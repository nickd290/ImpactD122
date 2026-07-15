/**
 * Jobs Payment Controller
 *
 * Paper-driven payment routes (Impact Direct):
 *
 * BRADFORD paper:
 *   1. Customer → Impact
 *   2. Impact → Bradford (full outlay; auto JD invoice to Bradford)
 *   3. Bradford → JD (mfg only — partner tracking)
 *
 * JD / vendor paper:
 *   1. Customer → Impact
 *   2. Impact → JD (production)
 *   3. Impact → Bradford (margin split only)
 *
 * Production payee from Impact is exclusive by paperSource.
 */

import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { getSelfMailerPricing } from '../../utils/bradfordPricing';
import { sendJDInvoiceToBradfordEmail } from '../../services/emailService';
import { transformJob, logPaymentChange, calculateProfit, JOB_INCLUDE } from './jobsHelpers';
import { COMPANY_IDS } from '../../constants';
import { getPaymentAmounts, getPaymentRoute } from '../../services/paymentRouteService';

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
    const { date, sendInvoice, status } = req.body;

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
      const job = await prisma.job.update({
        where: { id },
        data: {
          bradfordPaymentPaid: false,
          bradfordPaymentDate: null,
          bradfordPaymentAmount: null,
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

    // Idempotency
    if (existingJob.bradfordPaymentDate) {
      return res.status(409).json({
        error: 'Bradford payment already recorded',
        existingDate: existingJob.bradfordPaymentDate,
        existingAmount: existingJob.bradfordPaymentAmount,
        hint: 'To resend JD invoice, use the sendJDInvoice endpoint instead',
      });
    }

    const route = getPaymentRoute(existingJob.paperSource);
    const profit = calculateProfit(existingJob);
    const amounts = getPaymentAmounts(existingJob.paperSource, profit);
    const paymentDate = date ? new Date(date) : new Date();
    const paymentAmount = amounts.impactToBradford;

    await logPaymentChange(id, 'bradfordPaymentDate', existingJob.bradfordPaymentDate, paymentDate, 'admin');

    let updateData: any = {
      bradfordPaymentPaid: true,
      bradfordPaymentDate: paymentDate,
      bradfordPaymentAmount: paymentAmount,
      updatedAt: new Date(),
    };

    // JD invoice only when Bradford is production payee (Bradford paper)
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
      const job = await prisma.job.update({
        where: { id },
        data: {
          jdPaymentPaid: false,
          jdPaymentDate: null,
          jdPaymentAmount: null,
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

    if (route.productionPayee === 'BRADFORD') {
      // Bradford → JD mfg tracking: Impact must have paid Bradford first
      if (!existingJob.customerPaymentDate) {
        return res.status(400).json({
          error: 'Cannot mark JD paid before customer payment',
          jobNo: existingJob.jobNo,
        });
      }
      if (!existingJob.bradfordPaymentDate && !existingJob.bradfordPaymentPaid) {
        return res.status(400).json({
          error: 'On Bradford-paper jobs, Impact pays Bradford first; then Bradford pays JD for mfg',
          hint: 'Mark Impact → Bradford paid first',
          jobNo: existingJob.jobNo,
        });
      }
    } else {
      // Impact → JD production: customer must have paid
      if (!existingJob.customerPaymentDate) {
        return res.status(400).json({
          error: 'Cannot pay JD before customer payment received',
          hint: 'Use markCustomerPaid first',
          jobNo: existingJob.jobNo,
        });
      }
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
