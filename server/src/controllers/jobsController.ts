import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

// Helper to transform job to expected frontend format
function transformJob(job: any) {
  // Calculate revenue from customerTotal or impactCustomerTotal
  const revenue = job.impactCustomerTotal ? Number(job.impactCustomerTotal) :
                  job.customerTotal ? Number(job.customerTotal) : 0;
  const quantity = job.quantity || 0;
  // Calculate CPM (cost per thousand)
  const unitPrice = quantity > 0 ? (revenue / quantity) : 0;

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
    // Bradford ref number (using customerPONumber as workaround)
    bradfordRefNumber: job.customerPONumber || '',
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
    // Transform flat financial fields to financials object for frontend
    financials: {
      impactCustomerTotal: revenue,
      jdServicesTotal: job.jdTotal ? Number(job.jdTotal) : 0,
      bradfordPaperCost: job.bradfordTotal ? Number(job.bradfordTotal) : 0,
      paperMarkupAmount: job.impactMargin ? Number(job.impactMargin) : 0,
      calculatedSpread: job.bradfordCut ? Number(job.bradfordCut) : 0,
      bradfordShareAmount: job.bradfordTotalMargin ? Number(job.bradfordTotalMargin) : 0,
      // Also include impactCostFromBradford for display
      impactCostFromBradford: (job.bradfordTotal ? Number(job.bradfordTotal) : 0) +
                              (job.impactMargin ? Number(job.impactMargin) : 0) +
                              (job.jdTotal ? Number(job.jdTotal) : 0) +
                              (job.bradfordTotalMargin ? Number(job.bradfordTotalMargin) : 0),
    },
    // Create lineItems from quantity for frontend compatibility
    // Note: paperCostCPM is "per thousand" so divide by 1000 to get per-unit cost
    lineItems: quantity > 0 ? [{
      id: 'main',
      description: job.title || 'Main Item',
      quantity: quantity,
      unitCost: job.paperCostCPM ? Number(job.paperCostCPM) / 1000 : 0,
      markupPercent: 0,
      unitPrice: unitPrice,
    }] : [],
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
    const { lineItems, specs, financials, customerId, vendorId, title, status, notes, customerPONumber, dueDate, ...rest } = req.body;

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

    // Calculate quantity from line items
    const quantity = lineItems?.reduce((sum: number, item: any) => sum + (parseInt(item.quantity) || 0), 0) || 0;

    // Calculate customer total from line items
    const customerTotal = lineItems?.reduce((sum: number, item: any) =>
      sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)), 0) || 0;

    const job = await prisma.job.create({
      data: {
        id: crypto.randomUUID(),
        jobNo,
        title: title || '',
        customerId,
        vendorId: vendorId || null,
        status: status || 'PENDING',
        specs: specs || {},
        quantity,
        customerTotal,
        customerCPM: quantity > 0 ? (customerTotal / quantity) * 1000 : 0,
        customerPONumber: customerPONumber || null,
        deliveryDate: dueDate ? new Date(dueDate) : null,
        // Financial fields from financials object
        jdTotal: financials?.jdServicesTotal || null,
        bradfordTotal: financials?.bradfordPaperCost || null,
        impactMargin: financials?.paperMarkupAmount || null,
        impactCustomerTotal: financials?.impactCustomerTotal || customerTotal,
        updatedAt: new Date(),
      },
      include: {
        Company: true,
        Vendor: true,
      },
    });

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
    const { lineItems, specs, financials, title, status, notes, customerPONumber, dueDate, customerId, vendorId, ...rest } = req.body;

    // Get existing job
    const existingJob = await prisma.job.findUnique({
      where: { id },
      include: { Vendor: true },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Calculate quantity and totals from line items if provided
    let quantity = existingJob.quantity;
    let customerTotal = existingJob.customerTotal;

    if (lineItems) {
      quantity = lineItems.reduce((sum: number, item: any) => sum + (parseInt(item.quantity) || 0), 0);
      customerTotal = lineItems.reduce((sum: number, item: any) =>
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
    if (lineItems !== undefined) {
      updateData.quantity = quantity;
      updateData.customerTotal = customerTotal;
      updateData.customerCPM = (quantity && quantity > 0) ? (Number(customerTotal) / quantity) * 1000 : 0;
    }

    // Handle financials
    if (financials) {
      if (financials.jdServicesTotal !== undefined) updateData.jdTotal = financials.jdServicesTotal;
      if (financials.bradfordPaperCost !== undefined) updateData.bradfordTotal = financials.bradfordPaperCost;
      if (financials.paperMarkupAmount !== undefined) updateData.impactMargin = financials.paperMarkupAmount;
      if (financials.impactCustomerTotal !== undefined) updateData.impactCustomerTotal = financials.impactCustomerTotal;

      // Calculate Bradford cut/spread if we have the data
      const impactCustomerTotal = financials.impactCustomerTotal || Number(existingJob.impactCustomerTotal) || 0;
      const jdTotal = financials.jdServicesTotal || Number(existingJob.jdTotal) || 0;
      const bradfordTotal = financials.bradfordPaperCost || Number(existingJob.bradfordTotal) || 0;
      const paperMarkup = financials.paperMarkupAmount || Number(existingJob.impactMargin) || 0;

      const impactBaseCost = bradfordTotal + paperMarkup + jdTotal;
      const spread = impactCustomerTotal - impactBaseCost;
      const bradfordShare = spread * 0.5;

      updateData.bradfordCut = spread;
      updateData.bradfordTotalMargin = bradfordShare;
    }

    const job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: {
        Company: true,
        Vendor: true,
      },
    });

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

// Update Bradford reference number - maps to customerPONumber or similar field
export const updateBradfordRef = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bradfordRefNumber } = req.body;

    // Production schema doesn't have bradfordRefNumber, use customerPONumber as workaround
    const job = await prisma.job.update({
      where: { id },
      data: {
        customerPONumber: bradfordRefNumber,
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
          status: 'PENDING',
          specs: jobData.specs || {},
          quantity: jobData.quantity || 0,
          customerTotal: jobData.customerTotal || 0,
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
