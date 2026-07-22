/**
 * Jobs Payment Controller
 *
 * Paper-driven payment routes (Impact Direct) — two money legs only:
 *
 * BRADFORD paper:
 *   1. Customer → Impact
 *   2. Impact → Bradford (BGE) production
 *   (BGE→JD mfg is partner-side; we do NOT track/require it)
 *
 * JD / vendor paper:
 *   1. Customer → Impact
 *   2. Impact → JD production
 *
 * When both legs recorded → status PAID + workflow COMPLETED.
 */

import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { getSelfMailerPricing } from '../../utils/bradfordPricing';
import { sendJDInvoiceToBradfordEmail } from '../../services/emailService';
import { transformJob, logPaymentChange, calculateProfit, JOB_INCLUDE } from './jobsHelpers';
import { COMPANY_IDS } from '../../constants';
import { getPaymentAmounts, getPaymentRoute } from '../../services/paymentRouteService';

/** Impact production payee from paperSource only */
function productionPayee(paperSource?: string | null): 'BGE' | 'JD' {
  const src = (paperSource || 'BRADFORD').toUpperCase();
  if (src === 'VENDOR' || src === 'CUSTOMER') return 'JD';
  return 'BGE';
}

function isProdPaid(job: {
  paperSource?: string | null;
  bradfordPaymentDate?: Date | null;
  bradfordPaymentPaid?: boolean | null;
  jdPaymentDate?: Date | null;
  jdPaymentPaid?: boolean | null;
}): boolean {
  if (productionPayee(job.paperSource) === 'JD') {
    return !!(job.jdPaymentPaid || job.jdPaymentDate);
  }
  return !!(job.bradfordPaymentPaid || job.bradfordPaymentDate);
}

/** JD paper: commission to Bradford is a separate required payment */
function isCommissionPaid(job: {
  paperSource?: string | null;
  bradfordPaymentDate?: Date | null;
  bradfordPaymentPaid?: boolean | null;
}): boolean {
  if (productionPayee(job.paperSource) !== 'JD') return true; // N/A
  return !!(job.bradfordPaymentPaid || job.bradfordPaymentDate);
}

function isFullySettled(job: {
  paperSource?: string | null;
  customerPaymentDate?: Date | null;
  bradfordPaymentDate?: Date | null;
  bradfordPaymentPaid?: boolean | null;
  jdPaymentDate?: Date | null;
  jdPaymentPaid?: boolean | null;
}): boolean {
  if (!job.customerPaymentDate) return false;
  if (!isProdPaid(job)) return false;
  return isCommissionPaid(job);
}

/**
 * After client and/or production/commission pay flips, set money-complete status.
 * Fully settled → PAID + COMPLETED.
 */
function moneyCompletePatch(job: {
  paperSource?: string | null;
  customerPaymentDate?: Date | null;
  bradfordPaymentDate?: Date | null;
  bradfordPaymentPaid?: boolean | null;
  jdPaymentDate?: Date | null;
  jdPaymentPaid?: boolean | null;
  workflowStatus?: string | null;
  invoiceGeneratedAt?: Date | null;
  customerInvoiceNumber?: string | null;
}): Record<string, unknown> {
  const now = new Date();
  const client = !!job.customerPaymentDate;
  const settled = isFullySettled(job);

  if (client && settled) {
    return {
      status: 'PAID',
      workflowStatus: 'COMPLETED',
      workflowStatusOverride: 'COMPLETED',
      workflowStatusOverrideAt: now,
      workflowStatusOverrideBy: 'staff',
      workflowUpdatedAt: now,
      completedAt: now,
    };
  }

  // Client paid, production still open — not COMPLETE yet
  if (client) {
    const invoiced = !!(job.invoiceGeneratedAt || job.customerInvoiceNumber);
    const current = job.workflowStatus || '';
    // Keep COMPLETED floor state; else INVOICED if billed; never PAID until both legs
    let wf = 'COMPLETED';
    if (current === 'COMPLETED' || current === 'INVOICED') wf = current;
    else if (invoiced) wf = 'INVOICED';
    return {
      status: 'ACTIVE',
      workflowStatus: wf,
      workflowStatusOverride: wf,
      workflowStatusOverrideAt: now,
      workflowStatusOverrideBy: 'staff',
      workflowUpdatedAt: now,
    };
  }

  return { status: 'ACTIVE' };
}

