/**
 * Purchase Order Service
 *
 * Centralized PO creation helpers to eliminate duplicate code across controllers.
 */

import crypto from 'crypto';
import { prisma } from '../utils/prisma';

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
 */
export async function createImpactVendorPO(
  jobId: string,
  vendorId: string,
  buyCost?: number | null,
  description?: string | null
) {
  return prisma.purchaseOrder.create({
    data: {
      id: crypto.randomUUID(),
      poNumber: generatePONumber('IV'),
      jobId,
      originCompanyId: 'impact-direct',
      targetVendorId: vendorId,
      status: 'PENDING',
      buyCost: buyCost ?? null,
      description: description ?? null,
      updatedAt: new Date()
    }
  });
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
