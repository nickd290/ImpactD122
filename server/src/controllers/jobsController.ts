import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import {
  calculateProfitSplit,
  calculateTierPricing,
  ProfitSplitResult,
  TierPricingResult,
  PAPER_MARKUP_PERCENT,
  PaperSource,
} from '../services/pricingService';
import { normalizeSize, getSelfMailerPricing } from '../utils/bradfordPricing';
import { sendArtworkFollowUpEmail, sendJDInvoiceToBradfordEmail, sendVendorPOWithPortalEmail } from '../services/emailService';
import { initiateBothThreads } from '../services/communicationService';
import { COMPANY_IDS } from '../constants';
import { JOB_INCLUDE } from './jobs/jobsHelpers';

/**
 * Check if a job meets criteria for Impact→Bradford PO creation
 * Requirements:
 * 1. Quantity > 0
 * 2. Valid standard size (matches pricing table)
 * 3. Sell price > 0
 */
function canCreateImpactPO(job: { quantity?: number; sizeName?: string | null; sellPrice?: number }): {
  valid: boolean;
  reason?: string;
} {
  if (!job.quantity || job.quantity <= 0) {
    return { valid: false, reason: 'Missing or invalid quantity' };
  }
  if (!job.sizeName || !getSelfMailerPricing(job.sizeName)) {
    return { valid: false, reason: 'Invalid or missing standard size' };
  }
  if (!job.sellPrice || job.sellPrice <= 0) {
    return { valid: false, reason: 'Missing or invalid sell price' };
  }
  return { valid: true };
}

/**
 * Calculate simplified profit from a job with its POs
 * Business Model:
 * - Sell Price: What customer pays
 * - Total Cost: Sum of all PO buy costs
 * - Spread: Sell Price - Total Cost
 * - Bradford gets: Paper Markup (18%) + 50% of Spread
 * - Impact gets: 50% of Spread
 *
 * Uses cached ProfitSplit record if available, otherwise calculates on-the-fly
 */
function calculateProfit(job: any) {
  // If job has cached ProfitSplit, use it
  if (job.ProfitSplit) {
    const ps = job.ProfitSplit;
    const purchaseOrders = job.PurchaseOrder || [];

    // Get Bradford→JD POs (what Bradford owes JD for manufacturing)
    const bradfordJdPOs = purchaseOrders.filter((po: any) =>
      po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
    );

    // Calculate what Bradford owes JD (from PO buyCost)
    let bradfordOwesJD = bradfordJdPOs.reduce((sum: number, po: any) => {
      return sum + (Number(po.buyCost) || 0);
    }, 0);

    // Fallback: Calculate from sizeName and quantity if no PO buyCost
    if (bradfordOwesJD === 0 && job.sizeName && job.quantity > 0) {
      const pricing = getSelfMailerPricing(job.sizeName);
      if (pricing) {
        bradfordOwesJD = pricing.printCPM * (job.quantity / 1000);
      }
    }

    // Get Impact→JD POs (direct jobs where Impact orders from JD)
    // Check both targetCompanyId and vendor name for JD Graphic (handle both Vendor and vendor casing)
    const impactJdPOs = purchaseOrders.filter((po: any) => {
      const vendorName = (po.Vendor?.name || po.vendor?.name || '').toLowerCase();
      return po.originCompanyId === 'impact-direct' &&
        (po.targetCompanyId === 'jd-graphic' || vendorName.includes('jd graphic'));
    });

    // Calculate what Impact owes JD (from PO buyCost)
    const impactOwesJD = impactJdPOs.reduce((sum: number, po: any) => {
      return sum + (Number(po.buyCost) || 0);
    }, 0);

    return {
      sellPrice: Number(ps.sellPrice),
      totalCost: Number(ps.totalCost),
      spread: Number(ps.grossMargin),
      paperMarkup: Number(ps.paperMarkup) || 0,
      paperCost: Number(ps.paperCost) || 0,
      bradfordSpreadShare: Number(ps.grossMargin) * 0.5,
      impactSpreadShare: Number(ps.grossMargin) * 0.5,
      bradfordTotal: Number(ps.bradfordShare),
      impactTotal: Number(ps.impactShare),
      bradfordOwesJD,
      impactOwesJD,
      marginPercent: Number(ps.sellPrice) > 0
        ? (Number(ps.grossMargin) / Number(ps.sellPrice)) * 100
        : 0,
      poCount: purchaseOrders.length,
      isOverridden: ps.isOverridden || false,
      overrideReason: ps.overrideReason || null,
      calculatedAt: ps.calculatedAt,
    };
  }

  // Fall back to on-the-fly calculation using sellPrice only
  const sellPrice = Number(job.sellPrice) || 0;

  // Calculate total cost from POs
  const purchaseOrders = job.PurchaseOrder || [];
  let totalCost = 0;
  let totalPaperMarkup = 0;
  let totalPaperCost = 0;

  // Sum costs from POs - only Impact→Bradford POs (not Bradford→JD reference POs)
  // Bradford→JD is internal tracking, not Impact's direct cost
  const impactPOs = purchaseOrders.filter((po: any) =>
    po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford'
  );

  // Get Bradford→JD POs (what Bradford owes JD for manufacturing)
  const bradfordJdPOs = purchaseOrders.filter((po: any) =>
    po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
  );

  // Calculate what Bradford owes JD (from PO buyCost)
  let bradfordOwesJD = bradfordJdPOs.reduce((sum: number, po: any) => {
    return sum + (Number(po.buyCost) || 0);
  }, 0);

  // Fallback: Calculate from sizeName and quantity if no PO buyCost
  if (bradfordOwesJD === 0 && job.sizeName && job.quantity > 0) {
    const pricing = getSelfMailerPricing(job.sizeName);
    if (pricing) {
      bradfordOwesJD = pricing.printCPM * (job.quantity / 1000);
    }
  }

  // Get Impact→JD POs (direct jobs where Impact orders from JD)
  // Check both targetCompanyId and vendor name for JD Graphic (handle both Vendor and vendor casing)
  const impactJdPOs = purchaseOrders.filter((po: any) => {
    const vendorName = (po.Vendor?.name || po.vendor?.name || '').toLowerCase();
    return po.originCompanyId === 'impact-direct' &&
      (po.targetCompanyId === 'jd-graphic' || vendorName.includes('jd graphic'));
  });

  // Calculate what Impact owes JD (from PO buyCost)
  const impactOwesJD = impactJdPOs.reduce((sum: number, po: any) => {
    return sum + (Number(po.buyCost) || 0);
  }, 0);

  if (impactPOs.length > 0) {
    totalCost = impactPOs.reduce((sum: number, po: any) => {
      return sum + (Number(po.buyCost) || 0);
    }, 0);

    totalPaperCost = impactPOs.reduce((sum: number, po: any) => {
      return sum + (Number(po.paperCost) || 0);
    }, 0);

    totalPaperMarkup = impactPOs.reduce((sum: number, po: any) => {
      return sum + (Number(po.paperMarkup) || 0);
    }, 0);
  }

  // Use pricing service to calculate split
  const split = calculateProfitSplit({
    sellPrice,
    totalCost,
    paperMarkup: totalPaperMarkup,
    routingType: job.routingType,  // Pass routing type for correct split calculation
  });

  return {
    sellPrice: split.sellPrice,
    totalCost: split.totalCost,
    spread: split.grossMargin,
    paperMarkup: split.paperMarkup,
    paperCost: totalPaperCost,
    bradfordSpreadShare: split.bradfordSpreadShare,
    impactSpreadShare: split.impactSpreadShare,
    bradfordTotal: split.bradfordTotal,
    impactTotal: split.impactTotal,
    bradfordOwesJD,
    impactOwesJD,
    marginPercent: split.marginPercent,
    poCount: purchaseOrders.length,
    isOverridden: false,
    overrideReason: null,
    calculatedAt: null,
    warnings: split.warnings,
    isHealthy: split.isHealthy,
  };
}

// Helper to transform job to expected frontend format
function transformJob(job: any) {
  // Use sellPrice as revenue
  const revenue = Number(job.sellPrice) || 0;
  const quantity = job.quantity || 0;
  // Calculate CPM (cost per thousand)
  const unitPrice = quantity > 0 ? (revenue / quantity) : 0;

  // Calculate simplified profit (uses ProfitSplit if available)
  const profit = calculateProfit(job);

  // Get paper source from job or default to BRADFORD
  const paperSource = job.paperSource || (job.jdSuppliesPaper ? 'VENDOR' : 'BRADFORD');

  // Calculate tier pricing if this is a standard size
  let tierPricing: TierPricingResult | null = null;
  const basePricing = job.sizeName ? getSelfMailerPricing(job.sizeName) : null;
  if (basePricing && quantity > 0) {
    tierPricing = calculateTierPricing({
      sizeName: job.sizeName,
      quantity,
      paperSource: paperSource as PaperSource,
    });
  }

  // Suggested CPM values for PO cost entry (from tier pricing)
  const suggestedPricing = basePricing ? {
    printCPM: basePricing.printCPM,
    paperCPM: basePricing.paperCPM,
    paperLbsPerM: basePricing.paperLbsPerM,
  } : null;

  // Transform POs to simplified format
  const purchaseOrders = (job.PurchaseOrder || []).map((po: any) => ({
    id: po.id,
    poNumber: po.poNumber,
    description: po.description || 'Vendor Services',
    buyCost: Number(po.buyCost) || 0,
    paperCost: po.paperCost ? Number(po.paperCost) : null,
    paperMarkup: po.paperMarkup ? Number(po.paperMarkup) : null,
    mfgCost: po.mfgCost ? Number(po.mfgCost) : null,
    // CPM rates (for edit UI)
    printCPM: po.printCPM ? Number(po.printCPM) : null,
    paperCPM: po.paperCPM ? Number(po.paperCPM) : null,
    vendorRef: po.vendorRef || '',
    status: po.status,
    issuedAt: po.issuedAt,
    paidAt: po.paidAt,
    // Include company IDs for determining PO type
    originCompanyId: po.originCompanyId,
    targetCompanyId: po.targetCompanyId,
    vendor: po.Vendor ? {
      id: po.Vendor.id,
      name: po.Vendor.name,
    } : null,
  }));

  return {
    ...job,
    // Fix Decimal serialization - ensure sellPrice is a number
    sellPrice: Number(job.sellPrice) || 0,
    // Preserve IDs explicitly for filtering
    customerId: job.customerId,
    vendorId: job.vendorId,
    // Map jobNo to number for frontend compatibility
    number: job.jobNo,
    // Map deliveryDate to dueDate for frontend
    dueDate: job.deliveryDate,
    // Map createdAt to dateCreated for frontend
    dateCreated: job.createdAt,
    // Bradford ref number (now using dedicated partnerPONumber field)
    bradfordRefNumber: job.partnerPONumber || '',

    // === PAYMENT TRACKING ===
    customerPaymentAmount: job.customerPaymentAmount ? Number(job.customerPaymentAmount) : null,
    customerPaymentDate: job.customerPaymentDate,
    vendorPaymentAmount: job.vendorPaymentAmount ? Number(job.vendorPaymentAmount) : null,
    vendorPaymentDate: job.vendorPaymentDate,
    bradfordPaymentAmount: job.bradfordPaymentAmount ? Number(job.bradfordPaymentAmount) : null,
    bradfordPaymentPaid: job.bradfordPaymentPaid || false,
    bradfordPaymentDate: job.bradfordPaymentDate,

    // === JD PAYMENT TRACKING (NEW) ===
    jdInvoiceGeneratedAt: job.jdInvoiceGeneratedAt,
    jdInvoiceEmailedAt: job.jdInvoiceEmailedAt,
    jdInvoiceEmailedTo: job.jdInvoiceEmailedTo,
    jdPaymentPaid: job.jdPaymentPaid || false,
    jdPaymentDate: job.jdPaymentDate,
    jdPaymentAmount: job.jdPaymentAmount ? Number(job.jdPaymentAmount) : null,

    // === DOCUMENT GENERATION TRACKING ===
    quoteGeneratedAt: job.quoteGeneratedAt,
    quoteGeneratedCount: job.quoteGeneratedCount || 0,
    poGeneratedAt: job.poGeneratedAt,
    poGeneratedCount: job.poGeneratedCount || 0,
    invoiceGeneratedAt: job.invoiceGeneratedAt,
    invoiceGeneratedCount: job.invoiceGeneratedCount || 0,

    // Simplified profit object (from ProfitSplit model or calculated)
    profit,

    // Paper source enum (BRADFORD, VENDOR, CUSTOMER)
    paperSource,

    // Tier pricing breakdown (for standard sizes)
    tierPricing,

    // Suggested CPM values for PO cost entry (from tier pricing table)
    suggestedPricing,

    // Size information
    sizeName: job.sizeName || null,
    isStandardSize: tierPricing !== null,

    // PurchaseOrders list
    purchaseOrders,

    // Transform customer (Company) to Entity-like structure
    customer: job.Company ? {
      id: job.Company.id,
      name: job.Company.name,
      type: 'CUSTOMER',
      email: job.Company.email || '',
      phone: job.Company.phone || '',
      address: job.Company.address || '',
    } : {
      id: '',
      name: 'Unknown Customer',
      type: 'CUSTOMER',
      email: '',
      phone: '',
      address: '',
    },
    // Transform vendor to Entity-like structure
    vendor: job.Vendor ? {
      id: job.Vendor.id,
      name: job.Vendor.name,
      type: 'VENDOR',
      email: job.Vendor.email || '',
      phone: job.Vendor.phone || '',
      isPartner: job.Vendor.vendorCode === 'BRADFORD' || job.Vendor.name?.toLowerCase().includes('bradford'),
    } : {
      id: '',
      name: 'No Vendor Assigned',
      type: 'VENDOR',
      email: '',
      phone: '',
      isPartner: false,
    },
    // Specs is already JSON
    specs: job.specs,
    // Financials object for frontend (derived from profit)
    financials: {
      impactCustomerTotal: revenue,
      jdServicesTotal: 0,
      bradfordPaperCost: profit.totalCost,
      paperMarkupAmount: profit.paperMarkup,
      calculatedSpread: profit.spread,
      bradfordShareAmount: profit.bradfordTotal,
      impactCostFromBradford: profit.totalCost,
    },
    // Use stored lineItems from specs if available, otherwise create default from quantity
    lineItems: job.specs?.lineItems ? job.specs.lineItems : (quantity > 0 ? [{
      id: 'main',
      description: job.title || 'Main Item',
      quantity: quantity,
      unitCost: 0,
      markupPercent: 0,
      unitPrice: unitPrice,
    }] : (revenue > 0 ? [{
      id: 'main',
      description: job.title || 'Main Item',
      quantity: 1,
      unitCost: 0,
      markupPercent: 0,
      unitPrice: revenue,
    }] : [])),

    // Invoice data for payment tracking
    invoices: (job.Invoice || []).map((inv: any) => ({
      id: inv.id,
      amount: inv.amount ? Number(inv.amount) : null,
      paidAt: inv.paidAt,
    })),
    hasPaidInvoice: (job.Invoice || []).some((inv: any) => inv.paidAt !== null) || job.customerPaymentDate !== null,

    // Vendor portal status (from JobPortal model)
    portal: job.JobPortal ? {
      confirmedAt: job.JobPortal.confirmedAt,
      confirmedByName: job.JobPortal.confirmedByName,
      confirmedByEmail: job.JobPortal.confirmedByEmail,
      vendorStatus: job.JobPortal.vendorStatus,
      statusUpdatedAt: job.JobPortal.statusUpdatedAt,
      trackingNumber: job.JobPortal.trackingNumber,
      trackingCarrier: job.JobPortal.trackingCarrier,
    } : null,
  };
}

