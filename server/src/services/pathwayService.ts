/**
 * Pathway Service - P1/P2/P3 Routing Detection
 *
 * Determines the correct pathway for a job based on routing type and vendor count.
 *
 * PATHWAY DEFINITIONS:
 * - P1: Bradford Partner (Impact → Bradford → JD), 50/50 split
 *       Detection: routingType === BRADFORD_JD (workflow-based, NOT vendor identity)
 * - P2: Single External Vendor, 65/35 split
 *       Detection: routingType !== BRADFORD_JD AND single vendor
 * - P3: Multi-Vendor, 65/35 split
 *       Detection: routingType !== BRADFORD_JD AND >1 vendor in execution map
 *
 * CRITICAL: P1 is a WORKFLOW route (uses Bradford as intermediary), NOT a vendor identity check.
 * JD as direct vendor = P2, not P1.
 */

import { Pathway, RoutingType, PrismaClient, Job, PurchaseOrder, JobComponent, ComponentOwner } from '@prisma/client';

// Types for job input (partial job data used for pathway detection)
export interface PathwayJobInput {
  routingType?: RoutingType | null;
  vendorId?: string | null;
  purchaseOrders?: Array<{
    targetVendorId?: string | null;
    originCompanyId?: string | null;
  }>;
  components?: Array<{
    owner?: ComponentOwner | null;
    vendorId?: string | null;
  }>;
}

// Extended job type with relations for pathway calculation
export type JobWithRelations = Job & {
  PurchaseOrder?: PurchaseOrder[];
  JobComponent?: JobComponent[];
};

/**
 * Determine the pathway for a job based on routing type and vendor configuration.
 *
 * Decision tree:
 * 1. If routingType === BRADFORD_JD → P1 (Bradford Partner workflow)
 * 2. If >1 vendor in execution map → P3 (Multi-Vendor)
 * 3. Otherwise → P2 (Single External Vendor)
 *
 * @param job - Job data with optional PO and component relations
 * @returns Pathway enum value (P1, P2, or P3)
 */
export function determinePathway(job: PathwayJobInput): Pathway {
  // P1: Bradford Partner WORKFLOW (not vendor identity!)
  // ONLY when routingType === BRADFORD_JD (Impact→Bradford→JD flow)
  if (job.routingType === RoutingType.BRADFORD_JD) {
    return Pathway.P1;
  }

  // P3: Multiple vendors in execution map
  const vendorCount = countDistinctVendors(job);
  if (vendorCount > 1) {
    return Pathway.P3;
  }

  // P2: Single external vendor (JD direct, ThreeZ, any other)
  // This includes JD when used directly (not through Bradford)
  return Pathway.P2;
}

/**
 * Count distinct vendors from job execution map.
 *
 * Source of truth priority (to match reality):
 * 1. Distinct vendorIds in vendor-targeted POs (POs exist before components are perfect)
 * 2. Distinct vendorIds in vendor-owned components
 * 3. Default to 1 (single vendor assumed)
 *
 * @param job - Job data with optional PO and component relations
 * @returns Number of distinct vendors
 */
export function countDistinctVendors(job: PathwayJobInput): number {
  const vendorIds = new Set<string>();

  // First: check POs (most reliable - POs are created first)
  // Look for POs from Impact to external vendors
  const vendorPOs = job.purchaseOrders?.filter(
    po => po.targetVendorId && po.originCompanyId
  );

  if (vendorPOs && vendorPOs.length > 0) {
    vendorPOs.forEach(po => {
      if (po.targetVendorId) {
        vendorIds.add(po.targetVendorId);
      }
    });
    if (vendorIds.size > 0) {
      return vendorIds.size;
    }
  }

  // Fallback: check vendor-owned components
  const vendorComponents = job.components?.filter(
    c => c.owner === ComponentOwner.VENDOR && c.vendorId
  );

  if (vendorComponents && vendorComponents.length > 0) {
    vendorComponents.forEach(c => {
      if (c.vendorId) {
        vendorIds.add(c.vendorId);
      }
    });
    if (vendorIds.size > 0) {
      return vendorIds.size;
    }
  }

  // Default: assume single vendor if we have a vendorId on the job
  if (job.vendorId) {
    return 1;
  }

  // No vendor information yet - default to 1
  return 1;
}

/**
 * Determine pathway for an existing job by fetching its relations.
 *
 * @param prisma - Prisma client
 * @param jobId - Job ID to check
 * @returns Pathway enum value
 */
export async function determinePathwayForJob(
  prisma: PrismaClient,
  jobId: string
): Promise<Pathway> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      PurchaseOrder: {
        select: {
          targetVendorId: true,
          originCompanyId: true,
        },
      },
      JobComponent: {
        select: {
          owner: true,
          vendorId: true,
        },
      },
    },
  });

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  return determinePathway({
    routingType: job.routingType,
    vendorId: job.vendorId,
    purchaseOrders: job.PurchaseOrder,
    components: job.JobComponent,
  });
}

/**
 * Update pathway and vendor count for a job.
 * Should be called when vendor assignments change.
 *
 * @param prisma - Prisma client
 * @param jobId - Job ID to update
 */
export async function updateJobPathway(
  prisma: PrismaClient,
  jobId: string
): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      PurchaseOrder: {
        select: {
          targetVendorId: true,
          originCompanyId: true,
        },
      },
      JobComponent: {
        select: {
          owner: true,
          vendorId: true,
        },
      },
    },
  });

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const pathway = determinePathway({
    routingType: job.routingType,
    vendorId: job.vendorId,
    purchaseOrders: job.PurchaseOrder,
    components: job.JobComponent,
  });

  const vendorCount = countDistinctVendors({
    routingType: job.routingType,
    vendorId: job.vendorId,
    purchaseOrders: job.PurchaseOrder,
    components: job.JobComponent,
  });

  await prisma.job.update({
    where: { id: jobId },
    data: {
      pathway,
      vendorCount,
    },
  });
}

/**
 * Get profit split percentages based on pathway.
 *
 * @param pathway - P1, P2, or P3
 * @returns Object with impact and partner percentages
 */
export function getProfitSplitPercentages(pathway: Pathway): {
  impactPercent: number;
  partnerPercent: number;
} {
  if (pathway === Pathway.P1) {
    // Bradford Partner: 50/50 split
    return { impactPercent: 50, partnerPercent: 50 };
  }

  // P2 and P3: 65/35 split (Impact gets 65%)
  return { impactPercent: 65, partnerPercent: 35 };
}

/**
 * Check if a pathway is a partner workflow (P1).
 */
export function isPartnerPathway(pathway: Pathway | null | undefined): boolean {
  return pathway === Pathway.P1;
}

/**
 * Check if a pathway involves multiple vendors (P3).
 */
export function isMultiVendorPathway(pathway: Pathway | null | undefined): boolean {
  return pathway === Pathway.P3;
}
