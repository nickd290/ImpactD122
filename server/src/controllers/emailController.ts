import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import { prisma } from '../utils/prisma';
import {
  sendInvoiceEmail,
  sendArtworkNotificationEmail,
  sendCustomerConfirmationEmail,
  sendShipmentTrackingEmail,
  sendVendorPOWithPortalEmail,
  sendCustomerProofEmail,
  getJobEmailAddress,
} from '../services/emailService';
import sgMail from '@sendgrid/mail';

// Initialize SendGrid
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
}

// Helper to transform job to PDF-compatible format (same as pdfController)
function transformJobForPDF(job: any) {
  const revenue = job.impactCustomerTotal ? Number(job.impactCustomerTotal) :
                  job.customerTotal ? Number(job.customerTotal) : 0;
  const quantity = job.quantity || 0;
  const unitPrice = quantity > 0 ? (revenue / quantity) : 0;

  return {
    id: job.id,
    number: job.jobNo,
    title: job.title || '',
    status: job.status,
    notes: job.notes || '',
    customerPONumber: job.customerPONumber || '',
    vendorPONumber: job.customerPONumber || job.jobNo,
    invoiceNumber: job.jobNo,
    quoteNumber: job.jobNo,
    dueDate: job.deliveryDate,
    createdAt: job.createdAt,
    sellPrice: job.sellPrice,
    // Additional job fields for PDF
    quantity: quantity,
    sizeName: job.sizeName || '',
    mailDate: job.mailDate,
    inHomesDate: job.inHomesDate,
    description: job.description || '',
    customer: job.Company ? {
      name: job.Company.name,
      email: job.Company.email || '',
      phone: job.Company.phone || '',
      address: job.Company.address || '',
      contactPerson: '',
    } : { name: 'N/A', email: '', phone: '', address: '', contactPerson: '' },
    vendor: job.Vendor ? {
      name: job.Vendor.name,
      email: job.Vendor.email || '',
      phone: job.Vendor.phone || '',
      address: [job.Vendor.streetAddress, job.Vendor.city, job.Vendor.state, job.Vendor.zip].filter(Boolean).join(', '),
      contactPerson: '',
    } : { name: 'N/A', email: '', phone: '', address: '', contactPerson: '' },
    specs: job.specs || {},
    lineItems: quantity > 0 ? [{
      description: job.title || 'Print Job',
      quantity: quantity,
      unitCost: job.paperCostCPM ? Number(job.paperCostCPM) : 0,
      unitPrice: unitPrice,
    }] : [],
    financials: {
      impactCustomerTotal: revenue,
      jdServicesTotal: job.jdTotal ? Number(job.jdTotal) : 0,
      bradfordPaperCost: job.bradfordTotal ? Number(job.bradfordTotal) : 0,
      paperMarkupAmount: job.impactMargin ? Number(job.impactMargin) : 0,
    },
  };
}

// Email Invoice to customer
export const emailInvoice = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { recipientEmail } = req.body;

    console.log('📧 Sending invoice:', { jobId, recipientEmail });

    if (!recipientEmail) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        Company: true,
        Vendor: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const customerName = job.Company?.name || 'Customer';
    const jobData = transformJobForPDF(job);

    // Send the email
    const result = await sendInvoiceEmail(jobData, recipientEmail, customerName);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to send email' });
    }

    // Update job with email tracking info
    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        invoiceEmailedAt: result.emailedAt,
        invoiceEmailedTo: recipientEmail,
        invoiceEmailedCount: { increment: 1 },
      },
    });

    res.json({
      success: true,
      message: `Invoice emailed to ${recipientEmail}`,
      emailedAt: result.emailedAt,
      job: {
        id: updatedJob.id,
        invoiceEmailedAt: updatedJob.invoiceEmailedAt,
        invoiceEmailedTo: updatedJob.invoiceEmailedTo,
        invoiceEmailedCount: updatedJob.invoiceEmailedCount,
      },
    });
  } catch (error: any) {
    console.error('Error emailing invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to email invoice' });
  }
};

