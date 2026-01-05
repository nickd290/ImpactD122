/**
 * Job ID Service - Canonical ID Generation
 *
 * Generates structured job IDs for the pathway system:
 * - Base Job ID: {TYPE_CODE}-{MASTER_SEQ} (stored on Job)
 *   Example: ME2-3000
 * - Execution ID: {TYPE_CODE}-{MASTER_SEQ}-{VENDOR_CODE}.{VENDOR_COUNT} (stored on PurchaseOrder)
 *   Example: ME2-3000-4198.3
 * - Change Order ID: {baseJobId}-CO{N} (stored on ChangeOrder)
 *   Example: ME2-3000-CO1
 *
 * TYPE CODES:
 * - MS: Self-mailer
 * - MP: Postcard mailing
 * - ME{N}: Envelope mailing with N components
 * - FJ: Flat job (non-mailing)
 * - HJ: Folded job (Half-fold, etc.)
 * - BJ: Booklet job
 */

import { PrismaClient, JobMetaType, MailFormat, JobType } from '@prisma/client';

// Master sequence starts at 3000 (fresh namespace, avoiding legacy IDs)
const MASTER_SEQ_START = 3000;

// Input types for ID generation
export interface JobTypeInput {
  jobMetaType?: JobMetaType | null;
  mailFormat?: MailFormat | null;
  envelopeComponents?: number | null;
  jobType?: JobType | null;
}

/**
 * CRITICAL: Atomic increment with transaction + row locking
 * Prevents duplicate sequences when 2 users create jobs simultaneously.
 *
 * This function uses a Prisma transaction to:
 * 1. Update the sequence counter
 * 2. Return the new value
 *
 * The update is atomic at the database level, ensuring no duplicates.
 *
 * @param prisma - Prisma client (can be transaction client)
 * @returns Next master sequence number
 */
export async function getNextMasterSequence(
  prisma: PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
): Promise<number> {
  // CRITICAL: Use upsert for atomic create-or-update
  // This prevents race conditions where two concurrent requests both try to create
  // the initial MasterSequence row.
  //
  // Behavior:
  // - If row exists: increment currentValue and return
  // - If row doesn't exist: create with MASTER_SEQ_START + 1 (first job gets 3001)
  const result = await prisma.masterSequence.upsert({
    where: { id: 'master-seq' },
    update: { currentValue: { increment: 1 } },
    create: {
      id: 'master-seq',
      currentValue: MASTER_SEQ_START + 1, // First job gets 3001
    },
  });

  return result.currentValue;
}

/**
 * Get the type code for a job based on its meta type and format.
 *
 * Type codes:
 * - MS: Self-mailer
 * - MP: Postcard mailing
 * - ME{N}: Envelope mailing with N components (ME1, ME2, ME3, etc.)
 * - FJ: Flat job (default for non-mailing)
 * - HJ: Folded/Half-fold job
 * - BJ: Booklet job
 *
 * @param job - Job data with meta type and format
 * @returns Type code string
 */
export function getTypeCode(job: JobTypeInput): string {
  // Mailing jobs have specific codes
  if (job.jobMetaType === JobMetaType.MAILING) {
    switch (job.mailFormat) {
      case MailFormat.SELF_MAILER:
        return 'MS';
      case MailFormat.POSTCARD:
        return 'MP';
      case MailFormat.ENVELOPE:
        // Envelope jobs include component count: ME1, ME2, ME3
        const components = job.envelopeComponents || 1;
        return `ME${components}`;
      default:
        return 'MS'; // Default to self-mailer if mailing but no format
    }
  }

  // Non-mailing job types
  if (job.jobType) {
    switch (job.jobType) {
      case JobType.FLAT:
        return 'FJ';
      case JobType.FOLDED:
        return 'HJ';
      case JobType.BOOKLET_SELF_COVER:
      case JobType.BOOKLET_PLUS_COVER:
        return 'BJ';
      default:
        return 'FJ';
    }
  }

  // Default to flat job
  return 'FJ';
}

/**
 * Generate the base job ID (vendor-agnostic, stored on Job).
 * Must be called inside a transaction that creates the Job.
 *
 * Format: {TYPE_CODE}-{MASTER_SEQ}
 * Example: ME2-3000, FJ-3001, MS-3002
 *
 * @param job - Job data for type code derivation
 * @param prisma - Prisma client (should be transaction client for atomicity)
 * @returns Object with baseJobId and masterSeq
 */
