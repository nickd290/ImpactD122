import sgMail from '@sendgrid/mail';
import { generateInvoicePDF, generateVendorPOPDF, generateJDToBradfordInvoicePDF } from './pdfService';

// Initialize SendGrid
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
} else {
  console.warn('⚠️ SENDGRID_API_KEY not set - email functionality disabled');
}

interface EmailAttachment {
  content: string; // base64 encoded
  filename: string;
  type?: string;
  disposition?: string;
}

interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  body: string;
  attachmentBuffer?: Buffer;
  attachmentFilename?: string;
  attachments?: EmailAttachment[]; // Support multiple attachments
  replyTo?: string; // Job-specific email for thread management
}

// Helper to generate job-specific email address for thread management
export function getJobEmailAddress(jobNo: string): string {
  return `job-${jobNo}@jobs.impactdirectprinting.com`;
}

// Helper to generate RFQ-specific email address for vendor quote responses
export function getRfqEmailAddress(rfqId: string): string {
  return `rfq-${rfqId}@jobs.impactdirectprinting.com`;
}

interface EmailResult {
  success: boolean;
  emailedAt?: Date;
  error?: string;
}

// Core send function
async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  if (!process.env.SENDGRID_API_KEY) {
    return { success: false, error: 'SendGrid API key not configured' };
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'brandon@impactdirectprinting.com';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Impact Direct Printing';

  const msg: any = {
    to: options.to,
    from: {
      email: fromEmail,
      name: fromName,
    },
    subject: options.subject,
    html: options.body,
  };

  // Add CC if provided
  if (options.cc) {
    msg.cc = options.cc;
  }

  // Add Reply-To for thread management (job-specific email address)
  if (options.replyTo) {
    msg.replyTo = options.replyTo;
  }

  // Add attachments if provided
  const allAttachments: any[] = [];

  // Single attachment (legacy support)
  if (options.attachmentBuffer && options.attachmentFilename) {
    allAttachments.push({
      content: options.attachmentBuffer.toString('base64'),
      filename: options.attachmentFilename,
      type: 'application/pdf',
      disposition: 'attachment',
    });
  }

  // Multiple attachments
  if (options.attachments && options.attachments.length > 0) {
    allAttachments.push(...options.attachments.map(att => ({
      content: att.content,
      filename: att.filename,
      type: att.type || 'application/octet-stream',
      disposition: att.disposition || 'attachment',
    })));
  }

  if (allAttachments.length > 0) {
    msg.attachments = allAttachments;
  }

  try {
    const [response] = await sgMail.send(msg);
    console.log('📧 Email sent successfully:', {
      to: options.to,
      cc: options.cc || null,
      subject: options.subject,
      statusCode: response.statusCode,
      messageId: response.headers['x-message-id'],
    });
    return { success: true, emailedAt: new Date() };
  } catch (error: any) {
    // Log detailed SendGrid error
    console.error('SendGrid error:', {
      code: error.code,
      message: error.message,
      errors: error.response?.body?.errors,
    });
    const errorMessage = error.response?.body?.errors?.[0]?.message || error.message || 'Failed to send email';
    return {
      success: false,
      error: errorMessage
    };
  }
}

// Generate email body for invoice
function getInvoiceEmailBody(job: any, customerName: string): string {
  const jobNo = job.jobNo || job.id;
  const invoiceAmount = job.sellPrice ? `$${Number(job.sellPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1A1A1A;">Invoice from Impact Direct Printing</h2>

      <p>Dear ${customerName},</p>

      <p>Please find attached the invoice for Job #${jobNo}.</p>

      ${invoiceAmount ? `<p><strong>Invoice Amount:</strong> ${invoiceAmount}</p>` : ''}

      <p>If you have any questions about this invoice, please don't hesitate to reach out.</p>

      <p>Thank you for your business!</p>

      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />

      <p style="color: #666; font-size: 12px;">
        Impact Direct Printing<br />
        brandon@impactdirectprinting.com
      </p>
    </div>
  `;
}

