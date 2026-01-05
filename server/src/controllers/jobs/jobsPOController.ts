/**
 * Jobs PO Controller
 *
 * Handles Purchase Order operations for jobs:
 * - Get POs for a job
 * - Create new POs
 * - Update existing POs
 * - Delete POs
 *
 * PO Types:
 * - Impact → Bradford (BRADFORD_JD routing)
 * - Bradford → JD (internal tracking)
 * - Impact → Vendor (third-party vendors)
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { calculateProfitSplit } from '../../services/pricingService';
import { COMPANY_IDS, isImpactOriginPO } from '../../constants';
import { createImpactVendorPO as createVendorPOWithExecutionId } from '../../services/poService';
import { Pathway } from '@prisma/client';

// ============================================================================
// PO NUMBER GENERATION
// ============================================================================

/**
 * Generate a new PO number with format PO-XXXX
 */
async function generatePONumber(): Promise<string> {
  const lastPO = await prisma.purchaseOrder.findFirst({
    where: {
      poNumber: {
        startsWith: 'PO-',
      },
    },
    orderBy: {
      poNumber: 'desc',
    },
  });

  if (lastPO?.poNumber) {
    const match = lastPO.poNumber.match(/PO-(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1]) + 1;
      return `PO-${nextNum.toString().padStart(4, '0')}`;
    }
  }
  return 'PO-0001';
}

// ============================================================================
// PO CRUD OPERATIONS
// ============================================================================

/**
 * Get all POs for a job
 */
export const getJobPOs = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const pos = await prisma.purchaseOrder.findMany({
      where: { jobId },
      include: {
        Vendor: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const transformed = pos.map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      executionId: po.executionId, // Sprint 3: Vendor-specific ID
      originCompanyId: po.originCompanyId,
      targetCompanyId: po.targetCompanyId,
      description: po.description || 'Vendor Services',
      buyCost: Number(po.buyCost) || 0,
      paperCost: po.paperCost ? Number(po.paperCost) : null,
      paperMarkup: po.paperMarkup ? Number(po.paperMarkup) : null,
      mfgCost: po.mfgCost ? Number(po.mfgCost) : null,
      printCPM: po.printCPM ? Number(po.printCPM) : null,
      paperCPM: po.paperCPM ? Number(po.paperCPM) : null,
      vendorRef: po.vendorRef || '',
      vendorId: po.targetVendorId,
      status: po.status,
      issuedAt: po.issuedAt,
      paidAt: po.paidAt,
      createdAt: po.createdAt,
      // Email tracking
      emailedAt: po.emailedAt,
      emailedTo: po.emailedTo,
      vendor: po.Vendor
        ? {
            id: po.Vendor.id,
            name: po.Vendor.name,
          }
        : null,
    }));

    res.json(transformed);
  } catch (error) {
    console.error('Get job POs error:', error);
    res.status(500).json({ error: 'Failed to fetch POs' });
  }
};

/**
 * Create a new PO for a job
 *
 * Sprint 3 Pathway-Specific Behavior:
 * - P1 (bradford-jd): NO executionId, internal tracking only
 * - P2/P3 (vendor): executionId generated from baseJobId-vendorCode.vendorCount
 *
 * @param poType - 'bradford-jd' for internal tracking, or 'vendor' for Impact→Vendor
 */
