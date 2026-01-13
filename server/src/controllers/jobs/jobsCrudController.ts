/**
 * Jobs CRUD Controller
 *
 * Core CRUD operations for jobs:
 * - getAllJobs: List all jobs with filtering and pagination
 * - getJob: Get single job by ID
 * - createJob: Create new job with auto-PO generation
 * - updateJob: Update job with field locking after invoice
 * - deleteJob: Soft delete job
 *
 * Also includes:
 * - updateJobStatus: Update job status
 * - toggleJobLock: Lock/unlock job (deprecated)
 * - updateBradfordRef: Update Bradford reference number
 * - importBatchJobs: Batch import jobs
 * - batchDeleteJobs: Batch delete jobs
 * - bulkUpdatePaperSource: Bulk update paper source
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import {
  calculateProfitSplit,
  calculateTierPricing,
  PaperSource,
} from '../../services/pricingService';
import { normalizeSize, getSelfMailerPricing } from '../../utils/bradfordPricing';
import { initiateBothThreads } from '../../services/communicationService';
import { syncJobVendorToPOs, createBradfordJDPO } from '../../services/poService';
import { sendVendorPOWithPortalEmail } from '../../services/emailService';
import { COMPANY_IDS } from '../../constants';
import {
  canCreateImpactPO,
  transformJob,
  transformJobForWorkflow,
  calculateWorkflowStage,
  logJobChange,
  JOB_INCLUDE,
  JOB_INCLUDE_FULL,
  JOB_INCLUDE_WORKFLOW,
} from './jobsHelpers';
import {
  determineInitialQcFlags,
  isMailingJob as isMailingJobCheck,
  updateJobReadiness,
} from '../../services/readinessService';
import { determinePathway } from '../../services/pathwayService';
import { generateBaseJobId, getTypeCode } from '../../services/jobIdService';
import { createJobUnified, CreateJobUnifiedInput } from '../../services/jobCreationService';
import { detectMailingType, MailingDetectionInput } from '../../services/mailingDetectionService';
import { syncWorkflowFromStatus } from '../../domain/jobStatusSync';
import { JobStatus } from '@prisma/client';

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get all jobs with optional tab filtering
 */
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
      include: JOB_INCLUDE,
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

/**
 * Get jobs grouped by workflow status with QC indicators
 * Returns lightweight job data optimized for the control station view
 */
