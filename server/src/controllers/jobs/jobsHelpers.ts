/**
 * Jobs Controller Helpers
 *
 * Shared utility functions for job-related controllers.
 * These functions handle:
 * - Job validation for PO creation
 * - Profit calculation (using cached ProfitSplit or on-the-fly)
 * - Job transformation for frontend consumption
 * - Activity logging for job changes
 */

import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import {
  calculateProfitSplit,
  calculateTierPricing,
  ProfitSplitResult,
  TierPricingResult,
  PaperSource,
} from '../../services/pricingService';
import { getSelfMailerPricing } from '../../utils/bradfordPricing';
import { COMPANY_IDS, isBradfordVendor } from '../../constants';

// ============================================================================
// JOB VALIDATION
// ============================================================================

/**
 * Check if a job meets criteria for Impact→Bradford PO creation
 * Requirements:
 * 1. Quantity > 0
 * 2. Valid standard size (matches pricing table)
 * 3. Sell price > 0
 */
export function canCreateImpactPO(job: {
  quantity?: number;
  sizeName?: string | null;
  sellPrice?: number;
}): { valid: boolean; reason?: string } {
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

// ============================================================================
// PROFIT CALCULATION
// ============================================================================

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
export function calculateProfit(job: any) {
  // If job has cached ProfitSplit, use it
  if (job.ProfitSplit) {
    const ps = job.ProfitSplit;
    const purchaseOrders = job.PurchaseOrder || [];

    // Get Bradford→JD POs (what Bradford owes JD for manufacturing)
    const bradfordJdPOs = purchaseOrders.filter((po: any) =>
      po.originCompanyId === COMPANY_IDS.BRADFORD &&
      po.targetCompanyId === COMPANY_IDS.JD_GRAPHIC
    );

    // Calculate what Bradford owes JD (manufacturing cost)
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
    po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT &&
    po.targetCompanyId === COMPANY_IDS.BRADFORD
  );

  // Get Bradford→JD POs (what Bradford owes JD for manufacturing)
  const bradfordJdPOs = purchaseOrders.filter((po: any) =>
    po.originCompanyId === COMPANY_IDS.BRADFORD &&
    po.targetCompanyId === COMPANY_IDS.JD_GRAPHIC
  );

  // Calculate what Bradford owes JD (manufacturing cost)
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
    routingType: job.routingType,
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
    marginPercent: split.marginPercent,
    poCount: purchaseOrders.length,
    isOverridden: false,
    overrideReason: null,
    calculatedAt: null,
    warnings: split.warnings,
    isHealthy: split.isHealthy,
  };
}

// ============================================================================
// JOB TRANSFORMATION
// ============================================================================

/**
 * Transform job record to frontend-expected format
 * Handles:
 * - Decimal serialization
 * - Relationship mapping (Company → customer, Vendor → vendor)
 * - Profit calculation
 * - Line items extraction
 * - Tier pricing for standard sizes
 */
