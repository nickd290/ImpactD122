import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

/**
 * Dashboard Controller - WhatsNextPanel API
 *
 * Provides action buckets for the main dashboard:
 * 1. Hot Proofs - urgent approval needed
 * 2. Awaiting Approval - proofs sent to customer
 * 3. Missing Files - art or data pending
 * 4. Materials In Transit - supplied materials on the way
 * 5. PO Not Confirmed - vendor hasn't acknowledged
 * 6. Ready to Invoice - completed but not invoiced
 * 7. Unpaid Invoices - invoiced but not paid
 * 8. Due This Week - upcoming deadlines
 */

// Minimal job select for dashboard performance
const dashboardJobSelect = {
  id: true,
  jobNo: true,
  title: true,
  customerJobNumber: true,
  status: true,
  workflowStatus: true,
  proofUrgency: true,
  proofUrgencyNote: true,
  proofReceivedAt: true,
  proofSentToCustomerAt: true,
  customerResponseDue: true,
  deliveryDate: true,
  mailDate: true,
  sellPrice: true,
  qcArtwork: true,
  qcDataFiles: true,
  qcSuppliedMaterials: true,
  invoiceEmailedAt: true,
  invoiceGeneratedAt: true,
  customerInvoiceNumber: true,
  workflowStatusOverride: true,
  customerPaymentDate: true,
  poEmailedAt: true,
  createdAt: true,
  Company: {
    select: { id: true, name: true }
  },
  Vendor: {
    select: { id: true, name: true }
  },
  JobPortal: {
    select: { vendorStatus: true, confirmedAt: true }
  },
};

export const getWhatsNext = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch all active jobs with relevant data
    const activeJobs = await prisma.job.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: dashboardJobSelect,
      orderBy: { deliveryDate: 'asc' },
    });

    // 1. Hot Proofs - HOT or CRITICAL urgency, or proof sent but no response in 48h
    const hotProofs = activeJobs.filter(job => {
      if (job.proofUrgency === 'HOT' || job.proofUrgency === 'CRITICAL') {
        return true;
      }
      // Also flag if proof sent > 48h ago with no customer response
      if (job.proofSentToCustomerAt && !job.customerResponseDue) {
        const sentAt = new Date(job.proofSentToCustomerAt);
        return sentAt < fortyEightHoursAgo;
      }
      return false;
    });

    // 2. Awaiting Approval - proof sent, waiting for customer
    const awaitingApproval = activeJobs.filter(job =>
      job.workflowStatus === 'PROOF_SENT_TO_CUSTOMER' ||
      job.workflowStatus === 'AWAITING_CUSTOMER_RESPONSE'
    );

    // 3. Missing Files - art or data pending
    const missingFiles = activeJobs.filter(job =>
      job.qcArtwork === 'PENDING' || job.qcDataFiles === 'PENDING'
    );

    // 4. Materials In Transit - tracking received, awaiting arrival
    const materialsInTransit = activeJobs.filter(job =>
      job.qcSuppliedMaterials === 'TRACKING_RECEIVED'
    );

    // 5. PO Not Confirmed - emailed > 24h ago, vendor hasn't acknowledged
    const poNotConfirmed = activeJobs.filter(job => {
      if (!job.poEmailedAt) return false;
      const emailedAt = new Date(job.poEmailedAt);
      if (emailedAt > twentyFourHoursAgo) return false;
      // Check if vendor confirmed via portal
      const portal = job.JobPortal;
      if (!portal) return true; // No portal = no confirmation
      return portal.vendorStatus === 'PENDING' && !portal.confirmedAt;
    });

    // 6. Ready to Invoice - completed but not invoiced
    //    invoiceEmailedAt is unset on every row in this DB — use isInvoiced()
    const readyToInvoice = activeJobs.filter(job =>
      (job.workflowStatus === 'COMPLETED' || job.workflowStatus === 'INVOICED') &&
      !isInvoiced(job)
    );

    // 7. Unpaid Invoices - invoiced but not paid
    const unpaidInvoices = activeJobs.filter(job =>
      isInvoiced(job) && !job.customerPaymentDate && job.status !== 'PAID'
    );

    // 8. Due This Week - delivery date within 7 days
    const dueThisWeek = activeJobs.filter(job => {
      if (!job.deliveryDate) return false;
      const dueDate = new Date(job.deliveryDate);
      return dueDate >= now && dueDate <= oneWeekFromNow;
    }).sort((a, b) => {
      const aDate = a.deliveryDate ? new Date(a.deliveryDate).getTime() : Infinity;
      const bDate = b.deliveryDate ? new Date(b.deliveryDate).getTime() : Infinity;
      return aDate - bDate;
    });

    // Calculate summary
    const summary = {
      urgent: hotProofs.length,
      needsAction: missingFiles.length + poNotConfirmed.length,
      awaitingResponse: awaitingApproval.length,
      readyToBill: readyToInvoice.length,
      unpaid: unpaidInvoices.length,
      dueThisWeek: dueThisWeek.length,
      totalActive: activeJobs.length,
    };

    res.json({
      success: true,
      data: {
        hotProofs,
        awaitingApproval,
        missingFiles,
        materialsInTransit,
        poNotConfirmed,
        readyToInvoice,
        unpaidInvoices,
        dueThisWeek,
        summary,
      },
    });
  } catch (error) {
    console.error('Error fetching whats-next data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
    });
  }
};

