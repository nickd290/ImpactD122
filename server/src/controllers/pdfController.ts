import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { generateQuotePDF, generateInvoicePDF, generateVendorPOPDF, generatePOPDF } from '../services/pdfService';

// Helper to transform job to PDF-compatible format
function transformJobForPDF(job: any) {
  // Calculate revenue from sellPrice or customerTotal
  const revenue = job.sellPrice ? Number(job.sellPrice) :
                  job.impactCustomerTotal ? Number(job.impactCustomerTotal) :
                  job.customerTotal ? Number(job.customerTotal) : 0;
  const quantity = job.quantity || 0;
  const unitPrice = quantity > 0 ? (revenue / quantity) : 0;

  // Get stored lineItems from specs if available
  const storedLineItems = job.specs?.lineItems;

  return {
    id: job.id,
    number: job.jobNo,
    title: job.title || '',
    status: job.status,
    notes: job.notes || '',
    quantity: quantity,
    sizeName: job.sizeName || '',
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
    // Transform Vendor - use job vendor or fallback to generic
    vendor: job.Vendor ? {
      name: job.Vendor.name,
      email: job.Vendor.email || '',
      phone: job.Vendor.phone || '',
      address: [job.Vendor.streetAddress, job.Vendor.city, job.Vendor.state, job.Vendor.zip].filter(Boolean).join(', '),
      contactPerson: '',
    } : { name: 'External Vendor', email: '', phone: '', address: '', contactPerson: '' },
    // Specs from JSON field
    specs: job.specs || {},
    // Use stored lineItems from specs, or create from job-level data
    lineItems: storedLineItems || (quantity > 0 ? [{
      description: job.title || 'Print Job',
      quantity: quantity,
      unitCost: 0,
      unitPrice: unitPrice,
    }] : []),
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

    // DEBUG: Log line items to verify unitCost values
    const specsObj = job.specs as Record<string, any> | null;
    console.log('📋 Vendor PO - Job specs.lineItems:', JSON.stringify(specsObj?.lineItems, null, 2));
    console.log('📋 Vendor PO - Transformed lineItems:', JSON.stringify(transformedJob.lineItems, null, 2));

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

    // Calculate total cost based on PO type
    let totalBuyCost = po.buyCost ? Number(po.buyCost) : 0;

    // For Bradford→JD POs, calculate from component costs or CPM
    if (po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic') {
      const mfgCost = po.mfgCost ? Number(po.mfgCost) : 0;
      const paperCost = po.paperCost ? Number(po.paperCost) : 0;
      if (mfgCost > 0 || paperCost > 0) {
        totalBuyCost = mfgCost + paperCost;
      } else if (po.printCPM && po.Job?.quantity) {
        // Calculate from CPM if component costs not set
        totalBuyCost = Number(po.printCPM) * (po.Job.quantity / 1000);
      }
    }

    // Transform PO data for PDF with comprehensive job details
    const poData = {
      poNumber: po.poNumber || po.id.slice(0, 8),
      description: po.description || 'Purchase Order',
      buyCost: totalBuyCost,
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
        bleed: jobSpecs.bleed || '',
        proofType: jobSpecs.proofType || '',
        dieCut: jobSpecs.dieCut || '',
        // Ship-to information
        shipToName: jobSpecs.shipToName || '',
        shipToAddress: jobSpecs.shipToAddress || '',
        shipVia: jobSpecs.shipVia || '',
        // All parsed notes/instructions
        specialInstructions: jobSpecs.specialInstructions || '',
        artworkInstructions: jobSpecs.artworkInstructions || '',
        packingInstructions: jobSpecs.packingInstructions || '',
        labelingInstructions: jobSpecs.labelingInstructions || '',
        additionalNotes: jobSpecs.additionalNotes || '',
        artworkUrl: jobSpecs.artworkUrl || '',
        // ===== PHASE 15: Enhanced Universal PO Parsing =====
        versions: jobSpecs.versions || [],
        languageBreakdown: jobSpecs.languageBreakdown || [],
        totalVersionQuantity: jobSpecs.totalVersionQuantity || 0,
        timeline: jobSpecs.timeline || {},
        mailing: jobSpecs.mailing || {},
        responsibilities: jobSpecs.responsibilities || { vendorTasks: [], customerTasks: [] },
        specialHandling: jobSpecs.specialHandling || {},
        paymentTerms: jobSpecs.paymentTerms || '',
        fob: jobSpecs.fob || '',
        accountNumber: jobSpecs.accountNumber || '',
      },

      // Vendor info (target of the PO)
      // Priority: 1) PO's External Vendor, 2) Job's Vendor, 3) Internal Company, 4) Parse from description, 5) Default
      vendor: (() => {
        // Priority 1: PO's external vendor (from targetVendorId)
        if (po.Vendor) {
          return {
            name: po.Vendor.name,
            email: po.Vendor.email || '',
            phone: po.Vendor.phone || '',
            address: [po.Vendor.streetAddress, po.Vendor.city, po.Vendor.state, po.Vendor.zip].filter(Boolean).join(', '),
          };
        }
        // Priority 2: Job's assigned vendor
        if (po.Job?.Vendor) {
          return {
            name: po.Job.Vendor.name,
            email: po.Job.Vendor.email || '',
            phone: po.Job.Vendor.phone || '',
            address: [po.Job.Vendor.streetAddress, po.Job.Vendor.city, po.Job.Vendor.state, po.Job.Vendor.zip].filter(Boolean).join(', '),
          };
        }
        // Priority 3: Internal company (Bradford/JD)
        if (po.Company_PurchaseOrder_targetCompanyIdToCompany) {
          return {
            name: po.Company_PurchaseOrder_targetCompanyIdToCompany.name ||
                  (po.targetCompanyId === 'jd-graphic' ? 'JD Graphic' :
                   po.targetCompanyId === 'bradford' ? 'Bradford' : 'Vendor'),
            email: po.Company_PurchaseOrder_targetCompanyIdToCompany.email ||
                   (po.targetCompanyId === 'jd-graphic' ? 'production@jdgraphic.com' : ''),
            phone: po.Company_PurchaseOrder_targetCompanyIdToCompany.phone || '',
            address: po.Company_PurchaseOrder_targetCompanyIdToCompany.address || '',
          };
        }
        // Priority 4: Hardcoded internal companies
        if (po.targetCompanyId === 'jd-graphic') {
          return { name: 'JD Graphic', email: 'production@jdgraphic.com', phone: '', address: '' };
        }
        if (po.targetCompanyId === 'bradford') {
          return { name: 'Bradford', email: '', phone: '', address: '' };
        }
        // Priority 5: Try to extract vendor name from PO description
        // Format: "Impact to {VENDOR NAME} - ..." or just use description as vendor indicator
        const desc = po.description || '';
        const vendorMatch = desc.match(/^Impact to (.+?) -/);
        if (vendorMatch) {
          return { name: vendorMatch[1], email: '', phone: '', address: '' };
        }
        // Priority 6: Default - use description or generic
        return { name: desc || 'External Vendor', email: '', phone: '', address: '' };
      })(),

      // Cost breakdown (if available)
      paperCost: po.paperCost ? Number(po.paperCost) : undefined,
      paperMarkup: po.paperMarkup ? Number(po.paperMarkup) : undefined,
      mfgCost: po.mfgCost ? Number(po.mfgCost) : undefined,
      printCPM: po.printCPM ? Number(po.printCPM) : undefined,
      paperCPM: po.paperCPM ? Number(po.paperCPM) : undefined,

      // Artwork to follow flag (from Job specs)
      artworkToFollow: jobSpecs.artworkToFollow || false,

      // Line items from job specs (for cost display on PO)
      lineItems: jobSpecs.lineItems || [{
        description: po.Job?.title || 'Print Services',
        quantity: po.Job?.quantity || 0,
        unitCost: totalBuyCost > 0 ? totalBuyCost / (po.Job?.quantity || 1) : 0,
        unitPrice: totalBuyCost > 0 ? totalBuyCost / (po.Job?.quantity || 1) : 0,
      }],
    };

    // Debug logging for PO PDF generation and vendor resolution
    console.log('📄 PO PDF Generation:', {
      poId: po.id,
      poNumber: po.poNumber,
      jobNumber: po.Job?.jobNo,
      originCompanyId: po.originCompanyId,
      targetCompanyId: po.targetCompanyId,
      targetVendorId: po.targetVendorId,
      // Vendor resolution chain
      poVendorName: po.Vendor?.name || null,
      jobVendorName: po.Job?.Vendor?.name || null,
      internalCompanyName: po.Company_PurchaseOrder_targetCompanyIdToCompany?.name || null,
      resolvedVendorName: poData.vendor?.name,
      // Cost details
      rawBuyCost: po.buyCost ? Number(po.buyCost) : null,
      mfgCost: po.mfgCost ? Number(po.mfgCost) : null,
      paperCost: po.paperCost ? Number(po.paperCost) : null,
      printCPM: po.printCPM ? Number(po.printCPM) : null,
      calculatedTotalBuyCost: totalBuyCost,
      quantity: po.Job?.quantity,
    });

    // Debug logging for Phase 15 fields
    console.log('📄 PDF Generation - Phase 15 Data:', {
      versionsCount: poData.specs?.versions?.length || 0,
      versions: poData.specs?.versions,
      languageBreakdownCount: poData.specs?.languageBreakdown?.length || 0,
      mailingIsDirectMail: poData.specs?.mailing?.isDirectMail,
      timelineMailDate: poData.specs?.timeline?.mailDate,
      responsibilitiesVendorCount: poData.specs?.responsibilities?.vendorTasks?.length || 0,
      specialHandlingRequired: poData.specs?.specialHandling?.handSortRequired,
    });

    const pdfBuffer = generatePOPDF(poData);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PO-${poData.poNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate PO PDF error:', error);
    res.status(500).json({ error: 'Failed to generate purchase order PDF' });
  }
};

// Generate Customer Statement PDF
export const generateCustomerStatement = async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const { filter } = req.query; // 'all' | 'unpaid'

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        toCompanyId: companyId,
        ...(filter === 'unpaid' ? { paidAt: null } : {}),
      },
      orderBy: { issuedAt: 'desc' },
    });

    // Import the statement PDF generator
    const { generateStatementPDF } = await import('../services/pdfService');
    const pdfBuffer = generateStatementPDF(company, invoices);

    // Sanitize company name for filename
    const sanitizedName = company.name.replace(/[^a-z0-9]/gi, '_');
    const dateStr = new Date().toISOString().split('T')[0];

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Statement_${sanitizedName}_${dateStr}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate customer statement error:', error);
    res.status(500).json({ error: 'Failed to generate customer statement' });
  }
};