export const getJobsWorkflowView = async (req: Request, res: Response) => {
  try {
    // Define workflow stage order for grouping
    const workflowOrder = [
      'NEW_JOB',
      'AWAITING_PROOF_FROM_VENDOR',
      'PROOF_RECEIVED',
      'PROOF_SENT_TO_CUSTOMER',
      'AWAITING_CUSTOMER_RESPONSE',
      'APPROVED_PENDING_VENDOR',
      'IN_PRODUCTION',
      'COMPLETED',
      'INVOICED',
      'PAID',
      'CANCELLED',
    ];

    // Friendly names for display
    const workflowLabels: Record<string, string> = {
      'NEW_JOB': 'New Job',
      'AWAITING_PROOF_FROM_VENDOR': 'Waiting on Proofs',
      'PROOF_RECEIVED': 'Proofs Received',
      'PROOF_SENT_TO_CUSTOMER': 'Sent to Customer',
      'AWAITING_CUSTOMER_RESPONSE': 'Awaiting Customer Approval',
      'APPROVED_PENDING_VENDOR': 'Approved - Notify Vendor',
      'IN_PRODUCTION': 'In Production',
      'COMPLETED': 'Shipped',
      'INVOICED': 'Invoiced',
      'PAID': 'Paid',
      'CANCELLED': 'Cancelled',
    };

    // Get all active (non-deleted, non-paid) jobs with workflow data
    const jobs = await prisma.job.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE', // Only active jobs for control station
      },
      include: JOB_INCLUDE_WORKFLOW,
      orderBy: [
        { deliveryDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Transform jobs for workflow view with CALCULATED stage
    const transformedJobs = jobs.map(job => {
      const transformed = transformJobForWorkflow(job);
      // Override stored workflowStatus with calculated stage from actual data
      transformed.workflowStatus = calculateWorkflowStage(job);
      return transformed;
    });

    // Group by workflow status
    const groupedJobs: Record<string, any[]> = {};
    workflowOrder.forEach(status => {
      groupedJobs[status] = [];
    });

    transformedJobs.forEach(job => {
      const status = job.workflowStatus || 'NEW_JOB';
      if (groupedJobs[status]) {
        groupedJobs[status].push(job);
      } else {
        groupedJobs['NEW_JOB'].push(job);
      }
    });

    // Build response with counts per stage
    const stages = workflowOrder
      .filter(status => status !== 'CANCELLED' && status !== 'PAID') // Hide empty end states
      .map(status => ({
        status,
        label: workflowLabels[status] || status,
        count: groupedJobs[status].length,
        jobs: groupedJobs[status],
      }))
      .filter(stage => stage.count > 0 || ['NEW_JOB', 'IN_PRODUCTION'].includes(stage.status)); // Always show key stages

    res.json({
      stages,
      totalActive: transformedJobs.length,
    });
  } catch (error) {
    console.error('Get jobs workflow view error:', error);
    res.status(500).json({ error: 'Failed to fetch workflow view' });
  }
};

/**
 * Get single job by ID
 */
export const getJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await prisma.job.findUnique({
      where: { id },
      include: JOB_INCLUDE_FULL,
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

// ============================================================================
// CREATE OPERATION
// ============================================================================

/**
 * Create new job
 * - Generates job number
 * - Calculates tier pricing for standard sizes
 * - Auto-creates POs for Bradford routing
 * - Creates ProfitSplit record
 * - Initiates email threads
 */
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
      bradfordCut,
      jdSuppliesPaper,
      bradfordRefNumber,
      bradfordPaperLbs,
      dataIncludedWithArtwork,
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

    // Validate required fields - check for both null/undefined AND empty strings
    if (!customerId || customerId.trim() === '') {
      return res.status(400).json({ error: 'Customer is required' });
    }
    if (!vendorId || (typeof vendorId === 'string' && vendorId.trim() === '')) {
      return res.status(400).json({ error: 'Vendor is required' });
    }
    if (!title?.trim()) {
      return res.status(400).json({ error: 'Job title is required' });
    }

    // Validate UUIDs are properly formatted
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(customerId)) {
      return res.status(400).json({ error: 'Invalid customer ID format' });
    }
    if (vendorId && !uuidRegex.test(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID format' });
    }

    // Calculate quantity from line items or use provided quantity
    const quantity =
      inputQuantity ||
      lineItems?.reduce((sum: number, item: any) => sum + (parseInt(item.quantity) || 0), 0) ||
      0;

    // Calculate total from line items
    const lineItemTotal =
      lineItems?.reduce((sum: number, item: any) => {
        if (item.lineTotal && item.lineTotal > 0) {
          return sum + parseFloat(item.lineTotal);
        }
        return sum + (parseInt(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
      }, 0) || 0;

    // Normalize size name
    const rawSizeName = inputSizeName || specs?.finishedSize;
    const sizeName = rawSizeName ? normalizeSize(rawSizeName) : null;

    // Determine paper source
    const paperSource = jdSuppliesPaper === true ? 'VENDOR' : inputPaperSource || 'BRADFORD';

    // Use sellPrice if provided, otherwise calculate from financials or line items
    const sellPrice =
      Number(inputSellPrice) || Number(financials?.impactCustomerTotal) || lineItemTotal || 0;

    // Calculate tier pricing if this is a standard size
    let totalCost = 0;
    let paperMarkup = 0;
    let paperCost = 0;
    let printCost = 0;

    // Use Bradford pricing from client if provided (from PO parsing)
    if (isBradfordJob && bradfordPricing && quantity > 0) {
      totalCost = bradfordPricing.totalCostToImpact || 0;
      paperCost = bradfordPricing.totalPaperCost || 0;
      const paperSellTotal = bradfordPricing.totalPaperSell || 0;
      paperMarkup = bradfordPricing.bradfordPaperProfit || paperSellTotal - paperCost;
      printCost = bradfordPricing.totalPrintCost || 0;

      console.log(`📦 Using Bradford pricing from client:`, {
        totalCostToImpact: totalCost,
        paperCost,
        paperSellTotal,
        paperMarkup,
        printCost,
        quantity,
        sizeName,
      });
    } else {
      // Fall back to standard tier pricing calculation
      const selfMailerPricing = sizeName ? getSelfMailerPricing(sizeName) : null;

      if (sizeName && quantity > 0 && selfMailerPricing) {
        const tierPricing = calculateTierPricing({
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

    // Guard: Backend pricing validation - reject negative margin without override
    if (totalCost > 0 && sellPrice < totalCost && req.body.allowNegativeMargin !== true) {
      return res.status(400).json({
        error: `Negative margin: sellPrice ($${sellPrice.toFixed(2)}) < totalCost ($${totalCost.toFixed(2)})`,
        sellPrice: sellPrice,
        totalCost: totalCost,
        margin: sellPrice - totalCost,
        hint: 'Set allowNegativeMargin=true to override',
      });
    }

    // Build specs JSON
    const isStandardSize = isBradfordJob || (sizeName ? !!getSelfMailerPricing(sizeName) : false);
    const jobSpecs = {
      ...(specs || {}),
      isStandardSize,
      isBradfordJob: !!isBradfordJob,
      bradfordCut: bradfordCut || null,
      jdSuppliesPaper: jdSuppliesPaper === true,
      lineItems: lineItems || null,
      // Ensure raw job description is preserved for vendor POs
      rawJobDescription: specs?.rawJobDescription || specs?.rawDescriptionText || null,
      rawDescriptionText: specs?.rawDescriptionText || specs?.rawJobDescription || null,
    };

    // Final validation: ensure sellPrice is valid before saving
    if (!sellPrice || sellPrice <= 0) {
      return res.status(400).json({ error: 'Sell price is required and must be greater than 0' });
    }

    // Determine routing type for pathway calculation
    const routingType = rest.routingType || 'BRADFORD_JD';

    // === PATHWAY SYSTEM: Use unified job creation service ===
    // This ensures atomic sequence increment + pathway assignment
    const { job, jobNo, baseJobId, pathway } = await createJobUnified({
      title: title || '',
      customerId,
      vendorId: vendorId || null,
      quantity,
      sellPrice,
      status: status || 'ACTIVE',
      specs: jobSpecs,
      lineItems: lineItems || null,
      sizeName,
      paperSource: paperSource as any,
      bradfordPaperLbs: bradfordPaperLbs ? parseFloat(bradfordPaperLbs) : null,
      customerPONumber: customerPONumber || null,
      partnerPONumber: bradfordRefNumber || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      mailDate: mailDate ? new Date(mailDate) : null,
      inHomesDate: inHomesDate ? new Date(inHomesDate) : null,
      dataIncludedWithArtwork: dataIncludedWithArtwork === true,
      routingType: routingType as any,
      jobMetaType: rest.jobMetaType || null,
      mailFormat: rest.mailFormat || null,
      envelopeComponents: rest.envelopeComponents || null,
      jobType: rest.jobType || null,
      source: 'MANUAL',
    });

    const jobId = job.id;
    console.log(`🛤️ [createJob] Created via unified service: pathway=${pathway} | baseJobId=${baseJobId}`);

    // Auto-create POs for BRADFORD_JD routing
    const poValidation = canCreateImpactPO({ quantity, sizeName, sellPrice });
    const shouldCreatePOs = (routingType === 'BRADFORD_JD' && poValidation.valid) || isBradfordJob;

    if (shouldCreatePOs && (totalCost > 0 || isBradfordJob)) {
      await createBradfordPOs(jobId, jobNo, {
        totalCost,
        paperCost,
        paperMarkup,
        printCost,
        sizeName,
        quantity,
        bradfordPricing,
      });
    } else if (routingType === 'BRADFORD_JD') {
      console.log(`Skipping PO creation for job ${jobNo}: ${poValidation.reason}`);
    }

    // Auto-create vendor PO(s) for non-Bradford vendors
    // Group line items by vendor (per-line vendorId overrides job-level vendorId)
    if (!isBradfordJob && lineItems?.length > 0) {
      const lineItemsByVendor: Record<string, any[]> = {};

      for (const item of lineItems) {
        const itemVendorId = item.vendorId || vendorId;
        if (itemVendorId) {
          if (!lineItemsByVendor[itemVendorId]) {
            lineItemsByVendor[itemVendorId] = [];
          }
          lineItemsByVendor[itemVendorId].push(item);
        }
      }

      // Create one PO per vendor
      for (const [targetVendorId, vendorLineItems] of Object.entries(lineItemsByVendor)) {
        await createVendorPO(jobId, jobNo, targetVendorId, title, quantity, vendorLineItems);
      }
    } else if (vendorId && !isBradfordJob) {
      // Fallback for jobs without line items
      await createVendorPO(jobId, jobNo, vendorId, title, quantity, lineItems || []);
    }

    // Create ProfitSplit record for this job
    if (sellPrice > 0 || totalCost > 0) {
      const split = calculateProfitSplit({
        sellPrice,
        totalCost,
        paperMarkup,
        routingType,
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

      // Auto-initiate email threads (fire and forget)
      initiateBothThreads(jobId)
        .then(({ customerResult, vendorResult }) => {
          console.log(`📧 Thread initiation for job ${jobNo}:`, {
            customer: customerResult.success ? 'sent' : customerResult.error,
            vendor: vendorResult.success ? 'sent' : vendorResult.error,
          });
        })
        .catch((err) => {
          console.error(`Failed to initiate threads for job ${jobNo}:`, err.message);
        });

      // Re-fetch job with ProfitSplit
      const jobWithSplit = await prisma.job.findUnique({
        where: { id: jobId },
        include: JOB_INCLUDE,
      });

      return res.status(201).json(transformJob(jobWithSplit));
    }

    // For jobs without ProfitSplit, still initiate threads
    initiateBothThreads(jobId)
      .then(({ customerResult, vendorResult }) => {
        console.log(`📧 Thread initiation for job ${jobNo}:`, {
          customer: customerResult.success ? 'sent' : customerResult.error,
          vendor: vendorResult.success ? 'sent' : vendorResult.error,
        });
      })
      .catch((err) => {
        console.error(`Failed to initiate threads for job ${jobNo}:`, err.message);
      });

    // Re-fetch job with includes for proper transform
    const jobWithIncludes = await prisma.job.findUnique({
      where: { id: jobId },
      include: JOB_INCLUDE,
    });

    res.status(201).json(transformJob(jobWithIncludes));
  } catch (error: any) {
    console.error('Create job error:', error);
    console.error('Create job error stack:', error.stack);
    console.error('Create job error code:', error.code);
    console.error('Create job error meta:', JSON.stringify(error.meta));

    // Return specific error for Prisma foreign key failures
    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'Invalid customer or vendor ID',
        details: error.meta?.field_name,
      });
    }
    if (error.code === 'P2025') {
      return res.status(400).json({ error: 'Customer or vendor not found' });
    }

    // Return detailed error in development, generic in production
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'Failed to create job'
      : error.message || 'Failed to create job';

    res.status(500).json({
      error: errorMessage,
      code: error.code || undefined,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    });
  }
};

// ============================================================================
// UPDATE OPERATION
// ============================================================================

/**
 * Update existing job
 * - Field locking after invoice generation
 * - Auto-syncs vendor to POs
 * - Recalculates ProfitSplit when pricing changes
 */
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
      bradfordRefNumber,
      bradfordPaperLbs: inputBradfordPaperLbs,
      dataIncludedWithArtwork,
      mailDate,
      inHomesDate,
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
      const attemptedLockedFields = LOCKED_AFTER_INVOICE.filter((field) => {
        if (field === 'sellPrice' && req.body.sellPrice !== undefined) {
          return Number(req.body.sellPrice) !== Number(existingJob.sellPrice);
        }
        if (field === 'quantity' && req.body.quantity !== undefined) {
          return Number(req.body.quantity) !== Number(existingJob.quantity);
        }
        if (field === 'specs' && (req.body.specs !== undefined || req.body.lineItems !== undefined)) {
          return true;
        }
        return false;
      });

      if (attemptedLockedFields.length > 0) {
        return res.status(403).json({
          error: 'Job is locked after invoice generation',
          lockedFields: attemptedLockedFields,
          invoiceGeneratedAt: existingJob.invoiceGeneratedAt,
          hint: 'Create a credit memo or new job for changes',
        });
      }
    }

    // Calculate quantity and totals from line items if provided
    let quantity = existingJob.quantity;
    let lineItemTotal = Number(existingJob.sellPrice) || 0;

    if (lineItems) {
      quantity = lineItems.reduce((sum: number, item: any) => sum + (parseInt(item.quantity) || 0), 0);
      lineItemTotal = lineItems.reduce(
        (sum: number, item: any) => sum + (parseInt(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0),
        0
      );
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
    if (mailDate !== undefined) updateData.mailDate = mailDate ? new Date(mailDate) : null;
    if (inHomesDate !== undefined) updateData.inHomesDate = inHomesDate ? new Date(inHomesDate) : null;
    if (customerId !== undefined) updateData.customerId = customerId;
    if (vendorId !== undefined) updateData.vendorId = vendorId;
    if (notes !== undefined) updateData.notes = notes;
    if (dataIncludedWithArtwork !== undefined) updateData.dataIncludedWithArtwork = dataIncludedWithArtwork === true;

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
      if (inputSellPrice === undefined) {
        updateData.sellPrice = lineItemTotal;
      }
    }

    // Handle financials (update sellPrice from impactCustomerTotal)
    if (financials && financials.impactCustomerTotal !== undefined && inputSellPrice === undefined) {
      updateData.sellPrice = financials.impactCustomerTotal;
    }

    // Guard: Backend pricing validation
    const finalSellPrice = updateData.sellPrice ?? existingJob.sellPrice;
    if (finalSellPrice !== undefined && req.body.allowNegativeMargin !== true) {
      const impactPOs = (existingJob.PurchaseOrder || []).filter(
        (po: any) => po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT
      );
      const totalCost = impactPOs.reduce((sum: number, po: any) => sum + (Number(po.buyCost) || 0), 0);

      if (Number(finalSellPrice) < 0) {
        return res.status(400).json({
          error: 'Sell price cannot be negative',
          sellPrice: finalSellPrice,
        });
      }

      if (totalCost > 0 && Number(finalSellPrice) < totalCost) {
        return res.status(400).json({
          error: `Negative margin: sellPrice ($${Number(finalSellPrice).toFixed(2)}) < totalCost ($${totalCost.toFixed(2)})`,
          sellPrice: finalSellPrice,
          totalCost: totalCost,
          margin: Number(finalSellPrice) - totalCost,
          hint: 'Set allowNegativeMargin=true to override',
        });
      }
    }

    // Log changes to JobActivity
    await logActivityChanges(id, existingJob, req.body);

    // Auto-sync vendor to Impact→Vendor POs when job vendor changes
    if (vendorId !== undefined && vendorId !== existingJob.vendorId) {
      const syncResult = await syncJobVendorToPOs(id, vendorId);
      if (syncResult.count > 0) {
        console.log(`Auto-synced vendor to ${syncResult.count} PO(s) for job ${id}`);
      }
    }

    let job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: JOB_INCLUDE,
    });

    // Auto-create POs if job now meets criteria and doesn't have Impact→Bradford PO
    const poValidation = canCreateImpactPO({
      quantity: job.quantity || 0,
      sizeName: job.sizeName,
      sellPrice: Number(job.sellPrice) || 0,
    });

    const hasImpactPO = (job.PurchaseOrder || []).some(
      (po: any) => po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT && po.targetCompanyId === COMPANY_IDS.BRADFORD
    );

    if (poValidation.valid && !hasImpactPO) {
      console.log(`Auto-creating POs for job ${job.jobNo}: Job now meets criteria`);

      const tierPricing = calculateTierPricing({
        sizeName: job.sizeName!,
        quantity: job.quantity!,
        paperSource: (job.paperSource || 'BRADFORD') as PaperSource,
      });

      await createBradfordPOs(id, job.jobNo, {
        totalCost: tierPricing.tier2.totalCost,
        paperCost: tierPricing.tier1.paperTotal,
        paperMarkup: tierPricing.tier2.paperMarkup,
        printCost: tierPricing.tier1.printTotal,
        sizeName: job.sizeName,
        quantity: job.quantity || 0,
      });
    }

    // Update ProfitSplit if pricing fields changed
    const pricingChanged =
      inputSellPrice !== undefined ||
      inputSizeName !== undefined ||
      inputPaperSource !== undefined ||
      lineItems !== undefined;

    if (pricingChanged) {
      await recalculateProfitSplit(id, job);
    }

    // Re-fetch with updated data
    const updatedJob = await prisma.job.findUnique({
      where: { id },
      include: JOB_INCLUDE,
    });

    res.json(transformJob(updatedJob));
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
};

// ============================================================================
// DELETE OPERATION
// ============================================================================

/**
 * Soft delete a job
 */
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

// ============================================================================
// STATUS OPERATIONS
// ============================================================================

/**
 * Update job status
 */
export const updateJobStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Fetch current job to get workflowStatus for sync
    const currentJob = await prisma.job.findUnique({
      where: { id },
      select: { workflowStatus: true },
    });

    if (!currentJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Sync workflowStatus when status changes to PAID or CANCELLED
    const newWorkflowStatus = syncWorkflowFromStatus(
      status as JobStatus,
      currentJob.workflowStatus
    );

    const job = await prisma.job.update({
      where: { id },
      data: {
        status,
        workflowStatus: newWorkflowStatus,
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

/**
 * Toggle job lock (deprecated - no-op)
 */
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

/**
 * Update Bradford reference number
 */
export const updateBradfordRef = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bradfordRefNumber } = req.body;

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

    const transformed = transformJob(job);
    transformed.bradfordRefNumber = bradfordRefNumber;

    res.json(transformed);
  } catch (error) {
    console.error('Update Bradford ref error:', error);
    res.status(500).json({ error: 'Failed to update Bradford reference' });
  }
};

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Import batch of jobs
 */
export const importBatchJobs = async (req: Request, res: Response) => {
  try {
    const { jobs } = req.body;

    if (!jobs || !Array.isArray(jobs)) {
      return res.status(400).json({ error: 'Invalid jobs data' });
    }

    // === PATHWAY SYSTEM: Use unified batch job creation ===
    // This ensures atomic sequence increment + pathway assignment for all jobs
    const { createJobsUnifiedBatch } = await import('../../services/jobCreationService');

    const inputs = jobs.map((jobData: any) => ({
      title: jobData.title || '',
      customerId: jobData.customerId,
      vendorId: jobData.vendorId || null,
      quantity: jobData.quantity || 0,
      sellPrice: jobData.sellPrice || jobData.customerTotal || 0,
      specs: jobData.specs || {},
      routingType: (jobData.vendorId ? 'THIRD_PARTY_VENDOR' : 'BRADFORD_JD') as 'BRADFORD_JD' | 'THIRD_PARTY_VENDOR',
      source: 'IMPORT' as const,
    }));

    const results = await createJobsUnifiedBatch(inputs);
    console.log(`🛤️ [importBatchJobs] Created ${results.length} jobs via unified service`);

    // Re-fetch jobs with includes for transform
    const createdJobs = await Promise.all(
      results.map(async ({ job }) => {
        const fullJob = await prisma.job.findUnique({
          where: { id: job.id },
          include: {
            Company: true,
            Vendor: true,
          },
        });
        return transformJob(fullJob);
      })
    );

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

/**
 * Batch delete jobs (soft delete)
 */
export const batchDeleteJobs = async (req: Request, res: Response) => {
  try {
    const { jobIds } = req.body;

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: 'Invalid job IDs' });
    }

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

/**
 * Bulk update paper source for multiple jobs
 */
export const bulkUpdatePaperSource = async (req: Request, res: Response) => {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Invalid updates data' });
    }

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

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create Bradford POs (Impact→Bradford and Bradford→JD)
 */
async function createBradfordPOs(
  jobId: string,
  jobNo: string,
  data: {
    totalCost: number;
    paperCost: number;
    paperMarkup: number;
    printCost: number;
    sizeName?: string | null;
    quantity: number;
    bradfordPricing?: any;
  }
) {
  const { totalCost, paperCost, paperMarkup, printCost, sizeName, quantity, bradfordPricing } = data;
  const timestamp = Date.now();

  // Calculate CPM rates
  const printCPMRate =
    bradfordPricing?.printCPM || (quantity > 0 && printCost > 0 ? printCost / (quantity / 1000) : 0);
  const paperCostCPMRate =
    bradfordPricing?.paperCostCPM || (quantity > 0 && paperCost > 0 ? paperCost / (quantity / 1000) : 0);
  const paperSellCPMRate = bradfordPricing?.paperSellCPM || 0;

  // Paper sell total is what Impact pays Bradford for paper
  const paperSellTotal =
    bradfordPricing?.totalPaperSell ||
    (quantity > 0 && paperSellCPMRate > 0 ? paperSellCPMRate * (quantity / 1000) : paperCost + paperMarkup);

  // PO 1: Impact Direct → Bradford
  await prisma.purchaseOrder.create({
    data: {
      id: crypto.randomUUID(),
      jobId,
      originCompanyId: COMPANY_IDS.IMPACT_DIRECT,
      targetCompanyId: COMPANY_IDS.BRADFORD,
      poNumber: `PO-${jobNo}-IB-${timestamp}`,
      description: `Impact to Bradford - ${sizeName || 'Custom'} x ${quantity}`,
      buyCost: totalCost,
      paperCost: paperSellTotal,
      paperMarkup: paperMarkup,
      printCPM: printCPMRate,
      paperCPM: paperSellCPMRate || paperCostCPMRate,
      status: 'PENDING',
      updatedAt: new Date(),
    },
  });

  // PO 2: Bradford → JD Graphic (internal tracking)
  await prisma.purchaseOrder.create({
    data: {
      id: crypto.randomUUID(),
      jobId,
      originCompanyId: COMPANY_IDS.BRADFORD,
      targetCompanyId: COMPANY_IDS.JD_GRAPHIC,
      poNumber: `PO-${jobNo}-BJ-${timestamp}`,
      description: `Bradford to JD - ${sizeName || 'Custom'} x ${quantity}`,
      buyCost: printCost > 0 ? printCost : null,
      mfgCost: printCost > 0 ? printCost : null,
      printCPM: printCPMRate,
      status: 'PENDING',
      updatedAt: new Date(),
    },
  });

  console.log(`📋 Auto-created Bradford POs for job ${jobNo}:`, {
    impactTotalCost: totalCost,
    paperSellTotal,
    bradfordPaperProfit: paperMarkup,
    printCost,
    printCPMRate,
    paperSellCPMRate,
  });
}

/**
 * Create vendor PO for non-Bradford vendors
 */
async function createVendorPO(
  jobId: string,
  jobNo: string,
  vendorId: string,
  title: string,
  quantity: number,
  lineItems: any[]
) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
  });

  if (!vendor || vendor.isPartner) return;

  const vendorTotalCost =
    lineItems?.reduce((sum: number, item: any) => {
      return sum + (parseInt(item.quantity) || 0) * (parseFloat(item.unitCost) || 0);
    }, 0) || 0;

  // Ensure vendor has a code
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

  // Count existing POs for sequence number
  const existingPOCount = await prisma.purchaseOrder.count({
    where: { jobId, targetVendorId: { not: null } },
  });
  const sequenceNum = existingPOCount + 1;

  const poNumber = `${jobNo}-${vendorCode}.${sequenceNum}`;

  const vendorPO = await prisma.purchaseOrder.create({
    data: {
      id: crypto.randomUUID(),
      jobId,
      originCompanyId: COMPANY_IDS.IMPACT_DIRECT,
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
        const job = await prisma.job.findUnique({
          where: { id: jobId },
        });

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
        const specs = job?.specs as Record<string, any> | null;
        const result = await sendVendorPOWithPortalEmail(
          vendorPO,
          { ...job, jobNo, title },
          vendorEmail,
          vendor.name,
          portalUrl,
          { specialInstructions: specs?.specialInstructions || undefined }
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
          console.log(`📧 Auto-sent Vendor PO to ${vendor.email} for job ${jobNo}`);
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

/**
 * Log activity changes for job updates
 */
async function logActivityChanges(id: string, existingJob: any, body: any) {
  const activityPromises: Promise<void>[] = [];

  if (body.title !== undefined && body.title !== existingJob.title) {
    activityPromises.push(logJobChange(id, 'JOB_UPDATED', 'title', existingJob.title, body.title));
  }
  if (body.status !== undefined && body.status !== existingJob.status) {
    activityPromises.push(logJobChange(id, 'STATUS_CHANGED', 'status', existingJob.status, body.status));
  }
  if (body.customerPONumber !== undefined && body.customerPONumber !== existingJob.customerPONumber) {
    activityPromises.push(
      logJobChange(id, 'JOB_UPDATED', 'customerPONumber', existingJob.customerPONumber, body.customerPONumber)
    );
  }
  if (body.quantity !== undefined && body.quantity !== existingJob.quantity) {
    activityPromises.push(logJobChange(id, 'JOB_UPDATED', 'quantity', existingJob.quantity, body.quantity));
  }
  if (body.sellPrice !== undefined && Number(body.sellPrice) !== Number(existingJob.sellPrice)) {
    activityPromises.push(logJobChange(id, 'PRICING_UPDATED', 'sellPrice', existingJob.sellPrice, body.sellPrice));
  }
  if (body.vendorId !== undefined && body.vendorId !== existingJob.vendorId) {
    activityPromises.push(logJobChange(id, 'VENDOR_CHANGED', 'vendorId', existingJob.vendorId, body.vendorId));
  }
  if (body.customerId !== undefined && body.customerId !== existingJob.customerId) {
    activityPromises.push(logJobChange(id, 'JOB_UPDATED', 'customerId', existingJob.customerId, body.customerId));
  }

  await Promise.all(activityPromises);
}

/**
 * Recalculate profit split for a job
 */
async function recalculateProfitSplit(id: string, job: any) {
  const finalSellPrice = Number(job.sellPrice) || 0;
  const finalSizeName = job.sizeName;
  const finalPaperSource = (job.paperSource || 'BRADFORD') as PaperSource;
  const routingType = job.routingType || 'BRADFORD_JD';
  const finalQuantity = job.quantity || 0;

  let totalCost = 0;
  let paperMarkup = 0;
  let paperCost = 0;

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
    const purchaseOrders = job.PurchaseOrder || [];
    totalCost = purchaseOrders.reduce((sum: number, po: any) => sum + (Number(po.buyCost) || 0), 0);
    paperCost = purchaseOrders.reduce((sum: number, po: any) => sum + (Number(po.paperCost) || 0), 0);
    paperMarkup = purchaseOrders.reduce((sum: number, po: any) => sum + (Number(po.paperMarkup) || 0), 0);
  }

  const split = calculateProfitSplit({
    sellPrice: finalSellPrice,
    totalCost,
    paperMarkup,
    routingType,
  });

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
}

/**
 * Update QC override fields for a job
 * Allows staff to manually set QC status when auto-calculation doesn't reflect reality
 */
export const updateQCOverrides = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      // Art override
      artOverride,
      artOverrideNote,
      clearArtOverride,
      // Data override
      dataOverride,
      dataOverrideNote,
      // Vendor override
      vendorConfirmOverride,
      vendorConfirmOverrideNote,
      clearVendorOverride,
      // Proof override
      proofOverride,
      proofOverrideNote,
      // Tracking override
      trackingOverride,
      trackingCarrierOverride,
    } = req.body;

    const now = new Date();
    const updatedBy = 'staff'; // TODO: Get from auth context

    // Build update data object
    const updateData: any = { updatedAt: now };

    // Art override
    if (clearArtOverride) {
      updateData.artOverride = false;
      updateData.artOverrideAt = null;
      updateData.artOverrideBy = null;
      updateData.artOverrideNote = null;
    } else if (artOverride !== undefined) {
      updateData.artOverride = artOverride;
      updateData.artOverrideAt = artOverride ? now : null;
      updateData.artOverrideBy = artOverride ? updatedBy : null;
      if (artOverrideNote !== undefined) updateData.artOverrideNote = artOverrideNote;
    }

    // Data override
    if (dataOverride === null) {
      updateData.dataOverride = null;
      updateData.dataOverrideAt = null;
      updateData.dataOverrideBy = null;
      updateData.dataOverrideNote = null;
    } else if (dataOverride !== undefined) {
      updateData.dataOverride = dataOverride;
      updateData.dataOverrideAt = now;
      updateData.dataOverrideBy = updatedBy;
      if (dataOverrideNote !== undefined) updateData.dataOverrideNote = dataOverrideNote;
    }

    // Vendor override
    if (clearVendorOverride) {
      updateData.vendorConfirmOverride = false;
      updateData.vendorConfirmOverrideAt = null;
      updateData.vendorConfirmOverrideBy = null;
      updateData.vendorConfirmOverrideNote = null;
    } else if (vendorConfirmOverride !== undefined) {
      updateData.vendorConfirmOverride = vendorConfirmOverride;
      updateData.vendorConfirmOverrideAt = vendorConfirmOverride ? now : null;
      updateData.vendorConfirmOverrideBy = vendorConfirmOverride ? updatedBy : null;
      if (vendorConfirmOverrideNote !== undefined) updateData.vendorConfirmOverrideNote = vendorConfirmOverrideNote;
    }

    // Proof override
    if (proofOverride === null) {
      updateData.proofOverride = null;
      updateData.proofOverrideAt = null;
      updateData.proofOverrideBy = null;
      updateData.proofOverrideNote = null;
    } else if (proofOverride !== undefined) {
      updateData.proofOverride = proofOverride;
      updateData.proofOverrideAt = now;
      updateData.proofOverrideBy = updatedBy;
      if (proofOverrideNote !== undefined) updateData.proofOverrideNote = proofOverrideNote;
    }

    // Tracking override
    if (trackingOverride === null) {
      updateData.trackingOverride = null;
      updateData.trackingCarrierOverride = null;
      updateData.trackingOverrideAt = null;
      updateData.trackingOverrideBy = null;
    } else if (trackingOverride !== undefined) {
      updateData.trackingOverride = trackingOverride;
      updateData.trackingOverrideAt = now;
      updateData.trackingOverrideBy = updatedBy;
      if (trackingCarrierOverride !== undefined) updateData.trackingCarrierOverride = trackingCarrierOverride;
    }

    const job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: JOB_INCLUDE,
    });

    // Log activity
    await logJobChange(id, 'QC_OVERRIDE', 'qcOverrides', null, JSON.stringify(req.body));

    res.json(transformJob(job));
  } catch (error) {
    console.error('Update QC overrides error:', error);
    res.status(500).json({ error: 'Failed to update QC overrides' });
  }
};

// Update workflow status override
export const updateWorkflowStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, clearOverride } = req.body;

    const now = new Date();
    const updatedBy = 'staff'; // TODO: Get from auth context

    let updateData: any = { updatedAt: now };

    if (clearOverride) {
      // Clear the override, revert to auto-calculated
      updateData.workflowStatusOverride = null;
      updateData.workflowStatusOverrideAt = null;
      updateData.workflowStatusOverrideBy = null;
    } else if (status) {
      // Set manual override
      updateData.workflowStatusOverride = status;
      updateData.workflowStatusOverrideAt = now;
      updateData.workflowStatusOverrideBy = updatedBy;
    }

    const job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: JOB_INCLUDE,
    });

    // Log activity
    await logJobChange(id, 'WORKFLOW_STATUS_OVERRIDE', 'workflowStatus', null, status || 'cleared');

    res.json(transformJob(job));
  } catch (error) {
    console.error('Update workflow status error:', error);
    res.status(500).json({ error: 'Failed to update workflow status' });
  }
};

