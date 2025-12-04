import sgMail from '@sendgrid/mail';
import { generateInvoicePDF, generateVendorPOPDF, generateJDToBradfordInvoicePDF } from './pdfService';

// Initialize SendGrid
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
} else {
  console.warn('⚠️ SENDGRID_API_KEY not set - email functionality disabled');
}

interface SendEmailOptions {
  to: string;
  cc?: string | string[];
  subject: string;
  body: string;
  attachmentBuffer?: Buffer;
  attachmentFilename?: string;
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

  // Add attachment if provided
  if (options.attachmentBuffer && options.attachmentFilename) {
    msg.attachments = [
      {
        content: options.attachmentBuffer.toString('base64'),
        filename: options.attachmentFilename,
        type: 'application/pdf',
        disposition: 'attachment',
      },
    ];
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
function getPOEmailBody(po: any, vendorName: string, job: any): string {
  const poNumber = po.poNumber || po.id;
  const buyCost = po.buyCost ? `$${Number(po.buyCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1A1A1A;">Purchase Order from Impact Direct Printing</h2>

      <p>Dear ${vendorName},</p>

      <p>Please find attached the Purchase Order #${poNumber}${job?.jobNo ? ` for Job #${job.jobNo}` : ''}.</p>

      ${buyCost ? `<p><strong>PO Amount:</strong> ${buyCost}</p>` : ''}

      <p>Please confirm receipt and let us know if you have any questions.</p>

      <p>Thank you!</p>

      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />

      <p style="color: #666; font-size: 12px;">
        Impact Direct Printing<br />
        brandon@impactdirectprinting.com
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

    return await sendEmail({
      to: recipientEmail,
      subject,
      body,
      attachmentBuffer: pdfBuffer,
      attachmentFilename: filename,
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
  recipientEmail: string,
  vendorName: string
): Promise<EmailResult> {
  try {
    // Generate PDF - include Job's artworkToFollow flag from specs AND PO's buyCost
    const jobWithPOData = {
      ...job,
      artworkToFollow: job.specs?.artworkToFollow || false,
      buyCost: po.buyCost ? Number(po.buyCost) : 0,
    };
    const pdfBuffer = generateVendorPOPDF(jobWithPOData);

    const poNumber = po.poNumber || po.id;
    const subject = `Purchase Order #${poNumber} - Impact Direct Printing`;
    const body = getPOEmailBody(po, vendorName, job);
    const filename = `PO-${poNumber}.pdf`;

    return await sendEmail({
      to: recipientEmail,
      cc: VENDOR_PO_CC_EMAIL,
      subject,
      body,
      attachmentBuffer: pdfBuffer,
      attachmentFilename: filename,
    });
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

    const result = await sendEmail({
      to: allVendorEmails.join(','),  // Send to primary + all additional vendor contacts
      cc: allCcEmails,  // Internal team
      subject,
      body,
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

    // Send to vendor with CC
    const result = await sendEmail({
      to: vendorEmail,
      cc: ccList,
      subject,
      body,
      attachmentBuffer: pdfBuffer,
      attachmentFilename: filename,
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