// Get all jobs with optional tab filtering
export const getAllJobs = async (req: Request, res: Response) => {
  try {
    const { tab } = req.query;

    // Build where clause based on tab filter
    let whereClause: any = {
      deletedAt: null, // Only get non-deleted jobs
    };

    if (tab === 'active') {
      whereClause.status = 'ACTIVE';
    } else if (tab === 'completed') {
      whereClause.status = 'PAID';
    } else if (tab === 'paid') {
      // Jobs where customer has actually paid (has an invoice with paidAt set)
      whereClause.Invoice = {
        some: {
          paidAt: { not: null },
        },
      };
    }

    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          include: {
            Vendor: true,
          },
        },
        ProfitSplit: true,
        Invoice: {
          select: {
            id: true,
            paidAt: true,
            amount: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const transformedJobs = jobs.map(transformJob);

    // Get counts for all tabs
    const [activeCount, completedCount, paidCount] = await Promise.all([
      prisma.job.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.job.count({ where: { deletedAt: null, status: 'PAID' } }),
      prisma.job.count({
        where: {
          deletedAt: null,
          Invoice: { some: { paidAt: { not: null } } },
        },
      }),
    ]);

    res.json({
      jobs: transformedJobs,
      counts: {
        active: activeCount,
        completed: completedCount,
        paid: paidCount,
      },
    });
  } catch (error) {
    console.error('Get all jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
};

// Get single job
export const getJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          include: {
            Vendor: true,
          },
        },
        ProfitSplit: true, // NEW: Include cached profit split
        JobPortal: true, // Vendor portal status tracking
        Invoice: {
          select: {
            id: true,
            paidAt: true,
            amount: true,
            invoiceNo: true,
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(transformJob(job));
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
};

// Create job
export const createJob = async (req: Request, res: Response) => {
  console.log('🔵 createJob called with body:', JSON.stringify(req.body, null, 2));
  try {
    const {
      lineItems,
      specs,
      financials,
      customerId,
      vendorId,
      title,
      status,
      customerPONumber,
      dueDate,
      mailDate,
      inHomesDate,
      sellPrice: inputSellPrice,
      sizeName: inputSizeName,
      paperSource: inputPaperSource,
      isBradfordJob,
      bradfordPricing,
      quantity: inputQuantity,
      bradfordCut,  // Bradford's cut for non-Bradford vendor jobs
      jdSuppliesPaper,  // Paper source: true = vendor supplies, false = Bradford supplies
      bradfordRefNumber,  // Bradford reference number (for all jobs)
      bradfordPaperLbs,  // Bradford paper weight in lbs
      ...rest
    } = req.body;

    // Validate sellPrice if provided
    if (inputSellPrice !== undefined && inputSellPrice !== null && inputSellPrice !== '') {
      const parsedPrice = Number(inputSellPrice);
      if (isNaN(parsedPrice)) {
        return res.status(400).json({ error: 'Invalid sell price format' });
      }
      if (parsedPrice < 0) {
        return res.status(400).json({ error: 'Sell price cannot be negative' });
      }
    }

    // Generate job number
    const lastJob = await prisma.job.findFirst({
      orderBy: { jobNo: 'desc' },
    });

    let jobNo = 'J-1001';
    if (lastJob) {
      const match = lastJob.jobNo.match(/J-(\d+)/);
      if (match) {
        const lastNumber = parseInt(match[1]);
        jobNo = `J-${(lastNumber + 1).toString().padStart(4, '0')}`;
      }
    }

    // Calculate quantity from line items or use provided quantity
    const quantity = inputQuantity || lineItems?.reduce((sum: number, item: any) => sum + (parseInt(item.quantity) || 0), 0) || 0;

    // Calculate total from line items - use lineTotal if available, otherwise calculate
    const lineItemTotal = lineItems?.reduce((sum: number, item: any) => {
      if (item.lineTotal && item.lineTotal > 0) {
        return sum + parseFloat(item.lineTotal);
      }
      return sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0));
    }, 0) || 0;

    // Normalize size name - use provided or extract from specs.finishedSize
    const rawSizeName = inputSizeName || specs?.finishedSize;
    const sizeName = rawSizeName ? normalizeSize(rawSizeName) : null;

    // Determine paper source from jdSuppliesPaper flag
    // jdSuppliesPaper = true means VENDOR supplies paper
    // jdSuppliesPaper = false means BRADFORD supplies paper
    const paperSource = jdSuppliesPaper === true ? 'VENDOR' : (inputPaperSource || 'BRADFORD');

    // Use sellPrice if provided, otherwise calculate from financials or line items
    // Ensure proper Number conversion to avoid NaN or string concatenation
    const sellPrice = Number(inputSellPrice) ||
                      Number(financials?.impactCustomerTotal) ||
                      lineItemTotal ||
                      0;

    // Calculate tier pricing if this is a standard size
    let tierPricing: TierPricingResult | null = null;
    let totalCost = 0;
    let paperMarkup = 0;
    let paperCost = 0;
    let printCost = 0;

    // Use Bradford pricing from client if provided (from PO parsing)
    // CORRECT BUSINESS MODEL:
    // - Impact pays Bradford: Paper SELL + Print (not paper cost!)
    // - Profit = Customer Revenue - Impact's Total Cost
    // - 50/50 split on the profit
    // - Bradford also keeps the paper markup separately
    if (isBradfordJob && bradfordPricing && quantity > 0) {
      // Impact's total cost = Paper SELL + Print
      totalCost = bradfordPricing.totalCostToImpact || 0;
      // Paper amounts
      paperCost = bradfordPricing.totalPaperCost || 0;  // Bradford's actual paper cost
      const paperSellTotal = bradfordPricing.totalPaperSell || 0;  // What Impact pays for paper
      paperMarkup = bradfordPricing.bradfordPaperProfit || (paperSellTotal - paperCost);  // Bradford's paper profit
      printCost = bradfordPricing.totalPrintCost || 0;

      console.log(`📦 Using Bradford pricing from client (CORRECTED):`, {
        totalCostToImpact: totalCost,
        paperCost,
        paperSellTotal,
        paperMarkup,
        printCost,
        quantity,
        sizeName
      });
    } else {
      // Fall back to standard tier pricing calculation
      const selfMailerPricing = sizeName ? getSelfMailerPricing(sizeName) : null;

      if (sizeName && quantity > 0 && selfMailerPricing) {
        tierPricing = calculateTierPricing({
          sizeName,
          quantity,
          paperSource: paperSource as PaperSource,
        });
        totalCost = tierPricing.tier2.totalCost;
        paperMarkup = tierPricing.tier2.paperMarkup;
        paperCost = tierPricing.tier1.paperTotal;
        printCost = tierPricing.tier1.printTotal;
      }
    }

    const jobId = crypto.randomUUID();

    // Guard: Backend pricing validation - reject negative margin without override
    if (totalCost > 0 && sellPrice < totalCost && req.body.allowNegativeMargin !== true) {
      return res.status(400).json({
        error: `Negative margin: sellPrice ($${sellPrice.toFixed(2)}) < totalCost ($${totalCost.toFixed(2)})`,
        sellPrice: sellPrice,
        totalCost: totalCost,
        margin: sellPrice - totalCost,
        hint: 'Set allowNegativeMargin=true to override'
      });
    }

    // Build specs JSON - check if it's a standard Bradford size
    const isStandardSize = isBradfordJob || (sizeName ? !!getSelfMailerPricing(sizeName) : false);
    const jobSpecs = {
      ...(specs || {}),
      isStandardSize,
      isBradfordJob: !!isBradfordJob,
      bradfordCut: bradfordCut || null,  // Bradford's cut for non-Bradford vendor jobs
      jdSuppliesPaper: jdSuppliesPaper === true,  // true = Vendor supplies paper, false = Bradford supplies
      lineItems: lineItems || null,  // Preserve user-entered line items (unitCost, markupPercent, unitPrice)
    };

    // Final validation: ensure sellPrice is valid before saving
    if (!sellPrice || sellPrice <= 0) {
      console.log('🔴 Validation failed: sellPrice is', sellPrice);
      return res.status(400).json({ error: 'Sell price is required and must be greater than 0' });
    }

    console.log('🔵 About to create job:', { jobId, jobNo, customerId, vendorId, sellPrice, title });
    const job = await prisma.job.create({
      data: {
        id: jobId,
        jobNo,
        title: title || '',
        customerId,
        vendorId: vendorId || null,
        status: status || 'ACTIVE',  // Default to ACTIVE
        specs: jobSpecs,
        quantity,
        sellPrice,
        sizeName,
        paperSource,
        bradfordPaperLbs: bradfordPaperLbs ? parseFloat(bradfordPaperLbs) : null,
        customerPONumber: customerPONumber || null,
        partnerPONumber: bradfordRefNumber || null,
        deliveryDate: dueDate ? new Date(dueDate) : null,
        mailDate: mailDate ? new Date(mailDate) : null,
        inHomesDate: inHomesDate ? new Date(inHomesDate) : null,
        updatedAt: new Date(),
      },
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          include: {
            Vendor: true,
          },
        },
        ProfitSplit: true,
      },
    });

    // Auto-create 2 POs for BRADFORD_JD routing
    // PO 1: Impact Direct → Bradford (with paperCost, paperMarkup)
    // PO 2: Bradford → JD Graphic (with mfgCost)
    // ONLY create if job meets validation criteria OR is explicitly a Bradford job
    const routingType = rest.routingType || 'BRADFORD_JD';
    const poValidation = canCreateImpactPO({ quantity, sizeName, sellPrice });
    const shouldCreatePOs = (routingType === 'BRADFORD_JD' && poValidation.valid) || isBradfordJob;

    if (shouldCreatePOs && (totalCost > 0 || isBradfordJob)) {
      const timestamp = Date.now();

      // Calculate CPM rates for POs
      const printCPMRate = bradfordPricing?.printCPM || (quantity > 0 && printCost > 0 ? (printCost / (quantity / 1000)) : 0);
      const paperCostCPMRate = bradfordPricing?.paperCostCPM || (quantity > 0 && paperCost > 0 ? (paperCost / (quantity / 1000)) : 0);
      const paperSellCPMRate = bradfordPricing?.paperSellCPM || 0;

      // Paper sell total is what Impact pays Bradford for paper
      const paperSellTotal = bradfordPricing?.totalPaperSell || (quantity > 0 && paperSellCPMRate > 0 ? paperSellCPMRate * (quantity / 1000) : paperCost + paperMarkup);

      // PO 1: Impact Direct → Bradford
      // buyCost = what Impact actually pays = Paper SELL + Print
      await prisma.purchaseOrder.create({
        data: {
          id: crypto.randomUUID(),
          jobId,
          originCompanyId: 'impact-direct',
          targetCompanyId: 'bradford',
          poNumber: `PO-${jobNo}-IB-${timestamp}`,
          description: `Impact to Bradford - ${sizeName || 'Custom'} x ${quantity}`,
          buyCost: totalCost,  // Impact's total cost = Paper SELL + Print
          paperCost: paperSellTotal,  // What Impact pays for paper (includes Bradford's markup)
          paperMarkup: paperMarkup,  // Bradford's paper profit (for tracking)
          printCPM: printCPMRate,
          paperCPM: paperSellCPMRate || paperCostCPMRate,  // Paper sell CPM
          status: 'PENDING',
          updatedAt: new Date(),
        },
      });

      // PO 2: Bradford → JD Graphic (internal tracking - what Bradford pays JD)
      await prisma.purchaseOrder.create({
        data: {
          id: crypto.randomUUID(),
          jobId,
          originCompanyId: 'bradford',
          targetCompanyId: 'jd-graphic',
          poNumber: `PO-${jobNo}-BJ-${timestamp}`,
          description: `Bradford to JD - ${sizeName || 'Custom'} x ${quantity}`,
          buyCost: printCost > 0 ? printCost : null,  // What Bradford pays JD for print
          mfgCost: printCost > 0 ? printCost : null,
          printCPM: printCPMRate,
          status: 'PENDING',
          updatedAt: new Date(),
        },
      });

      console.log(`📋 Auto-created Bradford POs for job ${jobNo} (CORRECTED):`, {
        impactTotalCost: totalCost,
        paperSellTotal,
        bradfordPaperProfit: paperMarkup,
        printCost,
        printCPMRate,
        paperSellCPMRate,
      });
    } else if (routingType === 'BRADFORD_JD') {
      console.log(`Skipping PO creation for job ${jobNo}: ${poValidation.reason}`);
    }

    // Auto-create vendor PO for non-Bradford vendors
    // If a vendor is selected and it's NOT a Bradford partner job, create a PO
    if (vendorId && !isBradfordJob) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
      });

      // Check if vendor exists and is NOT a Bradford partner
      if (vendor && !vendor.isPartner) {
        const vendorTotalCost = lineItems?.reduce((sum: number, item: any) => {
          return sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.unitCost) || 0));
        }, 0) || 0;

        // Ensure vendor has a code (auto-generate if missing for existing vendors)
        let vendorCode = vendor.vendorCode;
        if (!vendorCode) {
          let isUnique = false;
          while (!isUnique) {
            vendorCode = Math.floor(1000 + Math.random() * 9000).toString();
            const existing = await prisma.vendor.findUnique({ where: { vendorCode } });
            if (!existing) isUnique = true;
          }
          await prisma.vendor.update({
            where: { id: vendorId },
            data: { vendorCode },
          });
        }

        // Count existing POs for this job to get sequence number
        const existingPOCount = await prisma.purchaseOrder.count({
          where: { jobId, targetVendorId: { not: null } },
        });
        const sequenceNum = existingPOCount + 1;

        // New PO format: {jobNo}-{vendorCode}.{seq} (jobNo already has J- prefix)
        const poNumber = `${jobNo}-${vendorCode}.${sequenceNum}`;

        // Create PO: Impact Direct → Vendor
        const vendorPO = await prisma.purchaseOrder.create({
          data: {
            id: crypto.randomUUID(),
            jobId,
            originCompanyId: 'impact-direct',
            targetVendorId: vendorId,
            poNumber,
            description: `Impact to ${vendor.name} - ${title || 'Job'} x ${quantity}`,
            buyCost: vendorTotalCost > 0 ? vendorTotalCost : null,
            status: 'PENDING',
            updatedAt: new Date(),
          },
        });

        console.log(`📋 Auto-created Vendor PO for job ${jobNo}:`, {
          vendorName: vendor.name,
          vendorTotalCost,
          poNumber: vendorPO.poNumber,
        });

        // Auto-send PO email to vendor with portal (fire and forget)
        const vendorEmail = vendor.email;
        if (vendorEmail) {
          (async () => {
            try {
              // Create or get portal for this job
              const existingPortal = await prisma.jobPortal.findUnique({
                where: { jobId },
              });

              const shareToken = existingPortal?.shareToken || crypto.randomBytes(32).toString('hex');
              const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

              const portal = existingPortal || await prisma.jobPortal.create({
                data: {
                  jobId,
                  shareToken,
                  expiresAt,
                },
              });

              const baseUrl = process.env.APP_URL || process.env.PUBLIC_URL || 'https://app.impactdirectprinting.com';
              const portalUrl = `${baseUrl}/portal/${portal.shareToken}`;

              // Send PO email with portal link
              const result = await sendVendorPOWithPortalEmail(
                vendorPO,
                { ...job, jobNo, title },
                vendorEmail,
                vendor.name,
                portalUrl,
                { specialInstructions: jobSpecs?.specialInstructions || undefined }
              );

              if (result.success) {
                // Update PO with email tracking
                await prisma.purchaseOrder.update({
                  where: { id: vendorPO.id },
                  data: {
                    emailedAt: result.emailedAt,
                    emailedTo: vendorEmail,
                  },
                });
                console.log(`📧 Auto-sent Vendor PO to ${vendorEmail} for job ${jobNo}`);
              } else {
                console.error(`❌ Failed to auto-send Vendor PO for job ${jobNo}:`, result.error);
              }
            } catch (err: any) {
              console.error(`❌ Error auto-sending Vendor PO for job ${jobNo}:`, err.message);
            }
          })();
        } else {
          console.log(`⚠️ Vendor ${vendor.name} has no email - PO not auto-sent`);
        }
      }
    }

    // Create ProfitSplit record for this job
    if (sellPrice > 0 || totalCost > 0) {
      const split = calculateProfitSplit({
        sellPrice,
        totalCost,
        paperMarkup,
        routingType,  // Pass routing type to determine split: 50/50 (Bradford) vs 35/65 (third-party)
      });

      await prisma.profitSplit.create({
        data: {
          jobId,
          sellPrice,
          totalCost,
          paperCost,
          paperMarkup,
          grossMargin: split.grossMargin,
          bradfordShare: split.bradfordTotal,
          impactShare: split.impactTotal,
          calculatedAt: new Date(),
        },
      });

      // Auto-initiate email threads with customer and vendor (fire and forget)
      // This sends welcome emails to both parties with Reply-To set to job-specific email
      initiateBothThreads(jobId).then(({ customerResult, vendorResult }) => {
        console.log(`📧 Thread initiation for job ${jobNo}:`, {
          customer: customerResult.success ? 'sent' : customerResult.error,
          vendor: vendorResult.success ? 'sent' : vendorResult.error,
        });
      }).catch((err) => {
        console.error(`Failed to initiate threads for job ${jobNo}:`, err.message);
      });

      // Re-fetch job with ProfitSplit
      const jobWithSplit = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          Company: true,
          Vendor: true,
          PurchaseOrder: {
            include: {
              Vendor: true,
            },
          },
          ProfitSplit: true,
        },
      });

      return res.status(201).json(transformJob(jobWithSplit));
    }

    // For jobs without ProfitSplit, still initiate threads
    initiateBothThreads(jobId).then(({ customerResult, vendorResult }) => {
      console.log(`📧 Thread initiation for job ${jobNo}:`, {
        customer: customerResult.success ? 'sent' : customerResult.error,
        vendor: vendorResult.success ? 'sent' : vendorResult.error,
      });
    }).catch((err) => {
      console.error(`Failed to initiate threads for job ${jobNo}:`, err.message);
    });

    res.status(201).json(transformJob(job));
  } catch (error: any) {
    console.error('=== CREATE JOB ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error meta:', JSON.stringify(error.meta));
    console.error('Error stack:', error.stack);
    console.error('Request body keys:', Object.keys(req.body || {}));
    res.status(500).json({
      error: 'Failed to create job',
      details: error.message,
      code: error.code
    });
  }
};

