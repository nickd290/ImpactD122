/**
 * Change Order Controller
 *
 * Sprint 4: CRUD + Approval workflow for Change Orders
 *
 * Key Rules:
 * - COs must NOT overwrite Job specs - they attach deltas
 * - changeOrderNo format: {baseJobId}-CO{version}
 * - Approval updates Job.effectiveCOVersion
 * - Only the latest approved CO is "effective" for production
 */

import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { generateChangeOrderIdForJob } from '../services/jobIdService';
import { ChangeOrderStatus } from '@prisma/client';

/**
 * List all change orders for a job
 * GET /api/jobs/:jobId/change-orders
 */
export const listChangeOrders = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const changeOrders = await prisma.changeOrder.findMany({
      where: { jobId },
      orderBy: { version: 'desc' },
    });

    res.json(changeOrders);
  } catch (error) {
    console.error('List change orders error:', error);
    res.status(500).json({ error: 'Failed to list change orders' });
  }
};

/**
 * Get a single change order
 * GET /api/change-orders/:id
 */
export const getChangeOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const changeOrder = await prisma.changeOrder.findUnique({
      where: { id },
      include: {
        Job: {
          select: {
            id: true,
            jobNo: true,
            baseJobId: true,
            title: true,
            effectiveCOVersion: true,
          },
        },
      },
    });

    if (!changeOrder) {
      return res.status(404).json({ error: 'Change order not found' });
    }

    res.json(changeOrder);
  } catch (error) {
    console.error('Get change order error:', error);
    res.status(500).json({ error: 'Failed to get change order' });
  }
};

/**
 * Create a new change order (DRAFT status)
 * POST /api/jobs/:jobId/change-orders
 */
export const createChangeOrder = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { summary, changes, affectsVendors, requiresNewPO, requiresReprice } = req.body;

    // Verify job exists and has baseJobId
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, baseJobId: true },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!job.baseJobId) {
      return res.status(400).json({
        error: 'Job does not have a baseJobId. Edit and save the job to generate one.',
      });
    }

    if (!summary) {
      return res.status(400).json({ error: 'Summary is required' });
    }

    // Generate change order ID
    const { changeOrderNo, version } = await generateChangeOrderIdForJob(prisma, jobId);

    const changeOrder = await prisma.changeOrder.create({
      data: {
        jobId,
        changeOrderNo,
        version,
        summary,
        changes: changes || {},
        status: ChangeOrderStatus.DRAFT,
        affectsVendors: affectsVendors || [],
        requiresNewPO: requiresNewPO || false,
        requiresReprice: requiresReprice || false,
      },
    });

    res.status(201).json(changeOrder);
  } catch (error) {
    console.error('Create change order error:', error);
    res.status(500).json({ error: 'Failed to create change order' });
  }
};

/**
 * Update a draft change order
 * PATCH /api/change-orders/:id
 *
 * Only DRAFT change orders can be updated.
 */
export const updateChangeOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { summary, changes, affectsVendors, requiresNewPO, requiresReprice } = req.body;

    // Fetch existing CO
    const existing = await prisma.changeOrder.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Change order not found' });
    }

    // Only drafts can be updated
    if (existing.status !== ChangeOrderStatus.DRAFT) {
      return res.status(400).json({
        error: `Cannot update change order with status ${existing.status}. Only DRAFT change orders can be modified.`,
      });
    }

    const updated = await prisma.changeOrder.update({
      where: { id },
      data: {
        summary: summary !== undefined ? summary : existing.summary,
        changes: changes !== undefined ? changes : existing.changes,
        affectsVendors: affectsVendors !== undefined ? affectsVendors : existing.affectsVendors,
        requiresNewPO: requiresNewPO !== undefined ? requiresNewPO : existing.requiresNewPO,
        requiresReprice: requiresReprice !== undefined ? requiresReprice : existing.requiresReprice,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update change order error:', error);
    res.status(500).json({ error: 'Failed to update change order' });
  }
};

/**
 * Delete a draft change order
 * DELETE /api/change-orders/:id
 *
 * Only DRAFT change orders can be deleted.
 */
export const deleteChangeOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.changeOrder.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Change order not found' });
    }

    // Only drafts can be deleted
    if (existing.status !== ChangeOrderStatus.DRAFT) {
      return res.status(400).json({
        error: `Cannot delete change order with status ${existing.status}. Only DRAFT change orders can be deleted.`,
      });
    }

    await prisma.changeOrder.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Change order deleted' });
  } catch (error) {
    console.error('Delete change order error:', error);
    res.status(500).json({ error: 'Failed to delete change order' });
  }
};

