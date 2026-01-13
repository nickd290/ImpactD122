/**
 * Job Validation System
 *
 * Read-only validation that checks job data consistency
 * without modifying any data.
 *
 * 11 invariants covering:
 * - Workflow consistency (3)
 * - Payment sequence (4)
 * - Data consistency (4)
 */

import {
  PrismaClient,
  Job,
  JobStatus,
  JobWorkflowStatus,
  Pathway,
  ReadinessStatus,
  QcArtworkStatus,
  QcDataFilesStatus,
  QcMailingStatus,
  PurchaseOrder,
  JobComponent,
  ProfitSplit,
  POStatus,
} from '@prisma/client';

import { isImpactOriginPO } from '../constants/companies';

// ============================================
// TYPES
// ============================================

export interface Violation {
  /** Invariant code, e.g., "INVOICE_BEFORE_PAYMENT" */
  code: string;
  /** Human-readable explanation */
  message: string;
  /** WARN = suspicious but not necessarily wrong, ERROR = definitely wrong */
  severity: 'WARN' | 'ERROR';
  /** Context for debugging */
  data?: Record<string, unknown>;
}

export interface ValidationResult {
  /** True if no violations found */
  ok: boolean;
  /** Job ID that was validated */
  jobId: string;
  /** List of violations (empty if ok) */
  violations: Violation[];
  /** ISO timestamp of when validation ran */
  checkedAt: string;
}

// Type for job with relations needed for validation
type JobWithRelations = Job & {
  PurchaseOrder: PurchaseOrder[];
  JobComponent: JobComponent[];
  ProfitSplit: ProfitSplit | null;
};

// ============================================
// INVARIANT CHECKS
// ============================================

type InvariantCheck = (job: JobWithRelations) => Violation | null;

/**
 * Invariant 1: STATUS_WORKFLOW_MATCH
 * If status === PAID, workflowStatus must be PAID or INVOICED
 */
const checkStatusWorkflowMatch: InvariantCheck = (job) => {
  if (job.status === JobStatus.PAID) {
    const allowedStatuses: JobWorkflowStatus[] = [
      JobWorkflowStatus.PAID,
      JobWorkflowStatus.INVOICED,
    ];
    if (!allowedStatuses.includes(job.workflowStatus)) {
      return {
        code: 'STATUS_WORKFLOW_MATCH',
        message: `Job marked PAID but workflowStatus is ${job.workflowStatus}`,
        severity: 'ERROR',
        data: { status: job.status, workflowStatus: job.workflowStatus },
      };
    }
  }
  return null;
};

/**
 * Invariant 2: OVERRIDE_HAS_TIMESTAMP
 * If workflowStatusOverride is set, workflowStatusOverrideAt must exist
 */
const checkOverrideHasTimestamp: InvariantCheck = (job) => {
  if (job.workflowStatusOverride && !job.workflowStatusOverrideAt) {
    return {
      code: 'OVERRIDE_HAS_TIMESTAMP',
      message: 'Workflow status override set but no timestamp recorded',
      severity: 'WARN',
      data: { workflowStatusOverride: job.workflowStatusOverride },
    };
  }
  return null;
};

/**
 * Invariant 3: CANCELLED_IS_TERMINAL
 * If status === CANCELLED, no payment dates should exist
 */
const checkCancelledIsTerminal: InvariantCheck = (job) => {
  if (job.status === JobStatus.CANCELLED) {
    const payments: string[] = [];
    if (job.customerPaymentDate) payments.push('customerPaymentDate');
    if (job.vendorPaymentDate) payments.push('vendorPaymentDate');
    if (job.bradfordPaymentPaid) payments.push('bradfordPaymentPaid');
    if (job.jdPaymentPaid) payments.push('jdPaymentPaid');

    if (payments.length > 0) {
      return {
        code: 'CANCELLED_IS_TERMINAL',
        message: `Cancelled job has payment records: ${payments.join(', ')}`,
        severity: 'WARN',
        data: { payments },
      };
    }
  }
  return null;
};

/**
 * Invariant 4: INVOICE_BEFORE_PAYMENT
 * If customerPaymentDate exists, invoiceEmailedAt must exist and be <= customerPaymentDate
 */
