import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { generatePOPDF } from '../services/pdfService';

const PORTAL_EXPIRY_DAYS = 14;

// Get or create portal link for a job
export const getOrCreatePortal = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Verify job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        JobPortal: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Check if portal exists and is not expired
    if (job.JobPortal && job.JobPortal.expiresAt > new Date()) {
      return res.json({
        portalUrl: `/portal/${job.JobPortal.shareToken}`,
        shareToken: job.JobPortal.shareToken,
        expiresAt: job.JobPortal.expiresAt,
        accessCount: job.JobPortal.accessCount,
      });
    }

    // Delete expired portal if exists
    if (job.JobPortal) {
      await prisma.jobPortal.delete({ where: { id: job.JobPortal.id } });
    }

    // Create new portal
    const shareToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + PORTAL_EXPIRY_DAYS);

    const portal = await prisma.jobPortal.create({
      data: {
        jobId,
        shareToken,
        expiresAt,
      },
    });

    res.json({
      portalUrl: `/portal/${portal.shareToken}`,
      shareToken: portal.shareToken,
      expiresAt: portal.expiresAt,
      accessCount: 0,
    });
  } catch (error) {
    console.error('Get/create portal error:', error);
    res.status(500).json({ error: 'Failed to create portal link' });
  }
};

