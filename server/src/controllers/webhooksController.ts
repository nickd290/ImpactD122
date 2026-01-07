import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { RoutingType, PaperSource, CampaignFrequency, DropStatus, FileKind, WebhookSource } from '@prisma/client';
import { sendThreeZPOEmail, sendEmailImportNotification } from '../services/emailService';
import { parsePrintSpecs, parseEmailToJobSpecs } from '../services/openaiService';
import { parsePurchaseOrder } from '../services/geminiService';
import { createJobUnified } from '../services/jobCreationService';
import {
  portalJobPayloadSchema,
  portalCampaignPayloadSchema,
  emailToJobPayloadSchema,
  linkJobPayloadSchema,
  validatePayload,
  type PortalJobPayload,
  type PortalCampaignPayload,
  type EmailToJobPayload,
} from '../schemas/webhookSchemas';
import {
  badRequest,
  unauthorized,
  notFound,
  conflict,
  unprocessable,
  serverError,
  validationError,
  accepted,
  created,
  handlePrismaError,
} from '../utils/apiErrors';

// ============================================
// WEBHOOK IDEMPOTENCY SYSTEM
// ============================================

/**
 * Generate a hash of the webhook payload for deduplication
 */
function generatePayloadHash(payload: unknown): string {
  const normalized = JSON.stringify(payload, Object.keys(payload as object).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32);
}

/**
 * Check if this webhook has already been processed (idempotency)
 */
