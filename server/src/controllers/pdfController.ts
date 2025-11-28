import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { generateQuotePDF, generateInvoicePDF, generateVendorPOPDF, generatePOPDF } from '../services/pdfService';

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

    // Track document generation
    await prisma.job.update({
      where: { id: jobId },
      data: {
        quoteGeneratedAt: new Date(),
        quoteGeneratedCount: { increment: 1 },
      },
    });

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId,
        action: 'DOCUMENT_GENERATED',
        field: 'quote',
        newValue: `Quote generated at ${new Date().toISOString()}`,
        changedBy: 'system',
        changedByRole: 'BROKER_ADMIN',
      },
    });

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

    // Track document generation
    await prisma.job.update({
      where: { id: jobId },
      data: {
        invoiceGeneratedAt: new Date(),
        invoiceGeneratedCount: { increment: 1 },
      },
    });

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId,
        action: 'DOCUMENT_GENERATED',
        field: 'invoice',
        newValue: `Invoice generated at ${new Date().toISOString()}`,
        changedBy: 'system',
        changedByRole: 'BROKER_ADMIN',
      },
    });

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

    // Track document generation
    await prisma.job.update({
      where: { id: jobId },
      data: {
        poGeneratedAt: new Date(),
        poGeneratedCount: { increment: 1 },
      },
    });

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId,
        action: 'DOCUMENT_GENERATED',
        field: 'vendorPO',
        newValue: `Vendor PO generated at ${new Date().toISOString()}`,
        changedBy: 'system',
        changedByRole: 'BROKER_ADMIN',
      },
    });

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

// Generate PDF for a specific Purchase Order
export const generatePurchaseOrderPDF = async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;

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

    // Get job specs
    const jobSpecs = po.Job?.specs as any || {};

    // Transform PO data for PDF with comprehensive job details
    const poData = {
      poNumber: po.poNumber || po.id.slice(0, 8),
      description: po.description || 'Purchase Order',
      buyCost: po.buyCost ? Number(po.buyCost) : 0,
      vendorRef: po.vendorRef || '',
      issuedAt: po.issuedAt || new Date(),
      status: po.status,
      originCompanyId: po.originCompanyId,
      targetCompanyId: po.targetCompanyId,

      // Job info - comprehensive
      jobNumber: po.Job?.jobNo || 'N/A',
      jobTitle: po.Job?.title || '',
      dueDate: po.Job?.deliveryDate,
      mailDate: po.Job?.mailDate,
      inHomesDate: po.Job?.inHomesDate,
      quantity: po.Job?.quantity || 0,
      sizeName: po.Job?.sizeName || jobSpecs.finishedSize || jobSpecs.sizeName || '',

      // Customer info
      customer: po.Job?.Company ? {
        name: po.Job.Company.name,
        email: po.Job.Company.email || '',
        phone: po.Job.Company.phone || '',
        address: po.Job.Company.address || '',
      } : { name: 'N/A', email: '', phone: '', address: '' },
      customerPONumber: po.Job?.customerPONumber || '',

      // Job specs - comprehensive
      specs: {
        productType: jobSpecs.productType || '',
        finishedSize: jobSpecs.finishedSize || jobSpecs.sizeName || po.Job?.sizeName || '',
        flatSize: jobSpecs.flatSize || '',
        paperType: jobSpecs.paperType || '',
        paperWeight: jobSpecs.paperWeight || '',
        colors: jobSpecs.colors || '',
        coating: jobSpecs.coating || '',
        finishing: jobSpecs.finishing || '',
        bindingStyle: jobSpecs.bindingStyle || '',
        coverType: jobSpecs.coverType || '',
        coverPaperType: jobSpecs.coverPaperType || '',
        pageCount: jobSpecs.pageCount || '',
        folds: jobSpecs.folds || '',
        perforations: jobSpecs.perforations || '',
        specialInstructions: jobSpecs.specialInstructions || '',
      },

      // Vendor info (target of the PO)
      vendor: po.Vendor ? {
        name: po.Vendor.name,
        email: po.Vendor.email || '',
        phone: po.Vendor.phone || '',
        address: [po.Vendor.streetAddress, po.Vendor.city, po.Vendor.state, po.Vendor.zip].filter(Boolean).join(', '),
      } : po.Company_PurchaseOrder_targetCompanyIdToCompany ? {
        name: po.Company_PurchaseOrder_targetCompanyIdToCompany.name,
        email: po.Company_PurchaseOrder_targetCompanyIdToCompany.email || '',
        phone: po.Company_PurchaseOrder_targetCompanyIdToCompany.phone || '',
        address: po.Company_PurchaseOrder_targetCompanyIdToCompany.address || '',
      } : { name: 'N/A', email: '', phone: '', address: '' },

      // Cost breakdown (if available)
      paperCost: po.paperCost ? Number(po.paperCost) : undefined,
      paperMarkup: po.paperMarkup ? Number(po.paperMarkup) : undefined,
      mfgCost: po.mfgCost ? Number(po.mfgCost) : undefined,
      printCPM: po.printCPM ? Number(po.printCPM) : undefined,
      paperCPM: po.paperCPM ? Number(po.paperCPM) : undefined,
    };

    const pdfBuffer = generatePOPDF(poData);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PO-${poData.poNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate PO PDF error:', error);
    res.status(500).json({ error: 'Failed to generate purchase order PDF' });
  }
};