// Email artwork notification to vendor
export const emailArtworkNotification = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { artworkUrl } = req.body;

    console.log('📧 Sending artwork notification:', { jobId, artworkUrl });

    if (!artworkUrl) {
      return res.status(400).json({ error: 'Artwork URL is required' });
    }

    // Validate URL format
    try {
      new URL(artworkUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid artwork URL format' });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        Company: true,
        Vendor: {
          include: {
            contacts: true,  // Include vendor contacts
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.Vendor) {
      return res.status(400).json({ error: 'Job has no vendor assigned' });
    }

    // Collect all vendor emails (main + contacts)
    const vendorEmails: string[] = [];

    // Add primary vendor email if exists
    if (job.Vendor.email) {
      vendorEmails.push(job.Vendor.email);
    }

    // Add all vendor contact emails
    if (job.Vendor.contacts && job.Vendor.contacts.length > 0) {
      for (const contact of job.Vendor.contacts) {
        if (contact.email && !vendorEmails.includes(contact.email)) {
          vendorEmails.push(contact.email);
        }
      }
    }

    if (vendorEmails.length === 0) {
      return res.status(400).json({ error: 'Vendor has no email addresses' });
    }

    const vendorName = job.Vendor.name || 'Vendor';
    // Use the first email as primary (usually the main vendor email or primary contact)
    const primaryEmail = vendorEmails[0];
    // Additional contacts go in the TO field as well
    const additionalVendorEmails = vendorEmails.slice(1);

    const jobData = transformJobForPDF(job);

    // Send the email (to primary vendor, CC to additional contacts and internal team)
    const result = await sendArtworkNotificationEmail(
      jobData,
      primaryEmail,
      vendorName,
      artworkUrl,
      additionalVendorEmails  // Pass additional vendor contacts
    );

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to send email' });
    }

    // Update job specs with artwork URL and clear artworkToFollow flag
    const currentSpecs = (job.specs as any) || {};
    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        specs: {
          ...currentSpecs,
          artworkUrl: artworkUrl,
          artworkToFollow: false,
        },
        artworkEmailedAt: result.emailedAt,
        artworkEmailedTo: vendorEmails.join(', '),  // Store all recipients
      },
    });

    res.json({
      success: true,
      message: `Artwork notification emailed to ${vendorEmails.length} vendor recipient(s)`,
      emailedAt: result.emailedAt,
      recipients: {
        to: vendorEmails,
        cc: ['brandon@impactdirectprinting.com', 'nick@jdgraphic.com', 'devin@jdgraphic.com'],
      },
      job: {
        id: updatedJob.id,
        artworkUrl: artworkUrl,
      },
    });
  } catch (error: any) {
    console.error('Error emailing artwork notification:', error);
    res.status(500).json({ error: error.message || 'Failed to email artwork notification' });
  }
};

// Email customer order confirmation
export const emailCustomerConfirmation = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { recipientEmail } = req.body;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        Company: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Use provided email or customer email
    const email = recipientEmail || job.Company?.email;
    if (!email) {
      return res.status(400).json({ error: 'No customer email available' });
    }

    const customerName = job.Company?.name || 'Customer';

    const result = await sendCustomerConfirmationEmail(job, email, customerName);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to send email' });
    }

    res.json({
      success: true,
      message: `Order confirmation emailed to ${email}`,
      emailedAt: result.emailedAt,
    });
  } catch (error: any) {
    console.error('Error emailing customer confirmation:', error);
    res.status(500).json({ error: error.message || 'Failed to email confirmation' });
  }
};

// Email shipment tracking notification
export const emailShipmentTracking = async (req: Request, res: Response) => {
  try {
    const { jobId, shipmentId } = req.params;
    const { recipientEmail } = req.body;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        Company: true,
        Shipment: {
          where: { id: shipmentId },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const shipment = job.Shipment[0];
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (!shipment.trackingNo) {
      return res.status(400).json({ error: 'Shipment has no tracking number' });
    }

    // Use provided email or customer email
    const email = recipientEmail || job.Company?.email;
    if (!email) {
      return res.status(400).json({ error: 'No customer email available' });
    }

    const customerName = job.Company?.name || 'Customer';

    const result = await sendShipmentTrackingEmail(job, shipment, email, customerName);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to send email' });
    }

    // Update shipment with email tracking
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingEmailedAt: result.emailedAt,
        trackingEmailedTo: email,
      },
    });

    res.json({
      success: true,
      message: `Tracking notification emailed to ${email}`,
      emailedAt: result.emailedAt,
    });
  } catch (error: any) {
    console.error('Error emailing shipment tracking:', error);
    res.status(500).json({ error: error.message || 'Failed to email tracking' });
  }
};