// Generate email body for PO
function getPOEmailBody(
  po: any,
  vendorName: string,
  job: any,
  options?: {
    artworkFilesLink?: string;
    specialInstructions?: string;
    pdfUrl?: string;
    portalUrl?: string;
  }
): string {
  const poNumber = po.poNumber || po.id;
  const buyCost = po.buyCost ? `$${Number(po.buyCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';

  // Job specs for email body
  const specs = job?.specs || {};
  const quantity = job?.quantity ? Number(job.quantity).toLocaleString() : '';
  const sizeName = job?.sizeName || specs.finishedSize || '';
  const dueDate = job?.dueDate ? new Date(job.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const mailDate = job?.mailDate ? new Date(job.mailDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  // Build specs rows
  const specsRows: string[] = [];
  if (quantity) specsRows.push(`<tr><td style="padding: 6px 12px; color: #666;">Quantity:</td><td style="padding: 6px 12px; font-weight: 500;">${quantity}</td></tr>`);
  if (sizeName) specsRows.push(`<tr><td style="padding: 6px 12px; color: #666;">Size:</td><td style="padding: 6px 12px; font-weight: 500;">${sizeName}</td></tr>`);
  if (specs.paperType) specsRows.push(`<tr><td style="padding: 6px 12px; color: #666;">Paper:</td><td style="padding: 6px 12px; font-weight: 500;">${specs.paperType}</td></tr>`);
  if (specs.colors) specsRows.push(`<tr><td style="padding: 6px 12px; color: #666;">Colors:</td><td style="padding: 6px 12px; font-weight: 500;">${specs.colors}</td></tr>`);
  if (specs.finishing) specsRows.push(`<tr><td style="padding: 6px 12px; color: #666;">Finishing:</td><td style="padding: 6px 12px; font-weight: 500;">${specs.finishing}</td></tr>`);
  if (dueDate) specsRows.push(`<tr><td style="padding: 6px 12px; color: #666;">Due Date:</td><td style="padding: 6px 12px; font-weight: 500;">${dueDate}</td></tr>`);
  if (mailDate) specsRows.push(`<tr><td style="padding: 6px 12px; color: #666;">Mail Date:</td><td style="padding: 6px 12px; font-weight: 500;">${mailDate}</td></tr>`);

  // Job specs table
  const specsSection = specsRows.length > 0 ? `
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <strong style="color: #374151; font-size: 14px;">JOB SPECIFICATIONS</strong>
        <table style="width: 100%; margin-top: 8px; border-collapse: collapse;">
          ${specsRows.join('')}
        </table>
      </div>
  ` : '';

  // Portal link section (prominent green box)
  const portalSection = options?.portalUrl ? `
      <div style="background: #dcfce7; padding: 16px; border-radius: 8px; margin: 20px 0; border: 2px solid #22c55e; text-align: center;">
        <strong style="color: #166534; font-size: 16px;">📁 Access Job Portal</strong><br/>
        <p style="color: #166534; margin: 8px 0 12px 0; font-size: 13px;">Download PO, artwork, and all job files:</p>
        <a href="${options.portalUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          Open Job Portal →
        </a>
      </div>
  ` : '';

  // Artwork link section (blue box)
  const artworkSection = options?.artworkFilesLink ? `
      <div style="background: #dbeafe; padding: 12px; border-radius: 6px; margin: 16px 0; border: 1px solid #3b82f6;">
        <strong style="color: #1e40af;">Artwork Files:</strong><br/>
        <a href="${options.artworkFilesLink}" style="color: #2563eb; word-break: break-all;">${options.artworkFilesLink}</a>
      </div>
  ` : '';

  // Special instructions section (yellow box)
  const instructionsSection = (options?.specialInstructions || specs.specialInstructions) ? `
      <div style="background: #fef9c3; padding: 12px; border-radius: 6px; margin: 16px 0; border: 1px solid #eab308;">
        <strong style="color: #a16207;">⚠️ Special Instructions:</strong><br/>
        <span style="white-space: pre-wrap;">${options?.specialInstructions || specs.specialInstructions}</span>
      </div>
  ` : '';

  // PDF link section
  const pdfLinkSection = options?.pdfUrl ? `
      <p><a href="${options.pdfUrl}" style="color: #2563eb;">View/Download PO PDF</a></p>
  ` : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1A1A1A;">Purchase Order from Impact Direct Printing</h2>

      <p>Dear ${vendorName},</p>

      <p>Please find attached the Purchase Order #${poNumber}${job?.jobNo ? ` for Job #${job.jobNo}` : ''}${job?.title ? ` - ${job.title}` : ''}.</p>

      ${buyCost ? `<p><strong>PO Amount:</strong> ${buyCost}</p>` : ''}

      ${specsSection}
      ${portalSection}
      ${artworkSection}
      ${instructionsSection}
      ${pdfLinkSection}

      <p>Please confirm receipt by replying to this email.</p>

      <p>Thank you!</p>

      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />

      <p style="color: #666; font-size: 12px;">
        Impact Direct Printing<br />
        Reply to this email and it will be attached to Job #${job?.jobNo || 'N/A'}
      </p>
    </div>
  `;
}

// Send invoice email
export async function sendInvoiceEmail(
  job: any,
  recipientEmail: string,
  customerName: string
): Promise<EmailResult> {
  try {
    // Generate PDF
    const pdfBuffer = generateInvoicePDF(job);

    const jobNo = job.jobNo || job.id;
    const subject = `Invoice for Job #${jobNo} - Impact Direct Printing`;
    const body = getInvoiceEmailBody(job, customerName);
    const filename = `Invoice-${jobNo}.pdf`;
    const replyTo = getJobEmailAddress(jobNo);

    return await sendEmail({
      to: recipientEmail,
      subject,
      body,
      attachmentBuffer: pdfBuffer,
      attachmentFilename: filename,
      replyTo,
    });
  } catch (error: any) {
    console.error('Error sending invoice email:', error);
    return { success: false, error: error.message || 'Failed to generate or send invoice' };
  }
}

// Send PO email (vendor PO)
// CC nick@jdgraphic.com on all vendor PO emails
const VENDOR_PO_CC_EMAIL = 'nick@jdgraphic.com';

