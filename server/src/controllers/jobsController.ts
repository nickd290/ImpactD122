import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { calculateBradfordPricing, validateBradfordFinancials } from '../services/bradfordPricingService';

// Get all jobs
export const getAllJobs = async (req: Request, res: Response) => {
  try {
    const jobs = await prisma.job.findMany({
      include: {
        customer: true,
        vendor: true,
        lineItems: true,
        specs: true,
        financials: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(jobs);
  } catch (error) {
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
        customer: true,
        vendor: true,
        lineItems: {
          orderBy: { sortOrder: 'asc' },
        },
        specs: true,
        financials: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job' });
  }
};

// Create job
export const createJob = async (req: Request, res: Response) => {
  try {
    const { lineItems, specs, financials, ...jobData } = req.body;

    // Generate job number
    const lastJob = await prisma.job.findFirst({
      orderBy: { number: 'desc' },
    });

    let jobNumber = 'J-1001';
    if (lastJob) {
      const lastNumber = parseInt(lastJob.number.split('-')[1]);
      jobNumber = `J-${(lastNumber + 1).toString().padStart(4, '0')}`;
    }

    const job = await prisma.job.create({
      data: {
        ...jobData,
        number: jobNumber,
        lineItems: lineItems ? {
          create: lineItems.map((item: any, index: number) => ({
            ...item,
            sortOrder: index,
          })),
        } : undefined,
        specs: specs ? {
          create: {
            ...specs,
            // Convert string types to proper types
            pageCount: specs.pageCount ? parseInt(specs.pageCount) : null,
            coverType: specs.coverType || null,
            bindingStyle: specs.bindingStyle || null,
          }
        } : undefined,
        financials: financials ? { create: financials } : undefined,
      },
      include: {
        customer: true,
        vendor: true,
        lineItems: true,
        specs: true,
        financials: true,
      },
    });

    res.status(201).json(job);
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
};

// Update job
export const updateJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { lineItems, specs, financials, ...jobData } = req.body;

    // Check if job is locked
    const existingJob = await prisma.job.findUnique({
      where: { id },
      include: {
        vendor: true,
      },
    });

    if (existingJob?.locked) {
      return res.status(403).json({ error: 'Job is locked and cannot be modified' });
    }

    // Process Bradford partner financials if provided
    let processedFinancials = financials;
    if (financials && existingJob?.vendor?.isPartner) {
      // Check if this is Bradford partner pricing with new fields
      const hasBradfordFields = financials.jdServicesTotal !== undefined ||
        financials.bradfordPaperCost !== undefined ||
        financials.paperMarkupAmount !== undefined ||
        financials.impactCustomerTotal !== undefined;

      if (hasBradfordFields) {
        // Validate inputs
        const validation = validateBradfordFinancials({
          impactCustomerTotal: financials.impactCustomerTotal || 0,
          jdServicesTotal: financials.jdServicesTotal || 0,
          bradfordPaperCost: financials.bradfordPaperCost || 0,
          paperMarkupAmount: financials.paperMarkupAmount || 0,
        });

        if (!validation.isValid) {
          return res.status(400).json({
            error: 'Invalid Bradford financials',
            details: validation.errors,
          });
        }

        // Calculate all derived fields
        const calculated = calculateBradfordPricing({
          impactCustomerTotal: financials.impactCustomerTotal,
          jdServicesTotal: financials.jdServicesTotal,
          bradfordPaperCost: financials.bradfordPaperCost,
          paperMarkupAmount: financials.paperMarkupAmount,
        });

        // Merge calculated fields with input
        processedFinancials = {
          ...financials,
          calculatedSpread: calculated.calculatedSpread,
          bradfordShareAmount: calculated.bradfordShareAmount,
          impactCostFromBradford: calculated.impactCostFromBradford,
        };

        // Include warnings if any
        if (validation.warnings.length > 0) {
          console.warn('Bradford pricing warnings:', validation.warnings);
        }
      }
    }

    const job = await prisma.job.update({
      where: { id },
      data: {
        ...jobData,
        lineItems: lineItems ? {
          deleteMany: {},
          create: lineItems.map((item: any, index: number) => ({
            description: item.description,
            quantity: parseFloat(item.quantity) || 0,
            unitCost: parseFloat(item.unitCost) || 0,
            markupPercent: parseFloat(item.markupPercent) || 0,
            unitPrice: parseFloat(item.unitPrice) || 0,
            sortOrder: index,
          })),
        } : undefined,
        specs: specs ? {
          upsert: {
            create: specs,
            update: specs,
          },
        } : undefined,
        financials: processedFinancials ? {
          upsert: {
            create: processedFinancials,
            update: processedFinancials,
          },
        } : undefined,
      },
      include: {
        customer: true,
        vendor: true,
        lineItems: true,
        specs: true,
        financials: true,
      },
    });

    res.json(job);
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
};

// Delete job
export const deleteJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if job is locked
    const existingJob = await prisma.job.findUnique({
      where: { id },
    });

    if (existingJob?.locked) {
      return res.status(403).json({ error: 'Job is locked and cannot be deleted' });
    }

    await prisma.job.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
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
      data: { status },
      include: {
        customer: true,
        vendor: true,
        lineItems: true,
        specs: true,
        financials: true,
      },
    });

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update job status' });
  }
};

// Lock/unlock job
export const toggleJobLock = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingJob = await prisma.job.findUnique({
      where: { id },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = await prisma.job.update({
      where: { id },
      data: { locked: !existingJob.locked },
      include: {
        customer: true,
        vendor: true,
        lineItems: true,
        specs: true,
        financials: true,
      },
    });

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle job lock' });
  }
};