// ============================================================================
// STEP 1: CUSTOMER PAYMENT (Customer → Impact)
// ============================================================================

/**
 * Mark customer as paid or unpaid
 */
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
        paperSource: true,
        bradfordPaymentDate: true,
        bradfordPaymentPaid: true,
        jdPaymentDate: true,
        jdPaymentPaid: true,
        workflowStatus: true,
        invoiceGeneratedAt: true,
        customerInvoiceNumber: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Handle unpaid status - clear payment date (stay invoiced if invoice on file)
    if (status === 'unpaid') {
      await logPaymentChange(id, 'customerPaymentDate', existingJob.customerPaymentDate, null, 'admin');

      const stillInvoiced = !!(existingJob.invoiceGeneratedAt || existingJob.customerInvoiceNumber);

      const job = await prisma.job.update({
        where: { id },
        data: {
          customerPaymentDate: null,
          customerPaymentAmount: null,
          status: 'ACTIVE',
          workflowStatus: stillInvoiced ? 'INVOICED' : 'COMPLETED',
          workflowStatusOverride: stillInvoiced ? 'INVOICED' : 'COMPLETED',
          workflowStatusOverrideAt: new Date(),
          workflowStatusOverrideBy: 'staff',
          workflowUpdatedAt: new Date(),
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

    // Default: mark as paid (client only — production may still be open)
    const paymentDate = date ? new Date(date) : new Date();
    const paymentAmount = Number(existingJob.sellPrice) || 0;

    await logPaymentChange(id, 'customerPaymentDate', existingJob.customerPaymentDate, paymentDate, 'admin');

    const settle = moneyCompletePatch({
      ...existingJob,
      customerPaymentDate: paymentDate,
    });

    const job = await prisma.job.update({
      where: { id },
      data: {
        customerPaymentDate: paymentDate,
        customerPaymentAmount: paymentAmount,
        ...settle,
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

// ============================================================================
// STEP 1.5: INVOICE SENT (Manual tracking)
// ============================================================================

/**
 * Mark customer invoice as sent (manual tracking)
 * Can set or clear the invoice sent status
 */
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
        include: JOB_INCLUDE as any,
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
      include: JOB_INCLUDE as any,
    });

    res.json(transformJob(job));
  } catch (error) {
    console.error('Mark invoice sent error:', error);
    res.status(500).json({ error: 'Failed to mark invoice sent' });
  }
};

// ============================================================================
// MARK INVOICED (migration / AR) — old system invoice # + date; unpaid until client paid
// ============================================================================

/**
 * Record that a customer invoice exists (legacy system or new).
 * Sets workflow INVOICED, stores invoice # + date, does NOT mark paid.
 *
 * Body: { invoiceNumber: string, invoicedAt?: ISO date, status?: 'invoiced' | 'clear' }
 */
export const markInvoiced = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { invoiceNumber, invoicedAt, status } = req.body as {
      invoiceNumber?: string;
      invoicedAt?: string;
      status?: 'invoiced' | 'clear';
    };

    const existingJob = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        jobNo: true,
        customerInvoiceNumber: true,
        invoiceGeneratedAt: true,
        workflowStatus: true,
        completedAt: true,
        customerPaymentDate: true,
        status: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const now = new Date();

    // Clear invoiced state (back to completed / production)
    if (status === 'clear') {
      await logPaymentChange(
        id,
        'customerInvoiceNumber',
        existingJob.customerInvoiceNumber,
        null,
        'admin'
      );

      const job = await prisma.job.update({
        where: { id },
        data: {
          customerInvoiceNumber: null,
          invoiceGeneratedAt: null,
          workflowStatus: 'COMPLETED',
          workflowStatusOverride: 'COMPLETED',
          workflowStatusOverrideAt: now,
          workflowStatusOverrideBy: 'staff',
          workflowUpdatedAt: now,
          // Keep money status as-is; only reopen floor state if not paid
          status: existingJob.customerPaymentDate || existingJob.status === 'PAID' ? existingJob.status : 'ACTIVE',
          updatedAt: now,
        },
        include: JOB_INCLUDE as any,
      });
      return res.json(transformJob(job));
    }

    const invNo = (invoiceNumber || existingJob.customerInvoiceNumber || '').trim();
    if (!invNo) {
      return res.status(400).json({
        error: 'invoiceNumber required',
        message: 'Enter the invoice number from the old (or new) system',
      });
    }

    const issued = invoicedAt ? new Date(invoicedAt) : existingJob.invoiceGeneratedAt || now;
    if (Number.isNaN(issued.getTime())) {
      return res.status(400).json({ error: 'Invalid invoicedAt date' });
    }

    await logPaymentChange(
      id,
      'customerInvoiceNumber',
      existingJob.customerInvoiceNumber,
      invNo,
      'admin'
    );

    const job = await prisma.job.update({
      where: { id },
      data: {
        customerInvoiceNumber: invNo,
        invoiceGeneratedAt: issued,
        // Floor already done if not set
        completedAt: existingJob.completedAt || now,
        // Invoiced AR state — not paid unless already collected
        workflowStatus: existingJob.customerPaymentDate ? 'PAID' : 'INVOICED',
        workflowStatusOverride: existingJob.customerPaymentDate ? 'PAID' : 'INVOICED',
        workflowStatusOverrideAt: now,
        workflowStatusOverrideBy: 'staff',
        workflowUpdatedAt: now,
        // JobStatus.PAID only when customer paid; invoiced stays ACTIVE
        status: existingJob.customerPaymentDate || existingJob.status === 'PAID' ? 'PAID' : 'ACTIVE',
        updatedAt: now,
      },
      include: JOB_INCLUDE as any,
    });

    res.json(transformJob(job));
  } catch (error: any) {
    console.error('Mark invoiced error:', error);
    res.status(500).json({ error: 'Failed to mark invoiced', message: error?.message });
  }
};

/**
 * Mark vendor payment as complete (Impact → Vendor)
 * Used for non-Bradford vendors (JD direct, or other vendors)
 */
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
        include: JOB_INCLUDE as any,
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
      include: JOB_INCLUDE as any,
    });

    res.json(transformJob(job));
  } catch (error) {
    console.error('Mark vendor paid error:', error);
    res.status(500).json({ error: 'Failed to mark vendor paid' });
  }
};