// Update job
export const updateJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      lineItems,
      specs,
      financials,
      title,
      status,
      customerPONumber,
      dueDate,
      customerId,
      vendorId,
      notes,
      quantity: inputQuantity,
      sellPrice: inputSellPrice,
      sizeName: inputSizeName,
      paperSource: inputPaperSource,
      bradfordRefNumber,  // Bradford reference number (for all jobs)
      bradfordPaperLbs: inputBradfordPaperLbs,  // Bradford paper weight in lbs
      ...rest
    } = req.body;

    // Get existing job
    const existingJob = await prisma.job.findUnique({
      where: { id },
      include: {
        Vendor: true,
        ProfitSplit: true,
        PurchaseOrder: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Guard: Field locking after invoice generated
    const LOCKED_AFTER_INVOICE = ['sellPrice', 'quantity', 'specs'];
    if (existingJob.invoiceGeneratedAt) {
      const attemptedLockedFields = LOCKED_AFTER_INVOICE.filter(field => {
        const reqValue = req.body[field] ?? req.body.inputSellPrice ?? req.body.inputQuantity;
        if (field === 'sellPrice' && req.body.sellPrice !== undefined) {
          return Number(req.body.sellPrice) !== Number(existingJob.sellPrice);
        }
        if (field === 'quantity' && req.body.quantity !== undefined) {
          return Number(req.body.quantity) !== Number(existingJob.quantity);
        }
        if (field === 'specs' && req.body.specs !== undefined) {
          return true; // Specs changes after invoice are blocked
        }
        if (field === 'specs' && req.body.lineItems !== undefined) {
          return true; // LineItems changes after invoice are blocked
        }
        return false;
      });

      if (attemptedLockedFields.length > 0) {
        return res.status(403).json({
          error: 'Job is locked after invoice generation',
          lockedFields: attemptedLockedFields,
          invoiceGeneratedAt: existingJob.invoiceGeneratedAt,
          hint: 'Create a credit memo or new job for changes'
        });
      }
    }

    // Calculate quantity and totals from line items if provided
    let quantity = existingJob.quantity;
    let lineItemTotal = Number(existingJob.sellPrice) || 0;

    if (lineItems) {
      quantity = lineItems.reduce((sum: number, item: any) => sum + (parseInt(item.quantity) || 0), 0);
      lineItemTotal = lineItems.reduce((sum: number, item: any) =>
        sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)), 0);
    }

    // Build update data
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (title !== undefined) updateData.title = title;
    if (status !== undefined) updateData.status = status;
    if (customerPONumber !== undefined) updateData.customerPONumber = customerPONumber;
    if (bradfordRefNumber !== undefined) updateData.partnerPONumber = bradfordRefNumber;
    if (dueDate !== undefined) updateData.deliveryDate = dueDate ? new Date(dueDate) : null;
    if (customerId !== undefined) updateData.customerId = customerId;
    if (vendorId !== undefined) updateData.vendorId = vendorId;
    if (notes !== undefined) updateData.notes = notes;

    // Handle specs - merge lineItems into specs if either changed
    if (specs !== undefined || lineItems !== undefined) {
      const existingSpecs = (existingJob.specs as any) || {};
      updateData.specs = {
        ...existingSpecs,
        ...(specs || {}),
        lineItems: lineItems !== undefined ? lineItems : existingSpecs.lineItems,
      };
    }

    // Handle sizeName
    if (inputSizeName !== undefined) {
      updateData.sizeName = inputSizeName ? normalizeSize(inputSizeName) : null;
    }

    // Handle paperSource
    if (inputPaperSource !== undefined) {
      updateData.paperSource = inputPaperSource;
    }

    // Handle bradfordPaperLbs
    if (inputBradfordPaperLbs !== undefined) {
      updateData.bradfordPaperLbs = inputBradfordPaperLbs ? parseFloat(inputBradfordPaperLbs) : null;
    }

    // Handle sellPrice directly
    if (inputSellPrice !== undefined) {
      updateData.sellPrice = inputSellPrice;
    }

    // Handle quantity directly
    if (inputQuantity !== undefined) {
      updateData.quantity = inputQuantity;
    }

    if (lineItems !== undefined) {
      updateData.quantity = quantity;
      // Update sellPrice from line items if not explicitly set
      if (inputSellPrice === undefined) {
        updateData.sellPrice = lineItemTotal;
      }
    }

    // Handle financials (update sellPrice from impactCustomerTotal)
    if (financials) {
      if (financials.impactCustomerTotal !== undefined && inputSellPrice === undefined) {
        updateData.sellPrice = financials.impactCustomerTotal;
      }
    }

    // Guard: Backend pricing validation - reject negative margin without override
    const finalSellPrice = updateData.sellPrice ?? existingJob.sellPrice;
    if (finalSellPrice !== undefined && req.body.allowNegativeMargin !== true) {
      // Calculate total cost from Impact-origin POs
      const impactPOs = (existingJob.PurchaseOrder || []).filter(
        (po: any) => po.originCompanyId === 'impact-direct'
      );
      const totalCost = impactPOs.reduce((sum: number, po: any) => sum + (Number(po.buyCost) || 0), 0);

      if (Number(finalSellPrice) < 0) {
        return res.status(400).json({
          error: 'Sell price cannot be negative',
          sellPrice: finalSellPrice
        });
      }

      if (totalCost > 0 && Number(finalSellPrice) < totalCost) {
        return res.status(400).json({
          error: `Negative margin: sellPrice ($${Number(finalSellPrice).toFixed(2)}) < totalCost ($${totalCost.toFixed(2)})`,
          sellPrice: finalSellPrice,
          totalCost: totalCost,
          margin: Number(finalSellPrice) - totalCost,
          hint: 'Set allowNegativeMargin=true to override'
        });
      }
    }

    // Log all changes to JobActivity
    const activityPromises: Promise<void>[] = [];

    if (title !== undefined && title !== existingJob.title) {
      activityPromises.push(logJobChange(id, 'JOB_UPDATED', 'title', existingJob.title, title));
    }
    if (status !== undefined && status !== existingJob.status) {
      activityPromises.push(logJobChange(id, 'STATUS_CHANGED', 'status', existingJob.status, status));
    }
    if (customerPONumber !== undefined && customerPONumber !== existingJob.customerPONumber) {
      activityPromises.push(logJobChange(id, 'JOB_UPDATED', 'customerPONumber', existingJob.customerPONumber, customerPONumber));
    }
    if (inputQuantity !== undefined && inputQuantity !== existingJob.quantity) {
      activityPromises.push(logJobChange(id, 'JOB_UPDATED', 'quantity', existingJob.quantity, inputQuantity));
    }
    if (inputSellPrice !== undefined && Number(inputSellPrice) !== Number(existingJob.sellPrice)) {
      activityPromises.push(logJobChange(id, 'PRICING_UPDATED', 'sellPrice', existingJob.sellPrice, inputSellPrice));
    }
    if (vendorId !== undefined && vendorId !== existingJob.vendorId) {
      activityPromises.push(logJobChange(id, 'VENDOR_CHANGED', 'vendorId', existingJob.vendorId, vendorId));
    }
    if (customerId !== undefined && customerId !== existingJob.customerId) {
      activityPromises.push(logJobChange(id, 'JOB_UPDATED', 'customerId', existingJob.customerId, customerId));
    }
    if (inputSizeName !== undefined && inputSizeName !== existingJob.sizeName) {
      activityPromises.push(logJobChange(id, 'JOB_UPDATED', 'sizeName', existingJob.sizeName, inputSizeName));
    }
    if (inputPaperSource !== undefined && inputPaperSource !== existingJob.paperSource) {
      activityPromises.push(logJobChange(id, 'JOB_UPDATED', 'paperSource', existingJob.paperSource, inputPaperSource));
    }
    if (inputBradfordPaperLbs !== undefined && Number(inputBradfordPaperLbs) !== Number(existingJob.bradfordPaperLbs)) {
      activityPromises.push(logJobChange(id, 'JOB_UPDATED', 'bradfordPaperLbs', existingJob.bradfordPaperLbs, inputBradfordPaperLbs));
    }

    // Execute all activity logs in parallel
    await Promise.all(activityPromises);

    let job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          include: {
            Vendor: true,
          },
        },
        ProfitSplit: true, // NEW: Include profit split
      },
    });

    // Auto-create POs if job now meets criteria and doesn't have Impact→Bradford PO
    const poValidation = canCreateImpactPO({
      quantity: job.quantity || 0,
      sizeName: job.sizeName,
      sellPrice: Number(job.sellPrice) || 0,
    });

    const hasImpactPO = (job.PurchaseOrder || []).some(
      (po: any) => po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford'
    );

    if (poValidation.valid && !hasImpactPO) {
      console.log(`Auto-creating POs for job ${job.jobNo}: Job now meets criteria`);

      // Calculate tier pricing for the job
      const tierPricing = calculateTierPricing({
        sizeName: job.sizeName!,
        quantity: job.quantity!,
        paperSource: (job.paperSource || 'BRADFORD') as PaperSource,
      });

      const totalCost = tierPricing.tier2.totalCost;
      const paperCost = tierPricing.tier1.paperTotal;
      const paperMarkup = tierPricing.tier2.paperMarkup;
      const timestamp = Date.now();

      // PO 1: Impact Direct → Bradford
      await prisma.purchaseOrder.create({
        data: {
          id: crypto.randomUUID(),
          jobId: id,
          originCompanyId: 'impact-direct',
          targetCompanyId: 'bradford',
          poNumber: `PO-${job.jobNo}-IB-${timestamp}`,
          description: 'Impact to Bradford',
          buyCost: totalCost,
          paperCost: paperCost,
          paperMarkup: paperMarkup,
          status: 'PENDING',
          updatedAt: new Date(),
        },
      });

      // PO 2: Bradford → JD Graphic (only if not already exists)
      const mfgCost = totalCost - paperMarkup - paperCost;
      const hasBradfordJDPO = (job.PurchaseOrder || []).some(
        (po: any) => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
      );

      if (!hasBradfordJDPO) {
        await prisma.purchaseOrder.create({
          data: {
            id: crypto.randomUUID(),
            jobId: id,
            originCompanyId: 'bradford',
            targetCompanyId: 'jd-graphic',
            poNumber: `PO-${job.jobNo}-BJ-${timestamp}`,
            description: 'Bradford to JD',
            buyCost: mfgCost > 0 ? mfgCost : null,
            mfgCost: mfgCost > 0 ? mfgCost : null,
            status: 'PENDING',
            updatedAt: new Date(),
          },
        });
      }

      // Re-fetch job with new POs
      job = await prisma.job.findUnique({
        where: { id },
        include: {
          Company: true,
          Vendor: true,
          PurchaseOrder: {
            include: {
              Vendor: true,
            },
          },
          ProfitSplit: true,
        },
      }) as any;
    }

    // ===== ARTWORK URL CHANGE DETECTION =====
    // Check if artwork URL was just added to a job with "artwork to follow" flag
    const existingSpecs = (existingJob.specs as any) || {};
    const newSpecs = (updateData.specs as any) || existingSpecs;
    const oldArtworkUrl = existingSpecs.artworkUrl || '';
    const newArtworkUrl = newSpecs.artworkUrl || '';

    if (!oldArtworkUrl && newArtworkUrl && existingSpecs.artworkToFollow) {
      // Artwork was just added to a job that had "artwork to follow" checked
      // Find ALL POs that were previously emailed to vendors
      const emailedPOs = (job.PurchaseOrder || []).filter((po: any) => po.emailedTo);

      if (emailedPOs.length > 0) {
        console.log(`📎 Artwork URL added to job ${job.jobNo} - sending follow-up emails to ${emailedPOs.length} vendor(s)`);

        // Prepare job data for PDF generation
        const jobDataForPDF = {
          id: job.id,
          jobNo: job.jobNo,
          number: job.jobNo,
          title: job.title || '',
          specs: newSpecs,
          customer: job.Company ? {
            name: job.Company.name,
            email: job.Company.email || '',
            phone: job.Company.phone || '',
            address: job.Company.address || '',
          } : { name: 'N/A', email: '', phone: '', address: '' },
          vendor: job.Vendor ? {
            name: job.Vendor.name,
            email: job.Vendor.email || '',
            phone: job.Vendor.phone || '',
            address: [job.Vendor.streetAddress, job.Vendor.city, job.Vendor.state, job.Vendor.zip].filter(Boolean).join(', '),
          } : { name: 'N/A', email: '', phone: '', address: '' },
        };

        // Send follow-up emails to all flagged POs
        for (const po of emailedPOs) {
          const vendorName = po.Vendor?.name || 'Vendor';
          try {
            const result = await sendArtworkFollowUpEmail(
              po,
              jobDataForPDF,
              po.emailedTo!, // We know emailedTo exists because we filtered for it above
              vendorName,
              newArtworkUrl,
              'brandon@impactdirectprinting.com'
            );

            if (result.success) {
              // Log the activity
              await logJobChange(id, 'ARTWORK_FOLLOWUP_SENT', 'artworkUrl', '', newArtworkUrl);
              console.log(`✅ Artwork follow-up sent for PO ${po.poNumber} to ${po.emailedTo}`);
            } else {
              console.error(`❌ Failed to send artwork follow-up for PO ${po.poNumber}:`, result.error);
            }
          } catch (err) {
            console.error(`❌ Error sending artwork follow-up for PO ${po.poNumber}:`, err);
          }
        }
      }
    }

    // Update ProfitSplit record if sell price or pricing-related fields changed
    const sellPriceChanged = inputSellPrice !== undefined;
    const sizeChanged = inputSizeName !== undefined;
    const paperSourceChanged = inputPaperSource !== undefined;
    const quantityChanged = lineItems !== undefined;

    if (sellPriceChanged || sizeChanged || paperSourceChanged || quantityChanged) {
      // Recalculate profit split
      const finalSellPrice = Number(job.sellPrice) || 0;
      const finalSizeName = job.sizeName;
      const finalPaperSource = (job.paperSource || 'BRADFORD') as PaperSource;
      const finalQuantity = job.quantity || 0;

      // Calculate total cost from POs or tier pricing
      let totalCost = 0;
      let paperMarkup = 0;
      let paperCost = 0;

      // Check if this is a standard size with auto-calculated pricing
      const selfMailerPricing = finalSizeName ? getSelfMailerPricing(finalSizeName) : null;
      if (finalSizeName && finalQuantity > 0 && selfMailerPricing) {
        const tierPricing = calculateTierPricing({
          sizeName: finalSizeName,
          quantity: finalQuantity,
          paperSource: finalPaperSource,
        });
        totalCost = tierPricing.tier2.totalCost;
        paperMarkup = tierPricing.tier2.paperMarkup;
        paperCost = tierPricing.tier1.paperTotal;
      } else {
        // Sum from POs
        const purchaseOrders = job.PurchaseOrder || [];
        totalCost = purchaseOrders.reduce((sum: number, po: any) => {
          return sum + (Number(po.buyCost) || 0);
        }, 0);
        paperCost = purchaseOrders.reduce((sum: number, po: any) => {
          return sum + (Number(po.paperCost) || 0);
        }, 0);
        paperMarkup = purchaseOrders.reduce((sum: number, po: any) => {
          return sum + (Number(po.paperMarkup) || 0);
        }, 0);
      }

      // Calculate split
      const split = calculateProfitSplit({
        sellPrice: finalSellPrice,
        totalCost,
        paperMarkup,
        routingType: job.routingType,  // Pass routing type for correct split calculation
      });

      // Upsert ProfitSplit record
      await prisma.profitSplit.upsert({
        where: { jobId: id },
        create: {
          jobId: id,
          sellPrice: finalSellPrice,
          totalCost,
          paperCost,
          paperMarkup,
          grossMargin: split.grossMargin,
          bradfordShare: split.bradfordTotal,
          impactShare: split.impactTotal,
          calculatedAt: new Date(),
        },
        update: {
          sellPrice: finalSellPrice,
          totalCost,
          paperCost,
          paperMarkup,
          grossMargin: split.grossMargin,
          bradfordShare: split.bradfordTotal,
          impactShare: split.impactTotal,
          calculatedAt: new Date(),
        },
      });

      // Re-fetch job with updated ProfitSplit
      const updatedJob = await prisma.job.findUnique({
        where: { id },
        include: {
          Company: true,
          Vendor: true,
          PurchaseOrder: {
            include: {
              Vendor: true,
            },
          },
          ProfitSplit: true,
        },
      });

      return res.json(transformJob(updatedJob));
    }

    res.json(transformJob(job));
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
};

