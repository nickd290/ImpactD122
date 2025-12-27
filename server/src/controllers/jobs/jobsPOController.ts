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

    // Determine origin/target based on poType
    let originCompanyId: string;
    let targetCompanyId: string | null = null;
    let targetVendorId: string | null = null;
    let poNumber: string;

    if (poType === 'bradford-jd') {
      // Bradford → JD Graphic (internal tracking, NOT Impact's cost)
      originCompanyId = COMPANY_IDS.BRADFORD;
      targetCompanyId = COMPANY_IDS.JD_GRAPHIC;

      // Keep existing format for Bradford→JD POs
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 6);
      poNumber = `PO-BJ-${timestamp}-${random}`;
    } else {
      // Impact → Vendor (counts as our cost) - default
      originCompanyId = COMPANY_IDS.IMPACT_DIRECT;
      targetVendorId = vendorId || null;

      // PO format: {jobDigits}-{random4}.{seq} (per vendor per job)
      if (vendorId) {
        // Get job number digits only (strip "J-" prefix)
        const jobDigits = job.jobNo.replace(/^J-/i, '');

        // Check if this vendor already has a PO for this job (reuse random4)
        const existingVendorPO = await prisma.purchaseOrder.findFirst({
          where: { jobId, targetVendorId: vendorId },
          orderBy: { createdAt: 'asc' },
        });

        let random4: string;
        if (existingVendorPO?.poNumber) {
          // Extract random4 from existing PO: "2056-9283.1" → "9283"
          const match = existingVendorPO.poNumber.match(/-(\d{4})\./);
          random4 = match?.[1] || Math.floor(1000 + Math.random() * 9000).toString();
        } else {
          // Generate new random 4-digit suffix for this vendor on this job
          random4 = Math.floor(1000 + Math.random() * 9000).toString();
        }

        // Count existing POs for sequence
        const existingPOCount = await prisma.purchaseOrder.count({
          where: { jobId, targetVendorId: vendorId },
        });
        const sequenceNum = existingPOCount + 1;

        poNumber = `${jobDigits}-${random4}.${sequenceNum}`;
      } else {
        // No vendor specified, use fallback format
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 6);
        poNumber = `PO-IV-${timestamp}-${random}`;
      }
    }

    const po = await prisma.purchaseOrder.create({
      data: {
        id: crypto.randomUUID(),
        poNumber,
        jobId,
        originCompanyId,
        targetCompanyId,
        targetVendorId,
        description: description || 'Vendor Services',
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

    // Recalculate profit split now that a PO has been added
    await recalculateProfitSplit(jobId, [...(job.PurchaseOrder || []), po]);

    res.status(201).json({
      id: po.id,
      poNumber: po.poNumber,
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

    // Recalculate profit split after PO deletion (only if linked to a job)
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
 * Recalculate profit split for a job based on its POs
 * Only considers Impact-origin POs as costs
 */
async function recalculateProfitSplit(jobId: string, allPOs: any[]): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { sellPrice: true },
  });

  if (!job) return;

  // Sum ALL Impact-origin POs (Impact → any vendor counts as our cost)
  const impactPOs = allPOs.filter((p: any) => isImpactOriginPO(p));
  const totalCost = impactPOs.reduce((sum, p) => sum + (Number(p.buyCost) || 0), 0);
  const totalPaperCost = impactPOs.reduce((sum, p) => sum + (Number(p.paperCost) || 0), 0);
  const totalPaperMarkup = impactPOs.reduce((sum, p) => sum + (Number(p.paperMarkup) || 0), 0);

  const sellPrice = Number(job.sellPrice) || 0;

  // Calculate profit split
  const split = calculateProfitSplit({
    sellPrice,
    totalCost,
    paperMarkup: totalPaperMarkup,
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