const checkInvoiceBeforePayment: InvariantCheck = (job) => {
  if (job.customerPaymentDate && !job.invoiceEmailedAt) {
    return {
      code: 'INVOICE_BEFORE_PAYMENT',
      message: 'Customer payment recorded but no invoice was sent',
      severity: 'ERROR',
      data: {
        customerPaymentDate: job.customerPaymentDate,
        invoiceEmailedAt: null,
      },
    };
  }

  if (job.customerPaymentDate && job.invoiceEmailedAt) {
    const invoiceDate = new Date(job.invoiceEmailedAt);
    const paymentDate = new Date(job.customerPaymentDate);
    if (invoiceDate > paymentDate) {
      return {
        code: 'INVOICE_BEFORE_PAYMENT',
        message: 'Invoice sent after customer payment date',
        severity: 'WARN',
        data: {
          invoiceEmailedAt: job.invoiceEmailedAt,
          customerPaymentDate: job.customerPaymentDate,
        },
      };
    }
  }
  return null;
};

/**
 * Invariant 5: CUSTOMER_BEFORE_VENDOR
 * If vendorPaymentDate exists, customerPaymentDate must exist and be <= vendorPaymentDate
 */
const checkCustomerBeforeVendor: InvariantCheck = (job) => {
  if (job.vendorPaymentDate && !job.customerPaymentDate) {
    return {
      code: 'CUSTOMER_BEFORE_VENDOR',
      message: 'Vendor paid before customer payment received',
      severity: 'ERROR',
      data: {
        vendorPaymentDate: job.vendorPaymentDate,
        customerPaymentDate: null,
      },
    };
  }

  if (job.vendorPaymentDate && job.customerPaymentDate) {
    const customerDate = new Date(job.customerPaymentDate);
    const vendorDate = new Date(job.vendorPaymentDate);
    if (customerDate > vendorDate) {
      return {
        code: 'CUSTOMER_BEFORE_VENDOR',
        message: 'Customer payment date is after vendor payment date',
        severity: 'WARN',
        data: {
          customerPaymentDate: job.customerPaymentDate,
          vendorPaymentDate: job.vendorPaymentDate,
        },
      };
    }
  }
  return null;
};

/**
 * Invariant 6: P1_BRADFORD_REQUIRED
 * If pathway === P1 and vendorPaymentDate exists, bradfordPaymentPaid must be true
 */
const checkP1BradfordRequired: InvariantCheck = (job) => {
  if (
    job.pathway === Pathway.P1 &&
    job.vendorPaymentDate &&
    !job.bradfordPaymentPaid
  ) {
    return {
      code: 'P1_BRADFORD_REQUIRED',
      message: 'P1 job has vendor payment but Bradford payment not recorded',
      severity: 'WARN',
      data: {
        pathway: job.pathway,
        vendorPaymentDate: job.vendorPaymentDate,
        bradfordPaymentPaid: job.bradfordPaymentPaid,
      },
    };
  }
  return null;
};

/**
 * Invariant 7: JD_INVOICE_CHAIN
 * If jdPaymentPaid === true, jdInvoiceNumber and jdInvoiceGeneratedAt must exist
 */
const checkJdInvoiceChain: InvariantCheck = (job) => {
  if (job.jdPaymentPaid) {
    const missing: string[] = [];
    if (!job.jdInvoiceNumber) missing.push('jdInvoiceNumber');
    if (!job.jdInvoiceGeneratedAt) missing.push('jdInvoiceGeneratedAt');

    if (missing.length > 0) {
      return {
        code: 'JD_INVOICE_CHAIN',
        message: `JD payment marked as paid but missing: ${missing.join(', ')}`,
        severity: 'ERROR',
        data: {
          jdPaymentPaid: job.jdPaymentPaid,
          jdInvoiceNumber: job.jdInvoiceNumber,
          jdInvoiceGeneratedAt: job.jdInvoiceGeneratedAt,
        },
      };
    }
  }
  return null;
};

/**
 * Invariant 8: PATHWAY_VENDOR_COUNT
 * P1 jobs should route through Bradford; P3 jobs should have >=2 distinct vendors
 */
const checkPathwayVendorCount: InvariantCheck = (job) => {
  const purchaseOrders = job.PurchaseOrder || [];
  const components = job.JobComponent || [];

  // P3 should have multiple components or vendors
  if (job.pathway === Pathway.P3) {
    // Count distinct vendors from POs (targetVendorId is the vendor field)
    const vendorIds = new Set(
      purchaseOrders.map((po) => po.targetVendorId).filter(Boolean)
    );
    // Also count from components (vendorId is the field on JobComponent)
    components.forEach((c) => {
      if (c.vendorId) vendorIds.add(c.vendorId);
    });

    if (vendorIds.size < 2 && components.length < 2) {
      return {
        code: 'PATHWAY_VENDOR_COUNT',
        message: 'P3 job should have multiple vendors or components',
        severity: 'WARN',
        data: {
          pathway: job.pathway,
          distinctVendors: vendorIds.size,
          componentCount: components.length,
        },
      };
    }
  }

  return null;
};