/**
 * Money Snapshot — the four things the landing dashboard shows.
 *
 * 1. unpaidInvoices     — invoiced, client has not paid Impact
 * 2. recentlyPaid       — client cash in, last 30 days
 * 3. needsProductionPay — client paid, Impact still owes its ONE production payee
 *                         (paperSource BRADFORD → BGE, VENDOR/CUSTOMER → JD)
 * 4. missingBgePO       — Bradford-paper jobs with no partnerPONumber (BGE PO)
 * plus inProductionCount (ops stage new|proofing|production — New is NOT split out).
 */
const moneyJobSelect = {
  id: true,
  jobNo: true,
  title: true,
  status: true,
  workflowStatus: true,
  workflowStatusOverride: true,
  sellPrice: true,
  deliveryDate: true,
  invoiceEmailedAt: true,
  invoiceGeneratedAt: true,
  customerInvoiceNumber: true,
  customerPONumber: true,
  partnerPONumber: true,
  paperSource: true,
  customerPaymentDate: true,
  customerPaymentAmount: true,
  bradfordPaymentDate: true,
  bradfordPaymentPaid: true,
  jdPaymentDate: true,
  jdPaymentPaid: true,
  Company: { select: { id: true, name: true } },
};

type MoneyJob = {
  id: string;
  status: string | null;
  workflowStatus: string | null;
  workflowStatusOverride: string | null;
  sellPrice: any;
  invoiceEmailedAt: Date | null;
  invoiceGeneratedAt: Date | null;
  customerInvoiceNumber: string | null;
  partnerPONumber: string | null;
  paperSource: string | null;
  customerPaymentDate: Date | null;
  customerPaymentAmount: any;
  bradfordPaymentDate: Date | null;
  bradfordPaymentPaid: boolean | null;
  jdPaymentDate: Date | null;
  jdPaymentPaid: boolean | null;
};

// Mirrors client/lib/jobPipeline.ts getOpsStage
const PROOFING_STATUSES = new Set([
  'AWAITING_PROOF_FROM_VENDOR',
  'PROOF_RECEIVED',
  'PROOF_SENT_TO_CUSTOMER',
  'AWAITING_CUSTOMER_RESPONSE',
]);
const PRODUCTION_STATUSES = new Set(['APPROVED_PENDING_VENDOR', 'IN_PRODUCTION']);
const COMPLETE_STATUSES = new Set(['COMPLETED', 'INVOICED', 'PAID']);

function isComplete(job: MoneyJob): boolean {
  if (job.status === 'CANCELLED') return true;
  const wf = job.workflowStatusOverride || job.workflowStatus || 'NEW_JOB';
  return COMPLETE_STATUSES.has(wf) || job.status === 'PAID';
}