// Delete job (soft delete)
export const deleteJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.job.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
};

// Update job status
export const updateJobStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const job = await prisma.job.update({
      where: { id },
      data: {
        status,
        updatedAt: new Date(),
      },
      include: {
        Company: true,
        Vendor: true,
      },
    });

    res.json(transformJob(job));
  } catch (error) {
    console.error('Update job status error:', error);
    res.status(500).json({ error: 'Failed to update job status' });
  }
};

// Lock/unlock job - not supported in production schema, return job as-is
export const toggleJobLock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        Company: true,
        Vendor: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(transformJob(job));
  } catch (error) {
    console.error('Toggle job lock error:', error);
    res.status(500).json({ error: 'Failed to toggle job lock' });
  }
};

// Update Bradford reference number - uses dedicated partnerPONumber field
export const updateBradfordRef = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bradfordRefNumber } = req.body;

    // Use dedicated partnerPONumber field for Bradford/Partner PO
    const job = await prisma.job.update({
      where: { id },
      data: {
        partnerPONumber: bradfordRefNumber,
        updatedAt: new Date(),
      },
      include: {
        Company: true,
        Vendor: true,
      },
    });

    // Add bradfordRefNumber to response for frontend
    const transformed = transformJob(job);
    transformed.bradfordRefNumber = bradfordRefNumber;

    res.json(transformed);
  } catch (error) {
    console.error('Update Bradford ref error:', error);
    res.status(500).json({ error: 'Failed to update Bradford reference' });
  }
};

