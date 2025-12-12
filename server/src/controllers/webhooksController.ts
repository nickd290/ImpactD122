import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { RoutingType, PaperSource } from '@prisma/client';
import { sendThreeZPOEmail } from '../services/emailService';

/**
 * Webhook payload from Impact Customer Portal or Inventory Release App
 */
interface PortalJobPayload {
  jobNo: string;
  title?: string;
  companyId?: string;
  companyName: string;
  customerPONumber?: string;
  sizeName?: string;
  quantity?: number;
  specs?: {
    // Common fields
    source?: string;
    externalJobNo?: string;

    // Inventory Release App specific fields
    releaseId?: string;
    partNumber?: string;
    partDescription?: string;
    pallets?: number;
    boxes?: number;
    totalUnits?: number;
    unitsPerBox?: number;
    boxesPerSkid?: number;
    shippingLocation?: string;
    shippingAddress?: {
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
    ticketNumber?: string;
    batchNumber?: string;
    manufactureDate?: string;
    shipVia?: string;
    freightTerms?: string;
    sellPrice?: number;

    // Cost basis and vendor info (from inventory-release-app)
    costBasisPerUnit?: number;
    buyCost?: number;
    vendorName?: string;
    paperSource?: 'BRADFORD' | 'VENDOR' | 'CUSTOMER';

    // PDFs for ThreeZ email (base64 encoded)
    packingSlipPdf?: string;
    boxLabelsPdf?: string;

    // Any additional fields
    [key: string]: any;
  };
  status?: string;
  deliveryDate?: string;
  createdAt?: string;
  externalJobId: string; // The portal's job ID or release ID
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
  // First try to find by name (case-insensitive) - also check type case-insensitively
  const existingCompany = await prisma.company.findFirst({
    where: {
      name: {
        equals: companyName,
        mode: 'insensitive',
      },
      type: {
        equals: 'customer',
        mode: 'insensitive',
      },
    },
  });

  if (existingCompany) {
    console.log(`Found existing customer company: ${existingCompany.name} (${existingCompany.id})`);
    return existingCompany.id;
  }

  // Create new customer company
  const newCompany = await prisma.company.create({
    data: {
      id: companyId || crypto.randomUUID(),
      name: companyName,
      type: 'customer',  // Use lowercase to match existing data
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
    const specs = payload.specs || {};
    const jobSpecs = {
      ...specs,
      externalJobNo: payload.jobNo,  // Store external job/release number in specs
    };

    // Determine if this is from inventory-release-app
    const isFromReleaseApp = specs.source === 'inventory-release-app';
    const externalSource = isFromReleaseApp ? 'inventory-release-app' : 'impact-customer-portal';

    // Build title - use part number for release app jobs
    let jobTitle = payload.title;
    if (!jobTitle) {
      if (isFromReleaseApp && specs.partNumber) {
        jobTitle = `${specs.partNumber} - ${specs.partDescription || 'Release'}`;
      } else {
        jobTitle = `Job from ${payload.companyName}`;
      }
    }

    // Build description from part details if from release app
    let jobDescription: string | undefined;
    if (isFromReleaseApp) {
      const parts = [];
      if (specs.partNumber) parts.push(`Part: ${specs.partNumber}`);
      if (specs.partDescription) parts.push(specs.partDescription);
      if (specs.totalUnits) parts.push(`${specs.totalUnits.toLocaleString()} units`);
      if (specs.pallets) parts.push(`${specs.pallets} pallet${specs.pallets > 1 ? 's' : ''}`);
      jobDescription = parts.join(' • ');
    }

    const jobData = {
      customerId,
      title: jobTitle,
      description: jobDescription,
      customerPONumber: payload.customerPONumber || payload.jobNo,  // Use external jobNo as PO if not provided
      sizeName: payload.sizeName,
      quantity: payload.quantity || specs.totalUnits,
      specs: jobSpecs,
      status: mapStatus(payload.status),
      deliveryDate: payload.deliveryDate ? new Date(payload.deliveryDate) : null,
      externalJobId: payload.externalJobId,
      externalSource,
      updatedAt: new Date(),

      // Populate vendor ship-to fields from release shipping address
      ...(isFromReleaseApp && specs.shippingLocation ? {
        vendorShipToName: specs.shippingLocation,
        vendorShipToAddress: specs.shippingAddress?.address,
        vendorShipToCity: specs.shippingAddress?.city,
        vendorShipToState: specs.shippingAddress?.state,
        vendorShipToZip: specs.shippingAddress?.zip,
      } : {}),

      // Populate sell price if provided
      ...(specs.sellPrice ? {
        sellPrice: specs.sellPrice,
      } : {}),

      // Set routing type and paper source for third-party vendor jobs
      ...(specs.vendorName ? {
        routingType: RoutingType.THIRD_PARTY_VENDOR,
        paperSource: PaperSource.VENDOR,
      } : {}),
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
          externalJobNo: payload.jobNo,
          source: externalSource,
          ...(isFromReleaseApp && specs.partNumber ? { partNumber: specs.partNumber } : {}),
        }),
        changedBy: `webhook:${externalSource}`,
        changedByRole: 'BROKER_ADMIN',
      },
    });

