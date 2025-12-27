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
import { COMPANY_IDS } from '../../constants';
import {
  canCreateImpactPO,
  transformJob,
  logJobChange,
  JOB_INCLUDE,
  JOB_INCLUDE_FULL,
} from './jobsHelpers';

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

    const jobId = crypto.randomUUID();

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
    };

    // Final validation: ensure sellPrice is valid before saving
    if (!sellPrice || sellPrice <= 0) {
      return res.status(400).json({ error: 'Sell price is required and must be greater than 0' });
    }

    const job = await prisma.job.create({
      data: {
        id: jobId,
        jobNo,
        title: title || '',
        customerId,
        vendorId: vendorId || null,
        status: status || 'ACTIVE',
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
      include: JOB_INCLUDE,
    });

    // Auto-create POs for BRADFORD_JD routing
    const routingType = rest.routingType || 'BRADFORD_JD';
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

    // Auto-create vendor PO for non-Bradford vendors
    if (vendorId && !isBradfordJob) {
      await createVendorPO(jobId, jobNo, vendorId, title, quantity, lineItems);
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

    res.status(201).json(transformJob(job));
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Failed to create job' });
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

    const createdJobs = [];

    for (const jobData of jobs) {
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