export async function sendPOEmail(
  po: any,
  job: any,
  recipientEmail: string | string[],
  vendorName: string,
  options?: {
    artworkFilesLink?: string;
    specialInstructions?: string;
    jobFiles?: Array<{ content: string; filename: string; mimeType: string }>; // Base64 encoded files
    portalUrl?: string; // Link to vendor portal for file downloads
  }
): Promise<EmailResult & { pdfUrl?: string }> {
  try {
    // Generate PDF - include Job's artworkToFollow flag from specs AND PO's buyCost
    // Plus the new PO-specific fields
    const jobWithPOData = {
      ...job,
      artworkToFollow: job.specs?.artworkToFollow || false,
      buyCost: po.buyCost ? Number(po.buyCost) : 0,
      poArtworkFilesLink: options?.artworkFilesLink,
      poSpecialInstructions: options?.specialInstructions,
    };
    const pdfBuffer = generateVendorPOPDF(jobWithPOData);

    const jobNo = job.jobNo || job.id;
    const poNumber = po.poNumber || po.id;
    const filename = `PO-${poNumber}.pdf`;

    // Upload PDF to R2 if configured
    let pdfUrl: string | undefined;
    try {
      const { uploadPDF, isR2Configured } = await import('./storageService');
      if (isR2Configured()) {
        pdfUrl = await uploadPDF(pdfBuffer, filename);
        console.log('📄 PDF uploaded to R2:', pdfUrl);
      }
    } catch (uploadError) {
      console.warn('⚠️ R2 upload failed, continuing without hosted PDF:', uploadError);
    }

    const subject = `Purchase Order #${poNumber} - Impact Direct Printing`;
    const body = getPOEmailBody(po, vendorName, job, {
      artworkFilesLink: options?.artworkFilesLink,
      specialInstructions: options?.specialInstructions,
      pdfUrl,
      portalUrl: options?.portalUrl,
    });
    const replyTo = getJobEmailAddress(jobNo);

    // Build additional attachments from job files
    const additionalAttachments: EmailAttachment[] = [];
    if (options?.jobFiles && options.jobFiles.length > 0) {
      for (const file of options.jobFiles) {
        additionalAttachments.push({
          content: file.content,
          filename: file.filename,
          type: file.mimeType,
          disposition: 'attachment',
        });
      }
    }

    // Determine CC - exclude if already in recipient list to avoid SendGrid duplicate error
    const recipientList = Array.isArray(recipientEmail) ? recipientEmail : [recipientEmail];
    const recipientLower = recipientList.map(e => e.toLowerCase().trim());
    const ccEmail = recipientLower.includes(VENDOR_PO_CC_EMAIL.toLowerCase()) ? undefined : VENDOR_PO_CC_EMAIL;

    const result = await sendEmail({
      to: recipientEmail,
      cc: ccEmail,
      subject,
      body,
      attachmentBuffer: pdfBuffer,
      attachmentFilename: filename,
      attachments: additionalAttachments.length > 0 ? additionalAttachments : undefined,
      replyTo,
    });

    return { ...result, pdfUrl };
  } catch (error: any) {
    console.error('Error sending PO email:', error);
    return { success: false, error: error.message || 'Failed to generate or send PO' };
  }
}

// Generate email body for artwork follow-up
function getArtworkFollowUpEmailBody(po: any, vendorName: string, job: any, artworkUrl: string): string {
  const poNumber = po.poNumber || po.id;
  const jobNo = job.jobNo || job.number || job.id;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1A1A1A;">Updated Purchase Order - Artwork Now Available</h2>

      <p>Dear ${vendorName},</p>

      <p>The artwork for <strong>Job #${jobNo}</strong> / <strong>PO #${poNumber}</strong> is now available.</p>

      <div style="background-color: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 15px; margin: 20px 0;">
        <p style="margin: 0 0 5px 0; font-weight: bold; color: #1e40af;">Artwork Link:</p>
        <p style="margin: 0;"><a href="${artworkUrl}" style="color: #2563eb; word-break: break-all;">${artworkUrl}</a></p>
      </div>

      <p>Please find the updated Purchase Order attached with the artwork link included.</p>

      <p>If you have any questions, please don't hesitate to reach out.</p>

      <p>Thank you!</p>

      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />

      <p style="color: #666; font-size: 12px;">
        Impact Direct Printing<br />
        brandon@impactdirectprinting.com
      </p>
    </div>
  `;
}

// CC list for artwork notifications
const ARTWORK_CC_EMAILS = [
  'brandon@impactdirectprinting.com',
  'nick@jdgraphic.com',
  'devin@jdgraphic.com',
];

// Generate email body for artwork notification (new job-based notification)
function getArtworkNotificationEmailBody(job: any, artworkUrl: string): string {
  const jobNo = job.jobNo || job.number || job.id;
  const specs = job.specs || {};

  // Format delivery date
  const deliveryDate = job.dueDate || job.deliveryDate;
  const formattedDate = deliveryDate ? new Date(deliveryDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : 'TBD';

  // Build specs table rows
  const specsRows = [];
  if (specs.productType) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Product Type</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 500;">${specs.productType}</td></tr>`);
  if (job.sizeName || specs.finishedSize) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Size</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 500;">${job.sizeName || specs.finishedSize}</td></tr>`);
  if (job.quantity) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Quantity</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 500;">${Number(job.quantity).toLocaleString()}</td></tr>`);
  if (specs.paperType || specs.paperStock) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Paper Stock</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 500;">${specs.paperType || specs.paperStock}</td></tr>`);
  if (specs.colors) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Colors</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 500;">${specs.colors}</td></tr>`);
  if (specs.coating) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Coating</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 500;">${specs.coating}</td></tr>`);
  if (specs.finishing) specsRows.push(`<tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Finishing</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 500;">${specs.finishing}</td></tr>`);
  specsRows.push(`<tr><td style="padding: 8px; color: #666;">Delivery Date</td><td style="padding: 8px; font-weight: 500;">${formattedDate}</td></tr>`);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #FF8C42; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Artwork Now Available</h1>
      </div>

      <div style="padding: 20px;">
        <p style="font-size: 16px; color: #333;">The artwork for <strong>Job #${jobNo}</strong> is now ready for production.</p>

        <div style="background-color: #dbeafe; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
          <p style="margin: 0 0 10px 0; font-weight: bold; color: #1e40af; font-size: 14px;">ARTWORK LINK</p>
          <a href="${artworkUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Download Artwork</a>
          <p style="margin: 15px 0 0 0; font-size: 12px; color: #666; word-break: break-all;">${artworkUrl}</p>
        </div>

        <h3 style="color: #1A1A1A; border-bottom: 2px solid #FF8C42; padding-bottom: 8px;">Job Specifications</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          ${specsRows.join('')}
        </table>

        <p style="color: #666;">Please confirm receipt and let us know if you have any questions.</p>

        <p>Thank you!</p>
      </div>

      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />

      <p style="color: #666; font-size: 12px; text-align: center;">
        Impact Direct Printing<br />
        brandon@impactdirectprinting.com
      </p>
    </div>
  `;
}

// Send artwork notification email (job-based, no PO required)
export async function sendArtworkNotificationEmail(
  job: any,
  vendorEmail: string,
  vendorName: string,
  artworkUrl: string,
  additionalVendorEmails: string[] = []  // Additional vendor contact emails
): Promise<EmailResult> {
  try {
    const jobNo = job.jobNo || job.number || job.id;
    const subject = `Artwork Available - Job #${jobNo} | Impact Direct Printing`;
    const body = getArtworkNotificationEmailBody(job, artworkUrl);

    // Combine all vendor emails for the TO field
    const allVendorEmails = [vendorEmail, ...additionalVendorEmails];
    // Combine with internal CC emails (ensure no duplicates)
    const allCcEmails = ARTWORK_CC_EMAILS.filter(email => !allVendorEmails.includes(email));
    const replyTo = getJobEmailAddress(jobNo);

    const result = await sendEmail({
      to: allVendorEmails.join(','),  // Send to primary + all additional vendor contacts
      cc: allCcEmails,  // Internal team
      subject,
      body,
      replyTo,
    });

    if (result.success) {
      console.log('📧 Artwork notification email sent:', {
        vendors: allVendorEmails,
        cc: allCcEmails,
        jobNo,
        artworkUrl,
      });
    }

    return result;
  } catch (error: any) {
    console.error('Error sending artwork notification email:', error);
    return { success: false, error: error.message || 'Failed to send artwork notification email' };
  }
}