// Update Bradford payment status (LEGACY - kept for backward compatibility)
export const updateBradfordPayment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paid, date, amount } = req.body;

    const job = await prisma.job.update({
      where: { id },
      data: {
        bradfordPaymentPaid: paid,
        bradfordPaymentDate: date ? new Date(date) : null,
        bradfordPaymentAmount: amount || null,
        updatedAt: new Date(),
      },
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          include: {
            Vendor: true,
          },
        },
      },
    });

    res.json(transformJob(job));
  } catch (error) {
    console.error('Update Bradford payment error:', error);
    res.status(500).json({ error: 'Failed to update Bradford payment' });
  }
};

// ============================================
// COMPREHENSIVE PAYMENT TRACKING (NEW)
// ============================================

// Helper: Log job field changes to JobActivity
async function logJobChange(
  jobId: string,
  action: string,
  field: string,
  oldValue: any,
  newValue: any,
  changedBy: string = 'system'
) {
  // Only log if values actually changed
  const oldStr = oldValue !== null && oldValue !== undefined ? String(oldValue) : null;
  const newStr = newValue !== null && newValue !== undefined ? String(newValue) : null;

  if (oldStr === newStr) return; // Skip if no actual change

  await prisma.jobActivity.create({
    data: {
      id: crypto.randomUUID(),
      jobId,
      action,
      field,
      oldValue: oldStr,
      newValue: newStr,
      changedBy,
      changedByRole: 'BROKER_ADMIN',
    },
  });
}

// Helper: Log payment changes to JobActivity
async function logPaymentChange(
  jobId: string,
  field: string,
  oldValue: any,
  newValue: any,
  changedBy: string = 'system'
) {
  await prisma.jobActivity.create({
    data: {
      id: crypto.randomUUID(),
      jobId,
      action: 'PAYMENT_UPDATED',
      field,
      oldValue: oldValue !== null && oldValue !== undefined ? String(oldValue) : null,
      newValue: newValue !== null && newValue !== undefined ? String(newValue) : null,
      changedBy,
      changedByRole: 'BROKER_ADMIN',
    },
  });
}

// Update all payment fields for a job
export const updatePayments = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      customerPaymentAmount,
      customerPaymentDate,
      vendorPaymentAmount,
      vendorPaymentDate,
      bradfordPaymentAmount,
      bradfordPaymentDate,
    } = req.body;

    // Get existing job for activity logging
    const existingJob = await prisma.job.findUnique({
      where: { id },
      select: {
        customerPaymentAmount: true,
        customerPaymentDate: true,
        vendorPaymentAmount: true,
        vendorPaymentDate: true,
        bradfordPaymentAmount: true,
        bradfordPaymentDate: true,
        bradfordPaymentPaid: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Build update data
    const updateData: any = {
      updatedAt: new Date(),
    };

    // Customer payment
    if (customerPaymentAmount !== undefined) {
      updateData.customerPaymentAmount = customerPaymentAmount;
    }
    if (customerPaymentDate !== undefined) {
      updateData.customerPaymentDate = customerPaymentDate ? new Date(customerPaymentDate) : null;
    }

    // Vendor payment
    if (vendorPaymentAmount !== undefined) {
      updateData.vendorPaymentAmount = vendorPaymentAmount;
    }
    if (vendorPaymentDate !== undefined) {
      updateData.vendorPaymentDate = vendorPaymentDate ? new Date(vendorPaymentDate) : null;
    }

    // Bradford payment
    if (bradfordPaymentAmount !== undefined) {
      updateData.bradfordPaymentAmount = bradfordPaymentAmount;
    }
    if (bradfordPaymentDate !== undefined) {
      updateData.bradfordPaymentDate = bradfordPaymentDate ? new Date(bradfordPaymentDate) : null;
      // Also update bradfordPaymentPaid flag based on date
      updateData.bradfordPaymentPaid = !!bradfordPaymentDate;
    }

    // Update the job
    const job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          include: {
            Vendor: true,
          },
        },
      },
    });

    // Log changes to JobActivity
    const changedBy = 'admin'; // Could be req.user?.email if auth is set up

    if (customerPaymentAmount !== undefined &&
        Number(existingJob.customerPaymentAmount) !== Number(customerPaymentAmount)) {
      await logPaymentChange(id, 'customerPaymentAmount',
        existingJob.customerPaymentAmount, customerPaymentAmount, changedBy);
    }
    if (customerPaymentDate !== undefined &&
        existingJob.customerPaymentDate?.toISOString() !== (customerPaymentDate ? new Date(customerPaymentDate).toISOString() : null)) {
      await logPaymentChange(id, 'customerPaymentDate',
        existingJob.customerPaymentDate, customerPaymentDate, changedBy);
    }

    if (vendorPaymentAmount !== undefined &&
        Number(existingJob.vendorPaymentAmount) !== Number(vendorPaymentAmount)) {
      await logPaymentChange(id, 'vendorPaymentAmount',
        existingJob.vendorPaymentAmount, vendorPaymentAmount, changedBy);
    }
    if (vendorPaymentDate !== undefined &&
        existingJob.vendorPaymentDate?.toISOString() !== (vendorPaymentDate ? new Date(vendorPaymentDate).toISOString() : null)) {
      await logPaymentChange(id, 'vendorPaymentDate',
        existingJob.vendorPaymentDate, vendorPaymentDate, changedBy);
    }

    if (bradfordPaymentAmount !== undefined &&
        Number(existingJob.bradfordPaymentAmount) !== Number(bradfordPaymentAmount)) {
      await logPaymentChange(id, 'bradfordPaymentAmount',
        existingJob.bradfordPaymentAmount, bradfordPaymentAmount, changedBy);
    }
    if (bradfordPaymentDate !== undefined &&
        existingJob.bradfordPaymentDate?.toISOString() !== (bradfordPaymentDate ? new Date(bradfordPaymentDate).toISOString() : null)) {
      await logPaymentChange(id, 'bradfordPaymentDate',
        existingJob.bradfordPaymentDate, bradfordPaymentDate, changedBy);
    }

    res.json(transformJob(job));
  } catch (error) {
    console.error('Update payments error:', error);
    res.status(500).json({ error: 'Failed to update payments' });
  }
};

// Batch update payments for multiple jobs
export const batchUpdatePayments = async (req: Request, res: Response) => {
  try {
    const { jobIds, paymentType, date } = req.body;

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: 'Invalid job IDs' });
    }

    if (!paymentType || !['customer', 'vendor', 'bradford'].includes(paymentType)) {
      return res.status(400).json({ error: 'Invalid payment type. Must be: customer, vendor, or bradford' });
    }

    const paymentDate = date ? new Date(date) : new Date();
    const results: any[] = [];
    const changedBy = 'admin';

    // Process each job
    for (const jobId of jobIds) {
      try {
        // Get the job with its calculated profit for default amounts
        const job = await prisma.job.findUnique({
          where: { id: jobId },
          include: {
            Company: true,
            Vendor: true,
            PurchaseOrder: {
              include: {
                Vendor: true,
              },
            },
          },
        });

        if (!job) {
          results.push({ jobId, success: false, error: 'Job not found' });
          continue;
        }

        const profit = calculateProfit(job);
        const updateData: any = { updatedAt: new Date() };
        let field = '';
        let amount = 0;

        switch (paymentType) {
          case 'customer':
            // Customer → Impact: use sellPrice
            amount = profit.sellPrice;
            updateData.customerPaymentAmount = amount;
            updateData.customerPaymentDate = paymentDate;
            field = 'customerPayment';
            break;

          case 'vendor':
            // Impact → Vendor: use totalCost
            amount = profit.totalCost;
            updateData.vendorPaymentAmount = amount;
            updateData.vendorPaymentDate = paymentDate;
            field = 'vendorPayment';
            break;

          case 'bradford':
            // Impact → Bradford: use bradfordTotal (50% of spread + paper markup)
            amount = profit.bradfordTotal;
            updateData.bradfordPaymentAmount = amount;
            updateData.bradfordPaymentDate = paymentDate;
            updateData.bradfordPaymentPaid = true;
            field = 'bradfordPayment';
            break;
        }

        // Update the job
        await prisma.job.update({
          where: { id: jobId },
          data: updateData,
        });

        // Log the change
        await logPaymentChange(jobId, field, null, `${amount} on ${paymentDate.toISOString().split('T')[0]}`, changedBy);

        results.push({
          jobId,
          jobNo: job.jobNo,
          success: true,
          amount,
          date: paymentDate.toISOString().split('T')[0],
        });
      } catch (err) {
        console.error(`Error updating payment for job ${jobId}:`, err);
        results.push({ jobId, success: false, error: 'Update failed' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      updated: successCount,
      failed: failCount,
      paymentType,
      date: paymentDate.toISOString().split('T')[0],
      results,
    });
  } catch (error) {
    console.error('Batch update payments error:', error);
    res.status(500).json({ error: 'Failed to batch update payments' });
  }
};