// ============================================================================
// IMPACT → BRADFORD
// Bradford paper: full production outlay (+ JD invoice to Bradford)
// JD paper: margin share only
// ============================================================================

/**
 * Mark Impact→Bradford as paid.
 * Amount and JD-invoice side-effect depend on paperSource (see paymentRouteService).
 */
export const markImpactToBradfordPaid = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, sendInvoice, status, amount } = req.body;

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

    // Clear payment
    if (status === 'unpaid') {
      await logPaymentChange(id, 'bradfordPaymentDate', existingJob.bradfordPaymentDate, null, 'admin');
      const settle = moneyCompletePatch({
        ...existingJob,
        bradfordPaymentDate: null,
        bradfordPaymentPaid: false,
      });
      const job = await prisma.job.update({
        where: { id },
        data: {
          bradfordPaymentPaid: false,
          bradfordPaymentDate: null,
          bradfordPaymentAmount: null,
          ...settle,
          updatedAt: new Date(),
        },
        include: JOB_INCLUDE as any,
      });
      return res.json(transformJob(job));
    }

    // Customer must pay first
    if (!existingJob.customerPaymentDate) {
      return res.status(400).json({
        error: 'Cannot pay Bradford before customer payment received',
        hint: 'Use markCustomerPaid first',
        jobNo: existingJob.jobNo,
      });
    }

    const route = getPaymentRoute(existingJob.paperSource);
    const profit = calculateProfit(existingJob);
    const amounts = getPaymentAmounts(existingJob.paperSource, profit);
    const paymentDate = date ? new Date(date) : existingJob.bradfordPaymentDate || new Date();
    // Allow override — JD-paper commission often differs from table share
    const paymentAmount =
      amount != null && amount !== '' && !Number.isNaN(Number(amount))
        ? Math.round(Number(amount) * 100) / 100
        : Number(existingJob.bradfordPaymentAmount) || amounts.impactToBradford;

    // Allow amount override / re-save (JD-paper commission often differs from table)
    await logPaymentChange(id, 'bradfordPaymentDate', existingJob.bradfordPaymentDate, paymentDate, 'admin');
    await logPaymentChange(id, 'bradfordPaymentAmount', existingJob.bradfordPaymentAmount, paymentAmount, 'admin');

    const settle = moneyCompletePatch({
      ...existingJob,
      bradfordPaymentDate: paymentDate,
      bradfordPaymentPaid: true,
    });

    let updateData: any = {
      bradfordPaymentPaid: true,
      bradfordPaymentDate: paymentDate,
      bradfordPaymentAmount: paymentAmount,
      ...settle,
      updatedAt: new Date(),
    };

    // Optional JD-invoice email to Bradford (partner billing) — not a payment we track
    const shouldSendInvoice =
      route.sendJdInvoiceToBradford && (sendInvoice !== false);

    let emailResult: { success: boolean; emailedAt?: Date; emailedTo?: string; error?: string } | null = null;
    if (shouldSendInvoice) {
      const basePricing = existingJob.sizeName ? getSelfMailerPricing(existingJob.sizeName) : null;
      const suggestedPricingData = basePricing
        ? {
            printCPM: basePricing.printCPM,
            paperCPM: basePricing.paperCPM,
            paperLbsPerM: basePricing.paperLbsPerM,
          }
        : null;

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
        purchaseOrders: existingJob.PurchaseOrder,
        suggestedPricing: suggestedPricingData,
      };

      emailResult = await sendJDInvoiceToBradfordEmail(jobDataForInvoice);

      if (emailResult.success) {
        updateData.jdInvoiceGeneratedAt = new Date();
        updateData.jdInvoiceEmailedAt = emailResult.emailedAt;
        updateData.jdInvoiceEmailedTo = emailResult.emailedTo;
        console.log(`📧 JD Invoice sent to Bradford for job ${existingJob.jobNo}`);
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
      paymentRoute: route,
      paymentAmount,
      jdInvoiceSent: emailResult?.success || false,
      jdInvoiceError: emailResult?.error || null,
    });
  } catch (error) {
    console.error('Mark Bradford paid error:', error);
    res.status(500).json({ error: 'Failed to mark Bradford paid' });
  }
};