export const createJobPO = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const {
      poType,
      vendorId,
      description,
      buyCost,
      paperCost,
      paperMarkup,
      mfgCost,
      printCPM,
      paperCPM,
      vendorRef,
      status,
    } = req.body;

    // Verify job exists and get current data
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        PurchaseOrder: true,
      },
    });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let po: any;

    if (poType === 'bradford-jd') {
      // ===================================================================
      // P1: Bradford → JD Graphic (internal tracking, NOT Impact's cost)
      // NO executionId - this is internal routing only
      // ===================================================================
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 6);
      const poNumber = `PO-BJ-${timestamp}-${random}`;

      po = await prisma.purchaseOrder.create({
        data: {
          id: crypto.randomUUID(),
          poNumber,
          jobId,
          originCompanyId: COMPANY_IDS.BRADFORD,
          targetCompanyId: COMPANY_IDS.JD_GRAPHIC,
          // NO executionId for P1 internal POs
          description: description || 'Bradford → JD Production',
          buyCost: buyCost || 0,
          paperCost: paperCost || null,
          paperMarkup: paperMarkup || null,
          mfgCost: mfgCost || null,
          printCPM: printCPM || null,
          paperCPM: paperCPM || null,
          vendorRef: vendorRef || null,
          status: status || 'PENDING',
          updatedAt: new Date(),
        },
        include: {
          Vendor: true,
        },
      });
    } else {
      // ===================================================================
      // P2/P3: Impact → Vendor (counts as our cost)
      // GENERATES executionId via poService.createImpactVendorPO
      // ===================================================================
      if (!vendorId) {
        return res.status(400).json({
          error: 'vendorId is required for vendor POs',
          hint: 'Vendor POs require a target vendor to generate executionId',
        });
      }

      // Generate PO number (legacy format for backward compatibility)
      const jobDigits = job.jobNo.replace(/^J-/i, '');
      const existingVendorPO = await prisma.purchaseOrder.findFirst({
        where: { jobId, targetVendorId: vendorId },
        orderBy: { createdAt: 'asc' },
      });

      let random4: string;
      if (existingVendorPO?.poNumber) {
        const match = existingVendorPO.poNumber.match(/-(\d{4})\./);
        random4 = match?.[1] || Math.floor(1000 + Math.random() * 9000).toString();
      } else {
        random4 = Math.floor(1000 + Math.random() * 9000).toString();
      }

      const existingPOCount = await prisma.purchaseOrder.count({
        where: { jobId, targetVendorId: vendorId },
      });
      const sequenceNum = existingPOCount + 1;
      const poNumber = `${jobDigits}-${random4}.${sequenceNum}`;

      try {
        // Use new function that generates executionId
        po = await createVendorPOWithExecutionId(jobId, vendorId, {
          buyCost,
          description: description || 'Vendor Services',
          poNumber,
        });

        // Fetch vendor for response (createVendorPOWithExecutionId doesn't include it)
        const vendor = await prisma.vendor.findUnique({
          where: { id: vendorId },
          select: { id: true, name: true },
        });
        po.Vendor = vendor;
      } catch (err: any) {
        // Handle specific errors from poService
        if (err.message.includes('missing vendorCode')) {
          return res.status(400).json({
            error: 'Vendor missing vendorCode',
            details: err.message,
            hint: 'Update the vendor record with a unique vendorCode before creating a PO',
          });
        }
        if (err.message.includes('does not have a baseJobId')) {
          return res.status(400).json({
            error: 'Job missing baseJobId',
            details: err.message,
            hint: 'Jobs created before pathway system do not have baseJobId. Edit and save the job to generate one.',
          });
        }
        throw err;
      }

      // === Update job.vendorCount ===
      await updateJobVendorCount(jobId);
    }

    // Recalculate profit split now that a PO has been added
    await recalculateProfitSplit(jobId, [...(job.PurchaseOrder || []), po]);

    res.status(201).json({
      id: po.id,
      poNumber: po.poNumber,
      executionId: po.executionId || null, // Sprint 3: Include executionId
      originCompanyId: po.originCompanyId,
      targetCompanyId: po.targetCompanyId,
      description: po.description,
      buyCost: Number(po.buyCost),
      paperCost: po.paperCost ? Number(po.paperCost) : null,
      paperMarkup: po.paperMarkup ? Number(po.paperMarkup) : null,
      mfgCost: po.mfgCost ? Number(po.mfgCost) : null,
      printCPM: po.printCPM ? Number(po.printCPM) : null,
      paperCPM: po.paperCPM ? Number(po.paperCPM) : null,
      vendorRef: po.vendorRef,
      vendorId: po.targetVendorId,
      status: po.status,
      vendor: po.Vendor ? { id: po.Vendor.id, name: po.Vendor.name } : null,
    });
  } catch (error) {
    console.error('Create PO error:', error);
    res.status(500).json({ error: 'Failed to create PO' });
  }
};

/**
 * Update an existing PO
 *
 * Sprint 3 CRITICAL RULE:
 * - executionId is NEVER mutated. New scope = new PO. Always.
 * - If vendor changes, create a new PO instead of updating.
 */