export function transformJob(job: any) {
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
      email: po.Vendor.email || '',
      contacts: po.Vendor.contacts || [],
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

    // === JD PAYMENT TRACKING ===
    jdInvoiceNumber: job.jdInvoiceNumber || null,
    jdInvoiceGeneratedAt: job.jdInvoiceGeneratedAt,
    jdInvoiceEmailedAt: job.jdInvoiceEmailedAt,
    jdInvoiceEmailedTo: job.jdInvoiceEmailedTo,
    jdPaymentPaid: job.jdPaymentPaid || false,
    jdPaymentDate: job.jdPaymentDate,
    jdPaymentAmount: job.jdPaymentAmount ? Number(job.jdPaymentAmount) : null,

    // === WORKFLOW STATUS ===
    workflowStatus: job.workflowStatus || 'NEW_JOB',
    workflowStatusOverride: job.workflowStatusOverride || null,
    workflowUpdatedAt: job.workflowUpdatedAt,

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
      isPartner: isBradfordVendor(job.Vendor),
      contacts: job.Vendor.contacts || [],
    } : {
      id: '',
      name: 'No Vendor Assigned',
      type: 'VENDOR',
      email: '',
      phone: '',
      isPartner: false,
      contacts: [],
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

// ============================================================================
// ACTIVITY LOGGING
// ============================================================================

/**
 * Log job field changes to JobActivity
 */
export async function logJobChange(
  jobId: string,
  action: string,
  field: string,
  oldValue: any,
  newValue: any,
  changedBy: string = 'system'
): Promise<void> {
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

/**
 * Log payment changes to JobActivity
 */
export async function logPaymentChange(
  jobId: string,
  field: string,
  oldValue: any,
  newValue: any,
  changedBy: string = 'system'
): Promise<void> {
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

// ============================================================================
// PRISMA INCLUDES
// ============================================================================

/**
 * Standard job include for most queries
 */
export const JOB_INCLUDE = {
  Company: true,
  Vendor: {
    include: {
      contacts: true,
    },
  },
  PurchaseOrder: {
    include: {
      Vendor: {
        include: {
          contacts: true,
        },
      },
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
};

/**
 * Full job include with portal status
 */
export const JOB_INCLUDE_FULL = {
  ...JOB_INCLUDE,
  JobPortal: true,
  Invoice: {
    select: {
      id: true,
      paidAt: true,
      amount: true,
      invoiceNo: true,
    },
  },
};

/**
 * Workflow view include - includes File counts and Proof status for QC indicators
 */
export const JOB_INCLUDE_WORKFLOW = {
  Company: true,
  Vendor: {
    include: {
      contacts: true,
    },
  },
  JobPortal: true,
  File: {
    select: {
      id: true,
      kind: true,
      fileName: true,
      createdAt: true,
    },
  },
  Proof: {
    select: {
      id: true,
      status: true,
      version: true,
      createdAt: true,
    },
    orderBy: {
      version: 'desc' as const,
    },
    take: 1,
  },
  PurchaseOrder: {
    where: {
      originCompanyId: 'impact-direct',
    },
    select: {
      id: true,
      poNumber: true,
      status: true,
      issuedAt: true,
      buyCost: true,
      targetVendorId: true,
    },
  },
  ProfitSplit: {
    select: {
      grossMargin: true,
    },
  },
};

/**
 * Transform job for workflow view - lightweight with QC indicators
 */
export function transformJobForWorkflow(job: any) {
  // Count files by kind
  const files = job.File || [];
  const artworkFiles = files.filter((f: any) => f.kind === 'ARTWORK');
  const dataFiles = files.filter((f: any) => f.kind === 'DATA_FILE');
  const proofFiles = files.filter((f: any) => f.kind === 'PROOF' || f.kind === 'VENDOR_PROOF');

  // Get latest proof status
  const latestProof = job.Proof?.[0] || null;

  // Get portal status
  const portal = job.JobPortal;

  // Get all Impact-origin POs
  const allPOs = job.PurchaseOrder || [];
  // Vendor PO = the one sent to external vendor (has targetVendorId)
  const vendorPO = allPOs.find((po: any) => po.targetVendorId) || null;

  // Calculate spread (use ProfitSplit if available, otherwise calculate from POs)
  let spread = 0;
  if (job.ProfitSplit?.grossMargin) {
    spread = Number(job.ProfitSplit.grossMargin);
  } else {
    const totalCost = allPOs.reduce((sum: number, po: any) => sum + (Number(po.buyCost) || 0), 0);
    spread = (Number(job.sellPrice) || 0) - totalCost;
  }

  // Determine QC indicators (overrides take precedence)
  const qcIndicators = {
    // Artwork: sent, missing, partial - override takes precedence
    artwork: job.artOverride ? 'sent' : (artworkFiles.length > 0 ? 'sent' : 'missing'),
    artworkCount: artworkFiles.length,
    artworkIsOverride: job.artOverride || false,

    // Data files: sent, missing, n/a - override takes precedence
    data: job.dataOverride === 'SENT' ? 'sent' :
          job.dataOverride === 'NA' ? 'na' :
          (dataFiles.length > 0 ? 'sent' : (job.specs?.isDirectMail ? 'missing' : 'na')),
    dataCount: dataFiles.length,
    dataIsOverride: !!job.dataOverride,

    // Vendor confirmation - override takes precedence
    vendorConfirmed: job.vendorConfirmOverride || (portal?.confirmedAt ? true : false),
    vendorConfirmedAt: job.vendorConfirmOverride ? job.vendorConfirmOverrideAt : (portal?.confirmedAt || null),
    vendorConfirmedBy: job.vendorConfirmOverride ? job.vendorConfirmOverrideBy : (portal?.confirmedByName || null),
    vendorIsOverride: job.vendorConfirmOverride || false,

    // Vendor status from portal
    vendorStatus: portal?.vendorStatus || null,

    // Proof status - override takes precedence
    proofStatus: job.proofOverride || latestProof?.status || null,
    proofVersion: latestProof?.version || 0,
    hasProof: proofFiles.length > 0,
    proofIsOverride: !!job.proofOverride,

    // Tracking - override takes precedence
    hasTracking: !!(job.trackingOverride || portal?.trackingNumber),
    trackingNumber: job.trackingOverride || portal?.trackingNumber || null,
    trackingCarrier: job.trackingCarrierOverride || portal?.trackingCarrier || null,
    trackingIsOverride: !!job.trackingOverride,
  };

  return {
    id: job.id,
    jobNo: job.jobNo,
    title: job.title || '',
    workflowStatus: job.workflowStatus || 'NEW_JOB',
    workflowUpdatedAt: job.workflowUpdatedAt,

    // Key dates
    deliveryDate: job.deliveryDate,
    mailDate: job.mailDate,
    inHomesDate: job.inHomesDate,
    createdAt: job.createdAt,

    // Quantity
    quantity: job.quantity || 0,

    // Pricing
    sellPrice: Number(job.sellPrice) || 0,
    spread: spread,
    customerPONumber: job.customerPONumber || null,

    // Customer/Vendor names
    customerName: job.Company?.name || 'Unknown',
    customerId: job.customerId,
    vendorName: job.Vendor?.name || 'Unassigned',
    vendorId: job.vendorId,

    // PO info
    hasPO: !!vendorPO,
    poNumber: vendorPO?.poNumber || null,
    poSentAt: vendorPO?.issuedAt || null,

    // QC Indicators
    qc: qcIndicators,
  };
}

/**
 * Calculate workflow stage dynamically from actual job data
 * Overrides stored workflowStatus for accurate grouping in control station
 * Manual workflowStatusOverride takes precedence over everything
 */
export function calculateWorkflowStage(job: any): string {
  // Manual override takes precedence
  if (job.workflowStatusOverride) {
    return job.workflowStatusOverride;
  }

  const portal = job.JobPortal;
  const files = job.File || [];
  const latestProof = job.Proof?.[0] || null;
  const hasVendorProof = files.some((f: any) => f.kind === 'VENDOR_PROOF');

  // Check for tracking (override or portal)
  const hasTracking = !!(job.trackingOverride || portal?.trackingNumber);

  // Check for vendor confirmation (override or portal)
  const vendorConfirmed = job.vendorConfirmOverride || portal?.confirmedAt;

  // Check for proof approval (override or actual)
  const proofApproved = job.proofOverride === 'APPROVED' || latestProof?.status === 'APPROVED';

  // Priority order (most progressed → least)
  if (portal?.vendorStatus === 'SHIPPED' || hasTracking) {
    return 'COMPLETED';
  }
  if (portal?.vendorStatus === 'IN_PRODUCTION' || portal?.vendorStatus === 'PRINTING_COMPLETE') {
    return 'IN_PRODUCTION';
  }
  if (proofApproved) {
    return 'APPROVED_PENDING_VENDOR';
  }
  if (hasVendorProof || latestProof) {
    return 'AWAITING_CUSTOMER_RESPONSE';
  }
  if (vendorConfirmed) {
    return 'AWAITING_PROOF_FROM_VENDOR';
  }
  return 'NEW_JOB';
}
