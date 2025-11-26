import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { generateQuotePDF, generateInvoicePDF, generateVendorPOPDF } from '../services/pdfService';

// Helper to transform job to PDF-compatible format
function transformJobForPDF(job: any) {
  // Calculate revenue from customerTotal or impactCustomerTotal
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
    vendorPONumber: job.customerPONumber || job.jobNo, // Use as PO number
    invoiceNumber: job.jobNo, // Use job number as invoice number
    quoteNumber: job.jobNo,
    dueDate: job.deliveryDate,
    createdAt: job.createdAt,
    // Transform Company to customer
    customer: job.Company ? {
      name: job.Company.name,
      email: job.Company.email || '',
      phone: job.Company.phone || '',
      address: job.Company.address || '',
      contactPerson: '',
    } : { name: 'N/A', email: '', phone: '', address: '', contactPerson: '' },
    // Transform Vendor
    vendor: job.Vendor ? {
      name: job.Vendor.name,
      email: job.Vendor.email || '',
      phone: job.Vendor.phone || '',
      address: [job.Vendor.streetAddress, job.Vendor.city, job.Vendor.state, job.Vendor.zip].filter(Boolean).join(', '),
      contactPerson: '',
    } : { name: 'N/A', email: '', phone: '', address: '', contactPerson: '' },
    // Specs from JSON field
    specs: job.specs || {},
    // Create synthetic lineItems from job-level data
    lineItems: quantity > 0 ? [{
      description: job.title || 'Print Job',
      quantity: quantity,
      unitCost: job.paperCostCPM ? Number(job.paperCostCPM) : 0,
      unitPrice: unitPrice,
    }] : [],
    // Financials
    financials: {
      impactCustomerTotal: revenue,
      jdServicesTotal: job.jdTotal ? Number(job.jdTotal) : 0,
      bradfordPaperCost: job.bradfordTotal ? Number(job.bradfordTotal) : 0,
      paperMarkupAmount: job.impactMargin ? Number(job.impactMargin) : 0,
    },
  };
}

// Generate Quote PDF
export const generateQuote = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

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

    const transformedJob = transformJobForPDF(job);
    const pdfBuffer = generateQuotePDF(transformedJob);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Quote-${transformedJob.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate quote error:', error);
    res.status(500).json({ error: 'Failed to generate quote' });
  }
};

// Generate Invoice PDF
export const generateInvoice = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

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

    const transformedJob = transformJobForPDF(job);
    const pdfBuffer = generateInvoicePDF(transformedJob);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${transformedJob.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate invoice error:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
};

// Generate Vendor PO PDF
export const generateVendorPO = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

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

    const transformedJob = transformJobForPDF(job);
    const pdfBuffer = generateVendorPOPDF(transformedJob);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PO-${transformedJob.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate vendor PO error:', error);
    res.status(500).json({ error: 'Failed to generate vendor PO' });
  }
};
