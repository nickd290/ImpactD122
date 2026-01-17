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
    const readyToInvoice = activeJobs.filter(job =>
      (job.workflowStatus === 'COMPLETED' || job.workflowStatus === 'INVOICED') &&
      !job.invoiceEmailedAt
    );

    // 7. Unpaid Invoices - invoiced but not paid
    const unpaidInvoices = activeJobs.filter(job =>
      job.invoiceEmailedAt && !job.customerPaymentDate
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