// Access portal (public endpoint - no auth required)
export const accessPortal = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const portal = await prisma.jobPortal.findUnique({
      where: { shareToken: token },
      include: {
        Job: {
          include: {
            Company: true,
            Vendor: true,
            File: true,
            PurchaseOrder: {
              where: {
                originCompanyId: 'impact-direct',
                targetVendorId: { not: null },
              },
              include: { Vendor: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!portal) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    // Check if expired
    if (portal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This portal link has expired' });
    }

    // Update access count and timestamp
    await prisma.jobPortal.update({
      where: { id: portal.id },
      data: {
        accessCount: { increment: 1 },
        accessedAt: new Date(),
      },
    });

    const job = portal.Job;
    const vendorPO = job.PurchaseOrder[0];
    const specs = job.specs as any;

    // Return portal data
    res.json({
      jobNumber: job.jobNo,
      jobTitle: job.title || '',
      customer: job.Company?.name || 'N/A',
      vendor: job.Vendor?.name || vendorPO?.Vendor?.name || 'N/A',
      poNumber: vendorPO?.poNumber || '',
      quantity: job.quantity,
      sizeName: job.sizeName || specs?.finishedSize || '',
      dueDate: job.deliveryDate,
      mailDate: job.mailDate,
      inHomesDate: job.inHomesDate,
      specialInstructions: job.vendorSpecialInstructions || specs?.specialInstructions || '',
      // Customer references
      customerPONumber: job.customerPONumber || '',
      customerJobNumber: job.customerJobNumber || '',
      // Job notes
      description: job.description || '',
      notes: job.notes || '',
      packingSlipNotes: job.packingSlipNotes || '',
      // Vendor shipping address
      vendorShipping: {
        name: job.vendorShipToName || specs?.shipToName || '',
        address: job.vendorShipToAddress || specs?.shipToAddress || '',
        city: job.vendorShipToCity || '',
        state: job.vendorShipToState || '',
        zip: job.vendorShipToZip || '',
        phone: job.vendorShipToPhone || '',
      },
      // Full specs for vendor reference
      specs: {
        productType: specs?.productType || '',
        paperType: specs?.paperType || specs?.paper || '',
        paperWeight: specs?.paperWeight || '',
        coverPaperType: specs?.coverPaperType || '',
        colors: specs?.colors || specs?.inkColors || '',
        coating: specs?.coating || '',
        finishing: specs?.finishing || specs?.bindery || '',
        bindingStyle: specs?.bindingStyle || '',
        coverType: specs?.coverType || '',
        pageCount: specs?.pageCount || '',
        flatSize: specs?.flatSize || '',
        finishedSize: specs?.finishedSize || '',
        folds: specs?.folds || '',
        perforations: specs?.perforations || '',
        dieCut: specs?.dieCut || '',
        bleed: specs?.bleed || '',
        proofType: specs?.proofType || '',
        shipVia: specs?.shipVia || '',
      },
      // All timeline dates
      timeline: {
        orderDate: specs?.orderDate || null,
        filesDueDate: specs?.filesDueDate || null,
        proofDueDate: specs?.proofDueDate || null,
        approvalDueDate: specs?.approvalDueDate || null,
        productionStartDate: specs?.productionStartDate || null,
        uspsDeliveryDate: specs?.uspsDeliveryDate || null,
      },
      // Product components (for multi-product POs)
      productComponents: specs?.productComponents || [],
      // Line items with pricing
      lineItems: specs?.lineItems || [],
      // Mailing details (direct mail jobs)
      mailing: specs?.isDirectMail ? {
        isDirectMail: true,
        mailClass: specs?.mailClass || '',
        mailProcess: specs?.mailProcess || '',
        dropLocation: specs?.dropLocation || '',
        uspsRequirements: specs?.uspsRequirements || '',
        mailDatRequired: specs?.mailDatRequired || false,
        mailDatResponsibility: specs?.mailDatResponsibility || '',
        presortType: specs?.presortType || '',
      } : null,
      // Special handling
      specialHandling: {
        handSortRequired: specs?.handSortRequired || false,
        handSortItems: specs?.handSortItems || '',
        handSortReason: specs?.handSortReason || '',
        rushJob: specs?.rushJob || false,
        fragile: specs?.fragile || false,
        oversizedShipment: specs?.oversizedShipment || false,
      },
      // All instructions
      instructions: {
        artwork: specs?.artworkInstructions || '',
        packing: specs?.packingInstructions || '',
        labeling: specs?.labelingInstructions || '',
        special: specs?.specialInstructions || job.vendorSpecialInstructions || '',
      },
      // Raw PO text (verbatim from original PO)
      rawPOText: specs?.rawDescriptionText || '',
      additionalNotes: specs?.additionalNotes || '',
      // Versions/Language breakdowns
      versions: specs?.versions || [],
      languageBreakdown: specs?.languageBreakdown || [],
      // Responsibility matrix
      responsibilities: {
        vendor: specs?.vendorTasks || [],
        customer: specs?.customerTasks || [],
      },
      // Payment terms
      paymentTerms: specs?.paymentTerms || '',
      fob: specs?.fob || '',
      accountNumber: specs?.accountNumber || '',
      // Files grouped by type
      files: {
        artwork: job.File.filter(f => f.kind === 'ARTWORK').map(f => ({
          id: f.id,
          name: f.fileName,
          size: f.size,
          uploadedAt: f.createdAt,
        })),
        dataFiles: job.File.filter(f => f.kind === 'DATA_FILE').map(f => ({
          id: f.id,
          name: f.fileName,
          size: f.size,
          uploadedAt: f.createdAt,
        })),
        proofs: job.File.filter(f => f.kind === 'PROOF' || f.kind === 'VENDOR_PROOF').map(f => ({
          id: f.id,
          name: f.fileName,
          size: f.size,
          uploadedAt: f.createdAt,
          isVendorProof: f.kind === 'VENDOR_PROOF',
        })),
        other: job.File.filter(f => !['ARTWORK', 'DATA_FILE', 'PROOF', 'VENDOR_PROOF', 'PO_PDF', 'INVOICE'].includes(f.kind)).map(f => ({
          id: f.id,
          name: f.fileName,
          size: f.size,
          uploadedAt: f.createdAt,
        })),
      },
      hasVendorPO: !!vendorPO,
      // External artwork link (ShareFile, Dropbox, etc.)
      artworkFilesLink: vendorPO?.artworkFilesLink || specs?.artworkUrl || null,
      // Vendor portal status
      portal: {
        confirmedAt: portal.confirmedAt,
        confirmedByName: portal.confirmedByName,
        confirmedByEmail: portal.confirmedByEmail,
        vendorStatus: portal.vendorStatus,
        statusUpdatedAt: portal.statusUpdatedAt,
        trackingNumber: portal.trackingNumber,
        trackingCarrier: portal.trackingCarrier,
      },
      expiresAt: portal.expiresAt,
    });
  } catch (error) {
    console.error('Access portal error:', error);
    res.status(500).json({ error: 'Failed to access portal' });
  }
};

// Download PO PDF from portal (public endpoint)
export const downloadPortalPO = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const portal = await prisma.jobPortal.findUnique({
      where: { shareToken: token },
      include: {
        Job: {
          include: {
            Company: true,
            Vendor: true,
            PurchaseOrder: {
              where: {
                originCompanyId: 'impact-direct',
                targetVendorId: { not: null },
              },
              include: { Vendor: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!portal) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    if (portal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This portal link has expired' });
    }

    const job = portal.Job;
    const vendorPO = job.PurchaseOrder[0];

    if (!vendorPO) {
      return res.status(404).json({ error: 'No purchase order found for this job' });
    }

    const specs = job.specs as any;

    // Transform PO data for PDF
    const poData = {
      poNumber: vendorPO.poNumber || '',
      description: vendorPO.description || 'Purchase Order',
      buyCost: vendorPO.buyCost ? Number(vendorPO.buyCost) : 0,
      vendorRef: vendorPO.vendorRef || '',
      issuedAt: vendorPO.createdAt || new Date(),
      status: vendorPO.status,
      jobNumber: job.jobNo,
      jobTitle: job.title || '',
      dueDate: job.deliveryDate,
      mailDate: job.mailDate,
      inHomesDate: job.inHomesDate,
      quantity: job.quantity || 0,
      sizeName: job.sizeName || specs?.finishedSize || '',
      customer: job.Company ? {
        name: job.Company.name,
        email: job.Company.email || '',
        phone: job.Company.phone || '',
        address: job.Company.address || '',
      } : { name: 'N/A', email: '', phone: '', address: '' },
      customerPONumber: job.customerPONumber || '',
      specs: {
        productType: specs?.productType || '',
        finishedSize: specs?.finishedSize || job.sizeName || '',
        flatSize: specs?.flatSize || '',
        paperType: specs?.paperType || '',
        paperWeight: specs?.paperWeight || '',
        colors: specs?.colors || '',
        coating: specs?.coating || '',
        finishing: specs?.finishing || '',
        bindingStyle: specs?.bindingStyle || '',
        coverType: specs?.coverType || '',
        pageCount: specs?.pageCount || '',
        folds: specs?.folds || '',
        specialInstructions: specs?.specialInstructions || '',
        shipToName: specs?.shipToName || '',
        shipToAddress: specs?.shipToAddress || '',
        shipVia: specs?.shipVia || '',
      },
      vendor: vendorPO.Vendor ? {
        name: vendorPO.Vendor.name,
        email: vendorPO.Vendor.email || '',
        phone: vendorPO.Vendor.phone || '',
        address: [vendorPO.Vendor.streetAddress, vendorPO.Vendor.city, vendorPO.Vendor.state, vendorPO.Vendor.zip].filter(Boolean).join(', '),
      } : job.Vendor ? {
        name: job.Vendor.name,
        email: job.Vendor.email || '',
        phone: job.Vendor.phone || '',
        address: [job.Vendor.streetAddress, job.Vendor.city, job.Vendor.state, job.Vendor.zip].filter(Boolean).join(', '),
      } : { name: 'N/A', email: '', phone: '', address: '' },
      lineItems: specs?.lineItems || [{
        description: job.title || 'Print Services',
        quantity: job.quantity || 0,
        unitCost: vendorPO.buyCost ? Number(vendorPO.buyCost) / (job.quantity || 1) : 0,
        unitPrice: vendorPO.buyCost ? Number(vendorPO.buyCost) / (job.quantity || 1) : 0,
      }],
    };

    const pdfBuffer = generatePOPDF(poData);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PO-${poData.poNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Download portal PO error:', error);
    res.status(500).json({ error: 'Failed to generate PO PDF' });
  }
};

// Download a file from portal (public endpoint)
export const downloadPortalFile = async (req: Request, res: Response) => {
  try {
    const { token, fileId } = req.params;

    const portal = await prisma.jobPortal.findUnique({
      where: { shareToken: token },
      include: {
        Job: {
          include: {
            File: {
              where: { id: fileId },
            },
          },
        },
      },
    });

    if (!portal) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    if (portal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This portal link has expired' });
    }

    const file = portal.Job.File[0];
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // For now, redirect to the object URL
    // In production, you'd use a signed URL from R2/S3
    // The objectKey contains the storage path
    res.redirect(`/api/files/${file.id}/download`);
  } catch (error) {
    console.error('Download portal file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
};