// ============================================================================
// STEP 3: JD INVOICE (Manual send/resend)
// ============================================================================

/**
 * Send or resend JD Invoice to Bradford
 */
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
    const suggestedPricingData = basePricing
      ? {
          printCPM: basePricing.printCPM,
          paperCPM: basePricing.paperCPM,
          paperLbsPerM: basePricing.paperLbsPerM,
        }
      : null;

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
          updatedAt: new Date(),
        },
      });

      res.json({
        success: true,
        emailedAt: emailResult.emailedAt,
        emailedTo: emailResult.emailedTo,
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

/**
 * Download JD Invoice PDF (for manual download)
 */
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
    const suggestedPricingData = basePricing
      ? {
          printCPM: basePricing.printCPM,
          paperCPM: basePricing.paperCPM,
          paperLbsPerM: basePricing.paperLbsPerM,
        }
      : null;

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
      suggestedPricing: suggestedPricingData,
    };

    // Import the PDF generator
    const { generateJDToBradfordInvoicePDF } = await import('../../services/pdfService');
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

// ============================================================================
// BULK INVOICE GENERATION
// ============================================================================

/**
 * Bulk generate JD invoice numbers for all jobs that don't have one
 * This is a one-time operation to populate existing jobs
 */
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

    // Filter to only jobs with a jobNo (Prisma 6 doesn't allow not: null)
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

// ============================================================================
// JD PAYMENT
// Bradford paper: Bradford → JD (mfg only) — partner tracking
// JD paper: Impact → JD (production) — Impact's production payee
// ============================================================================

/**
 * Mark JD payment complete. Semantics depend on paperSource.
 */
export const markJDPaid = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, status } = req.body;

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

    if (status === 'unpaid') {
      await logPaymentChange(id, 'jdPaymentDate', existingJob.jdPaymentDate, null, 'admin');
      const settleClear = moneyCompletePatch({
        ...existingJob,
        jdPaymentDate: null,
        jdPaymentPaid: false,
      });
      const job = await prisma.job.update({
        where: { id },
        data: {
          jdPaymentPaid: false,
          jdPaymentDate: null,
          jdPaymentAmount: null,
          ...settleClear,
          updatedAt: new Date(),
        },
        include: JOB_INCLUDE as any,
      });
      return res.json(transformJob(job));
    }

    const route = getPaymentRoute(existingJob.paperSource);
    const profit = calculateProfit(existingJob);
    const amounts = getPaymentAmounts(existingJob.paperSource, profit);
    const paymentDate = date ? new Date(date) : new Date();

    // Only Impact → JD production (JD paper). BGE→JD mfg is not tracked.
    if (route.productionPayee === 'BRADFORD') {
      return res.status(400).json({
        error: 'Bradford-paper jobs only require Impact → BGE. BGE→JD is not tracked.',
        hint: 'Mark Impact → Bradford (BGE) paid instead',
        jobNo: existingJob.jobNo,
      });
    }

    if (!existingJob.customerPaymentDate) {
      return res.status(400).json({
        error: 'Cannot pay JD before customer payment received',
        hint: 'Use markCustomerPaid first',
        jobNo: existingJob.jobNo,
      });
    }

    if (existingJob.jdPaymentDate) {
      return res.status(409).json({
        error: 'JD payment already recorded',
        existingDate: existingJob.jdPaymentDate,
        existingAmount: existingJob.jdPaymentAmount,
      });
    }

    // Amount: Bradford-paper = mfg only; JD-paper = Impact production cost
    let jdPaymentAmount =
      route.productionPayee === 'JD' ? amounts.impactToJd : amounts.bradfordToJdMfg;

    // Fallback chain if profit had no mfg/cost
    if (!jdPaymentAmount) {
      if (route.productionPayee === 'JD') {
        // Impact → JD production PO (JD paper)
        const impactJdPO = (existingJob.PurchaseOrder || []).find(
          (po: any) =>
            po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT &&
            po.targetCompanyId === COMPANY_IDS.JD_GRAPHIC
        );
        if (impactJdPO) {
          jdPaymentAmount = Number(impactJdPO.buyCost) || 0;
        }
      }
      const bradfordJDPO = (existingJob.PurchaseOrder || []).find(
        (po: any) =>
          po.originCompanyId === COMPANY_IDS.BRADFORD && po.targetCompanyId === COMPANY_IDS.JD_GRAPHIC
      );
      if (!jdPaymentAmount && bradfordJDPO) {
        jdPaymentAmount = Number(bradfordJDPO.buyCost) || Number(bradfordJDPO.mfgCost) || 0;
      } else if (!jdPaymentAmount && existingJob.bradfordPrintCPM && existingJob.quantity) {
        jdPaymentAmount =
          (Number(existingJob.bradfordPrintCPM) / 1000) * Number(existingJob.quantity);
      }
    }

    await logPaymentChange(id, 'jdPaymentDate', existingJob.jdPaymentDate, paymentDate, 'admin');

    const settle = moneyCompletePatch({
      ...existingJob,
      jdPaymentDate: paymentDate,
      jdPaymentPaid: true,
    });

    const job = await prisma.job.update({
      where: { id },
      data: {
        jdPaymentPaid: true,
        jdPaymentDate: paymentDate,
        jdPaymentAmount: jdPaymentAmount,
        ...settle,
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

    res.json({
      ...transformJob(job),
      paymentRoute: route,
      paymentAmount: jdPaymentAmount,
    });
  } catch (error) {
    console.error('Mark JD paid error:', error);
    res.status(500).json({ error: 'Failed to mark JD paid' });
  }
};

// ============================================================================
// GENERAL PAYMENT UPDATES
// ============================================================================

/**
 * Update all payment fields for a job
 */
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

    if (
      customerPaymentAmount !== undefined &&
      Number(existingJob.customerPaymentAmount) !== Number(customerPaymentAmount)
    ) {
      await logPaymentChange(
        id,
        'customerPaymentAmount',
        existingJob.customerPaymentAmount,
        customerPaymentAmount,
        changedBy
      );
    }
    if (
      customerPaymentDate !== undefined &&
      existingJob.customerPaymentDate?.toISOString() !==
        (customerPaymentDate ? new Date(customerPaymentDate).toISOString() : null)
    ) {
      await logPaymentChange(
        id,
        'customerPaymentDate',
        existingJob.customerPaymentDate,
        customerPaymentDate,
        changedBy
      );
    }

    if (
      vendorPaymentAmount !== undefined &&
      Number(existingJob.vendorPaymentAmount) !== Number(vendorPaymentAmount)
    ) {
      await logPaymentChange(
        id,
        'vendorPaymentAmount',
        existingJob.vendorPaymentAmount,
        vendorPaymentAmount,
        changedBy
      );
    }
    if (
      vendorPaymentDate !== undefined &&
      existingJob.vendorPaymentDate?.toISOString() !==
        (vendorPaymentDate ? new Date(vendorPaymentDate).toISOString() : null)
    ) {
      await logPaymentChange(id, 'vendorPaymentDate', existingJob.vendorPaymentDate, vendorPaymentDate, changedBy);
    }

    if (
      bradfordPaymentAmount !== undefined &&
      Number(existingJob.bradfordPaymentAmount) !== Number(bradfordPaymentAmount)
    ) {
      await logPaymentChange(
        id,
        'bradfordPaymentAmount',
        existingJob.bradfordPaymentAmount,
        bradfordPaymentAmount,
        changedBy
      );
    }
    if (
      bradfordPaymentDate !== undefined &&
      existingJob.bradfordPaymentDate?.toISOString() !==
        (bradfordPaymentDate ? new Date(bradfordPaymentDate).toISOString() : null)
    ) {
      await logPaymentChange(
        id,
        'bradfordPaymentDate',
        existingJob.bradfordPaymentDate,
        bradfordPaymentDate,
        changedBy
      );
    }

    res.json(transformJob(job));
  } catch (error) {
    console.error('Update payments error:', error);
    res.status(500).json({ error: 'Failed to update payments' });
  }
};

