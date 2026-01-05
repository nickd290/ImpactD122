/**
 * Purchase Order Service
 *
 * Centralized PO creation helpers to eliminate duplicate code across controllers.
 *
 * Sprint 3 Additions:
 * - Execution ID generation for vendor POs (P2/P3)
 * - vendorCount computation from existing POs
 * - vendorCode validation (fail hard if missing)
 */

import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { generateExecutionId } from './jobIdService';

/**
 * Generate a unique PO number with type prefix
 * Format: PO-{PREFIX}-{timestamp}-{random}
 */
function generatePONumber(prefix: string): string {
  return `PO-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Create a Bradford → JD Graphic internal PO
 * Used for tracking internal routing (NOT counted in Impact's cost)
 */
export async function createBradfordJDPO(
  jobId: string,
  options?: {
    poNumber?: string | null; // Override auto-generated PO number (for Bradford system PO#)
    printCPM?: number | null;
    mfgCost?: number | null;
    buyCost?: number | null;
    paperCost?: number | null;
    paperMarkup?: number | null;
    description?: string | null;
  }
) {
  return prisma.purchaseOrder.create({
    data: {
      id: crypto.randomUUID(),
      poNumber: options?.poNumber ?? generatePONumber('BJ'),
      jobId,
      originCompanyId: 'bradford',
      targetCompanyId: 'jd-graphic',
      status: 'PENDING',
      printCPM: options?.printCPM ?? null,
      mfgCost: options?.mfgCost ?? null,
      buyCost: options?.buyCost ?? 0,
      paperCost: options?.paperCost ?? 0,
      paperMarkup: options?.paperMarkup ?? 0,
      description: options?.description ?? null,
      updatedAt: new Date()
    }
  });
}

/**
 * Create an Impact Direct → Bradford PO
 * Used for Bradford pricing (counted in Impact's cost)
 */
export async function createImpactBradfordPO(jobId: string, buyCost?: number | null) {
  return prisma.purchaseOrder.create({
    data: {
      id: crypto.randomUUID(),
      poNumber: generatePONumber('IB'),
      jobId,
      originCompanyId: 'impact-direct',
      targetCompanyId: 'bradford',
      status: 'PENDING',
      buyCost: buyCost ?? null,
      updatedAt: new Date()
    }
  });
}

/**
 * Create an Impact Direct → Vendor PO
 * Used for external vendor pricing (counted in Impact's cost)
 *
 * Sprint 3 (CORRECTED): executionId is NOT assigned at creation.
 * executionId is assigned at "finalize/send" time to ensure consistent
 * vendorCount suffix across all P3 vendor POs.
 *
 * WHY: If we assign executionId at creation:
 * - First vendor PO gets `.1`
 * - Second vendor PO gets `.2`
 * - But P3 jobs should have BOTH end in `.2` (final vendor count)
 *
 * SOLUTION: POs are created without executionId, then finalized when ready to send.
 * See: finalizeVendorPOExecutionId()
 */
export async function createImpactVendorPO(
  jobId: string,
  vendorId: string,
  options?: {
    buyCost?: number | null;
    description?: string | null;
    poNumber?: string | null; // Override auto-generated PO number if provided
  }
) {
  // Verify job exists
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, baseJobId: true },
  });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Verify vendor exists (vendorCode check deferred to finalization)
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, name: true },
  });

  if (!vendor) {
    throw new Error(`Vendor ${vendorId} not found`);
  }

  // Create PO WITHOUT executionId (assigned at finalization/send time)
  return prisma.purchaseOrder.create({
    data: {
      id: crypto.randomUUID(),
      poNumber: options?.poNumber ?? generatePONumber('IV'),
      jobId,
      originCompanyId: 'impact-direct',
      targetVendorId: vendorId,
      // executionId: null - NOT assigned at creation, assigned at finalization
      status: 'PENDING',
      buyCost: options?.buyCost ?? null,
      description: options?.description ?? null,
      updatedAt: new Date(),
    },
  });
}

/**
 * Finalize a vendor PO's executionId before sending.
 *
 * Sprint 3: This is the ONLY place executionId is assigned.
 * Called when user clicks "Send PO" or "Finalize Vendor Set".
 *
 * CRITICAL RULES:
 * - If executionId already exists, return existing (immutable)
 * - Requires job.baseJobId (fail hard if missing)
 * - Requires vendor.vendorCode (fail hard if missing)
 * - vendorCount = CURRENT distinct ACTIVE vendors (excludes CANCELLED/REJECTED)
 *
 * RACE CONDITION PREVENTION:
 * Wrapped in $transaction to ensure atomic read-check-write.
 * Two concurrent "Send PO" clicks will serialize properly.
 *
 * @returns The PO with executionId assigned
 */
export async function finalizeVendorPOExecutionId(poId: string) {
  return prisma.$transaction(async (tx) => {
    // Fetch PO with job and vendor (row locked within transaction)
    const po = await tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        Job: { select: { id: true, baseJobId: true, pathway: true } },
        Vendor: { select: { id: true, name: true, vendorCode: true } },
      },
    });

    if (!po) {
      throw new Error(`PurchaseOrder ${poId} not found`);
    }

    // If executionId already exists, return as-is (immutable)
    // This is the idempotency check - safe within transaction
    if (po.executionId) {
      return po;
    }

    // Validate: must be a vendor PO
    if (po.originCompanyId !== 'impact-direct' || !po.targetVendorId) {
      throw new Error(`PO ${poId} is not a vendor PO - cannot assign executionId`);
    }

    // Validate: job must have baseJobId
    if (!po.Job?.baseJobId) {
      throw new Error(
        `Job ${po.jobId} does not have a baseJobId - cannot generate executionId. ` +
        `Edit and save the job to generate one.`
      );
    }

    // Validate: vendor must have vendorCode
    if (!po.Vendor?.vendorCode) {
      throw new Error(
        `Vendor "${po.Vendor?.name}" (${po.targetVendorId}) is missing vendorCode - cannot generate executionId. ` +
        `Update vendor record with a unique vendorCode before sending PO.`
      );
    }

    // Compute CURRENT vendorCount from ACTIVE POs only
    // Excludes CANCELLED and REJECTED to ensure stable count
    const allVendorPOs = await tx.purchaseOrder.findMany({
      where: {
        jobId: po.jobId,
        originCompanyId: 'impact-direct',
        targetVendorId: { not: null },
        status: { notIn: ['CANCELLED', 'REJECTED'] }, // Only count active POs
      },
      select: { targetVendorId: true },
    });

    const distinctVendorIds = new Set(allVendorPOs.map(p => p.targetVendorId));
    const vendorCount = distinctVendorIds.size;

    // Generate executionId
    const executionId = generateExecutionId(
      po.Job.baseJobId,
      po.Vendor.vendorCode,
      vendorCount
    );

    // Atomic update within transaction (one-time assignment)
    return tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        executionId,
        updatedAt: new Date(),
      },
      include: {
        Job: { select: { id: true, baseJobId: true, pathway: true } },
        Vendor: { select: { id: true, name: true, vendorCode: true } },
      },
    });
  });
}

/**
 * Finalize ALL vendor POs for a job at once.
 * Use this when finalizing the entire vendor set before production.
 *
 * Only finalizes ACTIVE POs (excludes CANCELLED/REJECTED).
 *
 * @returns Array of finalized POs with executionIds
 */
export async function finalizeAllVendorPOsForJob(jobId: string) {
  const vendorPOs = await prisma.purchaseOrder.findMany({
    where: {
      jobId,
      originCompanyId: 'impact-direct',
      targetVendorId: { not: null },
      executionId: null, // Only those not yet finalized
      status: { notIn: ['CANCELLED', 'REJECTED'] }, // Only active POs
    },
    select: { id: true },
  });

  const results = [];
  for (const po of vendorPOs) {
    const finalized = await finalizeVendorPOExecutionId(po.id);
    results.push(finalized);
  }

  return results;
}

/**
 * Sync vendor across all Impact→Vendor POs for a job
 * Called when Job.vendorId changes
 */
export async function syncJobVendorToPOs(jobId: string, newVendorId: string | null) {
  // Only update Impact→Vendor POs (not internal Bradford→JD or Impact→Bradford)
  return prisma.purchaseOrder.updateMany({
    where: {
      jobId,
      originCompanyId: 'impact-direct',
      targetCompanyId: null, // Vendor POs have null targetCompanyId
      targetVendorId: { not: null } // Only POs that have a vendor assigned
    },
    data: {
      targetVendorId: newVendorId,
      updatedAt: new Date()
    }
  });
}
