import sgMail from '@sendgrid/mail';
import { prisma } from '../utils/prisma';
import { CommunicationDirection, SenderType, CommunicationStatus } from '@prisma/client';

// Initialize SendGrid
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
}

// Standard from address - must match existing SendGrid verified sender
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'brandon@impactdirectprinting.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Impact Direct Printing';

interface InboundEmailPayload {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    type: string;
    content: string; // base64
  }>;
  headers?: string;
}

interface ForwardResult {
  success: boolean;
  error?: string;
  communicationId?: string;
}

/**
 * Extract job number from email address or subject
 * Expects format: job-{jobNo}@domain.com or subject containing [Job #XXXX]
 */
export function extractJobNoFromEmail(toAddress: string, subject: string): string | null {
  // Try extracting from email address: job-12345@impactdirectprinting.com
  const emailMatch = toAddress.match(/job-([a-zA-Z0-9-]+)@/i);
  if (emailMatch) {
    return emailMatch[1];
  }

  // Try extracting from subject: [Job #12345] or Job #12345
  const subjectMatch = subject.match(/\[?Job\s*#?\s*([a-zA-Z0-9-]+)\]?/i);
  if (subjectMatch) {
    return subjectMatch[1];
  }

  return null;
}

/**
 * Determine if sender is customer or vendor based on email domain/address
 */
export async function determineSenderType(
  fromEmail: string,
  jobId: string
): Promise<{ senderType: SenderType; direction: CommunicationDirection }> {
  // Get job with customer and vendor info
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      Company: true, // Customer
      Vendor: {
        include: {
          contacts: true
        }
      },
      PurchaseOrder: {
        include: {
          Vendor: {
            include: {
              contacts: true
            }
          }
        }
      }
    }
  });

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const fromEmailLower = fromEmail.toLowerCase();

  // Check if sender matches customer email
  if (job.Company?.email && fromEmailLower.includes(job.Company.email.toLowerCase())) {
    return {
      senderType: SenderType.CUSTOMER,
      direction: CommunicationDirection.CUSTOMER_TO_VENDOR
    };
  }

  // Check if sender matches vendor email or any vendor contact
  if (job.Vendor) {
    if (job.Vendor.email && fromEmailLower.includes(job.Vendor.email.toLowerCase())) {
      return {
        senderType: SenderType.VENDOR,
        direction: CommunicationDirection.VENDOR_TO_CUSTOMER
      };
    }

    for (const contact of job.Vendor.contacts) {
      if (fromEmailLower.includes(contact.email.toLowerCase())) {
        return {
          senderType: SenderType.VENDOR,
          direction: CommunicationDirection.VENDOR_TO_CUSTOMER
        };
      }
    }
  }

  // Check vendor contacts from POs
  for (const po of job.PurchaseOrder) {
    if (po.Vendor) {
      if (po.Vendor.email && fromEmailLower.includes(po.Vendor.email.toLowerCase())) {
        return {
          senderType: SenderType.VENDOR,
          direction: CommunicationDirection.VENDOR_TO_CUSTOMER
        };
      }

      for (const contact of po.Vendor.contacts) {
        if (fromEmailLower.includes(contact.email.toLowerCase())) {
          return {
            senderType: SenderType.VENDOR,
            direction: CommunicationDirection.VENDOR_TO_CUSTOMER
          };
        }
      }
    }
  }

  // Default: assume it's from customer (safer default)
  return {
    senderType: SenderType.CUSTOMER,
    direction: CommunicationDirection.CUSTOMER_TO_VENDOR
  };
}

/**
 * Sanitize email content - remove identifying information
 */
export function sanitizeEmailForForwarding(
  content: string,
  stripPatterns: string[]
): string {
  let sanitized = content;

  // Remove each pattern
  for (const pattern of stripPatterns) {
    const regex = new RegExp(pattern, 'gi');
    sanitized = sanitized.replace(regex, '[REDACTED]');
  }

  // Remove common email signature patterns that might reveal identity
  // This is a basic implementation - can be enhanced
  sanitized = sanitized
    // Remove "Sent from" signatures
    .replace(/Sent from my (iPhone|iPad|Android|Samsung|Galaxy).*/gi, '')
    // Remove common email footers
    .replace(/--+\s*\n[\s\S]*$/gm, '');

  return sanitized;
}

/**
 * Store an inbound email as a JobCommunication
 */
export async function storeInboundEmail(
  jobId: string,
  payload: InboundEmailPayload,
  senderType: SenderType,
  direction: CommunicationDirection
): Promise<string> {
  const communication = await prisma.jobCommunication.create({
    data: {
      jobId,
      direction,
      senderType,
      originalFrom: payload.from,
      originalTo: payload.to,
      originalSubject: payload.subject,
      textBody: payload.text || null,
      htmlBody: payload.html || null,
      status: CommunicationStatus.PENDING_REVIEW, // Manual mode: wait for review
      receivedAt: new Date(),
      // Store attachments
      attachments: payload.attachments?.length ? {
        create: payload.attachments.map(att => ({
          fileName: att.filename,
          mimeType: att.type,
          size: Buffer.from(att.content, 'base64').length,
          contentBase64: att.content
        }))
      } : undefined
    },
    include: {
      attachments: true
    }
  });

  return communication.id;
}