// Import batch jobs - simplified for production schema
export const importBatchJobs = async (req: Request, res: Response) => {
  try {
    const { jobs } = req.body;

    if (!jobs || !Array.isArray(jobs)) {
      return res.status(400).json({ error: 'Invalid jobs data' });
    }

    const createdJobs = [];

    for (const jobData of jobs) {
      // Generate job number
      const lastJob = await prisma.job.findFirst({
        orderBy: { jobNo: 'desc' },
      });

      let jobNo = 'J-1001';
      if (lastJob) {
        const match = lastJob.jobNo.match(/J-(\d+)/);
        if (match) {
          const lastNumber = parseInt(match[1]);
          jobNo = `J-${(lastNumber + 1 + createdJobs.length).toString().padStart(4, '0')}`;
        }
      }

      const job = await prisma.job.create({
        data: {
          id: crypto.randomUUID(),
          jobNo,
          title: jobData.title || '',
          customerId: jobData.customerId,
          vendorId: jobData.vendorId || null,
          status: 'ACTIVE',
          specs: jobData.specs || {},
          quantity: jobData.quantity || 0,
          sellPrice: jobData.sellPrice || jobData.customerTotal || 0,
          updatedAt: new Date(),
        },
        include: {
          Company: true,
          Vendor: true,
        },
      });

      createdJobs.push(transformJob(job));
    }

    res.status(201).json({
      success: true,
      created: createdJobs.length,
      jobs: createdJobs,
    });
  } catch (error) {
    console.error('Import batch jobs error:', error);
    res.status(500).json({ error: 'Failed to import jobs' });
  }
};

// Batch delete jobs
export const batchDeleteJobs = async (req: Request, res: Response) => {
  try {
    const { jobIds } = req.body;

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: 'Invalid job IDs' });
    }

    // Soft delete jobs
    const result = await prisma.job.updateMany({
      where: {
        id: { in: jobIds },
      },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      deleted: result.count,
    });
  } catch (error) {
    console.error('Batch delete jobs error:', error);
    res.status(500).json({ error: 'Failed to delete jobs' });
  }
};

// Bulk update paper source for multiple jobs
export const bulkUpdatePaperSource = async (req: Request, res: Response) => {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Invalid updates data' });
    }

    // Update each job's paper source
    const results = await Promise.all(
      updates.map(async (update: { jobId: string; jdSuppliesPaper: boolean }) => {
        try {
          await prisma.job.update({
            where: { id: update.jobId },
            data: {
              jdSuppliesPaper: update.jdSuppliesPaper,
              updatedAt: new Date(),
            },
          });
          return { jobId: update.jobId, success: true };
        } catch (err) {
          return { jobId: update.jobId, success: false, error: 'Job not found' };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      updated: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error('Bulk update paper source error:', error);
    res.status(500).json({ error: 'Failed to bulk update paper source' });
  }
};

// ============================================
// PURCHASE ORDER MANAGEMENT (NEW SIMPLIFIED MODEL)
// ============================================

// Generate PO number
async function generatePONumber(): Promise<string> {
  const lastPO = await prisma.purchaseOrder.findFirst({
    where: {
      poNumber: {
        startsWith: 'PO-'
      }
    },
    orderBy: {
      poNumber: 'desc'
    }
  });

  if (lastPO?.poNumber) {
    const match = lastPO.poNumber.match(/PO-(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1]) + 1;
      return `PO-${nextNum.toString().padStart(4, '0')}`;
    }
  }
  return 'PO-0001';
}

// Get POs for a job
export const getJobPOs = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const pos = await prisma.purchaseOrder.findMany({
      where: { jobId },
      include: {
        Vendor: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const transformed = pos.map(po => ({
      id: po.id,
      poNumber: po.poNumber,
      originCompanyId: po.originCompanyId,
      targetCompanyId: po.targetCompanyId,
      description: po.description || 'Vendor Services',
      buyCost: Number(po.buyCost) || 0,
      paperCost: po.paperCost ? Number(po.paperCost) : null,
      paperMarkup: po.paperMarkup ? Number(po.paperMarkup) : null,
      mfgCost: po.mfgCost ? Number(po.mfgCost) : null,
      printCPM: po.printCPM ? Number(po.printCPM) : null,
      paperCPM: po.paperCPM ? Number(po.paperCPM) : null,
      vendorRef: po.vendorRef || '',
      vendorId: po.targetVendorId,
      status: po.status,
      issuedAt: po.issuedAt,
      paidAt: po.paidAt,
      createdAt: po.createdAt,
      // Email tracking
      emailedAt: po.emailedAt,
      emailedTo: po.emailedTo,
      vendor: po.Vendor ? {
        id: po.Vendor.id,
        name: po.Vendor.name,
      } : null,
    }));

    res.json(transformed);
  } catch (error) {
    console.error('Get job POs error:', error);
    res.status(500).json({ error: 'Failed to fetch POs' });
  }
};

// Create PO for a job
export const createJobPO = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { poType, vendorId, description, buyCost, paperCost, paperMarkup, mfgCost, printCPM, paperCPM, vendorRef, status } = req.body;

    // Verify job exists and get current data
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        PurchaseOrder: true,
      },
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Determine origin/target based on poType
    let originCompanyId: string;
    let targetCompanyId: string | null = null;
    let targetVendorId: string | null = null;
    let poNumber: string;

    if (poType === 'bradford-jd') {
      // Bradford → JD Graphic (internal tracking, NOT Impact's cost)
      originCompanyId = 'bradford';
      targetCompanyId = 'jd-graphic';

      // Keep existing format for Bradford→JD POs
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 6);
      poNumber = `PO-BJ-${timestamp}-${random}`;
    } else {
      // Impact → Vendor (counts as our cost) - default
      originCompanyId = 'impact-direct';
      targetVendorId = vendorId || null;

      // PO format: {jobDigits}-{random4}.{seq} (per vendor per job)
      if (vendorId) {
        // Get job number digits only (strip "J-" prefix)
        const jobDigits = job.jobNo.replace(/^J-/i, '');

        // Check if this vendor already has a PO for this job (reuse random4)
        const existingVendorPO = await prisma.purchaseOrder.findFirst({
          where: { jobId, targetVendorId: vendorId },
          orderBy: { createdAt: 'asc' },
        });

        let random4: string;
        if (existingVendorPO?.poNumber) {
          // Extract random4 from existing PO: "2056-9283.1" → "9283"
          const match = existingVendorPO.poNumber.match(/-(\d{4})\./);
          random4 = match?.[1] || Math.floor(1000 + Math.random() * 9000).toString();
        } else {
          // Generate new random 4-digit suffix for this vendor on this job
          random4 = Math.floor(1000 + Math.random() * 9000).toString();
        }

        // Count existing POs for sequence
        const existingPOCount = await prisma.purchaseOrder.count({
          where: { jobId, targetVendorId: vendorId },
        });
        const sequenceNum = existingPOCount + 1;

        poNumber = `${jobDigits}-${random4}.${sequenceNum}`;
      } else {
        // No vendor specified, use fallback format
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 6);
        poNumber = `PO-IV-${timestamp}-${random}`;
      }
    }

    const po = await prisma.purchaseOrder.create({
      data: {
        id: crypto.randomUUID(),
        poNumber,
        jobId,
        originCompanyId,
        targetCompanyId,
        targetVendorId,
        description: description || 'Vendor Services',
        buyCost: buyCost || 0,
        paperCost: paperCost || null,
        paperMarkup: paperMarkup || null,
        mfgCost: mfgCost || null,
        printCPM: printCPM || null,
        paperCPM: paperCPM || null,
        vendorRef: vendorRef || null,
        status: status || 'PENDING',
        updatedAt: new Date(),
      },
      include: {
        Vendor: true,
      },
    });

    // Recalculate profit split now that a PO has been added
    // Sum ALL Impact-origin POs (Impact → any vendor counts as our cost)
    const allPOs = [...(job.PurchaseOrder || []), po];
    const impactPOs = allPOs.filter((p: any) =>
      p.originCompanyId === 'impact-direct'
    );
    const totalCost = impactPOs.reduce((sum, p) => sum + (Number(p.buyCost) || 0), 0);
    const totalPaperCost = impactPOs.reduce((sum, p) => sum + (Number(p.paperCost) || 0), 0);
    const totalPaperMarkup = impactPOs.reduce((sum, p) => sum + (Number(p.paperMarkup) || 0), 0);

    const sellPrice = Number(job.sellPrice) || 0;

    // Calculate profit split
    const split = calculateProfitSplit({
      sellPrice,
      totalCost,
      paperMarkup: totalPaperMarkup,
      routingType: job.routingType,  // Pass routing type for correct split calculation
    });

    // Upsert ProfitSplit record
    await prisma.profitSplit.upsert({
      where: { jobId },
      create: {
        jobId,
        sellPrice,
        totalCost,
        paperCost: totalPaperCost,
        paperMarkup: totalPaperMarkup,
        grossMargin: split.grossMargin,
        bradfordShare: split.bradfordTotal,
        impactShare: split.impactTotal,
        calculatedAt: new Date(),
      },
      update: {
        sellPrice,
        totalCost,
        paperCost: totalPaperCost,
        paperMarkup: totalPaperMarkup,
        grossMargin: split.grossMargin,
        bradfordShare: split.bradfordTotal,
        impactShare: split.impactTotal,
        calculatedAt: new Date(),
      },
    });

    res.status(201).json({
      id: po.id,
      poNumber: po.poNumber,
      originCompanyId: po.originCompanyId,
      targetCompanyId: po.targetCompanyId,
      description: po.description,
      buyCost: Number(po.buyCost),
      paperCost: po.paperCost ? Number(po.paperCost) : null,
      paperMarkup: po.paperMarkup ? Number(po.paperMarkup) : null,
      mfgCost: po.mfgCost ? Number(po.mfgCost) : null,
      printCPM: po.printCPM ? Number(po.printCPM) : null,
      paperCPM: po.paperCPM ? Number(po.paperCPM) : null,
      vendorRef: po.vendorRef,
      vendorId: po.targetVendorId,
      status: po.status,
      vendor: po.Vendor ? { id: po.Vendor.id, name: po.Vendor.name } : null,
    });
  } catch (error) {
    console.error('Create PO error:', error);
    res.status(500).json({ error: 'Failed to create PO' });
  }
};