/**
 * Invariant 9: PO_COST_MATCHES_SPLIT
 * Sum of Impact-origin PO.buyCost should match ProfitSplit.totalCost (within $1)
 * Only checks when job is in a cost-final workflow stage.
 */
const checkPoCostMatchesSplit: InvariantCheck = (job) => {
  const profitSplit = job.ProfitSplit;
  const purchaseOrders = job.PurchaseOrder || [];

  // Skip if no profit split or no POs
  if (!profitSplit || purchaseOrders.length === 0) {
    return null;
  }

  // Only check for cost-final workflow stages
  const costFinalStatuses: JobWorkflowStatus[] = [
    JobWorkflowStatus.COMPLETED,
    JobWorkflowStatus.INVOICED,
    JobWorkflowStatus.PAID,
  ];
  if (!costFinalStatuses.includes(job.workflowStatus)) {
    return null; // Skip - costs not yet finalized
  }

  // Filter to Impact-origin POs only (matches ProfitSplit calculation)
  const impactPOs = purchaseOrders.filter((po) => isImpactOriginPO(po));

  // Filter out cancelled/rejected POs
  const activePOs = impactPOs.filter(
    (po) => po.status !== POStatus.CANCELLED && po.status !== POStatus.REJECTED
  );

  // Sum PO costs (buyCost field)
  const poCostSum = activePOs.reduce((sum, po) => {
    const cost = po.buyCost ? Number(po.buyCost) : 0;
    return sum + cost;
  }, 0);

  const splitTotalCost = profitSplit.totalCost
    ? Number(profitSplit.totalCost)
    : 0;

  // Allow $1 tolerance for rounding
  const difference = Math.abs(poCostSum - splitTotalCost);
  if (difference > 1 && splitTotalCost > 0) {
    return {
      code: 'PO_COST_MATCHES_SPLIT',
      message: `PO costs (${poCostSum.toFixed(2)}) don't match ProfitSplit.totalCost (${splitTotalCost.toFixed(2)}) - delta $${difference.toFixed(2)}`,
      severity: 'WARN',
      data: {
        expected: splitTotalCost,
        actual: poCostSum,
        delta: difference,
        poCount: activePOs.length,
        poIds: activePOs.map((po) => po.id),
        totalPOsOnJob: purchaseOrders.length,
        excludedPOsCount: purchaseOrders.length - activePOs.length,
      },
    };
  }

  return null;
};

/**
 * Invariant 10: PROFITSPLIT_ZERO_WITH_PO_COST
 * In cost-final stages, if ProfitSplit.totalCost is 0 but there are active POs
 * with cost, flag as stale/incomplete ProfitSplit
 */
const checkProfitSplitZeroWithCost: InvariantCheck = (job) => {
  const profitSplit = job.ProfitSplit;
  const purchaseOrders = job.PurchaseOrder || [];

  // Only check for cost-final workflow stages
  const costFinalStatuses: JobWorkflowStatus[] = [
    JobWorkflowStatus.COMPLETED,
    JobWorkflowStatus.INVOICED,
    JobWorkflowStatus.PAID,
  ];
  if (!costFinalStatuses.includes(job.workflowStatus)) {
    return null;
  }

  // Skip if no POs
  if (purchaseOrders.length === 0) {
    return null;
  }

  // Filter to Impact-origin, active POs
  const impactPOs = purchaseOrders.filter((po) => isImpactOriginPO(po));
  const activePOs = impactPOs.filter(
    (po) => po.status !== POStatus.CANCELLED && po.status !== POStatus.REJECTED
  );

  // Sum PO costs
  const poCostSum = activePOs.reduce((sum, po) => {
    const cost = po.buyCost ? Number(po.buyCost) : 0;
    return sum + cost;
  }, 0);

  const splitTotalCost = profitSplit?.totalCost
    ? Number(profitSplit.totalCost)
    : 0;

  // Flag if ProfitSplit is zero/missing but we have PO costs
  if (splitTotalCost === 0 && poCostSum > 0) {
    return {
      code: 'PROFITSPLIT_ZERO_WITH_PO_COST',
      message: `ProfitSplit.totalCost is 0 but has $${poCostSum.toFixed(2)} in PO costs`,
      severity: 'WARN',
      data: {
        splitTotalCost: 0,
        poCostSum,
        poCount: activePOs.length,
        poIds: activePOs.map((po) => po.id),
        hasProfitSplit: !!profitSplit,
      },
    };
  }

  return null;
};