/**
 * Forward a communication to the other party
 */
export async function forwardCommunication(
  communicationId: string,
  forwardedBy: string,
  customMessage?: string
): Promise<ForwardResult> {
  // Get the communication with job info
  const communication = await prisma.jobCommunication.findUnique({
    where: { id: communicationId },
    include: {
      job: {
        include: {
          Company: true, // Customer
          Vendor: {
            include: {
              contacts: true
            }
          }
        }
      },
      attachments: true
    }
  });

  if (!communication) {
    return { success: false, error: 'Communication not found' };
  }

  // Determine recipient based on direction
  let recipientEmail: string;
  let recipientName: string;

  if (communication.direction === CommunicationDirection.CUSTOMER_TO_VENDOR) {
    // Customer -> Vendor: forward to vendor
    if (communication.job.Vendor?.email) {
      recipientEmail = communication.job.Vendor.email;
      recipientName = communication.job.Vendor.name;
    } else {
      // Try to find vendor contact
      const primaryContact = communication.job.Vendor?.contacts.find(c => c.isPrimary);
      const anyContact = communication.job.Vendor?.contacts[0];
      const contact = primaryContact || anyContact;

      if (contact) {
        recipientEmail = contact.email;
        recipientName = contact.name;
      } else {
        return { success: false, error: 'No vendor email configured for this job' };
      }
    }
  } else {
    // Vendor -> Customer: forward to customer
    if (!communication.job.Company?.email) {
      return { success: false, error: 'No customer email configured for this job' };
    }
    recipientEmail = communication.job.Company.email;
    recipientName = communication.job.Company.name;
  }

  // Build the email
  const subject = `Re: ${communication.originalSubject.replace(/^Re:\s*/i, '')}`;

  // Use custom message or forward original content
  const body = customMessage || communication.htmlBody || communication.textBody || '';

  // Build email message
  const msg: any = {
    to: recipientEmail,
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME
    },
    subject,
    html: `
      <div style="font-family: Arial, sans-serif;">
        ${body}
        <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
        <p style="color: #666; font-size: 12px;">
          Impact Direct Printing<br />
          ${FROM_EMAIL}
        </p>
      </div>
    `
  };

  // Add attachments if any
  if (communication.attachments.length > 0) {
    msg.attachments = communication.attachments.map(att => ({
      content: att.contentBase64,
      filename: att.fileName,
      type: att.mimeType,
      disposition: 'attachment'
    }));
  }

  try {
    // Send the email
    await sgMail.send(msg);

    // Update communication status
    await prisma.jobCommunication.update({
      where: { id: communicationId },
      data: {
        status: CommunicationStatus.FORWARDED,
        forwardedAt: new Date(),
        forwardedTo: recipientEmail,
        forwardedBy,
        maskedFrom: FROM_EMAIL,
        maskedSubject: subject
      }
    });

    console.log('📧 Communication forwarded:', {
      communicationId,
      to: recipientEmail,
      direction: communication.direction
    });

    return { success: true, communicationId };
  } catch (error: any) {
    console.error('Error forwarding communication:', error);

    // Update status to failed
    await prisma.jobCommunication.update({
      where: { id: communicationId },
      data: {
        status: CommunicationStatus.FAILED,
        internalNotes: `Forward failed: ${error.message}`
      }
    });

    return { success: false, error: error.message };
  }
}

/**
 * Skip a communication (don't forward)
 */
export async function skipCommunication(
  communicationId: string,
  skippedBy: string,
  reason?: string
): Promise<void> {
  await prisma.jobCommunication.update({
    where: { id: communicationId },
    data: {
      status: CommunicationStatus.SKIPPED,
      forwardedBy: skippedBy,
      internalNotes: reason || 'Manually skipped'
    }
  });
}

/**
 * Get all communications for a job
 */
export async function getJobCommunications(jobId: string) {
  return prisma.jobCommunication.findMany({
    where: { jobId },
    include: {
      attachments: true
    },
    orderBy: {
      receivedAt: 'asc'
    }
  });
}

/**
 * Get pending communications count (for badge/notification)
 */
export async function getPendingCommunicationsCount(): Promise<number> {
  return prisma.jobCommunication.count({
    where: {
      status: CommunicationStatus.PENDING_REVIEW
    }
  });
}

/**
 * Get pending communications across all jobs
 */