// Update PO
export const updatePO = async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const { vendorId, description, buyCost, paperCost, paperMarkup, mfgCost, printCPM, paperCPM, vendorRef, status, issuedAt, paidAt } = req.body;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (vendorId !== undefined) updateData.targetVendorId = vendorId;
    if (description !== undefined) updateData.description = description;
    if (buyCost !== undefined) updateData.buyCost = buyCost;
    if (paperCost !== undefined) updateData.paperCost = paperCost;
    if (paperMarkup !== undefined) updateData.paperMarkup = paperMarkup;
    if (mfgCost !== undefined) updateData.mfgCost = mfgCost;
    // CPM rates for audit trail
    if (printCPM !== undefined) updateData.printCPM = printCPM;
    if (paperCPM !== undefined) updateData.paperCPM = paperCPM;
    if (vendorRef !== undefined) updateData.vendorRef = vendorRef;
    if (status !== undefined) updateData.status = status;
    if (issuedAt !== undefined) updateData.issuedAt = issuedAt ? new Date(issuedAt) : null;
    if (paidAt !== undefined) updateData.paidAt = paidAt ? new Date(paidAt) : null;

    const po = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: updateData,
      include: {
        Vendor: true,
      },
    });

    // Recalculate ProfitSplit after PO update (if linked to a job)
    if (po.jobId) {
      const job = await prisma.job.findUnique({
        where: { id: po.jobId },
        include: {
          PurchaseOrder: true,
        },
      });

      if (job) {
        // Sum ALL Impact-origin POs (Impact → any vendor counts as our cost)
        const allPOs = job.PurchaseOrder || [];
        const impactPOs = allPOs.filter((p: any) =>
          p.originCompanyId === 'impact-direct'
        );
        const totalCost = impactPOs.reduce((sum: number, p: any) => sum + (Number(p.buyCost) || 0), 0);
        const totalPaperCost = impactPOs.reduce((sum: number, p: any) => sum + (Number(p.paperCost) || 0), 0);
        const totalPaperMarkup = impactPOs.reduce((sum: number, p: any) => sum + (Number(p.paperMarkup) || 0), 0);

        const sellPrice = Number(job.sellPrice) || 0;

        // Calculate profit split
        const split = calculateProfitSplit({
          sellPrice,
          totalCost,
          paperMarkup: totalPaperMarkup,
          routingType: job.routingType,  // Pass routing type for correct split calculation
        });

        // Upsert ProfitSplit record
        await prisma.profitSplit.upsert({
          where: { jobId: po.jobId },
          create: {
            jobId: po.jobId,
            sellPrice,
            totalCost,
            paperCost: totalPaperCost,
            paperMarkup: totalPaperMarkup,
            grossMargin: split.grossMargin,
            bradfordShare: split.bradfordTotal,
            impactShare: split.impactTotal,
            calculatedAt: new Date(),
          },
          update: {
            sellPrice,
            totalCost,
            paperCost: totalPaperCost,
            paperMarkup: totalPaperMarkup,
            grossMargin: split.grossMargin,
            bradfordShare: split.bradfordTotal,
            impactShare: split.impactTotal,
            calculatedAt: new Date(),
          },
        });
      }
    }

    res.json({
      id: po.id,
      poNumber: po.poNumber,
      originCompanyId: po.originCompanyId,
      targetCompanyId: po.targetCompanyId,
      description: po.description,
      buyCost: Number(po.buyCost),
      paperCost: po.paperCost ? Number(po.paperCost) : null,
      paperMarkup: po.paperMarkup ? Number(po.paperMarkup) : null,
      mfgCost: po.mfgCost ? Number(po.mfgCost) : null,
      printCPM: po.printCPM ? Number(po.printCPM) : null,
      paperCPM: po.paperCPM ? Number(po.paperCPM) : null,
      vendorRef: po.vendorRef,
      vendorId: po.targetVendorId,
      status: po.status,
      issuedAt: po.issuedAt,
      paidAt: po.paidAt,
      vendor: po.Vendor ? { id: po.Vendor.id, name: po.Vendor.name } : null,
    });
  } catch (error) {
    console.error('Update PO error:', error);
    res.status(500).json({ error: 'Failed to update PO' });
  }
};

// Delete PO
export const deletePO = async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;

    // Get the PO first to find the job
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
    });

    if (!po) {
      return res.status(404).json({ error: 'PO not found' });
    }

    const jobId = po.jobId;

    // Guard: Prevent PO deletion after invoice generated
    if (jobId) {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (job?.invoiceGeneratedAt) {
        return res.status(403).json({
          error: 'Cannot delete PO after invoice generated',
          invoiceGeneratedAt: job.invoiceGeneratedAt,
          hint: 'Job is locked for financial integrity'
        });
      }
    }

    // Delete the PO
    await prisma.purchaseOrder.delete({
      where: { id: poId },
    });

    // Recalculate profit split after PO deletion (only if linked to a job)
    if (jobId) {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          PurchaseOrder: true,
        },
      });

      if (job) {
        // Sum remaining PO costs - ALL Impact-origin POs (Impact → any vendor counts as our cost)
        const remainingPOs = job.PurchaseOrder || [];
        const impactPOs = remainingPOs.filter((p: any) =>
          p.originCompanyId === 'impact-direct'
        );
        const totalCost = impactPOs.reduce((sum: number, p: any) => sum + (Number(p.buyCost) || 0), 0);
        const totalPaperCost = impactPOs.reduce((sum: number, p: any) => sum + (Number(p.paperCost) || 0), 0);
        const totalPaperMarkup = impactPOs.reduce((sum: number, p: any) => sum + (Number(p.paperMarkup) || 0), 0);

        const sellPrice = Number(job.sellPrice) || 0;

        // Calculate profit split
        const split = calculateProfitSplit({
          sellPrice,
          totalCost,
          paperMarkup: totalPaperMarkup,
          routingType: job.routingType,
        });

        // Upsert ProfitSplit record
        await prisma.profitSplit.upsert({
          where: { jobId },
          create: {
            jobId,
            sellPrice,
            totalCost,
            paperCost: totalPaperCost,
            paperMarkup: totalPaperMarkup,
            grossMargin: split.grossMargin,
            bradfordShare: split.bradfordTotal,
            impactShare: split.impactTotal,
            calculatedAt: new Date(),
          },
          update: {
            sellPrice,
            totalCost,
            paperCost: totalPaperCost,
            paperMarkup: totalPaperMarkup,
            grossMargin: split.grossMargin,
            bradfordShare: split.bradfordTotal,
            impactShare: split.impactTotal,
            calculatedAt: new Date(),
          },
        });
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete PO error:', error);
    res.status(500).json({ error: 'Failed to delete PO' });
  }
};

// ============================================
// MULTI-STEP PAYMENT WORKFLOW (4-STEP PROCESS)
// ============================================
// Step 0: Invoice Sent (manual tracking)
// Step 1: Customer → Impact (Financials tab)
// Step 2: Impact → Bradford OR Impact → Vendor
// Step 3: JD Invoice auto-sent to Bradford (triggered by Step 2 for Bradford path)
// Step 4: Bradford → JD Paid (Bradford Stats tab) OR Impact → Bradford Split
// ============================================

// Step 0: Mark Invoice Sent (manual tracking)
export const markInvoiceSent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, status } = req.body; // status: 'sent' | 'unsent', email: optional recipient

    const existingJob = await prisma.job.findUnique({
      where: { id },
      select: {
        invoiceEmailedAt: true,
        invoiceEmailedTo: true,
        invoiceEmailedCount: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Handle unsent status - clear invoice sent tracking
    if (status === 'unsent') {
      await logPaymentChange(id, 'invoiceEmailedAt', existingJob.invoiceEmailedAt, null, 'admin');

      const job = await prisma.job.update({
        where: { id },
        data: {
          invoiceEmailedAt: null,
          invoiceEmailedTo: null,
          updatedAt: new Date(),
        },
        include: JOB_INCLUDE,
      });
      return res.json(transformJob(job));
    }

    // Default: mark as sent
    const sentAt = new Date();

    // Log the change
    await logPaymentChange(id, 'invoiceEmailedAt', existingJob.invoiceEmailedAt, sentAt, 'admin');

    const job = await prisma.job.update({
      where: { id },
      data: {
        invoiceEmailedAt: sentAt,
        invoiceEmailedTo: email || existingJob.invoiceEmailedTo || null,
        invoiceEmailedCount: { increment: 1 },
        updatedAt: new Date(),
      },
      include: JOB_INCLUDE,
    });

    res.json(transformJob(job));
  } catch (error) {
    console.error('Mark invoice sent error:', error);
    res.status(500).json({ error: 'Failed to mark invoice sent' });
  }
};

// Step 1: Mark Customer Paid (Customer → Impact)
export const markCustomerPaid = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, status } = req.body; // status: 'paid' | 'unpaid'

    const existingJob = await prisma.job.findUnique({
      where: { id },
      select: {
        sellPrice: true,
        customerPaymentDate: true,
        customerPaymentAmount: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Handle unpaid status - clear payment date
    if (status === 'unpaid') {
      await logPaymentChange(id, 'customerPaymentDate', existingJob.customerPaymentDate, null, 'admin');

      const job = await prisma.job.update({
        where: { id },
        data: {
          customerPaymentDate: null,
          customerPaymentAmount: null,
          updatedAt: new Date(),
        },
        include: {
          Company: true,
          Vendor: true,
          PurchaseOrder: { include: { Vendor: true } },
          ProfitSplit: true,
        },
      });
      return res.json(transformJob(job));
    }

    // Default: mark as paid
    const paymentDate = date ? new Date(date) : new Date();
    const paymentAmount = Number(existingJob.sellPrice) || 0;

    // Log the change
    await logPaymentChange(id, 'customerPaymentDate', existingJob.customerPaymentDate, paymentDate, 'admin');

    const job = await prisma.job.update({
      where: { id },
      data: {
        customerPaymentDate: paymentDate,
        customerPaymentAmount: paymentAmount,
        updatedAt: new Date(),
      },
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          include: {
            Vendor: true,
          },
        },
        ProfitSplit: true,
      },
    });

    res.json(transformJob(job));
  } catch (error) {
    console.error('Mark customer paid error:', error);
    res.status(500).json({ error: 'Failed to mark customer paid' });
  }
};