/** New + Proofing + Production collapsed into one "in production" bucket */
function isInProduction(job: MoneyJob): boolean {
  return !isComplete(job);
}

function isClientPaid(job: MoneyJob): boolean {
  return !!(job.customerPaymentDate || job.status === 'PAID');
}

/**
 * Customer invoice on file. Mirrors client/lib/jobPipeline.ts isInvoiced().
 * invoiceEmailedAt alone is NOT enough — it is unset on every row in this DB;
 * the real signals are invoiceGeneratedAt / customerInvoiceNumber / wf INVOICED.
 */
function isInvoiced(job: {
  invoiceGeneratedAt?: Date | null;
  invoiceEmailedAt?: Date | null;
  customerInvoiceNumber?: string | null;
  workflowStatus?: string | null;
  workflowStatusOverride?: string | null;
}): boolean {
  if (job.invoiceGeneratedAt || job.invoiceEmailedAt || job.customerInvoiceNumber) return true;
  const wf = job.workflowStatusOverride || job.workflowStatus || '';
  return wf === 'INVOICED' || wf === 'PAID';
}

function productionPayee(job: MoneyJob): 'BGE' | 'JD' {
  const src = String(job.paperSource || 'BRADFORD').toUpperCase();
  return src === 'VENDOR' || src === 'CUSTOMER' ? 'JD' : 'BGE';
}

function num(value: any): number {
  return Number(value) || 0;
}

function bucket(jobs: any[], dollarsOf: (job: any) => number) {
  return {
    count: jobs.length,
    dollars: jobs.reduce((sum, j) => sum + dollarsOf(j), 0),
    jobs,
  };
}

export const getMoneySnapshot = async (_req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const jobs = (await prisma.job.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CANCELLED' },
      },
      select: moneyJobSelect,
      orderBy: { createdAt: 'desc' },
    })) as unknown as MoneyJob[];

    const unpaid = jobs.filter((j) => isInvoiced(j) && !isClientPaid(j));

    const recentlyPaid = jobs
      .filter((j) => j.customerPaymentDate && new Date(j.customerPaymentDate) >= thirtyDaysAgo)
      .sort(
        (a, b) =>
          new Date(b.customerPaymentDate as Date).getTime() -
          new Date(a.customerPaymentDate as Date).getTime()
      );

    const needsProductionPay = jobs
      .filter((j) => {
        if (!isClientPaid(j)) return false;
        return productionPayee(j) === 'JD'
          ? !(j.jdPaymentDate || j.jdPaymentPaid)
          : !(j.bradfordPaymentDate || j.bradfordPaymentPaid);
      })
      .map((j) => ({ ...j, payee: productionPayee(j) }));

    // Blank string counts as missing (migrated rows)
    const missingBgePO = jobs.filter(
      (j) =>
        productionPayee(j) === 'BGE' &&
        !String(j.partnerPONumber || '').trim() &&
        !isComplete(j)
    );

    res.json({
      success: true,
      data: {
        unpaidInvoices: bucket(unpaid, (j) => num(j.sellPrice)),
        recentlyPaid: bucket(
          recentlyPaid,
          (j) => num(j.customerPaymentAmount) || num(j.sellPrice)
        ),
        needsProductionPay: bucket(needsProductionPay, (j) => num(j.sellPrice)),
        missingBgePO: bucket(missingBgePO, (j) => num(j.sellPrice)),
        inProductionCount: jobs.filter(isInProduction).length,
      },
    });
  } catch (error) {
    console.error('Error fetching money snapshot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch money snapshot',
    });
  }
};

/**
 * Mark a job's proof as HOT urgency
 */
export const setProofUrgency = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { urgency, note } = req.body;

    if (!['NORMAL', 'HOT', 'CRITICAL', null].includes(urgency)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid urgency level. Must be NORMAL, HOT, CRITICAL, or null to clear.',
      });
    }

    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        proofUrgency: urgency,
        proofUrgencyNote: note || null,
      },
      select: dashboardJobSelect,
    });

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error('Error setting proof urgency:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update proof urgency',
    });
  }
};