export async function getPendingCommunications() {
  return prisma.jobCommunication.findMany({
    where: {
      status: CommunicationStatus.PENDING_REVIEW
    },
    include: {
      job: {
        include: {
          Company: true,
          Vendor: true
        }
      },
      attachments: true
    },
    orderBy: {
      receivedAt: 'asc'
    }
  });
}

/**
 * Add an internal note to a job's communication thread
 */
export async function addInternalNote(
  jobId: string,
  note: string,
  addedBy: string
): Promise<string> {
  const communication = await prisma.jobCommunication.create({
    data: {
      jobId,
      direction: CommunicationDirection.INTERNAL_NOTE,
      senderType: SenderType.INTERNAL,
      originalFrom: addedBy,
      originalTo: 'internal',
      originalSubject: 'Internal Note',
      textBody: note,
      status: CommunicationStatus.SKIPPED, // Internal notes are not forwarded
      receivedAt: new Date()
    }
  });

  return communication.id;
}

/**
 * Process inbound email from SendGrid webhook
 */
export async function processInboundEmail(payload: InboundEmailPayload): Promise<{
  success: boolean;
  jobId?: string;
  communicationId?: string;
  error?: string;
}> {
  try {
    // Extract job number from email
    const jobNo = extractJobNoFromEmail(payload.to, payload.subject);

    if (!jobNo) {
      console.warn('Could not extract job number from inbound email:', {
        to: payload.to,
        subject: payload.subject
      });
      return { success: false, error: 'Could not determine job from email' };
    }

    // Find the job
    const job = await prisma.job.findUnique({
      where: { jobNo }
    });

    if (!job) {
      console.warn('Job not found for inbound email:', { jobNo });
      return { success: false, error: `Job ${jobNo} not found` };
    }

    // Determine sender type
    const { senderType, direction } = await determineSenderType(payload.from, job.id);

    // Store the communication
    const communicationId = await storeInboundEmail(
      job.id,
      payload,
      senderType,
      direction
    );

    console.log('📬 Inbound email processed:', {
      jobNo,
      from: payload.from,
      senderType,
      direction,
      communicationId
    });

    return {
      success: true,
      jobId: job.id,
      communicationId
    };
  } catch (error: any) {
    console.error('Error processing inbound email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a new outbound communication (manual compose)
 */
export async function createOutboundCommunication(
  jobId: string,
  to: 'customer' | 'vendor',
  subject: string,
  body: string,
  createdBy: string
): Promise<ForwardResult> {
  // Get job with customer/vendor info
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      Company: true,
      Vendor: {
        include: {
          contacts: true
        }
      }
    }
  });

  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  let recipientEmail: string;
  let recipientName: string;
  let direction: CommunicationDirection;

  if (to === 'customer') {
    if (!job.Company?.email) {
      return { success: false, error: 'No customer email configured' };
    }
    recipientEmail = job.Company.email;
    recipientName = job.Company.name;
    direction = CommunicationDirection.VENDOR_TO_CUSTOMER; // We're acting as vendor
  } else {
    // To vendor
    if (job.Vendor?.email) {
      recipientEmail = job.Vendor.email;
      recipientName = job.Vendor.name;
    } else {
      const contact = job.Vendor?.contacts.find(c => c.isPrimary) || job.Vendor?.contacts[0];
      if (!contact) {
        return { success: false, error: 'No vendor email configured' };
      }
      recipientEmail = contact.email;
      recipientName = contact.name;
    }
    direction = CommunicationDirection.CUSTOMER_TO_VENDOR; // We're acting as customer
  }

  // Create communication record
  const communication = await prisma.jobCommunication.create({
    data: {
      jobId,
      direction,
      senderType: SenderType.INTERNAL,
      originalFrom: FROM_EMAIL,
      originalTo: recipientEmail,
      originalSubject: subject,
      htmlBody: body,
      status: CommunicationStatus.PENDING_REVIEW,
      receivedAt: new Date()
    }
  });

  // Build and send email
  const msg = {
    to: recipientEmail,
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME
    },
    subject: `${subject} - Job #${job.jobNo}`,
    html: `
      <div style="font-family: Arial, sans-serif;">
        ${body}
        <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
        <p style="color: #666; font-size: 12px;">
          Impact Direct Printing<br />
          ${FROM_EMAIL}
        </p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);

    // Update status
    await prisma.jobCommunication.update({
      where: { id: communication.id },
      data: {
        status: CommunicationStatus.FORWARDED,
        forwardedAt: new Date(),
        forwardedTo: recipientEmail,
        forwardedBy: createdBy
      }
    });

    console.log('📧 Outbound communication sent:', {
      jobId,
      to: recipientEmail,
      subject
    });

    return { success: true, communicationId: communication.id };
  } catch (error: any) {
    await prisma.jobCommunication.update({
      where: { id: communication.id },
      data: {
        status: CommunicationStatus.FAILED,
        internalNotes: `Send failed: ${error.message}`
      }
    });

    return { success: false, error: error.message };
  }
}
