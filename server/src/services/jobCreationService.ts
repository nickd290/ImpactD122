/**
 * Job Creation Service - Unified job creation with pathway system
 *
 * ALL job creation flows MUST go through createJobUnified() to ensure:
 * 1. Atomic MasterSequence increment (no duplicate IDs)
 * 2. Consistent pathway assignment (P1/P2/P3)
 * 3. Proper baseJobId + jobTypeCode generation
 *
 * Routes that use this service:
 * - POST /api/jobs (createJob)
 * - POST /api/jobs/from-email (createFromEmail)
 * - POST /api/jobs/import (importBatchJobs)
 * - POST /api/webhooks/jobs (receiveJobWebhook)
 * - POST /api/webhooks/campaigns (receiveCampaignWebhook)
 * - POST /api/webhooks/email-to-job (receiveEmailToJobWebhook)
 * - POST /api/vendor-rfqs/:id/convert (convertToJob)
 */

import { PrismaClient, Job, JobStatus, PaperSource, RoutingType, JobMetaType, MailFormat, JobType, Pathway } from '@prisma/client';
import crypto from 'crypto';
import { generateBaseJobId, getTypeCode } from './jobIdService';
import { determinePathway } from './pathwayService';

// Prisma client for non-transaction operations
const prisma = new PrismaClient();

// Input interface for unified job creation
export interface CreateJobUnifiedInput {
  // Required fields
  title: string;
  customerId: string;

  // Optional core fields
  vendorId?: string | null;
  quantity?: number;
  sellPrice?: number;
  status?: JobStatus;

  // Specs (can be any JSON)
  specs?: Record<string, any>;
  lineItems?: any[];

  // Dates
  dueDate?: Date | string | null;
  mailDate?: Date | string | null;
  inHomesDate?: Date | string | null;

  // IDs & references
  customerPONumber?: string | null;
  customerJobNumber?: string | null;
  partnerPONumber?: string | null;

  // Sizing & paper
  sizeName?: string | null;
  paperSource?: PaperSource | null;

  // Bradford-specific
  bradfordPaperLbs?: number | null;
  dataIncludedWithArtwork?: boolean;

  // Routing (determines pathway)
  routingType?: RoutingType;

  // Pathway meta flags (for type code generation)
  jobMetaType?: JobMetaType | null;
  mailFormat?: MailFormat | null;
  envelopeComponents?: number | null;
  jobType?: JobType | null;

  // Source tracking
  source?: 'MANUAL' | 'WEBHOOK' | 'IMPORT' | 'RFQ' | 'EMAIL';

  // Notes
  notes?: string | null;

  // Envelope components (for multi-component mailings)
  components?: Array<{
    name: string;
    specs?: Record<string, any>;
    sortOrder?: number;
  }>;
}

// Result interface
export interface CreateJobUnifiedResult {
  job: Job;
  jobNo: string;
  baseJobId: string;
  pathway: Pathway;
}

/**
 * Generate the next job number (J-XXXX format).
 * Uses atomic increment via JobSequence to prevent race conditions.
 * Can be called with prisma client or transaction client.
 */
export async function generateJobNo(
  tx: PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
): Promise<string> {
  // Use atomic upsert to prevent race conditions when multiple users create jobs simultaneously
  const result = await tx.jobSequence.upsert({
    where: { id: 'job-seq' },
    update: { currentValue: { increment: 1 }, updatedAt: new Date() },
    create: { id: 'job-seq', currentValue: 1001, updatedAt: new Date() },  // First job gets J-1001
  });

  return `J-${result.currentValue.toString().padStart(4, '0')}`;
}

/**
 * Unified job creation function.
 *
 * ALL job creation flows MUST use this function to ensure:
 * 1. Atomic transaction (jobNo + masterSeq + job in one tx)
 * 2. Pathway assignment (P1/P2/P3)
 * 3. Base job ID generation (TYPE_CODE-MASTER_SEQ)
 *
 * @param input - Job creation input (see CreateJobUnifiedInput)
 * @param existingTx - Optional existing transaction client (for nested transactions)
 * @returns Created job with pathway and ID info
 */