// Send artwork follow-up email when artwork becomes available
export async function sendArtworkFollowUpEmail(
  po: any,
  job: any,
  vendorEmail: string,
  vendorName: string,
  artworkUrl: string,
  additionalCcEmail: string = 'brandon@impactdirectprinting.com'
): Promise<EmailResult> {
  try {
    // Generate updated PDF with artwork URL (artworkToFollow is now false since we have the URL)
    const jobWithArtwork = {
      ...job,
      specs: {
        ...(job.specs || {}),
        artworkUrl: artworkUrl,
      },
      artworkToFollow: false, // No longer "to follow" since we have it
    };
    const pdfBuffer = generateVendorPOPDF(jobWithArtwork);

    const poNumber = po.poNumber || po.id;
    const jobNo = job.jobNo || job.number || job.id;
    const subject = `Updated PO #${poNumber} - Artwork Now Available (Job #${jobNo})`;
    const body = getArtworkFollowUpEmailBody(po, vendorName, job, artworkUrl);
    const filename = `PO-${poNumber}-Updated.pdf`;

    // Build CC list - always include nick@jdgraphic.com, optionally add another
    const ccList = [VENDOR_PO_CC_EMAIL];
    if (additionalCcEmail && additionalCcEmail !== VENDOR_PO_CC_EMAIL) {
      ccList.push(additionalCcEmail);
    }
    const replyTo = getJobEmailAddress(jobNo);

    // Send to vendor with CC
    const result = await sendEmail({
      to: vendorEmail,
      cc: ccList,
      subject,
      body,
      attachmentBuffer: pdfBuffer,
      attachmentFilename: filename,
      replyTo,
    });

    if (result.success) {
      console.log('📧 Artwork follow-up email sent:', {
        vendor: vendorEmail,
        cc: ccList,
        poNumber,
        jobNo,
      });
    }

    return result;
  } catch (error: any) {
    console.error('Error sending artwork follow-up email:', error);
    return { success: false, error: error.message || 'Failed to send artwork follow-up email' };
  }
}

// Bradford contact for JD invoices
const BRADFORD_INVOICE_EMAIL = 'steve.gustafson@bgeltd.com';
const JD_INVOICE_CC_EMAIL = 'nick@jdgraphic.com';

// Generate email body for JD → Bradford Invoice
function getJDInvoiceEmailBody(job: any): string {
  const jobNo = job.jobNo || job.id;
  const bradfordPO = job.bradfordPONumber || job.customerPONumber || 'N/A';

  // Calculate total from manufacturing + paper
  let totalAmount = 0;
  if (job.bradfordPrintCPM && job.quantity) {
    totalAmount += (Number(job.bradfordPrintCPM) / 1000) * Number(job.quantity);
  }
  if (job.bradfordPaperLbs && job.bradfordPaperCostPerLb) {
    totalAmount += Number(job.bradfordPaperLbs) * Number(job.bradfordPaperCostPerLb);
  }

  const formattedAmount = totalAmount > 0
    ? `$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1E40AF; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">JD Graphic</h1>
        <p style="color: #93C5FD; margin: 5px 0 0 0; font-size: 14px;">Manufacturing Invoice</p>
      </div>

      <div style="padding: 20px;">
        <p>Dear Steve,</p>

        <p>Please find attached the manufacturing invoice for <strong>Job #${jobNo}</strong> (Bradford PO: ${bradfordPO}).</p>

        ${formattedAmount ? `<p><strong>Invoice Total:</strong> ${formattedAmount}</p>` : ''}

        <p>This invoice covers the manufacturing costs for the job completed through our facility.</p>

        <p>Payment terms: Net 30</p>

        <p>If you have any questions about this invoice, please don't hesitate to reach out.</p>

        <p>Thank you for your business!</p>
      </div>

      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />

      <p style="color: #666; font-size: 12px; text-align: center;">
        JD Graphic<br />
        nick@jdgraphic.com
      </p>
    </div>
  `;
}

