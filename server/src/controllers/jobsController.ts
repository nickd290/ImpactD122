import { Request, Response } from 'express';
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
      marginPercent: Number(ps.sellPrice) > 0
        ? (Number(ps.grossMargin) / Number(ps.sellPrice)) * 100
        : 0,
      poCount: (job.PurchaseOrder || []).length,
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
    // Create lineItems from quantity for frontend compatibility
    lineItems: quantity > 0 ? [{
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
    }] : []),
  };
}

// Get all jobs
export const getAllJobs = async (req: Request, res: Response) => {
  try {
    const jobs = await prisma.job.findMany({
      where: {
        deletedAt: null, // Only get non-deleted jobs
      },
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: {
          include: {
            Vendor: true,
          },
        },
        ProfitSplit: true, // NEW: Include cached profit split
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const transformedJobs = jobs.map(transformJob);
    res.json(transformedJobs);
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
      ...rest
    } = req.body;

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

    // Determine paper source (default to BRADFORD)
    const paperSource = inputPaperSource || 'BRADFORD';

    // Use sellPrice if provided, otherwise calculate from financials or line items
    const sellPrice = inputSellPrice || financials?.impactCustomerTotal || lineItemTotal;

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

    // Build specs JSON - check if it's a standard Bradford size
    const isStandardSize = isBradfordJob || (sizeName ? !!getSelfMailerPricing(sizeName) : false);
    const jobSpecs = {
      ...(specs || {}),
      isStandardSize,
      isBradfordJob: !!isBradfordJob,
    };

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
        customerPONumber: customerPONumber || null,
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

    // Create ProfitSplit record for this job
    if (sellPrice > 0 || totalCost > 0) {
      const split = calculateProfitSplit({
        sellPrice,
        totalCost,
        paperMarkup,
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

    res.status(201).json(transformJob(job));
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Failed to create job' });
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
      quantity: inputQuantity,
      sellPrice: inputSellPrice,
      sizeName: inputSizeName,
      paperSource: inputPaperSource,
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
    if (dueDate !== undefined) updateData.deliveryDate = dueDate ? new Date(dueDate) : null;
    if (customerId !== undefined) updateData.customerId = customerId;
    if (vendorId !== undefined) updateData.vendorId = vendorId;
    if (specs !== undefined) updateData.specs = specs;

    // Handle sizeName
    if (inputSizeName !== undefined) {
      updateData.sizeName = inputSizeName ? normalizeSize(inputSizeName) : null;
    }

    // Handle paperSource
    if (inputPaperSource !== undefined) {
      updateData.paperSource = inputPaperSource;
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

    if (poType === 'bradford-jd') {
      // Bradford → JD Graphic (internal tracking, NOT Impact's cost)
      originCompanyId = 'bradford';
      targetCompanyId = 'jd-graphic';
    } else {
      // Impact → Vendor (counts as our cost) - default
      originCompanyId = 'impact-direct';
      targetVendorId = vendorId || null;
    }

    // Generate unique PO number with type prefix and random suffix
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    const prefix = poType === 'bradford-jd' ? 'BJ' : 'IV';
    const poNumber = `PO-${prefix}-${timestamp}-${random}`;

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