/**
 * Batch update payments for multiple jobs
 */
export const batchUpdatePayments = async (req: Request, res: Response) => {
  try {
    const { jobIds, paymentType, date } = req.body;

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: 'Invalid job IDs' });
    }

    if (!paymentType || !['customer', 'vendor', 'bradford'].includes(paymentType)) {
      return res.status(400).json({ error: 'Invalid payment type' });
    }

    const paymentDate = date ? new Date(date) : new Date();

    // Build update data based on payment type
    let updateData: any = {
      updatedAt: new Date(),
    };

    switch (paymentType) {
      case 'customer':
        updateData.customerPaymentDate = paymentDate;
        break;
      case 'vendor':
        updateData.vendorPaymentDate = paymentDate;
        break;
      case 'bradford':
        updateData.bradfordPaymentDate = paymentDate;
        updateData.bradfordPaymentPaid = true;
        break;
    }

    // Update jobs one by one to get individual amounts
    const results: Array<{ jobId: string; success: boolean; error?: string }> = [];

    for (const jobId of jobIds) {
      try {
        const job = await prisma.job.findUnique({
          where: { id: jobId },
          select: { sellPrice: true },
        });

        if (!job) {
          results.push({ jobId, success: false, error: 'Job not found' });
          continue;
        }

        // For customer payments, set the amount
        if (paymentType === 'customer') {
          updateData.customerPaymentAmount = Number(job.sellPrice) || 0;
        }

        await prisma.job.update({
          where: { id: jobId },
          data: updateData,
        });

        results.push({ jobId, success: true });
      } catch (err) {
        results.push({ jobId, success: false, error: 'Update failed' });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

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

// ============================================================================
// LEGACY ENDPOINTS
// ============================================================================

/**
 * Update Bradford payment status (LEGACY - kept for backward compatibility)
 */
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

/**
 * Update invoice payment status (toggle paidAt)
 */
export const updateInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { status } = req.body; // 'paid' | 'unpaid'

    const invoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAt: status === 'paid' ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    res.json({
      id: invoice.id,
      paidAt: invoice.paidAt,
      status: invoice.paidAt ? 'paid' : 'unpaid',
    });
  } catch (error) {
    console.error('Update invoice status error:', error);
    res.status(500).json({ error: 'Failed to update invoice status' });
  }
};