// Step 1.5: Mark Vendor Paid (Impact → Vendor) - for non-Bradford vendors
export const markVendorPaid = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, amount, status } = req.body;

    const existingJob = await prisma.job.findUnique({
      where: { id },
      include: {
        ProfitSplit: true,
        PurchaseOrder: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Handle unpaid status - clear vendor payment
    if (status === 'unpaid') {
      await logPaymentChange(id, 'vendorPaymentDate', existingJob.vendorPaymentDate, null, 'admin');

      const job = await prisma.job.update({
        where: { id },
        data: {
          vendorPaymentDate: null,
          vendorPaymentAmount: null,
          updatedAt: new Date(),
        },
        include: JOB_INCLUDE,
      });
      return res.json(transformJob(job));
    }

    // Default: mark as paid
    const paymentDate = date ? new Date(date) : new Date();

    // Calculate vendor payment amount - try from PO first
    let paymentAmount = amount;
    if (!paymentAmount) {
      // Sum Impact→Vendor PO costs (non-Bradford)
      const vendorPOs = (existingJob.PurchaseOrder || []).filter(
        (po: any) =>
          po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT && po.targetCompanyId !== COMPANY_IDS.BRADFORD
      );
      paymentAmount = vendorPOs.reduce((sum: number, po: any) => sum + (Number(po.buyCost) || 0), 0);
    }

    // Log the change
    await logPaymentChange(id, 'vendorPaymentDate', existingJob.vendorPaymentDate, paymentDate, 'admin');

    const job = await prisma.job.update({
      where: { id },
      data: {
        vendorPaymentDate: paymentDate,
        vendorPaymentAmount: paymentAmount || null,
        updatedAt: new Date(),
      },
      include: JOB_INCLUDE,
    });

    res.json(transformJob(job));
  } catch (error) {
    console.error('Mark vendor paid error:', error);
    res.status(500).json({ error: 'Failed to mark vendor paid' });
  }
};

// Step 2: Mark Bradford Paid (Impact → Bradford) - triggers JD Invoice
export const markImpactToBradfordPaid = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, sendInvoice = true } = req.body;

    const existingJob = await prisma.job.findUnique({
      where: { id },
      include: {
        Company: true,
        ProfitSplit: true,
        PurchaseOrder: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Guard 1: Payment sequence - customer must pay first
    if (!existingJob.customerPaymentDate) {
      return res.status(400).json({
        error: 'Cannot pay Bradford before customer payment received',
        hint: 'Use markCustomerPaid first',
        jobNo: existingJob.jobNo
      });
    }

    // Guard 2: Idempotency - prevent duplicate Bradford payments
    if (existingJob.bradfordPaymentDate) {
      return res.status(409).json({
        error: 'Bradford payment already recorded',
        existingDate: existingJob.bradfordPaymentDate,
        existingAmount: existingJob.bradfordPaymentAmount,
        hint: 'To resend JD invoice, use the sendJDInvoice endpoint instead'
      });
    }

    const paymentDate = date ? new Date(date) : new Date();

    // Calculate Bradford payment amount from profit split
    const profit = calculateProfit(existingJob);
    const paymentAmount = profit.bradfordTotal || 0;

    // Log the change
    await logPaymentChange(id, 'bradfordPaymentDate', existingJob.bradfordPaymentDate, paymentDate, 'admin');

    // Update the job with Bradford payment info
    let updateData: any = {
      bradfordPaymentPaid: true,
      bradfordPaymentDate: paymentDate,
      bradfordPaymentAmount: paymentAmount,
      updatedAt: new Date(),
    };

    // If sendInvoice is true, generate and send JD invoice to Bradford
    let emailResult = null;
    if (sendInvoice) {
      // Compute suggestedPricing from sizeName (not stored in DB, must be computed)
      const basePricing = existingJob.sizeName ? getSelfMailerPricing(existingJob.sizeName) : null;
      const suggestedPricingData = basePricing ? {
        printCPM: basePricing.printCPM,
        paperCPM: basePricing.paperCPM,
        paperLbsPerM: basePricing.paperLbsPerM,
      } : null;

      // Prepare job data for JD invoice PDF
      const jobDataForInvoice = {
        id: existingJob.id,
        jobNo: existingJob.jobNo,
        customerPONumber: existingJob.customerPONumber,
        bradfordPONumber: existingJob.partnerPONumber,
        partnerPONumber: existingJob.partnerPONumber,
        quantity: existingJob.quantity,
        bradfordPrintCPM: existingJob.bradfordPrintCPM,
        bradfordBuyCost: existingJob.bradfordBuyCost,
        bradfordPaperLbs: existingJob.bradfordPaperLbs,
        bradfordPaperCostPerLb: existingJob.bradfordPaperCostPerLb,
        paperSource: existingJob.paperSource,
        sizeName: existingJob.sizeName,
        title: existingJob.title,
        specs: existingJob.specs,
        // Include POs for invoice amount calculation
        purchaseOrders: existingJob.PurchaseOrder,
        // Include suggestedPricing for paper lbs calculation
        suggestedPricing: suggestedPricingData,
      };

      emailResult = await sendJDInvoiceToBradfordEmail(jobDataForInvoice);

      if (emailResult.success) {
        // Update JD invoice tracking fields
        updateData.jdInvoiceGeneratedAt = new Date();
        updateData.jdInvoiceEmailedAt = emailResult.emailedAt;
        updateData.jdInvoiceEmailedTo = emailResult.emailedTo;
        if (emailResult.jdInvoiceNumber) {
          updateData.jdInvoiceNumber = emailResult.jdInvoiceNumber;
        }

        // Log activity
        await prisma.jobActivity.create({
          data: {
            id: crypto.randomUUID(),
            jobId: existingJob.id,
            action: 'JD_INVOICE_EMAILED',
            field: 'jdInvoice',
            oldValue: null,
            newValue: emailResult.jdInvoiceNumber || null,
            changedBy: 'system',
            changedByRole: 'BROKER_ADMIN',
          },
        });

        console.log(`📧 JD Invoice ${emailResult.jdInvoiceNumber} sent to Bradford for job ${existingJob.jobNo}`);
      } else {
        console.error(`❌ Failed to send JD invoice for job ${existingJob.jobNo}:`, emailResult.error);
      }
    }

    const job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          include: {
            Vendor: true,
          },
        },
        ProfitSplit: true,
      },
    });

    res.json({
      ...transformJob(job),
      jdInvoiceSent: emailResult?.success || false,
      jdInvoiceError: emailResult?.error || null,
    });
  } catch (error) {
    console.error('Mark Bradford paid error:', error);
    res.status(500).json({ error: 'Failed to mark Bradford paid' });
  }
};

// Manual: Send JD Invoice to Bradford (can be used to resend)
export const sendJDInvoice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        Company: true,
        ProfitSplit: true,
        PurchaseOrder: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Compute suggestedPricing from sizeName (not stored in DB, must be computed)
    const basePricing = job.sizeName ? getSelfMailerPricing(job.sizeName) : null;
    const suggestedPricingData = basePricing ? {
      printCPM: basePricing.printCPM,
      paperCPM: basePricing.paperCPM,
      paperLbsPerM: basePricing.paperLbsPerM,
    } : null;

    // Prepare job data for JD invoice PDF
    const jobDataForInvoice = {
      id: job.id,
      jobNo: job.jobNo,
      customerPONumber: job.customerPONumber,
      bradfordPONumber: job.partnerPONumber,
      partnerPONumber: job.partnerPONumber,
      quantity: job.quantity,
      bradfordPrintCPM: job.bradfordPrintCPM,
      bradfordBuyCost: job.bradfordBuyCost,
      bradfordPaperLbs: job.bradfordPaperLbs,
      bradfordPaperCostPerLb: job.bradfordPaperCostPerLb,
      paperSource: job.paperSource,
      sizeName: job.sizeName,
      title: job.title,
      specs: job.specs,
      // Include POs for invoice amount calculation
      purchaseOrders: job.PurchaseOrder,
      // Include suggestedPricing for paper lbs calculation
      suggestedPricing: suggestedPricingData,
    };

    const emailResult = await sendJDInvoiceToBradfordEmail(jobDataForInvoice);

    if (emailResult.success) {
      // Update JD invoice tracking fields
      await prisma.job.update({
        where: { id },
        data: {
          jdInvoiceGeneratedAt: new Date(),
          jdInvoiceEmailedAt: emailResult.emailedAt,
          jdInvoiceEmailedTo: emailResult.emailedTo,
          jdInvoiceNumber: emailResult.jdInvoiceNumber || null,
          updatedAt: new Date(),
        },
      });

      // Log activity
      await prisma.jobActivity.create({
        data: {
          id: crypto.randomUUID(),
          jobId: id,
          action: 'JD_INVOICE_EMAILED',
          field: 'jdInvoice',
          oldValue: null,
          newValue: emailResult.jdInvoiceNumber || null,
          changedBy: 'system',
          changedByRole: 'BROKER_ADMIN',
        },
      });

      res.json({
        success: true,
        emailedAt: emailResult.emailedAt,
        emailedTo: emailResult.emailedTo,
        jdInvoiceNumber: emailResult.jdInvoiceNumber,
      });
    } else {
      res.status(500).json({
        success: false,
        error: emailResult.error || 'Failed to send JD invoice',
      });
    }
  } catch (error) {
    console.error('Send JD invoice error:', error);
    res.status(500).json({ error: 'Failed to send JD invoice' });
  }
};

// Download JD Invoice PDF (for manual download)
export const downloadJDInvoicePDF = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        Company: true,
        ProfitSplit: true,
        PurchaseOrder: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Compute suggestedPricing from sizeName (not stored in DB, must be computed)
    const basePricing = job.sizeName ? getSelfMailerPricing(job.sizeName) : null;
    const suggestedPricingData = basePricing ? {
      printCPM: basePricing.printCPM,
      paperCPM: basePricing.paperCPM,
      paperLbsPerM: basePricing.paperLbsPerM,
    } : null;

    // Prepare job data for JD invoice PDF
    const jobDataForInvoice = {
      id: job.id,
      jobNo: job.jobNo,
      customerPONumber: job.customerPONumber,
      bradfordPONumber: job.partnerPONumber,
      partnerPONumber: job.partnerPONumber,
      quantity: job.quantity,
      bradfordPrintCPM: job.bradfordPrintCPM,
      bradfordBuyCost: job.bradfordBuyCost,
      bradfordPaperLbs: job.bradfordPaperLbs,
      bradfordPaperCostPerLb: job.bradfordPaperCostPerLb,
      paperSource: job.paperSource,
      sizeName: job.sizeName,
      title: job.title,
      specs: job.specs,
      purchaseOrders: job.PurchaseOrder,
      // Include suggestedPricing for paper lbs calculation
      suggestedPricing: suggestedPricingData,
    };

    // Import the PDF generator
    const { generateJDToBradfordInvoicePDF } = await import('../services/pdfService');
    const pdfBuffer = generateJDToBradfordInvoicePDF(jobDataForInvoice);

    const filename = `JD-Invoice-Job-${job.jobNo}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Download JD invoice error:', error);
    res.status(500).json({ error: 'Failed to generate JD invoice PDF' });
  }
};

// Bulk generate JD invoice numbers for all jobs (one-time operation)
export const bulkGenerateJDInvoices = async (req: Request, res: Response) => {
  try {
    // Find all jobs without a JD invoice number
    const allJobs = await prisma.job.findMany({
      where: {
        jdInvoiceNumber: null,
      },
      select: {
        id: true,
        jobNo: true,
      },
    });

    // Filter to only jobs that have a jobNo
    const jobs = allJobs.filter(job => job.jobNo !== null && job.jobNo !== '');

    if (jobs.length === 0) {
      return res.json({
        success: true,
        message: 'No jobs need invoice numbers',
        generated: 0,
      });
    }

    // Generate invoice numbers for each job
    const updates = await Promise.all(
      jobs.map(async (job) => {
        const invoiceNumber = `JD-${job.jobNo}`;
        await prisma.job.update({
          where: { id: job.id },
          data: {
            jdInvoiceNumber: invoiceNumber,
            jdInvoiceGeneratedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        return { jobNo: job.jobNo, invoiceNumber };
      })
    );

    console.log(`📄 Bulk generated ${updates.length} JD invoice numbers`);

    res.json({
      success: true,
      message: `Generated ${updates.length} invoice numbers`,
      generated: updates.length,
      invoices: updates,
    });
  } catch (error) {
    console.error('Bulk generate JD invoices error:', error);
    res.status(500).json({ error: 'Failed to bulk generate JD invoices' });
  }
};

// Step 4: Mark JD Paid (Bradford → JD)
export const markJDPaid = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date } = req.body;

    const existingJob = await prisma.job.findUnique({
      where: { id },
      include: {
        ProfitSplit: true,
        PurchaseOrder: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const paymentDate = date ? new Date(date) : new Date();

    // Calculate JD payment amount (manufacturing cost)
    // This is what Bradford pays JD for print manufacturing
    let jdPaymentAmount = 0;

    // Try to get from Bradford→JD PO
    const bradfordJDPO = (existingJob.PurchaseOrder || []).find(
      (po: any) => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
    );

    if (bradfordJDPO) {
      jdPaymentAmount = Number(bradfordJDPO.buyCost) || Number(bradfordJDPO.mfgCost) || 0;
    } else {
      // Fallback: calculate from job fields
      if (existingJob.bradfordPrintCPM && existingJob.quantity) {
        jdPaymentAmount = (Number(existingJob.bradfordPrintCPM) / 1000) * Number(existingJob.quantity);
      }
    }

    // Log the change
    await logPaymentChange(id, 'jdPaymentDate', existingJob.jdPaymentDate, paymentDate, 'admin');

    const job = await prisma.job.update({
      where: { id },
      data: {
        jdPaymentPaid: true,
        jdPaymentDate: paymentDate,
        jdPaymentAmount: jdPaymentAmount,
        updatedAt: new Date(),
      },
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          include: {
            Vendor: true,
          },
        },
        ProfitSplit: true,
      },
    });

    res.json(transformJob(job));
  } catch (error) {
    console.error('Mark JD paid error:', error);
    res.status(500).json({ error: 'Failed to mark JD paid' });
  }
};

// Update invoice payment status (toggle paidAt)
export const updateInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { status } = req.body; // 'paid' | 'unpaid'

    const invoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAt: status === 'paid' ? new Date() : null,
        updatedAt: new Date()
      }
    });

    res.json({ success: true, invoice });
  } catch (error) {
    console.error('Update invoice status error:', error);
    res.status(500).json({ error: 'Failed to update invoice status' });
  }
};

// Re-export from crud controller
export { getJobsWorkflowView, updateQCOverrides, updateWorkflowStatus, setJobTask, completeJobTask, createFromEmail, detectMailingTypeEndpoint } from './jobs/jobsCrudController';

// Re-export from QC controller
export {
  getJobReadiness,
  updateJobQcFlags,
  recalculateReadiness,
  getJobComponents,
  createJobComponent,
  updateJobComponent,
  deleteJobComponent,
} from './jobs/jobsQcController';