// Email vendor PO with portal link
export const emailVendorPOWithPortal = async (req: Request, res: Response) => {
  try {
    const { jobId, poId } = req.params;
    const { recipientEmail, specialInstructions } = req.body;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          where: { id: poId },
          include: { Vendor: true },
        },
        JobPortal: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const po = job.PurchaseOrder[0];
    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    // Get or create portal link
    let portal = job.JobPortal;
    if (!portal || portal.expiresAt < new Date()) {
      // Create new portal
      if (portal) {
        await prisma.jobPortal.delete({ where: { id: portal.id } });
      }
      const shareToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      portal = await prisma.jobPortal.create({
        data: {
          jobId,
          shareToken,
          expiresAt,
        },
      });
    }

    // Get vendor info
    const vendor = po.Vendor || job.Vendor;
    if (!vendor) {
      return res.status(400).json({ error: 'No vendor found for this PO' });
    }

    const email = recipientEmail || vendor.email;
    if (!email) {
      return res.status(400).json({ error: 'No vendor email available' });
    }

    const vendorName = vendor.name || 'Vendor';
    const baseUrl = process.env.APP_URL || 'https://app.impactdirectprinting.com';
    const portalUrl = `${baseUrl}/portal/${portal.shareToken}`;

    const result = await sendVendorPOWithPortalEmail(
      po,
      job,
      email,
      vendorName,
      portalUrl,
      { specialInstructions: specialInstructions || (job.specs as any)?.specialInstructions }
    );

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to send email' });
    }

    // Update PO with email tracking
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        emailedAt: result.emailedAt,
        emailedTo: email,
      },
    });

    res.json({
      success: true,
      message: `Vendor PO emailed to ${email} with portal link`,
      emailedAt: result.emailedAt,
      portalUrl,
    });
  } catch (error: any) {
    console.error('Error emailing vendor PO with portal:', error);
    res.status(500).json({ error: error.message || 'Failed to email PO' });
  }
};

// Send proof to customer
export const sendProofToCustomer = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { recipientEmail, fileIds, message } = req.body;

    console.log('📧 Sending proof to customer:', { jobId, recipientEmail, fileIds });

    if (!recipientEmail) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'At least one file must be selected' });
    }

    // Fetch job with company
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        Company: true,
        File: {
          where: {
            id: { in: fileIds },
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.File.length === 0) {
      return res.status(404).json({ error: 'No files found with the provided IDs' });
    }

    const customerName = job.Company?.name || 'Customer';

    // Read file contents and prepare attachments
    const attachments: Array<{ content: string; filename: string; mimeType: string }> = [];

    for (const file of job.File) {
      // Try to find file in uploads directory
      const filePath = `uploads/${file.objectKey}`;
      if (fs.existsSync(filePath)) {
        try {
          const fileBuffer = fs.readFileSync(filePath);
          attachments.push({
            content: fileBuffer.toString('base64'),
            filename: file.fileName,
            mimeType: file.mimeType,
          });
        } catch (err) {
          console.warn(`Could not read file ${file.fileName}:`, err);
        }
      } else {
        console.warn(`File not found on disk: ${filePath}`);
      }
    }

    if (attachments.length === 0) {
      return res.status(500).json({ error: 'Could not read any of the selected files' });
    }

    // Send the email
    const result = await sendCustomerProofEmail(
      job,
      recipientEmail,
      customerName,
      attachments,
      message
    );

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to send email' });
    }

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId,
        action: 'PROOF_SENT_TO_CUSTOMER',
        field: 'proofEmail',
        oldValue: null,
        newValue: `Sent to ${recipientEmail}: ${job.File.map(f => f.fileName).join(', ')}`,
        changedBy: 'admin',
        changedByRole: 'BROKER_ADMIN',
      },
    });

    res.json({
      success: true,
      message: `Proof sent to ${recipientEmail}`,
      emailedAt: result.emailedAt,
      fileCount: attachments.length,
    });
  } catch (error: any) {
    console.error('Error sending proof to customer:', error);
    res.status(500).json({ error: error.message || 'Failed to send proof email' });
  }
};

