import sgMail from '@sendgrid/mail';
import { generateInvoicePDF, generateVendorPOPDF } from './pdfService';

// Initialize SendGrid
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
} else {
  console.warn('⚠️ SENDGRID_API_KEY not set - email functionality disabled');
}

interface SendEmailOptions {
  to: string;
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
export async function sendPOEmail(
  po: any,
  job: any,
  recipientEmail: string,
  vendorName: string
): Promise<EmailResult> {
  try {
    // Generate PDF - use the full job data with PO info
    const pdfBuffer = generateVendorPOPDF(job);

    const poNumber = po.poNumber || po.id;
    const subject = `Purchase Order #${poNumber} - Impact Direct Printing`;
    const body = getPOEmailBody(po, vendorName, job);
    const filename = `PO-${poNumber}.pdf`;

    return await sendEmail({
      to: recipientEmail,
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
