import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { sendInvoiceEmail, sendPOEmail } from '../services/emailService';

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

// Email PO to vendor
export const emailPO = async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const { recipientEmail } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        Job: {
          include: {
            Company: true,
            Vendor: true,
          },
        },
        Vendor: true,
        Company_PurchaseOrder_targetCompanyIdToCompany: true,
      },
    });

    if (!po) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }

    // Determine vendor name from PO relations
    const vendorName = po.Vendor?.name ||
                       po.Company_PurchaseOrder_targetCompanyIdToCompany?.name ||
                       'Vendor';

    // Prepare job data for PDF generation
    const jobData = po.Job ? transformJobForPDF(po.Job) : null;

    if (!jobData) {
      return res.status(400).json({ error: 'PO is not linked to a job' });
    }

    // Send the email
    const result = await sendPOEmail(po, jobData, recipientEmail, vendorName);

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to send email' });
    }

    // Update PO with email tracking info
    const updatedPO = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        emailedAt: result.emailedAt,
        emailedTo: recipientEmail,
      },
    });

    res.json({
      success: true,
      message: `PO emailed to ${recipientEmail}`,
      emailedAt: result.emailedAt,
      purchaseOrder: {
        id: updatedPO.id,
        emailedAt: updatedPO.emailedAt,
        emailedTo: updatedPO.emailedTo,
      },
    });
  } catch (error: any) {
    console.error('Error emailing PO:', error);
    res.status(500).json({ error: error.message || 'Failed to email PO' });
  }
};