// Notify vendor that customer approved proof - proceed to production
export const notifyVendorApproval = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    console.log('📧 Notifying vendor of customer approval:', { jobId });

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        Company: true,
        Vendor: {
          include: {
            contacts: true,
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.Vendor) {
      return res.status(400).json({ error: 'Job has no vendor assigned' });
    }

    // Collect vendor emails
    const vendorEmails: string[] = [];
    if (job.Vendor.email) {
      vendorEmails.push(job.Vendor.email);
    }
    if (job.Vendor.contacts) {
      for (const contact of job.Vendor.contacts) {
        if (contact.email && !vendorEmails.includes(contact.email)) {
          vendorEmails.push(contact.email);
        }
      }
    }

    if (vendorEmails.length === 0) {
      return res.status(400).json({ error: 'Vendor has no email addresses' });
    }

    const vendorName = job.Vendor.name || 'Vendor';
    const customerName = job.Company?.name || 'Customer';
    const jobNo = job.jobNo;
    const jobTitle = job.title || 'Print Job';
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'brandon@impactdirectprinting.com';
    const jobEmail = getJobEmailAddress(jobNo);

    // Determine branding based on routing type
    const isBradfordRouting = job.routingType === 'BRADFORD_JD';
    const companyName = isBradfordRouting ? 'Bradford Exchange Ltd.' : 'Impact Direct Printing';
    const headerColor = isBradfordRouting ? '#003366' : '#22c55e';
    const accentColor = isBradfordRouting ? '#CC9900' : '#22c55e';

    const body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${headerColor}; padding: 20px; text-align: center;${isBradfordRouting ? ' border-bottom: 4px solid ' + accentColor + ';' : ''}">
          <h1 style="color: white; margin: 0; font-size: 22px;">✅ Proof Approved - Proceed to Production</h1>
        </div>

        <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px;">Dear ${vendorName},</p>

          <p style="font-size: 16px;">Great news! The customer has approved the proof for this job. <strong>Please proceed with production.</strong></p>

          <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <h2 style="color: #166534; margin: 0 0 10px 0;">APPROVED FOR PRODUCTION</h2>
            <p style="color: #166534; margin: 0; font-size: 14px;">Begin manufacturing immediately</p>
          </div>

          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <table style="width: 100%;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; width: 100px;">Job #:</td>
                <td style="padding: 8px 0; font-weight: 600;">${jobNo}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Title:</td>
                <td style="padding: 8px 0; font-weight: 600;">${jobTitle}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Customer:</td>
                <td style="padding: 8px 0; font-weight: 600;">${customerName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Quantity:</td>
                <td style="padding: 8px 0; font-weight: 600;">${job.quantity?.toLocaleString() || 'TBD'}</td>
              </tr>
            </table>
          </div>

          <p style="color: #6b7280; font-size: 14px;">
            If you have any questions, please reply to this email.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />

          <p style="color: #9ca3af; font-size: 12px;">
            ${companyName}<br/>
            This is an automated notification.
          </p>
        </div>
      </div>
    `;

    // Send email to all vendor contacts
    try {
      await sgMail.send({
        to: vendorEmails,
        cc: 'nick@jdgraphic.com',
        from: { email: fromEmail, name: companyName },
        subject: `✅ APPROVED - Job #${jobNo} - Proceed to Production`,
        html: body,
        replyTo: jobEmail,
      });
      console.log(`📧 Vendor approval notification sent to: ${vendorEmails.join(', ')}`);
    } catch (emailError: any) {
      console.error('Failed to send vendor approval email:', emailError);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    // Update workflow status
    await prisma.job.update({
      where: { id: jobId },
      data: {
        workflowStatus: 'IN_PRODUCTION',
        workflowUpdatedAt: new Date(),
      },
    });

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId,
        action: 'VENDOR_NOTIFIED_APPROVAL',
        field: 'workflowStatus',
        oldValue: 'APPROVED_PENDING_VENDOR',
        newValue: 'IN_PRODUCTION',
        changedBy: 'admin',
        changedByRole: 'BROKER_ADMIN',
      },
    });

    res.json({
      success: true,
      message: `Vendor notified of approval - job now IN_PRODUCTION`,
      emailedTo: vendorEmails,
      workflowStatus: 'IN_PRODUCTION',
    });
  } catch (error: any) {
    console.error('Error notifying vendor of approval:', error);
    res.status(500).json({ error: error.message || 'Failed to notify vendor' });
  }
};