    // Create PurchaseOrder to vendor if buyCost is provided (for third-party vendor jobs)
    let purchaseOrder = null;
    if (!existingJob && specs.buyCost && specs.vendorName) {
      try {
        // Find vendor by name
        const vendor = await prisma.vendor.findFirst({
          where: { name: { equals: specs.vendorName, mode: 'insensitive' } }
        });

        if (vendor) {
          // Find Impact company (broker) as the origin
          const impactCompany = await prisma.company.findFirst({
            where: {
              name: { contains: 'Impact', mode: 'insensitive' },
              type: { equals: 'broker', mode: 'insensitive' }
            }
          });

          // Generate PO number based on job number
          const poCount = await prisma.purchaseOrder.count({ where: { jobId: job.id } });
          const poNumber = `PO-${job.jobNo}-${String(poCount + 1).padStart(3, '0')}`;

          // Create PO: Impact → Vendor (e.g., ThreeZ)
          purchaseOrder = await prisma.purchaseOrder.create({
            data: {
              id: crypto.randomUUID(),
              jobId: job.id,
              originCompanyId: impactCompany?.id || customerId,
              targetVendorId: vendor.id,
              poNumber,
              description: `${specs.partNumber || 'Part'} - ${specs.totalUnits?.toLocaleString() || ''} units`,
              buyCost: specs.buyCost,
              status: 'PENDING',
              updatedAt: new Date(),
            }
          });

          // Update job with vendor link
          await prisma.job.update({
            where: { id: job.id },
            data: { vendorId: vendor.id }
          });

          console.log(`✅ Created PO ${poNumber} to ${vendor.name} for $${specs.buyCost.toFixed(2)}`);

          // Auto-email ThreeZ if this is a ThreeZ PO with PDFs
          if (vendor.name.toLowerCase() === 'threez' && (specs.packingSlipPdf || specs.boxLabelsPdf)) {
            try {
              const emailResult = await sendThreeZPOEmail(purchaseOrder, job, specs);
              if (emailResult.success) {
                // Update PO with email sent timestamp
                await prisma.purchaseOrder.update({
                  where: { id: purchaseOrder.id },
                  data: {
                    emailedAt: emailResult.emailedAt,
                    emailedTo: 'jkoester@threez.com,dmeinhart@threez.com',
                  },
                });
                console.log('📧 ThreeZ auto-email sent successfully');
              } else {
                console.warn('⚠️ ThreeZ email failed:', emailResult.error);
              }
            } catch (emailError) {
              console.error('⚠️ Error sending ThreeZ email:', emailError);
              // Don't fail webhook if email fails
            }
          }
        } else {
          console.warn(`⚠️ Vendor "${specs.vendorName}" not found - skipping PO creation`);
        }
      } catch (poError) {
        console.error('⚠️ Error creating PurchaseOrder:', poError);
        // Don't fail the webhook if PO creation fails
      }
    }

    return res.status(existingJob ? 200 : 201).json({
      success: true,
      action: existingJob ? 'updated' : 'created',
      jobId: job.id,
      jobNo: job.jobNo,
      ...(purchaseOrder ? {
        purchaseOrder: {
          id: purchaseOrder.id,
          poNumber: purchaseOrder.poNumber,
          buyCost: purchaseOrder.buyCost,
        }
      } : {}),
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