/**
 * Invariant 11: QC_READY_CONSISTENCY
 * If readinessStatus === READY, no QC flag should be PENDING
 */
const checkQcReadyConsistency: InvariantCheck = (job) => {
  if (job.readinessStatus === ReadinessStatus.READY) {
    const pendingFlags: string[] = [];

    if (job.qcArtwork === QcArtworkStatus.PENDING) {
      pendingFlags.push('qcArtwork');
    }
    if (job.qcDataFiles === QcDataFilesStatus.PENDING) {
      pendingFlags.push('qcDataFiles');
    }
    if (job.qcMailing === QcMailingStatus.INCOMPLETE) {
      pendingFlags.push('qcMailing');
    }

    if (pendingFlags.length > 0) {
      return {
        code: 'QC_READY_CONSISTENCY',
        message: `Job marked READY but has pending QC items: ${pendingFlags.join(', ')}`,
        severity: 'ERROR',
        data: {
          readinessStatus: job.readinessStatus,
          qcArtwork: job.qcArtwork,
          qcDataFiles: job.qcDataFiles,
          qcMailing: job.qcMailing,
          pendingFlags,
        },
      };
    }
  }
  return null;
};

// ============================================
// INVARIANT REGISTRY
// ============================================

const INVARIANTS: Record<string, InvariantCheck> = {
  // Workflow invariants (3)
  STATUS_WORKFLOW_MATCH: checkStatusWorkflowMatch,
  OVERRIDE_HAS_TIMESTAMP: checkOverrideHasTimestamp,
  CANCELLED_IS_TERMINAL: checkCancelledIsTerminal,

  // Payment sequence invariants (4)
  INVOICE_BEFORE_PAYMENT: checkInvoiceBeforePayment,
  CUSTOMER_BEFORE_VENDOR: checkCustomerBeforeVendor,
  P1_BRADFORD_REQUIRED: checkP1BradfordRequired,
  JD_INVOICE_CHAIN: checkJdInvoiceChain,

  // Data consistency invariants (4)
  PATHWAY_VENDOR_COUNT: checkPathwayVendorCount,
  PO_COST_MATCHES_SPLIT: checkPoCostMatchesSplit,
  PROFITSPLIT_ZERO_WITH_PO_COST: checkProfitSplitZeroWithCost,
  QC_READY_CONSISTENCY: checkQcReadyConsistency,
};

// ============================================
// MAIN VALIDATION FUNCTION
// ============================================

/**
 * Validates a job against all defined invariants.
 *
 * @param prisma - Prisma client instance
 * @param jobId - Job ID to validate
 * @returns ValidationResult with ok flag and any violations
 */
export async function validateJob(
  prisma: PrismaClient,
  jobId: string
): Promise<ValidationResult> {
  // Fetch job with all relations needed for validation
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      PurchaseOrder: true,
      JobComponent: true,
      ProfitSplit: true,
    },
  });

  if (!job) {
    return {
      ok: false,
      jobId,
      violations: [
        {
          code: 'JOB_NOT_FOUND',
          message: `Job with ID ${jobId} not found`,
          severity: 'ERROR',
        },
      ],
      checkedAt: new Date().toISOString(),
    };
  }

  // Run all invariants and collect violations
  const violations: Violation[] = [];

  for (const [_name, check] of Object.entries(INVARIANTS)) {
    const violation = check(job as JobWithRelations);
    if (violation) {
      violations.push(violation);
    }
  }

  return {
    ok: violations.length === 0,
    jobId,
    violations,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Validates multiple jobs in batch.
 *
 * @param prisma - Prisma client instance
 * @param jobIds - Array of job IDs to validate
 * @returns Array of ValidationResults
 */
export async function validateJobs(
  prisma: PrismaClient,
  jobIds: string[]
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const jobId of jobIds) {
    results.push(await validateJob(prisma, jobId));
  }
  return results;
}