export const updatePO = async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const {
      vendorId,
      description,
      buyCost,
      paperCost,
      paperMarkup,
      mfgCost,
      printCPM,
      paperCPM,
      vendorRef,
      status,
      issuedAt,
      paidAt,
    } = req.body;

    // === Sprint 3: Block vendor changes on existing vendor POs with executionId ===
    // If vendor changes, user should delete this PO and create a new one
    if (vendorId !== undefined) {
      const existingPO = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        select: { targetVendorId: true, executionId: true },
      });

      if (existingPO?.executionId && existingPO.targetVendorId !== vendorId) {
        return res.status(400).json({
          error: 'Cannot change vendor on a PO with executionId',
          details: 'executionId is tied to the original vendor and cannot be regenerated',
          hint: 'Delete this PO and create a new one for the different vendor',
          existingExecutionId: existingPO.executionId,
        });
      }
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (vendorId !== undefined) updateData.targetVendorId = vendorId;
    if (description !== undefined) updateData.description = description;
    if (buyCost !== undefined) updateData.buyCost = buyCost;
    if (paperCost !== undefined) updateData.paperCost = paperCost;
    if (paperMarkup !== undefined) updateData.paperMarkup = paperMarkup;
    if (mfgCost !== undefined) updateData.mfgCost = mfgCost;
    // CPM rates for audit trail
    if (printCPM !== undefined) updateData.printCPM = printCPM;
    if (paperCPM !== undefined) updateData.paperCPM = paperCPM;
    if (vendorRef !== undefined) updateData.vendorRef = vendorRef;
    if (status !== undefined) updateData.status = status;
    if (issuedAt !== undefined) updateData.issuedAt = issuedAt ? new Date(issuedAt) : null;
    if (paidAt !== undefined) updateData.paidAt = paidAt ? new Date(paidAt) : null;

    // NEVER include executionId in updateData - it's immutable

    const po = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: updateData,
      include: {
        Vendor: true,
      },
    });

    // Recalculate ProfitSplit after PO update (if linked to a job)
    if (po.jobId) {
      const job = await prisma.job.findUnique({
        where: { id: po.jobId },
        include: {
          PurchaseOrder: true,
        },
      });

      if (job) {
        await recalculateProfitSplit(po.jobId, job.PurchaseOrder || []);
      }
    }

    res.json({
      id: po.id,
      poNumber: po.poNumber,
      executionId: po.executionId || null, // Sprint 3: Include executionId (read-only)
      originCompanyId: po.originCompanyId,
      targetCompanyId: po.targetCompanyId,
      description: po.description,
      buyCost: Number(po.buyCost),
      paperCost: po.paperCost ? Number(po.paperCost) : null,
      paperMarkup: po.paperMarkup ? Number(po.paperMarkup) : null,
      mfgCost: po.mfgCost ? Number(po.mfgCost) : null,
      printCPM: po.printCPM ? Number(po.printCPM) : null,
      paperCPM: po.paperCPM ? Number(po.paperCPM) : null,
      vendorRef: po.vendorRef,
      vendorId: po.targetVendorId,
      status: po.status,
      issuedAt: po.issuedAt,
      paidAt: po.paidAt,
      vendor: po.Vendor ? { id: po.Vendor.id, name: po.Vendor.name } : null,
    });
  } catch (error) {
    console.error('Update PO error:', error);
    res.status(500).json({ error: 'Failed to update PO' });
  }
};

/**
 * Delete a PO
 * Prevents deletion after invoice generated for financial integrity
 *
 * Sprint 3: Updates job.vendorCount after deletion
 */