// Update Bradford reference number
export const updateBradfordRef = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bradfordRefNumber } = req.body;

    const job = await prisma.job.update({
      where: { id },
      data: { bradfordRefNumber },
      include: {
        customer: true,
        vendor: true,
        lineItems: true,
        specs: true,
        financials: true,
      },
    });

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update Bradford reference' });
  }
};

// Import batch jobs from Excel
export const importBatchJobs = async (req: Request, res: Response) => {
  try {
    const { jobs, entityMappings } = req.body;

    if (!jobs || !Array.isArray(jobs)) {
      return res.status(400).json({ error: 'Invalid jobs data' });
    }

    const createdJobs = [];
    const entityCache: { [key: string]: string } = {}; // Cache created entity IDs

    // Process each job
    for (const jobData of jobs) {
      // Handle customer entity
      let customerId: string | undefined;
      if (jobData.customerName && entityMappings?.customers?.[jobData.customerName]) {
        const mapping = entityMappings.customers[jobData.customerName];
        if (mapping.action === 'create') {
          // Check if we already created this customer
          if (entityCache[`customer-${jobData.customerName}`]) {
            customerId = entityCache[`customer-${jobData.customerName}`];
          } else {
            // Create new customer
            const customer = await prisma.entity.create({
              data: {
                type: 'CUSTOMER',
                name: jobData.customerName,
                contactPerson: '',
                email: jobData.customerEmail || '',
                phone: jobData.customerPhone || '',
                address: '',
                notes: '',
              },
            });
            customerId = customer.id;
            entityCache[`customer-${jobData.customerName}`] = customer.id;
          }
        } else {
          customerId = mapping.entityId;
        }
      }

      // Handle vendor entity
      let vendorId: string | undefined;
      if (jobData.vendorName && entityMappings?.vendors?.[jobData.vendorName]) {
        const mapping = entityMappings.vendors[jobData.vendorName];
        if (mapping.action === 'create') {
          // Check if we already created this vendor
          if (entityCache[`vendor-${jobData.vendorName}`]) {
            vendorId = entityCache[`vendor-${jobData.vendorName}`];
          } else {
            // Create new vendor
            const vendor = await prisma.entity.create({
              data: {
                type: 'VENDOR',
                name: jobData.vendorName,
                contactPerson: '',
                email: jobData.vendorEmail || '',
                phone: jobData.vendorPhone || '',
                address: '',
                notes: '',
              },
            });
            vendorId = vendor.id;
            entityCache[`vendor-${jobData.vendorName}`] = vendor.id;
          }
        } else {
          vendorId = mapping.entityId;
        }
      }

      // Generate job number
      const lastJob = await prisma.job.findFirst({
        orderBy: { number: 'desc' },
      });

      let jobNumber = 'J-1001';
      if (lastJob) {
        const lastNumber = parseInt(lastJob.number.split('-')[1]);
        jobNumber = `J-${(lastNumber + 1 + createdJobs.length).toString().padStart(4, '0')}`;
      }

      // Skip jobs without required customer and vendor
      if (!customerId || !vendorId) {
        console.warn(`Skipping job "${jobData.title}" - missing customer or vendor`);
        continue;
      }

      // Create job
      const job = await prisma.job.create({
        data: {
          title: jobData.title,
          number: jobNumber,
          status: jobData.status || 'DRAFT',
          notes: jobData.notes || '',
          customerPONumber: jobData.customerPONumber || '',
          dueDate: jobData.dueDate ? new Date(jobData.dueDate) : null,
          customerId,
          vendorId,
          lineItems: jobData.lineItems ? {
            create: jobData.lineItems.map((item: any, index: number) => ({
              description: item.description,
              quantity: parseFloat(item.quantity) || 1,
              unitCost: parseFloat(item.unitCost) || 0,
              markupPercent: parseFloat(item.markupPercent) || 20,
              unitPrice: parseFloat(item.unitPrice) || 0,
              sortOrder: index,
            })),
          } : undefined,
          specs: jobData.specs ? {
            create: {
              productType: jobData.specs.productType || 'OTHER',
              colors: jobData.specs.colors || null,
              coating: jobData.specs.coating || null,
              finishing: jobData.specs.finishing || null,
              flatSize: jobData.specs.flatSize || null,
              finishedSize: jobData.specs.finishedSize || null,
              paperType: jobData.specs.paperType || null,
              pageCount: jobData.specs.pageCount ? parseInt(jobData.specs.pageCount) : null,
              bindingStyle: jobData.specs.bindingStyle || null,
              coverType: jobData.specs.coverType || null,
              coverPaperType: jobData.specs.coverPaperType || null,
            },
          } : undefined,
        },
        include: {
          customer: true,
          vendor: true,
          lineItems: true,
          specs: true,
        },
      });

      createdJobs.push(job);
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

    // Check for locked jobs
    const lockedJobs = await prisma.job.findMany({
      where: {
        id: { in: jobIds },
        locked: true,
      },
      select: { id: true, number: true, title: true },
    });

    if (lockedJobs.length > 0) {
      return res.status(403).json({
        error: 'Cannot delete locked jobs',
        lockedJobs: lockedJobs.map((j: any) => ({ id: j.id, number: j.number, title: j.title })),
      });
    }

    // Delete jobs
    const result = await prisma.job.deleteMany({
      where: {
        id: { in: jobIds },
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