export async function createJobUnified(
  input: CreateJobUnifiedInput,
  existingTx?: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
): Promise<CreateJobUnifiedResult> {
  // Use existing transaction if provided, otherwise create new one
  const executeInTransaction = async (
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
  ): Promise<CreateJobUnifiedResult> => {
    // 1. Generate jobNo (J-XXXX format)
    const jobNo = await generateJobNo(tx);

    // 2. Generate baseJobId + masterSeq + jobTypeCode
    const { baseJobId, masterSeq, jobTypeCode } = await generateBaseJobId(
      {
        jobMetaType: input.jobMetaType || null,
        mailFormat: input.mailFormat || null,
        envelopeComponents: input.envelopeComponents || null,
        jobType: input.jobType || null,
      },
      tx
    );

    // 3. Determine pathway (P1/P2/P3)
    const routingType = input.routingType || RoutingType.THIRD_PARTY_VENDOR;
    const pathway = determinePathway({
      routingType,
      vendorId: input.vendorId || null,
    });

    console.log(`🛤️ [createJobUnified] pathway=${pathway} | baseJobId=${baseJobId} | source=${input.source || 'UNKNOWN'}`);

    // 4. Build specs JSON
    const specs = {
      ...(input.specs || {}),
      lineItems: input.lineItems || null,
    };

    // 5. Create the job (using Prisma relation connect syntax for Prisma 6 compatibility)
    const jobId = crypto.randomUUID();
    const job = await tx.job.create({
      data: {
        id: jobId,
        jobNo,
        title: input.title || '',
        // Use relation connect syntax for Company (required relation)
        Company: { connect: { id: input.customerId } },
        // Use relation connect syntax for Vendor (optional relation)
        ...(input.vendorId ? { Vendor: { connect: { id: input.vendorId } } } : {}),
        status: input.status || JobStatus.ACTIVE,
        specs,
        quantity: input.quantity || 0,
        sellPrice: input.sellPrice || 0,
        sizeName: input.sizeName || null,
        // paperSource has a schema default (BRADFORD), only set if explicitly provided
        ...(input.paperSource ? { paperSource: input.paperSource } : {}),
        bradfordPaperLbs: input.bradfordPaperLbs || null,
        customerPONumber: input.customerPONumber || null,
        customerJobNumber: input.customerJobNumber || null,
        partnerPONumber: input.partnerPONumber || null,
        deliveryDate: input.dueDate ? new Date(input.dueDate) : null,
        mailDate: input.mailDate ? new Date(input.mailDate) : null,
        inHomesDate: input.inHomesDate ? new Date(input.inHomesDate) : null,
        dataIncludedWithArtwork: input.dataIncludedWithArtwork || false,
        notes: input.notes || null,
        // === PATHWAY SYSTEM FIELDS ===
        pathway,
        baseJobId,
        masterSeq,
        jobTypeCode,
        vendorCount: input.vendorId ? 1 : 0,
        jobMetaType: input.jobMetaType || null,
        mailFormat: input.mailFormat || null,
        envelopeComponents: input.envelopeComponents || null,
        routingType,
        updatedAt: new Date(),
      },
    });

    // 6. Create JobComponents if provided (for envelope mailings)
    if (input.components && input.components.length > 0) {
      await tx.jobComponent.createMany({
        data: input.components.map((c, idx) => ({
          id: crypto.randomUUID(),
          jobId: job.id,
          name: c.name,
          specs: c.specs || {},
          sortOrder: c.sortOrder ?? idx,
          componentType: 'PRINT',
          supplier: 'JD',
          artworkStatus: 'PENDING',
          materialStatus: 'NA',
        })),
      });
      console.log(`📦 [createJobUnified] Created ${input.components.length} JobComponents for job ${jobNo}`);
    }

    return {
      job,
      jobNo,
      baseJobId,
      pathway,
    };
  };

  // If existing transaction provided, use it directly
  if (existingTx) {
    return executeInTransaction(existingTx);
  }

  // Otherwise, create new transaction with increased timeout for Railway DB latency
  return prisma.$transaction(executeInTransaction, {
    maxWait: 10000,  // Maximum wait time to acquire a connection (10s)
    timeout: 30000,  // Maximum transaction execution time (30s)
  });
}

/**
 * Batch job creation (for imports).
 * Creates multiple jobs in a single transaction with sequential masterSeq.
 */
export async function createJobsUnifiedBatch(
  inputs: CreateJobUnifiedInput[]
): Promise<CreateJobUnifiedResult[]> {
  return prisma.$transaction(async (tx) => {
    const results: CreateJobUnifiedResult[] = [];

    for (const input of inputs) {
      const result = await createJobUnified(input, tx);
      results.push(result);
    }

    return results;
  }, {
    maxWait: 30000,  // Maximum wait time (30s)
    timeout: 120000, // Batch operations may take longer (2min)
  });
}

/**
 * Check if a job was created after the pathway launch date.
 * Jobs after this date MUST have baseJobId.
 */
export function requiresPathwayFields(createdAt: Date): boolean {
  // Pathway launch date: 2024-01-01 (adjust as needed)
  const PATHWAY_LAUNCH_DATE = new Date('2024-01-01');
  return createdAt >= PATHWAY_LAUNCH_DATE;
}

/**
 * Validate that a job has required pathway fields.
 * Throws error if fields are missing after launch date.
 */
export function validatePathwayFields(job: Partial<Job>): void {
  if (!job.createdAt) return;

  if (requiresPathwayFields(new Date(job.createdAt))) {
    if (!job.baseJobId) {
      throw new Error(`Job created after pathway launch date must have baseJobId`);
    }
    if (!job.pathway) {
      throw new Error(`Job created after pathway launch date must have pathway`);
    }
  }
}