/**
 * Submit a change order for approval
 * POST /api/change-orders/:id/submit
 *
 * Transitions: DRAFT → PENDING_APPROVAL
 */
export const submitForApproval = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.changeOrder.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Change order not found' });
    }

    if (existing.status !== ChangeOrderStatus.DRAFT) {
      return res.status(400).json({
        error: `Cannot submit change order with status ${existing.status}. Only DRAFT change orders can be submitted.`,
      });
    }

    const updated = await prisma.changeOrder.update({
      where: { id },
      data: {
        status: ChangeOrderStatus.PENDING_APPROVAL,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Submit change order error:', error);
    res.status(500).json({ error: 'Failed to submit change order' });
  }
};

/**
 * Approve a change order
 * POST /api/change-orders/:id/approve
 *
 * Transitions: PENDING_APPROVAL → APPROVED
 * Also updates Job.effectiveCOVersion
 */
export const approveChangeOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approvedBy } = req.body;

    const existing = await prisma.changeOrder.findUnique({
      where: { id },
      include: { Job: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Change order not found' });
    }

    if (existing.status !== ChangeOrderStatus.PENDING_APPROVAL) {
      return res.status(400).json({
        error: `Cannot approve change order with status ${existing.status}. Only PENDING_APPROVAL change orders can be approved.`,
      });
    }

    // Approve CO and update Job's effectiveCOVersion in a transaction
    const [updated] = await prisma.$transaction([
      prisma.changeOrder.update({
        where: { id },
        data: {
          status: ChangeOrderStatus.APPROVED,
          approvedAt: new Date(),
          approvedBy: approvedBy || 'system',
        },
      }),
      prisma.job.update({
        where: { id: existing.jobId },
        data: {
          effectiveCOVersion: existing.version,
          updatedAt: new Date(),
        },
      }),
    ]);

    res.json(updated);
  } catch (error) {
    console.error('Approve change order error:', error);
    res.status(500).json({ error: 'Failed to approve change order' });
  }
};

/**
 * Reject a change order
 * POST /api/change-orders/:id/reject
 *
 * Transitions: PENDING_APPROVAL → REJECTED
 */
export const rejectChangeOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const existing = await prisma.changeOrder.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Change order not found' });
    }

    if (existing.status !== ChangeOrderStatus.PENDING_APPROVAL) {
      return res.status(400).json({
        error: `Cannot reject change order with status ${existing.status}. Only PENDING_APPROVAL change orders can be rejected.`,
      });
    }

    const updated = await prisma.changeOrder.update({
      where: { id },
      data: {
        status: ChangeOrderStatus.REJECTED,
        rejectionReason: rejectionReason || null,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Reject change order error:', error);
    res.status(500).json({ error: 'Failed to reject change order' });
  }
};

/**
 * Get effective job state (base + approved COs)
 * GET /api/jobs/:jobId/effective-state
 *
 * Computes the effective job specs by applying all approved COs in order.
 */
export const getEffectiveJobState = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        ChangeOrder: {
          where: { status: ChangeOrderStatus.APPROVED },
          orderBy: { version: 'asc' },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Start with base job specs
    let effectiveSpecs = { ...(job.specs as Record<string, unknown> || {}) };

    // Apply approved COs in version order
    for (const co of job.ChangeOrder) {
      const changes = co.changes as Record<string, unknown> || {};
      effectiveSpecs = { ...effectiveSpecs, ...changes };
    }

    const latestApprovedCO = job.ChangeOrder.length > 0
      ? job.ChangeOrder[job.ChangeOrder.length - 1]
      : null;

    res.json({
      jobId: job.id,
      jobNo: job.jobNo,
      baseJobId: job.baseJobId,
      effectiveCOVersion: job.effectiveCOVersion,
      latestApprovedCO: latestApprovedCO ? {
        id: latestApprovedCO.id,
        changeOrderNo: latestApprovedCO.changeOrderNo,
        version: latestApprovedCO.version,
        summary: latestApprovedCO.summary,
        approvedAt: latestApprovedCO.approvedAt,
      } : null,
      baseSpecs: job.specs,
      effectiveSpecs,
      appliedCOCount: job.ChangeOrder.length,
    });
  } catch (error) {
    console.error('Get effective state error:', error);
    res.status(500).json({ error: 'Failed to get effective job state' });
  }
};
