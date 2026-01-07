import sgMail from '@sendgrid/mail';
import { prisma } from '../utils/prisma';
import { CommunicationDirection, SenderType, CommunicationStatus } from '@prisma/client';
import { getJobEmailAddress, getRfqEmailAddress } from './emailService';
import { canSendEmail, logEmailSend, logEmailSkipped } from './emailGuard';

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
 * Check if email is a Bradford PO confirmation and extract details
 * Subject format: "BGE LTD Print Order PO# 1227839 J-2045"
 * Also handles forwarded emails (Fwd: prefix) since the subject pattern is unique enough
 */
function parseBradfordPOEmail(from: string, subject: string): {
  isBradfordPO: boolean;
  bradfordPONumber?: string;
  jobNo?: string;
} {
  // Match: "BGE LTD Print Order PO# 1227839 J-2045" (with optional Fwd: or Re: prefix)
  // The subject pattern is unique enough to Bradford that we don't need to check sender
  const match = subject.match(/BGE\s+LTD\s+Print\s+Order\s+PO#\s*(\d+)\s+J-?(\d+)/i);

  if (!match) {
    return { isBradfordPO: false };
  }

  console.log('🔍 Bradford PO pattern matched:', {
    from,
    subject,
    poNumber: match[1],
    jobNo: match[2]
  });

  return {
    isBradfordPO: true,
    bradfordPONumber: match[1],  // "1227839"
    jobNo: match[2]              // "2045" (number only)
  };
}

/**
 * Handle Bradford PO confirmation email
 * - Finds job by number (tries both "2045" and "J-2045" formats)
 * - Updates partnerPONumber (always overwrites)
 * - Stores email in job communication thread
 */
async function handleBradfordPOEmail(
  jobNo: string,
  bradfordPONumber: string,
  payload: InboundEmailPayload
): Promise<{ success: boolean; jobId?: string; communicationId?: string; error?: string }> {
  // Try to find job - check both formats since both exist in DB
  let job = await prisma.job.findUnique({ where: { jobNo } });
  if (!job) {
    job = await prisma.job.findUnique({ where: { jobNo: `J-${jobNo}` } });
  }
  if (!job) {
    // Also try without J- if the extracted number already has it
    const numOnly = jobNo.replace(/^J-?/i, '');
    job = await prisma.job.findUnique({ where: { jobNo: numOnly } });
  }

  if (!job) {
    console.warn('⚠️ Bradford PO email: Job not found', { jobNo, bradfordPONumber });
    return { success: false, error: `Job ${jobNo} not found` };
  }

  // Update job with Bradford PO number (always overwrite)
  const oldValue = job.partnerPONumber;
  await prisma.job.update({
    where: { id: job.id },
    data: {
      partnerPONumber: bradfordPONumber,
      updatedAt: new Date()
    }
  });

  console.log('✅ Bradford PO captured:', {
    jobNo: job.jobNo,
    bradfordPONumber,
    previousValue: oldValue || '(none)'
  });

  // Store email in job communication thread
  const communicationId = await storeInboundEmail(
    job.id,
    payload,
    SenderType.VENDOR,
    CommunicationDirection.VENDOR_TO_CUSTOMER
  );

  return {
    success: true,
    jobId: job.id,
    communicationId
  };
}

/**
 * Extract RFQ ID from email address
 * Expects format: rfq-{rfqId}@jobs.impactdirectprinting.com
 */
export function extractRfqIdFromEmail(toAddress: string): string | null {
  const match = toAddress.match(/rfq-([a-zA-Z0-9]+)@/i);
  return match ? match[1] : null;
}

/**
 * Handle RFQ reply email from vendor
 * - Finds the RFQ by ID
 * - Matches vendor by "from" email
 * - Creates or updates VendorQuote with email content
 */
async function handleRfqReply(
  rfqId: string,
  payload: InboundEmailPayload
): Promise<{ success: boolean; rfqId?: string; vendorQuoteId?: string; error?: string }> {
  // Find the RFQ with its vendors
  const rfq = await prisma.vendorRFQ.findUnique({
    where: { id: rfqId },
    include: {
      vendors: {
        include: {
          Vendor: true
        }
      }
    }
  });

  if (!rfq) {
    console.warn('⚠️ RFQ reply email: RFQ not found', { rfqId });
    return { success: false, error: `RFQ ${rfqId} not found` };
  }

  // Extract email from "from" field (handles formats like "Name <email@domain.com>")
  const fromMatch = payload.from.match(/<([^>]+)>/) || [null, payload.from];
  const fromEmail = (fromMatch[1] || payload.from).toLowerCase().trim();

  // Match vendor by email
  const matchedVendor = rfq.vendors.find(v =>
    v.Vendor.email?.toLowerCase() === fromEmail
  );

  if (!matchedVendor) {
    console.warn('⚠️ RFQ reply email: Vendor not matched', {
      rfqId,
      fromEmail,
      assignedVendorEmails: rfq.vendors.map(v => v.Vendor.email)
    });
    // Still store the email content for manual review
    // We'll create a quote without matching vendorId
    return { success: false, error: `Vendor not matched for email: ${fromEmail}` };
  }

  // Build notes from email content
  const emailNotes = [
    `Email received from: ${payload.from}`,
    `Subject: ${payload.subject}`,
    '',
    'Email content:',
    payload.text || payload.html?.replace(/<[^>]+>/g, ' ').trim() || '(no content)'
  ].join('\n');

  // Create or update VendorQuote
  const vendorQuote = await prisma.vendorQuote.upsert({
    where: {
      rfqId_vendorId: {
        rfqId,
        vendorId: matchedVendor.vendorId
      }
    },
    create: {
      rfqId,
      vendorId: matchedVendor.vendorId,
      quoteAmount: 0,  // Needs manual entry
      status: 'RECEIVED',
      notes: emailNotes,
      emailContent: payload.text || payload.html || null,
      respondedAt: new Date()
    },
    update: {
      status: 'RECEIVED',
      notes: emailNotes,
      emailContent: payload.text || payload.html || null,
      respondedAt: new Date()
    }
  });

  // Update RFQ status to QUOTED if all vendors have responded, or just leave as PENDING
  const allQuotes = await prisma.vendorQuote.findMany({
    where: { rfqId }
  });

  // Check if at least some vendors have responded
  const respondedCount = allQuotes.filter(q => q.status === 'RECEIVED').length;
  if (respondedCount > 0 && rfq.status === 'PENDING') {
    await prisma.vendorRFQ.update({
      where: { id: rfqId },
      data: { status: 'QUOTED' }
    });
  }

  console.log('✅ RFQ vendor quote received:', {
    rfqNumber: rfq.rfqNumber,
    vendorName: matchedVendor.Vendor.name,
    vendorEmail: matchedVendor.Vendor.email,
    quoteId: vendorQuote.id
  });

  return {
    success: true,
    rfqId,
    vendorQuoteId: vendorQuote.id
  };
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

    if (job.Vendor.contacts) {
      for (const contact of job.Vendor.contacts) {
        if (fromEmailLower.includes(contact.email.toLowerCase())) {
          return {
            senderType: SenderType.VENDOR,
            direction: CommunicationDirection.VENDOR_TO_CUSTOMER
          };
        }
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

      if (po.Vendor.contacts) {
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
  }

  // Default: assume it's from customer (safer default)
  return {
    senderType: SenderType.CUSTOMER,
    direction: CommunicationDirection.CUSTOMER_TO_VENDOR
  };
}

/**
 * Strip email signatures and identifying info from content
 * Handles both HTML and plain text emails
 */
export function stripEmailSignature(content: string, isHtml: boolean = false): string {
  if (!content) return '';

  let stripped = content;

  if (isHtml) {
    // HTML email signature stripping

    // Remove common signature divider patterns in HTML
    // Matches: <div>--</div>, <p>--</p>, <br>--<br>, etc.
    stripped = stripped.replace(/<(div|p|span)[^>]*>\s*--\s*<\/\1>[\s\S]*$/gi, '');
    stripped = stripped.replace(/<br\s*\/?>\s*--\s*<br\s*\/?>[\s\S]*$/gi, '');

    // Remove everything after signature delimiter in content
    stripped = stripped.replace(/(<br\s*\/?>\s*){1,2}--\s*(<br\s*\/?>)?[\s\S]*$/gi, '');

    // Remove "Sent from" mobile signatures
    stripped = stripped.replace(/<(div|p|span)[^>]*>.*?Sent from my (iPhone|iPad|Android|Samsung|Galaxy|Mobile).*?<\/\1>/gi, '');
    stripped = stripped.replace(/Sent from my (iPhone|iPad|Android|Samsung|Galaxy|Mobile)[^<]*/gi, '');

    // Remove common signature wrapper divs (Gmail, Outlook)
    stripped = stripped.replace(/<div[^>]*class="[^"]*gmail_signature[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
    stripped = stripped.replace(/<div[^>]*class="[^"]*signature[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
    stripped = stripped.replace(/<table[^>]*class="[^"]*signature[^"]*"[^>]*>[\s\S]*?<\/table>/gi, '');

    // Remove quoted reply sections that might contain original sender info
    stripped = stripped.replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
    stripped = stripped.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, '');

    // Remove "On [date] [person] wrote:" patterns
    stripped = stripped.replace(/<div[^>]*>On .{1,100} wrote:[\s\S]*?<\/div>/gi, '');
    stripped = stripped.replace(/On .{1,50} at .{1,20}, .{1,50} wrote:/gi, '');

    // Remove lines starting with "From:" "To:" "Subject:" "Date:" (forwarded headers)
    stripped = stripped.replace(/<(div|p)[^>]*>\s*(From|To|Subject|Date|Sent|Cc):\s*[^<]*<\/\1>/gi, '');

    // Clean up empty divs/paragraphs left behind
    stripped = stripped.replace(/<(div|p|span)[^>]*>\s*<\/\1>/gi, '');
    stripped = stripped.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');

  } else {
    // Plain text signature stripping

    // Standard signature delimiter: line starting with --
    stripped = stripped.replace(/^--\s*$[\s\S]*/gm, '');
    stripped = stripped.replace(/\n--\s*\n[\s\S]*$/g, '');

    // "Sent from" mobile signatures
    stripped = stripped.replace(/\n*Sent from my (iPhone|iPad|Android|Samsung|Galaxy|Mobile)[\s\S]*/gi, '');

    // Common sign-off patterns followed by name/contact (be careful not to strip legitimate content)
    // Only strip if followed by what looks like contact info (email, phone, company name patterns)
    stripped = stripped.replace(/\n+(Best regards?|Kind regards?|Regards|Thanks|Thank you|Cheers|Sincerely|Best),?\s*\n+[A-Z][a-z]+ [A-Z][a-z]+\s*\n+[\s\S]*$/gi, '');

    // Remove quoted replies
    stripped = stripped.replace(/\n*On .{1,100} wrote:\s*\n[\s\S]*$/gi, '');
    stripped = stripped.replace(/\n*-+\s*Original Message\s*-+[\s\S]*$/gi, '');
    stripped = stripped.replace(/\n*_{5,}[\s\S]*$/g, ''); // Outlook separator

    // Remove forwarded email headers
    stripped = stripped.replace(/\n*(From|To|Subject|Date|Sent|Cc):\s*[^\n]+/gi, '');

    // Clean up excessive newlines
    stripped = stripped.replace(/\n{3,}/g, '\n\n');
  }

  return stripped.trim();
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
  console.log('💾 Storing inbound email:', {
    jobId,
    senderType,
    direction,
    hasText: !!(payload.text && payload.text.length > 0),
    textLength: payload.text?.length || 0,
    textPreview: payload.text?.substring(0, 300) || '(none)',
    hasHtml: !!(payload.html && payload.html.length > 0),
    htmlLength: payload.html?.length || 0,
    htmlPreview: payload.html?.substring(0, 300) || '(none)',
    attachmentCount: payload.attachments?.length || 0
  });

  // Strip email signatures before storing
  const cleanedText = payload.text ? stripEmailSignature(payload.text, false) : null;
  const cleanedHtml = payload.html ? stripEmailSignature(payload.html, true) : null;

  console.log('🧹 Stripped signatures:', {
    originalTextLength: payload.text?.length || 0,
    cleanedTextLength: cleanedText?.length || 0,
    originalHtmlLength: payload.html?.length || 0,
    cleanedHtmlLength: cleanedHtml?.length || 0
  });

  const communication = await prisma.jobCommunication.create({
    data: {
      jobId,
      direction,
      senderType,
      originalFrom: payload.from,
      originalTo: payload.to,
      originalSubject: payload.subject,
      textBody: cleanedText,
      htmlBody: cleanedHtml,
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

  console.log('✅ Communication stored with ID:', communication.id);
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

  // Use custom message or forward original content (strip signatures to hide sender identity)
  let body: string;
  console.log('📝 Forward body source check:', {
    communicationId,
    hasCustomMessage: !!customMessage,
    htmlBodyLength: communication.htmlBody?.length || 0,
    textBodyLength: communication.textBody?.length || 0,
    htmlPreview: communication.htmlBody?.substring(0, 200) || '(none)',
    textPreview: communication.textBody?.substring(0, 200) || '(none)'
  });

  if (customMessage) {
    body = customMessage;
  } else if (communication.htmlBody) {
    const stripped = stripEmailSignature(communication.htmlBody, true);
    console.log('📝 HTML stripped result:', {
      original: communication.htmlBody.length,
      stripped: stripped.length,
      preview: stripped.substring(0, 200)
    });
    body = stripped; // HTML content
  } else if (communication.textBody) {
    const stripped = stripEmailSignature(communication.textBody, false);
    console.log('📝 Text stripped result:', {
      original: communication.textBody.length,
      stripped: stripped.length,
      preview: stripped.substring(0, 200)
    });
    body = stripped; // Plain text
  } else {
    console.log('⚠️ No body content found for communication');
    body = '';
  }

  // Build email message with Reply-To for thread management
  const jobEmailAddress = getJobEmailAddress(communication.job.jobNo);
  const msg: any = {
    to: recipientEmail,
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME
    },
    replyTo: jobEmailAddress,
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
    // Check for Bradford PO confirmation email first
    const bradfordCheck = parseBradfordPOEmail(payload.from, payload.subject);
    if (bradfordCheck.isBradfordPO && bradfordCheck.jobNo && bradfordCheck.bradfordPONumber) {
      console.log('📬 Bradford PO email detected:', bradfordCheck);
      return await handleBradfordPOEmail(
        bradfordCheck.jobNo,
        bradfordCheck.bradfordPONumber,
        payload
      );
    }

    // Check for RFQ reply: rfq-{id}@jobs.impactdirectprinting.com
    const rfqId = extractRfqIdFromEmail(payload.to);
    if (rfqId) {
      console.log('📬 RFQ reply email detected:', { rfqId, from: payload.from });
      const result = await handleRfqReply(rfqId, payload);
      return {
        success: result.success,
        jobId: result.rfqId, // Return rfqId as jobId for consistency
        communicationId: result.vendorQuoteId,
        error: result.error
      };
    }

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

    // Email stored as PENDING_REVIEW - user will manually forward via dashboard

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

/**
 * Thread Initiation Options
 */
interface ThreadInitOptions {
  includeJobSpecs?: boolean;
  customMessage?: string;
}

/**
 * Generate customer welcome email HTML
 */
function getCustomerWelcomeEmailHtml(job: any, jobEmailAddress: string, options?: ThreadInitOptions): string {
  const jobNo = job.jobNo;
  const specs = job.specs || {};
  const productType = specs.productType || job.title || 'Print Job';
  const quantity = job.quantity ? Number(job.quantity).toLocaleString() : 'TBD';
  const dueDate = job.dueDate || job.deliveryDate
    ? new Date(job.dueDate || job.deliveryDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'TBD';
  const customerName = job.Company?.name || 'Valued Customer';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Order Confirmed</h1>
        <p style="color: #dbeafe; margin: 5px 0 0 0;">Job #${jobNo}</p>
      </div>

      <div style="padding: 25px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Dear ${customerName},</p>

        <p>Thank you for your order! Here's what happens next:</p>

        ${options?.customMessage ? `<p style="color: #333;">${options.customMessage}</p>` : ''}

        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; vertical-align: top; width: 50px;">
                <div style="background: #2563eb; color: white; width: 30px; height: 30px; border-radius: 50%; text-align: center; line-height: 30px; font-weight: bold;">1</div>
              </td>
              <td style="padding: 10px 0;">
                <strong style="color: #1e40af;">PROOF REVIEW</strong><br/>
                <span style="color: #6b7280; font-size: 14px;">You'll receive a proof shortly for your approval. Please review carefully and approve to proceed to production.</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; vertical-align: top;">
                <div style="background: #2563eb; color: white; width: 30px; height: 30px; border-radius: 50%; text-align: center; line-height: 30px; font-weight: bold;">2</div>
              </td>
              <td style="padding: 10px 0;">
                <strong style="color: #1e40af;">PRODUCTION</strong><br/>
                <span style="color: #6b7280; font-size: 14px;">Once approved, we'll begin manufacturing your order.</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; vertical-align: top;">
                <div style="background: #2563eb; color: white; width: 30px; height: 30px; border-radius: 50%; text-align: center; line-height: 30px; font-weight: bold;">3</div>
              </td>
              <td style="padding: 10px 0;">
                <strong style="color: #1e40af;">DELIVERY</strong><br/>
                <span style="color: #6b7280; font-size: 14px;">When complete, you'll receive tracking information for shipment to your location.</span>
              </td>
            </tr>
          </table>
        </div>

        <div style="background: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <strong style="color: #1e40af;">Keep all communication on this thread</strong>
          <p style="margin: 5px 0 0 0; color: #1e3a5f; font-size: 14px;">Reply to this email for questions, artwork submissions, or any updates about your project.</p>
        </div>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-top: 25px;">
          <h3 style="margin: 0 0 10px 0; color: #374151; font-size: 16px;">Order Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0; color: #6b7280;">Job #:</td>
              <td style="padding: 5px 0; font-weight: 600;">${jobNo}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #6b7280;">Product:</td>
              <td style="padding: 5px 0; font-weight: 600;">${productType}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #6b7280;">Quantity:</td>
              <td style="padding: 5px 0; font-weight: 600;">${quantity}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #6b7280;">Due Date:</td>
              <td style="padding: 5px 0; font-weight: 600;">${dueDate}</td>
            </tr>
          </table>
        </div>

        <p style="margin-top: 25px;">Questions? Reply to this email or call us at (330) 963-0970.</p>

        <p>Thank you for choosing Impact Direct Printing!</p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;" />

        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Impact Direct Printing<br />
          (330) 963-0970<br />
          brandon@impactdirectprinting.com
        </p>
      </div>
    </div>
  `;
}

/**
 * Generate vendor job notification email HTML
 */
function getVendorJobEmailHtml(job: any, jobEmailAddress: string, options?: ThreadInitOptions): string {
  const jobNo = job.jobNo;
  const specs = job.specs || {};

  // Build specs table
  const specsRows = [];
  if (job.description) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666; width: 40%;">Description</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${job.description}</td></tr>`);
  if (job.sizeName || specs.finishedSize) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Size</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${job.sizeName || specs.finishedSize}</td></tr>`);
  if (job.quantity) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Quantity</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${Number(job.quantity).toLocaleString()}</td></tr>`);
  if (specs.paperType || specs.paperStock) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Paper Stock</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${specs.paperType || specs.paperStock}</td></tr>`);
  if (specs.colors) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Colors</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${specs.colors}</td></tr>`);
  if (specs.coating) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Coating</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${specs.coating}</td></tr>`);
  if (specs.finishing) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Finishing</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${specs.finishing}</td></tr>`);
  if (job.dueDate) specsRows.push(`<tr><td style="padding: 8px; color: #666;">Due Date</td><td style="padding: 8px; font-weight: bold; color: #dc2626;">${new Date(job.dueDate).toLocaleDateString()}</td></tr>`);

  const specsHtml = specsRows.length > 0 ? `
    <h3 style="color: #1A1A1A; margin-top: 20px; border-bottom: 2px solid #FF8C42; padding-bottom: 8px;">Job Specifications</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      ${specsRows.join('')}
    </table>
  ` : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1E40AF; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">New Print Job</h1>
        <p style="color: #93C5FD; margin: 10px 0 0 0; font-size: 18px;">Impact Direct #${jobNo}</p>
      </div>

      <div style="padding: 25px; background-color: #ffffff;">
        <p style="font-size: 16px; color: #333;">You have a new print job from Impact Direct Printing.</p>

        ${options?.customMessage ? `<p style="font-size: 16px; color: #333;">${options.customMessage}</p>` : ''}

        ${specsHtml}

        <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="margin: 0 0 10px 0; color: #92400e; font-size: 16px;">Communication for This Project</h3>
          <p style="margin: 0; color: #333;">
            <strong>Please keep all communication on this email thread</strong> regarding this job. This includes proofs, status updates, questions, change requests, shipping confirmations, and any other correspondence about this project.
          </p>
        </div>

        <p style="color: #666; font-size: 14px;">Simply reply to this email for any job-related communication. Please confirm receipt of this job notification.</p>
      </div>

      <hr style="border: none; border-top: 1px solid #ccc; margin: 0;" />

      <div style="padding: 20px; text-align: center;">
        <p style="color: #666; font-size: 12px; margin: 0;">
          Impact Direct Printing<br />
          brandon@impactdirectprinting.com
        </p>
      </div>
    </div>
  `;
}

/**
 * Initiate email thread with customer
 * Sends a welcome email that establishes the job-specific reply-to address
 */
export async function initiateCustomerThread(
  jobId: string,
  options?: ThreadInitOptions
): Promise<ForwardResult & { skipped?: boolean }> {
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        Company: true
      }
    });

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (!job.Company?.email) {
      return { success: false, error: 'No customer email configured for this job' };
    }

    // GUARD: Check for duplicate thread initiation
    const guardCheck = await canSendEmail(jobId, 'THREAD_INIT_CUSTOMER', job.Company.email);
    if (!guardCheck.canSend) {
      console.log(`⏭️ Skipping customer thread init for job ${job.jobNo}: ${guardCheck.reason}`);
      await logEmailSkipped(jobId, 'THREAD_INIT_CUSTOMER', job.Company.email, guardCheck.reason || 'Duplicate');
      return { success: true, skipped: true };
    }

    const jobEmailAddress = getJobEmailAddress(job.jobNo);
    const subject = `Your Print Order - Job #${job.jobNo} | Impact Direct Printing`;
    const body = getCustomerWelcomeEmailHtml(job, jobEmailAddress, {
      includeJobSpecs: true,
      ...options
    });

    // Create communication record
    const communication = await prisma.jobCommunication.create({
      data: {
        jobId,
        direction: CommunicationDirection.VENDOR_TO_CUSTOMER,
        senderType: SenderType.INTERNAL,
        originalFrom: FROM_EMAIL,
        originalTo: job.Company.email,
        originalSubject: subject,
        htmlBody: body,
        status: CommunicationStatus.PENDING_REVIEW,
        receivedAt: new Date(),
        internalNotes: 'Thread initiation email - Customer welcome'
      }
    });

    // Send the email
    const msg = {
      to: job.Company.email,
      from: {
        email: FROM_EMAIL,
        name: FROM_NAME
      },
      replyTo: jobEmailAddress,
      subject,
      html: body
    };

    await sgMail.send(msg);

    // Log successful send for dedup tracking
    await logEmailSend({
      jobId,
      emailType: 'THREAD_INIT_CUSTOMER',
      sentTo: job.Company.email,
      success: true,
    });

    // Update status to forwarded (sent)
    await prisma.jobCommunication.update({
      where: { id: communication.id },
      data: {
        status: CommunicationStatus.FORWARDED,
        forwardedAt: new Date(),
        forwardedTo: job.Company.email,
        forwardedBy: 'system'
      }
    });

    console.log('📧 Customer thread initiated:', {
      jobNo: job.jobNo,
      customerEmail: job.Company.email,
      communicationId: communication.id
    });

    return { success: true, communicationId: communication.id };
  } catch (error: any) {
    console.error('Error initiating customer thread:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initiate email thread with vendor
 * Sends a job notification email that establishes the job-specific reply-to address
 */
export async function initiateVendorThread(
  jobId: string,
  options?: ThreadInitOptions
): Promise<ForwardResult & { skipped?: boolean }> {
  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
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

    // Determine vendor email
    let vendorEmail: string | null = null;
    let vendorName: string = 'Vendor';

    if (job.Vendor?.email) {
      vendorEmail = job.Vendor.email;
      vendorName = job.Vendor.name;
    } else if (job.Vendor?.contacts?.length) {
      const primary = job.Vendor.contacts.find(c => c.isPrimary);
      const contact = primary || job.Vendor.contacts[0];
      vendorEmail = contact.email;
      vendorName = contact.name;
    }

    if (!vendorEmail) {
      return { success: false, error: 'No vendor email configured for this job' };
    }

    // GUARD: Check for duplicate thread initiation
    const guardCheck = await canSendEmail(jobId, 'THREAD_INIT_VENDOR', vendorEmail);
    if (!guardCheck.canSend) {
      console.log(`⏭️ Skipping vendor thread init for job ${job.jobNo}: ${guardCheck.reason}`);
      await logEmailSkipped(jobId, 'THREAD_INIT_VENDOR', vendorEmail, guardCheck.reason || 'Duplicate');
      return { success: true, skipped: true };
    }

    const jobEmailAddress = getJobEmailAddress(job.jobNo);
    const subject = `New Print Job - Impact Direct #${job.jobNo}`;
    const body = getVendorJobEmailHtml(job, jobEmailAddress, {
      includeJobSpecs: true,
      ...options
    });

    // Create communication record
    const communication = await prisma.jobCommunication.create({
      data: {
        jobId,
        direction: CommunicationDirection.CUSTOMER_TO_VENDOR,
        senderType: SenderType.INTERNAL,
        originalFrom: FROM_EMAIL,
        originalTo: vendorEmail,
        originalSubject: subject,
        htmlBody: body,
        status: CommunicationStatus.PENDING_REVIEW,
        receivedAt: new Date(),
        internalNotes: 'Thread initiation email - Vendor notification'
      }
    });

    // Send the email
    const msg = {
      to: vendorEmail,
      from: {
        email: FROM_EMAIL,
        name: FROM_NAME
      },
      replyTo: jobEmailAddress,
      subject,
      html: body
    };

    await sgMail.send(msg);

    // Log successful send for dedup tracking
    await logEmailSend({
      jobId,
      emailType: 'THREAD_INIT_VENDOR',
      sentTo: vendorEmail,
      success: true,
    });

    // Update status to forwarded (sent)
    await prisma.jobCommunication.update({
      where: { id: communication.id },
      data: {
        status: CommunicationStatus.FORWARDED,
        forwardedAt: new Date(),
        forwardedTo: vendorEmail,
        forwardedBy: 'system'
      }
    });

    console.log('📧 Vendor thread initiated:', {
      jobNo: job.jobNo,
      vendorEmail,
      communicationId: communication.id
    });

    return { success: true, communicationId: communication.id };
  } catch (error: any) {
    console.error('Error initiating vendor thread:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initiate threads with both customer and vendor
 * Convenience wrapper that sends welcome emails to both parties
 */
export async function initiateBothThreads(
  jobId: string,
  options?: ThreadInitOptions
): Promise<{
  customerResult: ForwardResult;
  vendorResult: ForwardResult;
}> {
  const [customerResult, vendorResult] = await Promise.all([
    initiateCustomerThread(jobId, options),
    initiateVendorThread(jobId, options)
  ]);

  return { customerResult, vendorResult };
}

/**
 * Record proof activity in the communication thread
 * Creates an internal note that shows up in the thread for tracking
 */
export async function recordProofActivity(
  jobId: string,
  proofVersion: number | string,
  action: 'uploaded' | 'approved' | 'changes_requested',
  details?: string
): Promise<string> {
  const actionLabels = {
    uploaded: 'Proof Uploaded',
    approved: 'Proof Approved',
    changes_requested: 'Changes Requested'
  };

  const noteContent = `${actionLabels[action]} - Version ${proofVersion}${details ? `\n\n${details}` : ''}`;

  const communication = await prisma.jobCommunication.create({
    data: {
      jobId,
      direction: CommunicationDirection.INTERNAL_NOTE,
      senderType: SenderType.INTERNAL,
      originalFrom: 'system',
      originalTo: 'internal',
      originalSubject: actionLabels[action],
      textBody: noteContent,
      status: CommunicationStatus.SKIPPED,
      receivedAt: new Date(),
      internalNotes: `Proof activity: ${action}`
    }
  });

  console.log('Proof activity recorded:', {
    jobId,
    proofVersion,
    action,
    communicationId: communication.id
  });

  return communication.id;
}