// Send JD Invoice to Bradford
export async function sendJDInvoiceToBradfordEmail(
  job: any
): Promise<EmailResult & { emailedTo?: string }> {
  try {
    // Generate JD Invoice PDF
    const pdfBuffer = generateJDToBradfordInvoicePDF(job);

    const jobNo = job.jobNo || job.id;
    const subject = `JD Graphic Invoice - Job #${jobNo}`;
    const body = getJDInvoiceEmailBody(job);
    const filename = `JD-Invoice-Job-${jobNo}.pdf`;

    const result = await sendEmail({
      to: BRADFORD_INVOICE_EMAIL,
      cc: JD_INVOICE_CC_EMAIL,
      subject,
      body,
      attachmentBuffer: pdfBuffer,
      attachmentFilename: filename,
    });

    if (result.success) {
      console.log('📧 JD Invoice sent to Bradford:', {
        to: BRADFORD_INVOICE_EMAIL,
        jobNo,
        subject,
      });
      return {
        ...result,
        emailedTo: BRADFORD_INVOICE_EMAIL
      };
    }

    return result;
  } catch (error: any) {
    console.error('Error sending JD invoice to Bradford:', error);
    return { success: false, error: error.message || 'Failed to generate or send JD invoice' };
  }
}

// ===========================================
// Vendor RFQ Email Functions
// ===========================================