export const deletePO = async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;

    // Get the PO first to find the job
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
    });

    if (!po) {
      return res.status(404).json({ error: 'PO not found' });
    }

    const jobId = po.jobId;
    const isVendorPO = po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT && po.targetVendorId;

    // Guard: Prevent PO deletion after invoice generated
    if (jobId) {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (job?.invoiceGeneratedAt) {
        return res.status(403).json({
          error: 'Cannot delete PO after invoice generated',
          invoiceGeneratedAt: job.invoiceGeneratedAt,
          hint: 'Job is locked for financial integrity',
        });
      }
    }

    // Delete the PO
    await prisma.purchaseOrder.delete({
      where: { id: poId },
    });

    // Recalculate profit split and vendorCount after PO deletion
    if (jobId) {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          PurchaseOrder: true,
        },
      });

      if (job) {
        await recalculateProfitSplit(jobId, job.PurchaseOrder || []);
      }

      // Sprint 3: Update vendorCount if this was a vendor PO
      if (isVendorPO) {
        await updateJobVendorCount(jobId);
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete PO error:', error);
    res.status(500).json({ error: 'Failed to delete PO' });
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update job.vendorCount based on distinct vendors in vendor POs
 * Called after PO create/delete to keep vendorCount in sync
 *
 * CRITICAL PATHWAY RULES:
 * - P1 is ONLY determined by routingType === BRADFORD_JD (workflow-based)
 * - P1 is NEVER changed automatically by vendorCount
 * - P2 ↔ P3 transitions are based on vendorCount (for non-P1 jobs only)
 */
async function updateJobVendorCount(jobId: string): Promise<void> {
  const vendorPOs = await prisma.purchaseOrder.findMany({
    where: {
      jobId,
      originCompanyId: COMPANY_IDS.IMPACT_DIRECT,
      targetVendorId: { not: null },
    },
    select: { targetVendorId: true },
  });

  const distinctVendorIds = new Set(vendorPOs.map(po => po.targetVendorId));
  const vendorCount = distinctVendorIds.size;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { pathway: true, routingType: true },
  });

  // CRITICAL: P1 is determined by routingType, NEVER by vendorCount
  // If routingType is BRADFORD_JD, pathway MUST remain P1 (or be set to P1)
  // Never auto-transition TO P1 from P2/P3
  // Never auto-transition FROM P1 to P2/P3
  let newPathway = job?.pathway;

  if (job?.routingType === 'BRADFORD_JD') {
    // P1 workflow - pathway should be P1, don't change based on vendorCount
    newPathway = Pathway.P1;
  } else if (job?.pathway !== Pathway.P1) {
    // Non-P1 job: P2 vs P3 is determined by vendorCount
    // Only transition between P2 and P3, never to P1
    newPathway = vendorCount > 1 ? Pathway.P3 : Pathway.P2;
  }
  // If current pathway is P1 but routingType is not BRADFORD_JD,
  // that's a data inconsistency - leave it alone for manual review

  await prisma.job.update({
    where: { id: jobId },
    data: {
      vendorCount,
      pathway: newPathway,
    },
  });
}

/**
 * Recalculate profit split for a job based on its POs
 * Only considers Impact-origin POs as costs
 */
async function recalculateProfitSplit(jobId: string, allPOs: any[]): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { sellPrice: true, routingType: true },
  });

  if (!job) return;

  // Sum ALL Impact-origin POs (Impact → any vendor counts as our cost)
  const impactPOs = allPOs.filter((p: any) => isImpactOriginPO(p));
  const totalCost = impactPOs.reduce((sum, p) => sum + (Number(p.buyCost) || 0), 0);
  const totalPaperCost = impactPOs.reduce((sum, p) => sum + (Number(p.paperCost) || 0), 0);
  const totalPaperMarkup = impactPOs.reduce((sum, p) => sum + (Number(p.paperMarkup) || 0), 0);

  const sellPrice = Number(job.sellPrice) || 0;

  // Calculate profit split
  const routingType = job.routingType || 'BRADFORD_JD';
  const split = calculateProfitSplit({
    sellPrice,
    totalCost,
    paperMarkup: totalPaperMarkup,
    routingType,
  });

  // Upsert ProfitSplit record
  await prisma.profitSplit.upsert({
    where: { jobId },
    create: {
      jobId,
      sellPrice,
      totalCost,
      paperCost: totalPaperCost,
      paperMarkup: totalPaperMarkup,
      grossMargin: split.grossMargin,
      bradfordShare: split.bradfordTotal,
      impactShare: split.impactTotal,
      calculatedAt: new Date(),
    },
    update: {
      sellPrice,
      totalCost,
      paperCost: totalPaperCost,
      paperMarkup: totalPaperMarkup,
      grossMargin: split.grossMargin,
      bradfordShare: split.bradfordTotal,
      impactShare: split.impactTotal,
      calculatedAt: new Date(),
    },
  });
}