export async function generateBaseJobId(
  job: JobTypeInput,
  prisma: PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
): Promise<{ baseJobId: string; masterSeq: number; jobTypeCode: string }> {
  const typeCode = getTypeCode(job);
  const masterSeq = await getNextMasterSequence(prisma);

  return {
    baseJobId: `${typeCode}-${masterSeq}`,
    masterSeq,
    jobTypeCode: typeCode,
  };
}

/**
 * Generate the execution ID (vendor-specific, stored on PurchaseOrder).
 *
 * Format: {BASE_JOB_ID}-{VENDOR_CODE}.{VENDOR_COUNT}
 * Example: ME2-3000-4198.3
 *
 * @param baseJobId - Base job ID (e.g., ME2-3000)
 * @param vendorCode - Vendor's unique code (e.g., 4198, 7777)
 * @param vendorCount - Number of vendors for this job (e.g., 3)
 * @returns Execution ID string
 */
export function generateExecutionId(
  baseJobId: string,
  vendorCode: string,
  vendorCount: number
): string {
  return `${baseJobId}-${vendorCode}.${vendorCount}`;
}

/**
 * Generate the change order ID (anchored to base job ID).
 *
 * Format: {BASE_JOB_ID}-CO{N}
 * Example: ME2-3000-CO1, ME2-3000-CO2
 *
 * @param baseJobId - Base job ID (e.g., ME2-3000)
 * @param version - Change order version number (1, 2, 3, etc.)
 * @returns Change order ID string
 */
export function generateChangeOrderId(
  baseJobId: string,
  version: number
): string {
  return `${baseJobId}-CO${version}`;
}

/**
 * Parse a base job ID into its components.
 *
 * @param baseJobId - Base job ID (e.g., ME2-3000)
 * @returns Object with typeCode and masterSeq, or null if invalid
 */
export function parseBaseJobId(baseJobId: string): {
  typeCode: string;
  masterSeq: number;
} | null {
  const match = baseJobId.match(/^([A-Z]+\d*)-(\d+)$/);
  if (!match) return null;

  return {
    typeCode: match[1],
    masterSeq: parseInt(match[2], 10),
  };
}

/**
 * Parse an execution ID into its components.
 *
 * @param executionId - Execution ID (e.g., ME2-3000-4198.3)
 * @returns Object with baseJobId, vendorCode, vendorCount, or null if invalid
 */
export function parseExecutionId(executionId: string): {
  baseJobId: string;
  vendorCode: string;
  vendorCount: number;
} | null {
  const match = executionId.match(/^([A-Z]+\d*-\d+)-(\w+)\.(\d+)$/);
  if (!match) return null;

  return {
    baseJobId: match[1],
    vendorCode: match[2],
    vendorCount: parseInt(match[3], 10),
  };
}

/**
 * Parse a change order ID into its components.
 *
 * @param changeOrderId - Change order ID (e.g., ME2-3000-CO1)
 * @returns Object with baseJobId and version, or null if invalid
 */
export function parseChangeOrderId(changeOrderId: string): {
  baseJobId: string;
  version: number;
} | null {
  const match = changeOrderId.match(/^([A-Z]+\d*-\d+)-CO(\d+)$/);
  if (!match) return null;

  return {
    baseJobId: match[1],
    version: parseInt(match[2], 10),
  };
}

/**
 * Get the next change order version for a job.
 *
 * @param prisma - Prisma client
 * @param jobId - Job ID
 * @returns Next version number (1 if no COs exist)
 */
export async function getNextChangeOrderVersion(
  prisma: PrismaClient,
  jobId: string
): Promise<number> {
  const maxVersion = await prisma.changeOrder.aggregate({
    where: { jobId },
    _max: { version: true },
  });

  return (maxVersion._max.version || 0) + 1;
}

/**
 * Generate a complete change order ID for a job.
 * Fetches job's baseJobId and calculates next version.
 *
 * @param prisma - Prisma client
 * @param jobId - Job ID
 * @returns Change order ID and version
 */
export async function generateChangeOrderIdForJob(
  prisma: PrismaClient,
  jobId: string
): Promise<{ changeOrderNo: string; version: number }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { baseJobId: true },
  });

  if (!job?.baseJobId) {
    throw new Error(`Job ${jobId} does not have a baseJobId`);
  }

  const version = await getNextChangeOrderVersion(prisma, jobId);
  const changeOrderNo = generateChangeOrderId(job.baseJobId, version);

  return { changeOrderNo, version };
}