// Generate email body for vendor RFQ
function getRfqEmailBody(rfq: any, vendorName: string, quoteToken?: string): string {
  const dueDate = rfq.dueDate ? new Date(rfq.dueDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : 'ASAP';

  // Format specs - preserve line breaks
  const formattedSpecs = (rfq.specs || '').replace(/\n/g, '<br/>');

  // Build quote submission link if token provided
  const baseUrl = process.env.APP_URL || 'https://impactd122-server-production.up.railway.app';
  const quoteLink = quoteToken ? `${baseUrl}/vendor-quote/${rfq.id}/${quoteToken}` : null;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
      <!-- Header -->
      <div style="background-color: #1a1a1a; padding: 24px 32px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">IMPACT DIRECT PRINTING</h1>
        <p style="color: #9ca3af; margin: 4px 0 0 0; font-size: 13px;">Request for Quote</p>
      </div>

      <!-- Body -->
      <div style="padding: 32px;">
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
          Hi ${vendorName},
        </p>

        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
          Please quote the following job:
        </p>

        <!-- Job Card -->
        <div style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <h2 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">${rfq.title}</h2>
          </div>
          <p style="color: #6b7280; font-size: 13px; margin: 0;">
            ${rfq.rfqNumber} &nbsp;&bull;&nbsp; Due: ${dueDate}
          </p>
        </div>

        <!-- Specifications -->
        <div style="margin: 0 0 24px 0;">
          <p style="color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
            Specifications
          </p>
          <div style="color: #374151; font-size: 14px; line-height: 1.7; font-family: 'SF Mono', Monaco, 'Courier New', monospace;">
            ${formattedSpecs}
          </div>
        </div>

        ${rfq.notes ? `
        <!-- Notes -->
        <div style="margin: 0 0 24px 0;">
          <p style="color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">
            Notes
          </p>
          <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0;">
            ${rfq.notes}
          </p>
        </div>
        ` : ''}

        ${quoteLink ? `
        <!-- CTA -->
        <div style="text-align: center; margin: 32px 0;">
          <a href="${quoteLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">Submit Your Quote</a>
          <p style="color: #9ca3af; font-size: 12px; margin: 12px 0 0 0;">No login required</p>
        </div>
        ` : `
        <p style="color: #374151; font-size: 14px; line-height: 1.6;">Please reply with your pricing and turnaround time.</p>
        `}

        <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0 0;">
          Questions? Reply to this email.
        </p>
      </div>

      <!-- Footer -->
      <div style="border-top: 1px solid #e5e7eb; padding: 20px 32px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Impact Direct Printing<br/>
          brandon@impactdirectprinting.com
        </p>
      </div>
    </div>
  `;
}

// Send RFQ email to vendor
export async function sendRfqEmail(
  rfq: any,
  vendorEmail: string,
  vendorName: string,
  quoteToken?: string  // Token for quote submission link
): Promise<EmailResult> {
  try {
    const subject = `RFQ ${rfq.rfqNumber}: ${rfq.title}`;
    const body = getRfqEmailBody(rfq, vendorName, quoteToken);
    const replyTo = getRfqEmailAddress(rfq.id);

    const result = await sendEmail({
      to: vendorEmail,
      subject,
      body,
      replyTo,  // Vendor replies go to rfq-{id}@jobs.impactdirectprinting.com
    });

    if (result.success) {
      console.log('📧 RFQ email sent:', {
        rfqNumber: rfq.rfqNumber,
        vendor: vendorName,
        email: vendorEmail,
        replyTo,
        hasQuoteLink: !!quoteToken,
      });
    }

    return result;
  } catch (error: any) {
    console.error('Error sending RFQ email:', error);
    return { success: false, error: error.message || 'Failed to send RFQ email' };
  }
}

// ===========================================
// ThreeZ PO Email for EPG Releases
// ===========================================

// ThreeZ contacts for EPG releases
const THREEZ_EMAILS = ['jkoester@threez.com', 'dmeinhart@threez.com'];
const THREEZ_CC_EMAIL = 'nick@jdgraphic.com';

// Generate email body for ThreeZ PO (EPG release)
function getThreeZPOEmailBody(po: any, job: any, specs: any): string {
  const poNumber = po.poNumber || po.id;
  const jobNo = job.jobNo || job.id;
  const partNumber = specs.partNumber || 'N/A';
  const totalUnits = specs.totalUnits ? Number(specs.totalUnits).toLocaleString() : 'N/A';
  const buyCost = po.buyCost ? `$${Number(po.buyCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';
  const shippingLocation = specs.shippingLocation || 'N/A';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1E40AF; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">New EPrint Group Release</h1>
        <p style="color: #93C5FD; margin: 5px 0 0 0;">Purchase Order from Impact Direct</p>
      </div>

      <div style="padding: 20px;">
        <p>Dear ThreeZ Team,</p>

        <p>Please find attached the Purchase Order and shipping documents for the following release:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; background: #f9fafb; font-weight: bold;">PO Number</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${poNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; background: #f9fafb; font-weight: bold;">Job Number</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${jobNo}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; background: #f9fafb; font-weight: bold;">Part Number</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${partNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; background: #f9fafb; font-weight: bold;">Total Units</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${totalUnits}</td>
          </tr>
          ${buyCost ? `
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; background: #f9fafb; font-weight: bold;">PO Amount</td>
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #059669;">${buyCost}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; background: #f9fafb; font-weight: bold;">Ship To</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${shippingLocation}</td>
          </tr>
        </table>

        <div style="background-color: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-weight: bold;">Attached Documents:</p>
          <ul style="margin: 10px 0 0 0; padding-left: 20px;">
            <li>Packing Slip</li>
            <li>Box Labels</li>
          </ul>
        </div>

        <p>Please confirm receipt and let us know if you have any questions.</p>

        <p>Thank you!</p>
      </div>

      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />

      <p style="color: #666; font-size: 12px; text-align: center;">
        Impact Direct Printing<br />
        brandon@impactdirectprinting.com
      </p>
    </div>
  `;
}

// Send ThreeZ PO email with release documents
export async function sendThreeZPOEmail(
  po: any,
  job: any,
  specs: any
): Promise<EmailResult> {
  if (!process.env.SENDGRID_API_KEY) {
    return { success: false, error: 'SendGrid API key not configured' };
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'brandon@impactdirectprinting.com';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Impact Direct Printing';

  const poNumber = po.poNumber || po.id;
  const jobNo = job.jobNo || job.id;
  const subject = `EPG Release PO #${poNumber} - Job #${jobNo}`;
  const body = getThreeZPOEmailBody(po, job, specs);

  // Build attachments array
  const attachments: any[] = [];

  if (specs.packingSlipPdf) {
    attachments.push({
      content: specs.packingSlipPdf, // Already base64
      filename: `Packing-Slip-${jobNo}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment',
    });
  }

  if (specs.boxLabelsPdf) {
    attachments.push({
      content: specs.boxLabelsPdf, // Already base64
      filename: `Box-Labels-${jobNo}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment',
    });
  }

  const msg: any = {
    to: THREEZ_EMAILS,
    cc: THREEZ_CC_EMAIL,
    from: { email: fromEmail, name: fromName },
    subject,
    html: body,
    attachments,
  };

  try {
    const [response] = await sgMail.send(msg);
    console.log('📧 ThreeZ PO email sent:', {
      to: THREEZ_EMAILS,
      cc: THREEZ_CC_EMAIL,
      poNumber,
      jobNo,
      attachments: attachments.length,
      statusCode: response.statusCode,
    });
    return { success: true, emailedAt: new Date() };
  } catch (error: any) {
    console.error('Error sending ThreeZ PO email:', {
      code: error.code,
      message: error.message,
      errors: error.response?.body?.errors,
    });
    return { success: false, error: error.message || 'Failed to send ThreeZ email' };
  }
}

// ============================================
// CUSTOMER ORDER CONFIRMATION EMAIL
// ============================================
function getCustomerConfirmationEmailBody(job: any, customerName: string): string {
  const jobNo = job.jobNo || job.id;
  const specs = job.specs || {};
  const productType = specs.productType || job.title || 'Print Job';
  const quantity = job.quantity ? job.quantity.toLocaleString() : 'TBD';
  const dueDate = job.deliveryDate
    ? new Date(job.deliveryDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'TBD';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Order Confirmed</h1>
        <p style="color: #dbeafe; margin: 5px 0 0 0;">Job #${jobNo}</p>
      </div>

      <div style="padding: 25px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Dear ${customerName},</p>

        <p>Thank you for your order! Here's what happens next:</p>

        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div style="display: flex; margin-bottom: 15px;">
            <div style="background: #2563eb; color: white; width: 30px; height: 30px; border-radius: 50%; text-align: center; line-height: 30px; font-weight: bold; margin-right: 15px;">1</div>
            <div>
              <strong style="color: #1e40af;">PROOF REVIEW</strong><br/>
              <span style="color: #6b7280;">You'll receive a proof shortly for your approval. Please review carefully and approve to proceed to production.</span>
            </div>
          </div>

          <div style="display: flex; margin-bottom: 15px;">
            <div style="background: #2563eb; color: white; width: 30px; height: 30px; border-radius: 50%; text-align: center; line-height: 30px; font-weight: bold; margin-right: 15px;">2</div>
            <div>
              <strong style="color: #1e40af;">PRODUCTION</strong><br/>
              <span style="color: #6b7280;">Once approved, we'll begin manufacturing your order.</span>
            </div>
          </div>

          <div style="display: flex;">
            <div style="background: #2563eb; color: white; width: 30px; height: 30px; border-radius: 50%; text-align: center; line-height: 30px; font-weight: bold; margin-right: 15px;">3</div>
            <div>
              <strong style="color: #1e40af;">DELIVERY</strong><br/>
              <span style="color: #6b7280;">When complete, you'll receive tracking information for shipment to your location.</span>
            </div>
          </div>
        </div>

        <p style="color: #6b7280;">Questions? Reply to this email or call us at (330) 963-0970.</p>

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

        <p style="margin-top: 25px;">Thank you for choosing Impact Direct Printing!</p>

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

export async function sendCustomerConfirmationEmail(
  job: any,
  recipientEmail: string,
  customerName: string
): Promise<EmailResult> {
  try {
    const jobNo = job.jobNo || job.id;
    const subject = `Order Confirmed - Job #${jobNo} - Impact Direct Printing`;
    const body = getCustomerConfirmationEmailBody(job, customerName);
    const replyTo = getJobEmailAddress(jobNo);

    return await sendEmail({
      to: recipientEmail,
      subject,
      body,
      replyTo,
    });
  } catch (error: any) {
    console.error('Error sending customer confirmation email:', error);
    return { success: false, error: error.message || 'Failed to send confirmation email' };
  }
}

// ============================================
// SHIPMENT TRACKING EMAIL
// ============================================
function getShipmentTrackingEmailBody(
  job: any,
  shipment: any,
  customerName: string
): string {
  const jobNo = job.jobNo || job.id;
  const carrier = shipment.carrier || 'Carrier';
  const trackingNumber = shipment.trackingNo || shipment.trackingNumber || '';
  const productTitle = job.title || 'Print Job';

  // Generate tracking URL based on carrier
  let trackingUrl = '';
  if (trackingNumber) {
    const carrierLower = carrier.toLowerCase();
    if (carrierLower.includes('ups')) {
      trackingUrl = `https://www.ups.com/track?tracknum=${trackingNumber}`;
    } else if (carrierLower.includes('fedex')) {
      trackingUrl = `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
    } else if (carrierLower.includes('usps')) {
      trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
    } else if (carrierLower.includes('dhl')) {
      trackingUrl = `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`;
    }
  }

  const trackingSection = trackingUrl
    ? `<a href="${trackingUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 10px;">Track Your Package</a>`
    : `<p style="font-family: monospace; font-size: 16px; background: #f3f4f6; padding: 10px; border-radius: 4px;">${trackingNumber}</p>`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 10px;">📦</div>
        <h1 style="color: white; margin: 0; font-size: 24px;">Your Order Has Shipped!</h1>
        <p style="color: #d1fae5; margin: 5px 0 0 0;">Job #${jobNo}</p>
      </div>

      <div style="padding: 25px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Hi ${customerName},</p>

        <p>Great news! Your order is on its way.</p>

        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <h3 style="margin: 0 0 10px 0; color: #166534;">Tracking Information</h3>
          <p style="margin: 5px 0; color: #6b7280;">Carrier: <strong>${carrier}</strong></p>
          <p style="margin: 5px 0; color: #6b7280;">Tracking #: <strong>${trackingNumber}</strong></p>
          ${trackingSection}
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
              <td style="padding: 5px 0; font-weight: 600;">${productTitle}</td>
            </tr>
          </table>
        </div>

        <p style="margin-top: 25px;">Thank you for your business!</p>

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

export async function sendShipmentTrackingEmail(
  job: any,
  shipment: any,
  recipientEmail: string,
  customerName: string
): Promise<EmailResult> {
  try {
    const jobNo = job.jobNo || job.id;
    const subject = `Your Order Has Shipped - Job #${jobNo} - Impact Direct Printing`;
    const body = getShipmentTrackingEmailBody(job, shipment, customerName);
    const replyTo = getJobEmailAddress(jobNo);

    return await sendEmail({
      to: recipientEmail,
      subject,
      body,
      replyTo,
    });
  } catch (error: any) {
    console.error('Error sending shipment tracking email:', error);
    return { success: false, error: error.message || 'Failed to send tracking email' };
  }
}

// ============================================
// VENDOR PO EMAIL WITH PORTAL LINK
// ============================================
function getVendorPOWithPortalEmailBody(
  po: any,
  vendorName: string,
  job: any,
  portalUrl: string,
  options?: {
    specialInstructions?: string;
  }
): string {
  const poNumber = po.poNumber || po.id;
  const jobNo = job.jobNo || job.id;
  const buyCost = po.buyCost ? `$${Number(po.buyCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';
  const dueDate = job.deliveryDate
    ? new Date(job.deliveryDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'TBD';

  const instructionsSection = options?.specialInstructions ? `
    <div style="background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <h4 style="margin: 0 0 10px 0; color: #854d0e;">Special Instructions:</h4>
      <p style="margin: 0; white-space: pre-wrap; color: #713f12;">${options.specialInstructions}</p>
    </div>
  ` : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="padding: 25px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="margin: 0 0 5px 0; color: #1f2937;">Purchase Order #${poNumber}</h2>
        <p style="margin: 0 0 20px 0; color: #6b7280;">Job #${jobNo}</p>

        <p>${vendorName},</p>

        <p>Please find your purchase order details below.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">PO #:</td>
            <td style="padding: 8px 0; font-weight: 600; border-bottom: 1px solid #e5e7eb;">${poNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Job #:</td>
            <td style="padding: 8px 0; font-weight: 600; border-bottom: 1px solid #e5e7eb;">${jobNo}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Due Date:</td>
            <td style="padding: 8px 0; font-weight: 600; border-bottom: 1px solid #e5e7eb;">${dueDate}</td>
          </tr>
          ${buyCost ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">PO Amount:</td>
            <td style="padding: 8px 0; font-weight: 600;">${buyCost}</td>
          </tr>
          ` : ''}
        </table>

        <div style="background: #eff6ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <h4 style="margin: 0 0 10px 0; color: #1e40af;">ACCESS FILES</h4>
          <p style="margin: 0 0 15px 0; color: #6b7280;">Click below to view PO PDF and artwork files</p>
          <a href="${portalUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Files</a>
        </div>

        ${instructionsSection}

        <p>Questions? Reply to this email.</p>

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

export async function sendVendorPOWithPortalEmail(
  po: any,
  job: any,
  recipientEmail: string,
  vendorName: string,
  portalUrl: string,
  options?: {
    specialInstructions?: string;
  }
): Promise<EmailResult> {
  try {
    const jobNo = job.jobNo || job.id;
    const poNumber = po.poNumber || po.id;
    const subject = `Purchase Order #${poNumber} - ${job.title || 'Job #' + jobNo}`;
    const body = getVendorPOWithPortalEmailBody(po, vendorName, job, portalUrl, options);
    const replyTo = getJobEmailAddress(jobNo);

    // Exclude CC if recipient is the same to avoid SendGrid duplicate error
    const ccEmail = recipientEmail.toLowerCase().trim() === VENDOR_PO_CC_EMAIL.toLowerCase()
      ? undefined
      : VENDOR_PO_CC_EMAIL;

    return await sendEmail({
      to: recipientEmail,
      cc: ccEmail,
      subject,
      body,
      replyTo,
    });
  } catch (error: any) {
    console.error('Error sending vendor PO with portal email:', error);
    return { success: false, error: error.message || 'Failed to send PO email' };
  }
}

// ============================================
// CUSTOMER PROOF EMAIL
// ============================================

function getCustomerProofEmailBody(
  job: any,
  customerName: string,
  fileNames: string[],
  customMessage?: string
): string {
  const jobNo = job.jobNo || job.id;
  const productTitle = job.title || 'Print Job';

  const filesList = fileNames.map(name => `<li style="padding: 4px 0;">${name}</li>`).join('');

  const messageSection = customMessage ? `
    <div style="background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; color: #374151; white-space: pre-wrap;">${customMessage}</p>
    </div>
  ` : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #1A1A1A; padding: 25px 30px;">
        <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">IMPACT DIRECT PRINTING</h1>
        <p style="color: #9CA3AF; margin: 5px 0 0 0; font-size: 14px;">Your Proof is Ready for Review</p>
      </div>

      <div style="padding: 25px 30px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="font-size: 15px;">Hi ${customerName},</p>

        <p style="font-size: 15px; line-height: 1.6;">
          Your proof for <strong>Job #${jobNo}</strong> - ${productTitle} is ready for review.
        </p>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; font-weight: 600; color: #1e40af;">📎 Attached Files:</p>
          <ul style="margin: 0; padding-left: 20px; color: #374151;">
            ${filesList}
          </ul>
        </div>

        ${messageSection}

        <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-weight: 600; color: #92400e;">⚠️ IMPORTANT</p>
          <p style="margin: 8px 0 0 0; color: #78350f; font-size: 14px;">
            Please reply with <strong>"APPROVED"</strong> to proceed with printing, or let us know what changes are needed.
          </p>
        </div>

        <p style="font-size: 14px; color: #6b7280;">
          Questions? Reply to this email or call us at (330) 963-0970.
        </p>

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

export async function sendCustomerProofEmail(
  job: any,
  recipientEmail: string,
  customerName: string,
  attachments: Array<{ content: string; filename: string; mimeType: string }>,
  customMessage?: string
): Promise<EmailResult> {
  try {
    const jobNo = job.jobNo || job.id;
    const fileNames = attachments.map(a => a.filename);
    const subject = `Proof Ready for Review - Job #${jobNo} - Impact Direct Printing`;
    const body = getCustomerProofEmailBody(job, customerName, fileNames, customMessage);
    const replyTo = getJobEmailAddress(jobNo);

    // Convert attachments to email format
    const emailAttachments: EmailAttachment[] = attachments.map(a => ({
      content: a.content,
      filename: a.filename,
      type: a.mimeType,
      disposition: 'attachment',
    }));

    const result = await sendEmail({
      to: recipientEmail,
      subject,
      body,
      attachments: emailAttachments,
      replyTo,
    });

    if (result.success) {
      console.log('📧 Customer proof email sent:', {
        to: recipientEmail,
        jobNo,
        fileCount: attachments.length,
      });
    }

    return result;
  } catch (error: any) {
    console.error('Error sending customer proof email:', error);
    return { success: false, error: error.message || 'Failed to send proof email' };
  }
}