async function checkWebhookIdempotency(
  source: WebhookSource,
  payload: unknown,
  idempotencyKey?: string
): Promise<{ isDuplicate: boolean; existingEventId?: string }> {
  const key = idempotencyKey || generatePayloadHash(payload);

  // Check for existing event with same key in last 24 hours
  const existing = await prisma.webhookEvent.findFirst({
    where: {
      source,
      processed: true,
      payload: {
        path: ['_idempotencyKey'],
        equals: key,
      },
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
  });

  return { isDuplicate: !!existing, existingEventId: existing?.id };
}

/**
 * Record a webhook event for idempotency tracking
 */
async function recordWebhookEvent(
  source: WebhookSource,
  payload: unknown,
  processed: boolean,
  idempotencyKey?: string
): Promise<string> {
  const key = idempotencyKey || generatePayloadHash(payload);

  const event = await prisma.webhookEvent.create({
    data: {
      id: crypto.randomUUID(),
      source,
      payload: { ...(payload as object), _idempotencyKey: key },
      processed,
      updatedAt: new Date(),
    },
  });

  return event.id;
}

// PortalJobPayload type is imported from '../schemas/webhookSchemas'

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
      return unauthorized(res, 'Invalid or missing webhook secret');
    }

    // Validate payload with Zod schema
    const validation = validatePayload(portalJobPayloadSchema, req.body);
    if (!validation.success) {
      console.warn('Webhook payload validation failed:', validation.errors);
      return validationError(res, validation.errors!);
    }

    const payload = validation.data!;

    // Check idempotency - skip if already processed
    const idempotencyKey = req.headers['x-idempotency-key'] as string;
    const { isDuplicate, existingEventId } = await checkWebhookIdempotency(
      'ZAPIER', // Using ZAPIER as source for portal webhooks
      payload,
      idempotencyKey
    );

    if (isDuplicate) {
      console.log(`⏭️ Duplicate webhook detected, skipping (event: ${existingEventId})`);
      return res.status(200).json({
        success: true,
        action: 'skipped',
        reason: 'duplicate',
        existingEventId,
      });
    }

    console.log(`📥 Received webhook for job ${payload.jobNo} from portal`);

    // Find or create the customer company
    const customerId = await findOrCreateCustomer(payload.companyName, payload.companyId);

    // Check if job already exists by externalJobId
    let existingJob = await prisma.job.findUnique({
      where: { externalJobId: payload.externalJobId },
    });

    // Fallback: If no match by externalJobId, try matching by customerPONumber (the portal's jobNo)
    // This handles cases where jobs were created before linking was established
    if (!existingJob && payload.jobNo) {
      const matchByPO = await prisma.job.findFirst({
        where: {
          customerPONumber: payload.jobNo,
          externalJobId: null, // Only match unlinked jobs
        },
      });
      if (matchByPO) {
        console.log(`🔗 Found unlinked job ${matchByPO.jobNo} by customerPONumber=${payload.jobNo}, will link it`);
        existingJob = matchByPO;
      }
    }

    // Second fallback: Try matching by title for jobs that might have different PO numbers
    if (!existingJob && payload.title) {
      const matchByTitle = await prisma.job.findFirst({
        where: {
          title: payload.title,
          customerId,
          externalJobId: null, // Only match unlinked jobs
        },
        orderBy: { createdAt: 'desc' }, // Get most recent if multiple
      });
      if (matchByTitle) {
        console.log(`🔗 Found unlinked job ${matchByTitle.jobNo} by title="${payload.title}", will link it`);
        existingJob = matchByTitle;
      }
    }

    let job;

    // Build specs with external job number included for reference
    const specs = payload.specs || {};
    const jobSpecs = {
      ...specs,
      externalJobNo: payload.jobNo,  // Store external job/release number in specs
      // Include artwork and data file URLs from customer portal
      ...(payload.artworkUrl ? { artworkUrl: payload.artworkUrl } : {}),
      ...(payload.dataFileUrl ? { dataFileUrl: payload.dataFileUrl } : {}),
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
      // === PATHWAY SYSTEM: Use unified job creation service ===
      // This ensures atomic sequence increment + pathway assignment
      const { job: createdJob, jobNo, baseJobId, pathway } = await createJobUnified({
        title: jobTitle,
        customerId,
        vendorId: specs.vendorName ? null : null, // Vendor linked later after lookup
        quantity: payload.quantity || specs.totalUnits || 0,
        sellPrice: specs.sellPrice || 0,
        specs: jobSpecs,
        customerPONumber: payload.customerPONumber || payload.jobNo,
        dueDate: payload.deliveryDate ? new Date(payload.deliveryDate) : null,
        routingType: specs.vendorName ? 'THIRD_PARTY_VENDOR' : 'BRADFORD_JD',
        source: 'WEBHOOK',
      });

      // Update with additional webhook-specific fields
      job = await prisma.job.update({
        where: { id: createdJob.id },
        data: {
          externalJobId: payload.externalJobId,
          externalSource,
          description: jobDescription,
          sizeName: payload.sizeName,
          status: mapStatus(payload.status),
          // Vendor ship-to fields for release app
          ...(isFromReleaseApp && specs.shippingLocation ? {
            vendorShipToName: specs.shippingLocation,
            vendorShipToAddress: specs.shippingAddress?.address,
            vendorShipToCity: specs.shippingAddress?.city,
            vendorShipToState: specs.shippingAddress?.state,
            vendorShipToZip: specs.shippingAddress?.zip,
          } : {}),
        },
      });

      console.log(`🛤️ [receiveJobWebhook] Created via unified service: pathway=${pathway} | baseJobId=${baseJobId}`);
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

    // Create File records for files sent via webhook from Portal
    if (payload.files && payload.files.length > 0) {
      console.log(`📎 Processing ${payload.files.length} files from webhook...`);
      for (const file of payload.files) {
        try {
          // Check if file already exists for this job
          const existingFile = await prisma.file.findFirst({
            where: {
              jobId: job.id,
              fileName: file.fileName,
            },
          });

          if (!existingFile) {
            // Map Portal FileKind to ImpactD122 FileKind
            let fileKind: FileKind = FileKind.ARTWORK;
            if (file.kind === 'ARTWORK') fileKind = FileKind.ARTWORK;
            else if (file.kind === 'DATA_FILE') fileKind = FileKind.DATA_FILE;
            else if (file.kind === 'PROOF') fileKind = FileKind.PROOF;
            else if (file.kind === 'INVOICE') fileKind = FileKind.INVOICE;

            await prisma.file.create({
              data: {
                id: crypto.randomUUID(),
                jobId: job.id,
                kind: fileKind,
                objectKey: file.downloadUrl, // Store the portal download URL
                fileName: file.fileName,
                mimeType: 'application/octet-stream',
                size: file.size || 0,
                checksum: `portal:${file.id}`, // Track the portal file ID
                uploadedBy: `webhook:${externalSource}`,
              },
            });
            console.log(`  ✅ Created file record: ${file.fileName} (${file.kind})`);
          } else {
            console.log(`  ⏭️ File already exists: ${file.fileName}`);
          }
        } catch (fileError) {
          console.error(`  ⚠️ Failed to create file record for ${file.fileName}:`, fileError);
          // Don't fail the webhook if file creation fails
        }
      }
    }

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

          // Ensure vendor has a code (auto-generate if missing)
          let vendorCode = vendor.vendorCode;
          if (!vendorCode) {
            let isUnique = false;
            while (!isUnique) {
              vendorCode = Math.floor(1000 + Math.random() * 9000).toString();
              const existing = await prisma.vendor.findUnique({ where: { vendorCode } });
              if (!existing) isUnique = true;
            }
            await prisma.vendor.update({
              where: { id: vendor.id },
              data: { vendorCode },
            });
          }

          // Count existing POs for this job to this vendor
          const existingPOCount = await prisma.purchaseOrder.count({
            where: { jobId: job.id, targetVendorId: vendor.id },
          });
          const sequenceNum = existingPOCount + 1;

          // New PO format: {jobNo}-{vendorCode}.{seq} (jobNo already has J- prefix)
          const poNumber = `${job.jobNo}-${vendorCode}.${sequenceNum}`;

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

    // Record successful webhook processing for idempotency
    await recordWebhookEvent('ZAPIER', payload, true, idempotencyKey);

    // Return 202 Accepted for new jobs (async processing), 200 for updates
    const statusCode = existingJob ? 200 : 202;
    return res.status(statusCode).json({
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

    // Handle Prisma errors with proper status codes
    if (error.code?.startsWith('P')) {
      return handlePrismaError(res, error, 'job');
    }

    return serverError(res, error.message, error);
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

// ============================================
// CAMPAIGN WEBHOOK
// ============================================
// PortalCampaignPayload type is imported from '../schemas/webhookSchemas'

/**
 * Map drop status from portal to ImpactD122
 */
function mapDropStatus(status: string): DropStatus {
  const statusMap: Record<string, DropStatus> = {
    'SCHEDULED': 'SCHEDULED',
    'AWAITING_FILES': 'AWAITING_FILES',
    'FILES_RECEIVED': 'FILES_RECEIVED',
    'IN_PRODUCTION': 'IN_PRODUCTION',
    'MAILED': 'MAILED',
    'COMPLETED': 'COMPLETED',
  };
  return statusMap[status] || 'SCHEDULED';
}

/**
 * POST /api/webhooks/campaigns
 * Receive campaign data from Impact Customer Portal
 */
export async function receiveCampaignWebhook(req: Request, res: Response) {
  try {
    // Validate webhook secret
    if (!validateWebhookSecret(req)) {
      console.warn('Campaign webhook authentication failed - invalid or missing X-Webhook-Secret');
      return unauthorized(res, 'Invalid or missing webhook secret');
    }

    // Validate payload with Zod schema
    const validation = validatePayload(portalCampaignPayloadSchema, req.body);
    if (!validation.success) {
      console.warn('Campaign webhook payload validation failed:', validation.errors);
      return validationError(res, validation.errors!);
    }

    const payload = validation.data!;

    // Check idempotency
    const idempotencyKey = req.headers['x-idempotency-key'] as string;
    const { isDuplicate, existingEventId } = await checkWebhookIdempotency(
      'ZAPIER',
      payload,
      idempotencyKey
    );

    if (isDuplicate) {
      console.log(`⏭️ Duplicate campaign webhook detected, skipping (event: ${existingEventId})`);
      return res.status(200).json({
        success: true,
        action: 'skipped',
        reason: 'duplicate',
        existingEventId,
      });
    }

    console.log(`📥 Received campaign webhook for "${payload.name}" from portal`);

    // Find or create the customer company
    const customerId = await findOrCreateCustomer(payload.companyName, payload.companyId);

    // Check if campaign already exists
    const existingCampaign = await prisma.campaign.findUnique({
      where: { externalCampaignId: payload.externalCampaignId },
      include: { CampaignDrop: true },
    });

    let campaign;

    const campaignData = {
      customerId,
      name: payload.name,
      sizeName: payload.sizeName,
      quantity: payload.quantity,
      frequency: payload.frequency as CampaignFrequency,
      mailDay: payload.mailDay,
      startDate: new Date(payload.startDate),
      endDate: payload.endDate ? new Date(payload.endDate) : null,
      isActive: payload.isActive,
    };

    if (existingCampaign) {
      // Update existing campaign
      campaign = await prisma.campaign.update({
        where: { id: existingCampaign.id },
        data: campaignData,
      });

      // Delete existing drops and recreate
      await prisma.campaignDrop.deleteMany({
        where: { campaignId: campaign.id },
      });

      console.log(`✅ Updated existing campaign "${campaign.name}" (${campaign.id})`);
    } else {
      // Create new campaign
      campaign = await prisma.campaign.create({
        data: {
          externalCampaignId: payload.externalCampaignId,
          ...campaignData,
        },
      });
      console.log(`✅ Created new campaign "${campaign.name}" (${campaign.id})`);
    }

    // Create drops and jobs if provided
    const createdJobs: { jobNo: string; mailDate: Date; sellPrice: number; poNumber: string }[] = [];

    if (payload.drops && payload.drops.length > 0) {
      let dropIndex = 1;
      for (const drop of payload.drops) {
        const mailDate = new Date(drop.mailDate);
        const uploadDeadline = new Date(drop.uploadDeadline);

        // Create drop record
        await prisma.campaignDrop.create({
          data: {
            campaignId: campaign.id,
            mailDate,
            uploadDeadline,
            status: mapDropStatus(drop.status),
          },
        });

        // Create a Job for each drop
        const dropDateStr = mailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Calculate sell price: quantity * pricePerM / 1000
        const sellPrice = (payload.quantity * payload.pricePerM) / 1000;

        // Sequential customer PO for each drop
        const jobCustomerPO = payload.customerPONumber
          ? `${payload.customerPONumber}-${dropIndex}`
          : null;

        // === PATHWAY SYSTEM: Use unified job creation service ===
        const { job: createdJob, jobNo, baseJobId, pathway } = await createJobUnified({
          title: `${payload.name} - ${dropDateStr}`,
          customerId,
          quantity: payload.quantity,
          sellPrice,
          sizeName: payload.sizeName,
          customerPONumber: jobCustomerPO,
          mailDate,
          specs: {
            campaignId: campaign.id,
            externalCampaignId: payload.externalCampaignId,
            frequency: payload.frequency,
            source: 'campaign-webhook',
            productType: payload.specs?.productType,
            paperStock: payload.specs?.paperStock,
            printColors: payload.specs?.printColors,
          },
          jobMetaType: 'MAILING', // Campaign drops are mailings
          routingType: 'BRADFORD_JD', // Default to Bradford routing
          source: 'WEBHOOK',
        });

        // Update with campaign-specific fields
        const job = await prisma.job.update({
          where: { id: createdJob.id },
          data: {
            description: `Campaign drop for ${payload.companyName}`,
            externalSource: 'impact-customer-portal',
          },
        });

        console.log(`🛤️ [receiveCampaignWebhook] Drop job created: pathway=${pathway} | baseJobId=${baseJobId}`);

        // Create PO from customer (the order/agreement)
        // Find Impact company as the origin for the PO
        const impactCompany = await prisma.company.findFirst({
          where: {
            name: { contains: 'Impact', mode: 'insensitive' },
            type: { equals: 'broker', mode: 'insensitive' }
          }
        });

        // Sequential PO numbering: if customerPONumber provided, use PO-1, PO-2, etc.
        const poNumber = payload.customerPONumber
          ? `${payload.customerPONumber}-${dropIndex}`
          : `${jobNo}-PO`;

        await prisma.purchaseOrder.create({
          data: {
            id: crypto.randomUUID(),
            jobId: job.id,
            originCompanyId: impactCompany?.id || customerId,
            targetCompanyId: customerId,
            poNumber,
            description: `${payload.sizeName} - ${payload.quantity.toLocaleString()} pcs`,
            buyCost: sellPrice, // What customer pays = our sell price
            status: 'PENDING',
            updatedAt: new Date(),
          }
        });

        createdJobs.push({ jobNo: job.jobNo, mailDate, sellPrice, poNumber });
        console.log(`  📦 Created job ${job.jobNo} (PO: ${poNumber}, $${sellPrice.toFixed(2)}) for drop on ${dropDateStr}`);
        dropIndex++;
      }
      console.log(`  📅 Created ${payload.drops.length} drops with jobs`);
    }

    // Record successful webhook processing
    await recordWebhookEvent('ZAPIER', payload, true, idempotencyKey);

    // Return 202 for new campaigns, 200 for updates
    const statusCode = existingCampaign ? 200 : 202;
    return res.status(statusCode).json({
      success: true,
      action: existingCampaign ? 'updated' : 'created',
      campaignId: campaign.id,
      name: campaign.name,
      dropsCount: payload.drops?.length || 0,
      jobs: createdJobs,
    });

  } catch (error: any) {
    console.error('❌ Campaign webhook error:', error);

    if (error.code?.startsWith('P')) {
      return handlePrismaError(res, error, 'campaign');
    }

    return serverError(res, error.message, error);
  }
}

// ============================================
// EMAIL-TO-JOB WEBHOOK
// ============================================
// EmailToJobPayload type is imported from '../schemas/webhookSchemas'

/**
 * Validate email import webhook secret
 */
function validateEmailImportSecret(req: Request): boolean {
  const secret = req.headers['x-webhook-secret'];
  const expectedSecret = process.env.EMAIL_IMPORT_WEBHOOK_SECRET || process.env.PORTAL_WEBHOOK_SECRET;

  if (!expectedSecret) {
    console.error('EMAIL_IMPORT_WEBHOOK_SECRET not configured');
    return false;
  }

  return secret === expectedSecret;
}

/**
 * Format a company name from email domain
 * e.g., "freedompressllc" -> "Freedom Press LLC"
 */
function formatCompanyNameFromDomain(domainBase: string): string {
  if (!domainBase) return '';

  // Common suffixes to preserve formatting
  const suffixes: { [key: string]: string } = {
    'llc': ' LLC',
    'inc': ' Inc',
    'co': ' Co',
    'corp': ' Corp',
    'ltd': ' Ltd',
  };

  let name = domainBase.toLowerCase();
  let suffix = '';

  // Check for and extract suffixes
  for (const [key, formatted] of Object.entries(suffixes)) {
    if (name.endsWith(key)) {
      suffix = formatted;
      name = name.slice(0, -key.length);
      break;
    }
  }

  // Insert spaces before capital letters or between lowercase-uppercase transitions
  // Also handle all-lowercase by looking for common word patterns
  name = name
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'); // ABCDef -> ABC Def

  // Capitalize each word
  name = name
    .split(/[\s_-]+/)
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return (name + suffix).trim();
}

/**
 * Try to match customer from email domain
 */
async function findCustomerByEmailDomain(email: string): Promise<{ id: string; name: string } | null> {
  if (!email) return null;

  // Extract domain from email
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // Skip common email providers
  const commonDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
  if (commonDomains.includes(domain)) return null;

  // Try to find a company with email containing this domain
  const company = await prisma.company.findFirst({
    where: {
      AND: [
        { type: { equals: 'customer', mode: 'insensitive' } },
        {
          OR: [
            { email: { contains: domain, mode: 'insensitive' } },
            { name: { contains: domain.split('.')[0], mode: 'insensitive' } },
          ],
        },
      ],
    },
  });

  return company ? { id: company.id, name: company.name } : null;
}

/**
 * Build job notes from parsed data and original payload
 * Includes AI-extracted notes, special instructions, and raw email body for LOW confidence
 */
function buildJobNotes(parsedData: any, payload: any): string | null {
  const noteParts: string[] = [];

  // Add parsed notes (from AI extraction)
  if (parsedData.notes) {
    noteParts.push(parsedData.notes);
  }

  // Add special instructions that didn't fit structured fields
  if (parsedData.specialInstructions) {
    noteParts.push(`Special Instructions: ${parsedData.specialInstructions}`);
  }

  // Add additional notes from PO parsing
  if (parsedData.additionalNotes) {
    noteParts.push(parsedData.additionalNotes);
  }

  // Add artwork/packing/labeling instructions
  if (parsedData.artworkInstructions) {
    noteParts.push(`Artwork: ${parsedData.artworkInstructions}`);
  }
  if (parsedData.packingInstructions) {
    noteParts.push(`Packing: ${parsedData.packingInstructions}`);
  }
  if (parsedData.labelingInstructions) {
    noteParts.push(`Labeling: ${parsedData.labelingInstructions}`);
  }

  // Add raw email body if confidence is LOW (couldn't parse much)
  if (parsedData.confidence === 'LOW' && payload.textBody) {
    noteParts.push(`--- Original Email ---\n${payload.textBody.substring(0, 2000)}`);
  }

  return noteParts.length > 0 ? noteParts.join('\n\n') : null;
}

/**
 * POST /api/webhooks/email-to-job
 * Receive forwarded email and create job via AI parsing
 */
export async function receiveEmailToJobWebhook(req: Request, res: Response) {
  try {
    // Validate webhook secret
    if (!validateEmailImportSecret(req)) {
      console.warn('Email import webhook authentication failed - invalid or missing X-Webhook-Secret');
      return unauthorized(res, 'Invalid or missing webhook secret');
    }

    // Validate payload with Zod schema
    const validation = validatePayload(emailToJobPayloadSchema, req.body);
    if (!validation.success) {
      console.warn('Email import webhook payload validation failed:', validation.errors);
      return validationError(res, validation.errors!);
    }

    const payload = validation.data!;

    // Check idempotency
    const idempotencyKey = req.headers['x-idempotency-key'] as string;
    const { isDuplicate, existingEventId } = await checkWebhookIdempotency(
      'EMAIL',
      payload,
      idempotencyKey
    );

    if (isDuplicate) {
      console.log(`⏭️ Duplicate email webhook detected, skipping (event: ${existingEventId})`);
      return res.status(200).json({
        success: true,
        action: 'skipped',
        reason: 'duplicate',
        existingEventId,
      });
    }

    console.log(`📧 Received email-to-job webhook from: ${payload.from}`);
    console.log(`   Subject: ${payload.subject}`);
    console.log(`   Attachments: ${payload.attachments?.length || 0}`);

    // Check for PDF/image attachments that might be a PO
    let parsedData: any = null;
    const pdfAttachment = payload.attachments?.find(
      att => att.mimeType === 'application/pdf' || att.mimeType.startsWith('image/')
    );

    if (pdfAttachment) {
      // Use PO parser for document
      console.log(`📄 Found attachment: ${pdfAttachment.filename} - using PO parser`);
      parsedData = await parsePurchaseOrder(pdfAttachment.content, pdfAttachment.mimeType);
    } else {
      // Use email parser for text content
      const textContent = payload.textBody || (payload.htmlBody?.replace(/<[^>]*>/g, ' ') || '');
      console.log(`📝 No PDF attachment - parsing email body text`);
      parsedData = await parseEmailToJobSpecs(payload.subject, textContent, payload.from);
    }

    if (!parsedData || Object.keys(parsedData).length === 0) {
      return unprocessable(res, 'Could not parse job details from email', {
        rawSubject: payload.subject,
      });
    }

    // Try to match customer from email sender
    const customerMatch = await findCustomerByEmailDomain(payload.from);
    let customerId: string;

    if (customerMatch) {
      customerId = customerMatch.id;
      console.log(`✅ Matched customer: ${customerMatch.name}`);
    } else if (parsedData.customerName) {
      // Create or find customer from parsed data
      customerId = await findOrCreateCustomer(parsedData.customerName);
    } else {
      // Try to derive company name from email domain
      const emailMatch = payload.from.match(/<([^>]+)>/) || [null, payload.from];
      const emailAddress = emailMatch[1] || payload.from;
      const domain = emailAddress.split('@')[1]?.toLowerCase();
      const domainBase = domain?.split('.')[0];

      // Skip common email providers - use sender name instead
      const commonDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
      let companyName: string;

      if (domain && !commonDomains.includes(domain)) {
        // Derive company name from domain (e.g., freedompressllc.com -> Freedom Press LLC)
        companyName = formatCompanyNameFromDomain(domainBase || '');
        console.log(`📧 Derived company name from domain: ${companyName}`);
      } else {
        // Fall back to sender name for common email providers
        const senderName = payload.from.split('<')[0]?.trim().replace(/"/g, '') || 'Unknown';
        companyName = `Email Import - ${senderName}`;
      }

      customerId = await findOrCreateCustomer(companyName);
    }

    // Build job title
    const jobTitle = parsedData.title || payload.subject || `Email Import - ${new Date().toLocaleDateString()}`;

    // === PATHWAY SYSTEM: Use unified job creation service ===
    const { job: createdJob, jobNo, baseJobId, pathway } = await createJobUnified({
      title: jobTitle,
      customerId,
      quantity: parsedData.quantity || 0,
      sellPrice: parsedData.poTotal || 0,
      sizeName: parsedData.specs?.finishedSize || null,
      customerPONumber: parsedData.customerPONumber || null,
      dueDate: parsedData.dueDate ? new Date(parsedData.dueDate) : null,
      mailDate: parsedData.mailDate ? new Date(parsedData.mailDate) : null,
      notes: buildJobNotes(parsedData, payload),
      specs: {
        ...parsedData.specs,
        originalEmail: {
          from: payload.from,
          subject: payload.subject,
          receivedAt: new Date().toISOString(),
        },
        requiresReview: true,
      },
      routingType: 'THIRD_PARTY_VENDOR', // Email imports typically use external vendors
      source: 'EMAIL',
    });

    // Update with email-specific fields
    const job = await prisma.job.update({
      where: { id: createdJob.id },
      data: {
        description: parsedData.description || null,
        externalSource: 'email-import',
      },
    });

    console.log(`🛤️ [receiveEmailToJobWebhook] Created via unified service: pathway=${pathway} | baseJobId=${baseJobId}`);
    console.log(`✅ Created job ${job.jobNo} from email import`);

    // Save the PO PDF attachment to the file system and database
    if (pdfAttachment) {
      try {
        // Decode base64 to buffer
        const pdfBuffer = Buffer.from(pdfAttachment.content, 'base64');

        // Save to disk
        const { uploadPDF } = await import('../services/storageService');
        const objectKey = await uploadPDF(pdfBuffer, pdfAttachment.filename || `PO-${jobNo}.pdf`);

        // Calculate checksum
        const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

        // Create File record
        await prisma.file.create({
          data: {
            id: crypto.randomUUID(),
            jobId: job.id,
            kind: 'PO_PDF',
            objectKey,
            fileName: pdfAttachment.filename || `PO-${jobNo}.pdf`,
            mimeType: pdfAttachment.mimeType,
            size: pdfBuffer.length,
            checksum,
            uploadedBy: 'email-import',
          },
        });

        console.log(`📎 Saved PO PDF: ${pdfAttachment.filename}`);
      } catch (fileError) {
        console.error('Failed to save PO PDF:', fileError);
        // Don't fail the job creation, just log the error
      }
    }

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId: job.id,
        action: 'EMAIL_IMPORT_CREATE',
        field: 'job',
        newValue: JSON.stringify({
          from: payload.from,
          subject: payload.subject,
          forwardedBy: payload.forwardedBy,
          hadAttachment: !!pdfAttachment,
        }),
        changedBy: payload.forwardedBy || `webhook:email-import`,
        changedByRole: 'BROKER_ADMIN',
      },
    });

    // Send notification to admin
    try {
      await sendEmailImportNotification({
        jobId: job.id,
        jobNo: job.jobNo,
        title: jobTitle,
        fromEmail: payload.from,
        subject: payload.subject,
        quantity: parsedData.quantity || 0,
        confidence: parsedData.confidence || 'LOW',
        customerName: customerMatch?.name,
        specs: parsedData.specs,
        notes: parsedData.notes,
      });
      console.log(`📧 Notification sent to admin`);
    } catch (notifyError) {
      console.warn('⚠️ Failed to send notification email:', notifyError);
      // Don't fail the webhook if notification fails
    }

    // Record successful webhook processing
    await recordWebhookEvent('EMAIL', payload, true, idempotencyKey);

    // Return 202 Accepted (job created, may need review)
    return res.status(202).json({
      success: true,
      jobId: job.id,
      jobNo: job.jobNo,
      parsedData: {
        title: jobTitle,
        customerMatch: customerMatch || null,
        specs: parsedData.specs || {},
        lineItems: parsedData.lineItems || [],
        quantity: parsedData.quantity,
      },
      requiresReview: true,
    });

  } catch (error: any) {
    console.error('❌ Email-to-job webhook error:', error);

    if (error.code?.startsWith('P')) {
      return handlePrismaError(res, error, 'job');
    }

    return serverError(res, error.message, error);
  }
}

/**
 * Link an external job by setting externalJobId
 * This allows syncing jobs created separately in ImpactD122 and Customer Portal
 */
export async function linkExternalJob(req: Request, res: Response) {
  try {
    // Validate webhook secret
    if (!validateWebhookSecret(req)) {
      return unauthorized(res, 'Invalid webhook secret');
    }

    // Validate payload with Zod schema
    const validation = validatePayload(linkJobPayloadSchema, req.body);
    if (!validation.success) {
      return validationError(res, validation.errors!);
    }

    const { jobId, externalJobId, jobNo } = validation.data!;

    // Find the job
    let job;
    if (jobId) {
      job = await prisma.job.findUnique({ where: { id: jobId } });
    } else if (jobNo) {
      job = await prisma.job.findFirst({ where: { jobNo } });
    }

    if (!job) {
      return notFound(res, `Job ${jobId || jobNo}`);
    }

    // Check if target job is already linked to a different external ID
    if (job.externalJobId && job.externalJobId !== externalJobId) {
      return conflict(res, `Job is already linked to external ID: ${job.externalJobId}`, {
        currentExternalId: job.externalJobId,
      });
    }

    // Clear externalJobId from any other job that has it (to avoid unique constraint)
    const existingWithExternalId = await prisma.job.findUnique({
      where: { externalJobId },
    });
    if (existingWithExternalId && existingWithExternalId.id !== job.id) {
      await prisma.job.update({
        where: { id: existingWithExternalId.id },
        data: { externalJobId: null },
      });
      console.log(`🔗 Cleared externalJobId from job ${existingWithExternalId.jobNo} to reassign it`);
    }

    // Update the job with externalJobId
    const updatedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        externalJobId,
        updatedAt: new Date(),
      },
    });

    console.log(`🔗 Linked job ${job.jobNo} to external ID: ${externalJobId}`);

    return res.json({
      success: true,
      jobId: updatedJob.id,
      jobNo: updatedJob.jobNo,
      externalJobId: updatedJob.externalJobId,
    });

  } catch (error: any) {
    console.error('❌ Link job error:', error);

    if (error.code?.startsWith('P')) {
      return handlePrismaError(res, error, 'job');
    }

    return serverError(res, error.message, error);
  }
}
