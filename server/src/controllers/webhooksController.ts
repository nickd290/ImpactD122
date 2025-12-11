import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';

/**
 * Webhook payload from Impact Customer Portal
 */
interface PortalJobPayload {
  jobNo: string;
  title?: string;
  companyId: string;
  companyName: string;
  customerPONumber?: string;
  sizeName?: string;
  quantity?: number;
  specs?: Record<string, any>;
  status?: string;
  deliveryDate?: string;
  createdAt: string;
  externalJobId: string; // The portal's job ID
}

/**
 * Validate webhook secret from header
 */
function validateWebhookSecret(req: Request): boolean {
  const secret = req.headers['x-webhook-secret'];
  const expectedSecret = process.env.PORTAL_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error('PORTAL_WEBHOOK_SECRET not configured');
    return false;
  }

  if (!secret || secret !== expectedSecret) {
    return false;
  }

  return true;
}

/**
 * Find or create customer company by name
 */
async function findOrCreateCustomer(companyName: string, companyId?: string): Promise<string> {
  // First try to find by name (case-insensitive)
  const existingCompany = await prisma.company.findFirst({
    where: {
      name: {
        equals: companyName,
        mode: 'insensitive',
      },
      type: 'CUSTOMER',
    },
  });

  if (existingCompany) {
    return existingCompany.id;
  }

  // Create new customer company
  const newCompany = await prisma.company.create({
    data: {
      id: companyId || crypto.randomUUID(),
      name: companyName,
      type: 'CUSTOMER',
      updatedAt: new Date(),
    },
  });

  console.log(`Created new customer company: ${newCompany.name} (${newCompany.id})`);
  return newCompany.id;
}

/**
 * Map portal status to ImpactD122 JobStatus
 */
function mapStatus(portalStatus?: string): 'ACTIVE' | 'PAID' | 'CANCELLED' {
  if (!portalStatus) return 'ACTIVE';

  const statusMap: Record<string, 'ACTIVE' | 'PAID' | 'CANCELLED'> = {
    'DRAFT': 'ACTIVE',
    'PO_RECEIVED': 'ACTIVE',
    'SUBMITTED': 'ACTIVE',
    'IN_PRODUCTION': 'ACTIVE',
    'SHIPPED': 'ACTIVE',
    'DELIVERED': 'ACTIVE',
    'COMPLETED': 'PAID',
    'PAID': 'PAID',
    'CANCELLED': 'CANCELLED',
  };

  return statusMap[portalStatus.toUpperCase()] || 'ACTIVE';
}

/**
 * Generate the next job number in ImpactD122's J-XXXX format
 */
async function generateJobNumber(): Promise<string> {
  const lastJob = await prisma.job.findFirst({
    orderBy: { jobNo: 'desc' },
    where: {
      jobNo: { startsWith: 'J-' }
    }
  });

  let nextNumber = 1001;
  if (lastJob) {
    const match = lastJob.jobNo.match(/J-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1]) + 1;
    }
  }

  return `J-${nextNumber.toString().padStart(4, '0')}`;
}

/**
 * POST /api/webhooks/jobs
 * Receive job data from Impact Customer Portal
 */
export async function receiveJobWebhook(req: Request, res: Response) {
  try {
    // Validate webhook secret
    if (!validateWebhookSecret(req)) {
      console.warn('Webhook authentication failed - invalid or missing X-Webhook-Secret');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing webhook secret'
      });
    }

    const payload: PortalJobPayload = req.body;

    // Validate required fields
    if (!payload.jobNo || !payload.companyName || !payload.externalJobId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: jobNo, companyName, externalJobId',
      });
    }

    console.log(`📥 Received webhook for job ${payload.jobNo} from portal`);

    // Find or create the customer company
    const customerId = await findOrCreateCustomer(payload.companyName, payload.companyId);

    // Check if job already exists by externalJobId
    const existingJob = await prisma.job.findUnique({
      where: { externalJobId: payload.externalJobId },
    });

    let job;

    // Build specs with external job number included for reference
    const jobSpecs = {
      ...(payload.specs || {}),
      externalJobNo: payload.jobNo,  // Store external job/release number in specs
    };

    const jobData = {
      customerId,
      title: payload.title || `Job from ${payload.companyName}`,
      customerPONumber: payload.customerPONumber || payload.jobNo,  // Use external jobNo as PO if not provided
      sizeName: payload.sizeName,
      quantity: payload.quantity,
      specs: jobSpecs,
      status: mapStatus(payload.status),
      deliveryDate: payload.deliveryDate ? new Date(payload.deliveryDate) : null,
      externalJobId: payload.externalJobId,
      externalSource: 'impact-customer-portal',
      updatedAt: new Date(),
    };

    if (existingJob) {
      // Update existing job (keep existing jobNo)
      job = await prisma.job.update({
        where: { id: existingJob.id },
        data: jobData,
      });
      console.log(`✅ Updated existing job ${job.jobNo} (${job.id})`);
    } else {
      // Create new job with ImpactD122's own job number format
      const newJobNo = await generateJobNumber();
      job = await prisma.job.create({
        data: {
          id: crypto.randomUUID(),
          jobNo: newJobNo,  // Use generated J-XXXX format
          ...jobData,
          createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
        },
      });
      console.log(`✅ Created new job ${job.jobNo} (${job.id}) from external ${payload.jobNo}`);
    }

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId: job.id,
        action: existingJob ? 'WEBHOOK_UPDATE' : 'WEBHOOK_CREATE',
        field: 'job',
        oldValue: existingJob ? JSON.stringify({ status: existingJob.status }) : null,
        newValue: JSON.stringify({
          externalJobId: payload.externalJobId,
          source: 'impact-customer-portal',
        }),
        changedBy: 'webhook:impact-customer-portal',
        changedByRole: 'BROKER_ADMIN',
      },
    });

    return res.status(existingJob ? 200 : 201).json({
      success: true,
      action: existingJob ? 'updated' : 'created',
      jobId: job.id,
      jobNo: job.jobNo,
    });

  } catch (error: any) {
    console.error('❌ Webhook error:', error);

    // Handle unique constraint violation (duplicate jobNo)
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'Conflict',
        message: `Job with number ${req.body.jobNo} already exists`,
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to process webhook',
    });
  }
}

/**
 * GET /api/webhooks/health
 * Health check for webhook endpoint
 */
export async function webhookHealth(req: Request, res: Response) {
  const hasSecret = !!process.env.PORTAL_WEBHOOK_SECRET;

  res.json({
    status: 'ok',
    configured: hasSecret,
    timestamp: new Date().toISOString(),
  });
}