// Set active task on a job (production meeting action item)
export const setJobTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { task } = req.body;

    if (!task || !task.trim()) {
      return res.status(400).json({ error: 'Task text is required' });
    }

    const now = new Date();
    const job = await prisma.job.update({
      where: { id },
      data: {
        activeTask: task.trim(),
        activeTaskCreatedAt: now,
        activeTaskCreatedBy: 'staff',
        updatedAt: now,
      },
      include: JOB_INCLUDE,
    });

    // Log to activity
    await logJobChange(id, 'TASK_SET', 'activeTask', null, task.trim());

    res.json(transformJob(job));
  } catch (error) {
    console.error('Set job task error:', error);
    res.status(500).json({ error: 'Failed to set task' });
  }
};

// Complete (clear) active task on a job
export const completeJobTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get current task before clearing for logging
    const currentJob = await prisma.job.findUnique({
      where: { id },
      select: { activeTask: true },
    });

    const now = new Date();
    const job = await prisma.job.update({
      where: { id },
      data: {
        activeTask: null,
        activeTaskCreatedAt: null,
        activeTaskCreatedBy: null,
        updatedAt: now,
      },
      include: JOB_INCLUDE,
    });

    // Log to activity
    if (currentJob?.activeTask) {
      await logJobChange(id, 'TASK_COMPLETED', 'activeTask', currentJob.activeTask, null);
    }

    res.json(transformJob(job));
  } catch (error) {
    console.error('Complete job task error:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
};

// ============================================================================
// EMAIL WEBHOOK - Auto-create jobs from parsed emails (e.g., Lahlouh)
// ============================================================================

// Three Z mailing vendor constants
const THREE_Z_VENDOR = {
  name: 'Three Z Printing',
  email: 'jenny@threez.com',
  phone: '(513) 942-0011',
  address: '150 Lawton Avenue, Monroe, OH 45050',
};

/**
 * Detect if a job is a mailing job (needs mailing vendor like Three Z)
 * vs. a print-only job (just print and ship back to customer)
 */
function isMailingJob(data: {
  mailing?: any;
  timeline?: any;
  notes?: string;
  matchType?: string;
  versions?: any[];
  components?: any[];
}): boolean {
  // Check explicit isDirectMail flag
  if (data.mailing?.isDirectMail === true) return true;

  // Check for mail-related dates in timeline
  if (data.timeline?.mailDate) return true;
  if (data.timeline?.inHomesDate) return true;

  // Check mailing object for dates
  if (data.mailing?.mailDate) return true;
  if (data.mailing?.inHomesDate) return true;

  // Check mailing infrastructure
  if (data.mailing?.dropLocation) return true;
  if (data.mailing?.mailClass) return true;
  if (data.mailing?.presortType) return true;
  if (data.mailing?.mailProcess) return true;

  // If it has a match type (2-way, 3-way), it's likely mailing
  if (data.matchType) return true;

  // Check components for envelope (strong mailing indicator)
  if (data.components?.some((c: any) =>
    c.name?.toLowerCase().includes('envelope') ||
    c.component?.toLowerCase().includes('envelope')
  )) return true;

  // Check notes for mailing keywords
  const notes = data.notes || '';
  const mailingKeywords = /mail date|in-homes|in homes|in home window|usps|presort|drop date|mailing date|standard mail|first class mail/i;
  if (mailingKeywords.test(notes)) return true;

  return false;
}

/**
 * Create a job from a parsed email (webhook from n8n)
 * Used for automated job creation from customer emails like Lahlouh
 *
 * For Lahlouh source:
 * - Automatically creates Three Z mailing vendor PO
 * - Returns mailingVendorId and mailingVendorEmail for n8n to send email
 */
export const createFromEmail = async (req: Request, res: Response) => {
  try {
    const {
      source,           // 'lahlouh' or other customer identifier
      poNumber,         // Customer's PO number (e.g., OHP13562)
      customerJobNumber, // Customer's job number (e.g., OH174385)
      title,            // Job title/description
      quantity,         // Total quantity
      notes,            // Full email body as notes
      fileLinks,        // Array of file URLs
      mailDate,         // Mail drop date
      inHomesDate,      // In-home window date
      // From PDF parsing
      parsedSpecs,      // AI-parsed specs from PDF
      lineItems,        // Parsed line items with quantities/prices
      sellPrice,        // Customer sell price from PDF
      // Enhanced Lahlouh data
      versions,         // Multi-version breakdown [{version, qty, phone}]
      components,       // Component breakdown [{name, supplier, specs}]
      matchType,        // "2-WAY" | "3-WAY"
      mailing,          // Mailing details {isDirectMail, mailClass, etc.}
      timeline,         // All dates from PO
    } = req.body;

    console.log(`[createFromEmail] Received webhook from source: ${source}`);
    console.log(`[createFromEmail] PO: ${poNumber}, Job: ${customerJobNumber}`);

    // Validate required fields
    if (!source || !title) {
      return res.status(400).json({ error: 'Missing required fields: source, title' });
    }

    // Find customer by source name (case-insensitive)
    let customer = await prisma.company.findFirst({
      where: {
        name: { contains: source, mode: 'insensitive' },
        type: 'CUSTOMER',
      },
    });

    // If not found, create the customer
    if (!customer) {
      customer = await prisma.company.create({
        data: {
          id: crypto.randomUUID(),
          name: source.charAt(0).toUpperCase() + source.slice(1), // Capitalize
          type: 'CUSTOMER',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      console.log(`[createFromEmail] Created new customer: ${customer.name}`);
    }

    // Check for duplicate by customerJobNumber to avoid re-processing
    if (customerJobNumber) {
      const existing = await prisma.job.findFirst({
        where: {
          customerJobNumber,
          deletedAt: null,
        },
      });
      if (existing) {
        console.log(`[createFromEmail] Job already exists for ${customerJobNumber}: ${existing.jobNo}`);
        return res.status(200).json({
          success: true,
          duplicate: true,
          jobId: existing.id,
          jobNo: existing.jobNo,
          message: 'Job already exists',
        });
      }
    }

    // Build specs - merge file links with parsed specs from PDF
    const specs: Record<string, any> = {
      ...(parsedSpecs || {}),
      // Store enhanced Lahlouh data in specs
      versions: versions || null,
      components: components || null,
      mailing: mailing || null,
      timeline: timeline || null,
      // Ensure raw job description is preserved for vendor POs
      rawJobDescription: parsedSpecs?.rawJobDescription || parsedSpecs?.rawDescriptionText || req.body.rawJobDescription || null,
      rawDescriptionText: parsedSpecs?.rawDescriptionText || parsedSpecs?.rawJobDescription || req.body.rawDescriptionText || null,
    };
    if (fileLinks && Array.isArray(fileLinks) && fileLinks.length > 0) {
      specs.artworkUrl = fileLinks[0]; // Primary link
      specs.additionalLinks = fileLinks.slice(1); // Additional links
    }
    // Include line items in specs for PDF generation
    if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
      specs.lineItems = lineItems;
    }

    // Check if this is a Lahlouh job and determine if it needs mailing vendor
    const isLahlouhJob = source?.toLowerCase() === 'lahlouh';
    const isMailing = isMailingJob({ mailing, timeline, notes, matchType, versions, components });
    const needsMailingVendor = isLahlouhJob && isMailing;
    let mailingVendorId: string | null = null;
    let mailingVendorEmail: string | null = null;

    console.log(`[createFromEmail] Job classification: isLahlouh=${isLahlouhJob}, isMailing=${isMailing}, needsMailingVendor=${needsMailingVendor}`);

    // Find or create Three Z vendor for Lahlouh jobs
    if (needsMailingVendor) {
      let threeZVendor = await prisma.vendor.findFirst({
        where: {
          OR: [
            { name: { contains: 'Three Z', mode: 'insensitive' } },
            { name: { contains: 'ThreeZ', mode: 'insensitive' } },
            { email: THREE_Z_VENDOR.email },
          ],
        },
      });

      if (!threeZVendor) {
        threeZVendor = await prisma.vendor.create({
          data: {
            id: crypto.randomUUID(),
            name: THREE_Z_VENDOR.name,
            email: THREE_Z_VENDOR.email,
            phone: THREE_Z_VENDOR.phone,
            streetAddress: THREE_Z_VENDOR.address,
            isActive: true,
            isPartner: false,
            updatedAt: new Date(),
          },
        });
        console.log(`[createFromEmail] Created Three Z vendor: ${threeZVendor.id}`);
      }

      mailingVendorId = threeZVendor.id;
      mailingVendorEmail = threeZVendor.email;
    }

    // Create the job
    // Print-only Lahlouh jobs are flagged in notes for manual vendor assignment
    const isPrintOnlyLahlouh = isLahlouhJob && !isMailing;
    const jobNotes = isPrintOnlyLahlouh
      ? `${notes || ''}\n\n[AUTO] Print-only Lahlouh job - no mailing signals detected. Needs manual vendor assignment.`
      : notes;

    // Calculate initial QC flags based on available data
    const tempJobForQc = {
      mailingVendorId,
      matchType: matchType || null,
      mailDate: mailDate ? new Date(mailDate) : (timeline?.mailDate ? new Date(timeline.mailDate) : null),
      inHomesDate: inHomesDate ? new Date(inHomesDate) : (timeline?.inHomesDate ? new Date(timeline.inHomesDate) : null),
      notes: jobNotes,
      specs,
      artOverride: false,
      dataOverride: null,
      dataIncludedWithArtwork: false,
    } as any;
    const qcFlags = determineInitialQcFlags(tempJobForQc, specs);

    // === PATHWAY SYSTEM: Use unified job creation service ===
    // This ensures atomic sequence increment + pathway assignment
    const { job: createdJob, jobNo, baseJobId, pathway } = await createJobUnified({
      title,
      customerId: customer.id,
      vendorId: mailingVendorId || null,
      quantity: quantity ? parseInt(String(quantity)) : 0,
      sellPrice: sellPrice ? parseFloat(String(sellPrice)) : 0,
      status: 'ACTIVE',
      specs,
      customerPONumber: poNumber || null,
      customerJobNumber: customerJobNumber || null,
      notes: jobNotes || null,
      mailDate: mailDate ? new Date(mailDate) : (timeline?.mailDate ? new Date(timeline.mailDate) : null),
      inHomesDate: inHomesDate ? new Date(inHomesDate) : (timeline?.inHomesDate ? new Date(timeline.inHomesDate) : null),
      // Detect mailing job type for proper type code
      jobMetaType: isMailing ? 'MAILING' : null,
      routingType: 'THIRD_PARTY_VENDOR', // Email jobs use external vendors
      source: 'EMAIL',
    });

    console.log(`🛤️ [createFromEmail] Created via unified service: pathway=${pathway} | baseJobId=${baseJobId}`);

    // Update with extra fields not in unified service
    const job = await prisma.job.update({
      where: { id: createdJob.id },
      data: {
        workflowStatus: 'NEW_JOB',
        mailingVendorId: mailingVendorId,
        matchType: matchType || null,
        readinessStatus: 'INCOMPLETE',
        qcArtwork: qcFlags.qcArtwork,
        qcDataFiles: qcFlags.qcDataFiles,
        qcMailing: qcFlags.qcMailing,
        qcSuppliedMaterials: qcFlags.qcSuppliedMaterials,
        qcVersions: qcFlags.qcVersions,
      },
      include: JOB_INCLUDE,
    });

    // Create JobComponents from parsed components (if any)
    if (components && Array.isArray(components) && components.length > 0) {
      for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        try {
          await prisma.jobComponent.create({
            data: {
              jobId: job.id,
              name: comp.name || `Component ${i + 1}`,
              description: comp.description || null,
              quantity: comp.quantity ? parseInt(String(comp.quantity)) : null,
              supplier: comp.supplier === 'LAHLOUH' ? 'LAHLOUH' : (comp.supplier === 'THIRD_PARTY' ? 'THIRD_PARTY' : 'JD'),
              supplierName: comp.supplierName || null,
              artworkStatus: comp.artworkUrl ? 'RECEIVED' : 'PENDING',
              artworkLink: comp.artworkUrl || null,
              materialStatus: comp.supplier === 'JD' ? 'NA' : 'PENDING',
              specs: comp.specs || null,
              notes: comp.notes || null,
              sortOrder: i,
            },
          });
        } catch (compError) {
          console.error(`[createFromEmail] Failed to create component ${comp.name}:`, compError);
        }
      }
      console.log(`[createFromEmail] Created ${components.length} job components`);
    }

    // Calculate final readiness
    await updateJobReadiness(job.id);

    console.log(`[createFromEmail] Created job ${jobNo} for ${customer.name}`);
    console.log(`[createFromEmail] Versions: ${versions?.length || 0}, Components: ${components?.length || 0}, MatchType: ${matchType || 'none'}`);

    // For Lahlouh jobs, create Three Z vendor PO
    let mailingPONumber: string | null = null;
    if (mailingVendorId) {
      try {
        const poNumber = `${jobNo}-MAIL-${Date.now()}`;
        await prisma.purchaseOrder.create({
          data: {
            id: crypto.randomUUID(),
            jobId: job.id,
            originCompanyId: COMPANY_IDS.IMPACT_DIRECT,
            targetVendorId: mailingVendorId,
            poNumber,
            description: `Mailing Services - ${title}`,
            specialInstructions: formatMailingInstructions(versions, components, matchType, fileLinks),
            status: 'PENDING',
            updatedAt: new Date(),
          },
        });
        mailingPONumber = poNumber;
        console.log(`[createFromEmail] Created Three Z PO: ${poNumber}`);
      } catch (poError) {
        console.error(`[createFromEmail] Failed to create Three Z PO:`, poError);
      }
    }

    res.status(201).json({
      success: true,
      jobId: job.id,
      jobNo: job.jobNo,
      customerId: customer.id,
      customerName: customer.name,
      // Job classification
      isLahlouhJob,
      isMailingJob: isMailing,
      isPrintOnly: isPrintOnlyLahlouh,
      // For n8n to send Three Z email
      mailingVendorId,
      mailingVendorEmail,
      mailingPONumber,
      // Return structured data for Three Z email
      threeZEmailData: mailingVendorId ? {
        lahlouhPO: poNumber,
        lahlouhJob: customerJobNumber,
        jdJob: jobNo,
        mailDate: mailDate || timeline?.mailDate || null,
        inHomesDate: inHomesDate || timeline?.inHomesDate || null,
        versions: versions || [],
        components: components || [],
        matchType: matchType || null,
        fileLinks: fileLinks || [],
        totalQuantity: quantity,
      } : null,
    });
  } catch (error) {
    console.error('Create from email error:', error);
    res.status(500).json({ error: 'Failed to create job from email' });
  }
};

// ============================================================================
// MAILING DETECTION
// ============================================================================

/**
 * POST /api/jobs/detect-mailing-type
 *
 * Detect if parsed job data indicates a mailing job and suggest mail format.
 * Used by ParsedJobReviewModal for preview before submission.
 */
export const detectMailingTypeEndpoint = async (req: Request, res: Response) => {
  try {
    const data: MailingDetectionInput = req.body;

    const result = detectMailingType(data);

    res.json({
      isMailing: result.isMailing,
      suggestedFormat: result.suggestedFormat,
      confidence: result.confidence,
      signals: result.signals,
      envelopeComponents: result.envelopeComponents,
    });
  } catch (error) {
    console.error('Mailing type detection error:', error);
    res.status(500).json({ error: 'Failed to detect mailing type' });
  }
};

/**
 * Format mailing instructions for Three Z PO
 */
function formatMailingInstructions(
  versions: any[] | null,
  components: any[] | null,
  matchType: string | null,
  fileLinks: string[] | null
): string {
  const lines: string[] = [];

  if (matchType) {
    lines.push(`MATCH TYPE: ${matchType}`);
    lines.push('');
  }

  if (versions && versions.length > 0) {
    lines.push('VERSIONS:');
    versions.forEach((v: any) => {
      lines.push(`- ${v.version || v.versionName}: ${v.qty || v.quantity} qty${v.phone ? ` (${v.phone})` : ''}`);
    });
    lines.push('');
  }

  if (components && components.length > 0) {
    lines.push('COMPONENTS:');
    components.forEach((c: any) => {
      const supplier = c.supplier?.toUpperCase() || 'TBD';
      lines.push(`- [${supplier}] ${c.name}${c.specs ? `: ${c.specs}` : ''}`);
    });
    lines.push('');
  }

  if (fileLinks && fileLinks.length > 0) {
    lines.push('ARTWORK FILES:');
    fileLinks.forEach((link: string) => {
      lines.push(`- ${link}`);
    });
  }

  return lines.join('\n');
}
