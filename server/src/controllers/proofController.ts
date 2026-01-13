import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import crypto from 'crypto';

/**
 * Approve or request changes on a proof
 * POST /api/proofs/:proofId/approve
 */
export const approveProof = async (req: Request, res: Response) => {
  try {
    const { proofId } = req.params;
    const { approved, comments, approvedBy } = req.body;

    // 1. Find proof with job info
    const proof = await prisma.proof.findUnique({
      where: { id: proofId },
      include: { Job: true },
    });

    if (!proof) {
      return res.status(404).json({ error: 'Proof not found' });
    }

    // 2. Create ProofApproval record
    const approval = await prisma.proofApproval.create({
      data: {
        id: crypto.randomUUID(),
        proofId,
        approved: Boolean(approved),
        comments: comments || null,
        approvedBy: approvedBy || 'Staff',
      },
    });

    // 3. Update Proof status
    const newStatus = approved ? 'APPROVED' : 'CHANGES_REQUESTED';
    await prisma.proof.update({
      where: { id: proofId },
      data: { status: newStatus },
    });

    // 4. Update Job workflow status
    // If approved: Move to APPROVED_PENDING_VENDOR (need to notify vendor to start production)
    // If changes requested: Move to AWAITING_PROOF_FROM_VENDOR (vendor needs to create new proof)
    const newWorkflowStatus = approved
      ? 'APPROVED_PENDING_VENDOR'
      : 'AWAITING_PROOF_FROM_VENDOR';

    await prisma.job.update({
      where: { id: proof.jobId },
      data: {
        workflowStatus: newWorkflowStatus,
        workflowUpdatedAt: new Date(),
      },
    });

    // 5. Create JobActivity log
    const actionDescription = approved
      ? `Proof v${proof.version} approved by ${approvedBy || 'Staff'}`
      : `Changes requested on proof v${proof.version}${comments ? `: ${comments}` : ''}`;

    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId: proof.jobId,
        action: approved ? 'PROOF_APPROVED' : 'PROOF_CHANGES_REQUESTED',
        changedBy: approvedBy || 'Staff',
        changedByRole: 'BROKER_ADMIN',
        newValue: actionDescription,
      },
    });

    // Return updated proof with approval
    const updatedProof = await prisma.proof.findUnique({
      where: { id: proofId },
      include: {
        File: true,
        ProofApproval: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    res.json({
      approval,
      proof: updatedProof,
    });
  } catch (error) {
    console.error('Error approving proof:', error);
    res.status(500).json({ error: 'Failed to process proof approval' });
  }
};

/**
 * Get all proofs for a job
 * GET /api/proofs/job/:jobId
 */
export const getJobProofs = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const proofs = await prisma.proof.findMany({
      where: { jobId },
      include: {
        File: true,
        ProofApproval: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { version: 'desc' },
    });

    res.json(proofs);
  } catch (error) {
    console.error('Error fetching job proofs:', error);
    res.status(500).json({ error: 'Failed to fetch proofs' });
  }
};

/**
 * Get approval history for a proof
 * GET /api/proofs/:proofId/approvals
 */
export const getProofApprovals = async (req: Request, res: Response) => {
  try {
    const { proofId } = req.params;

    // Verify proof exists
    const proof = await prisma.proof.findUnique({
      where: { id: proofId },
    });

    if (!proof) {
      return res.status(404).json({ error: 'Proof not found' });
    }

    const approvals = await prisma.proofApproval.findMany({
      where: { proofId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(approvals);
  } catch (error) {
    console.error('Error fetching proof approvals:', error);
    res.status(500).json({ error: 'Failed to fetch proof approvals' });
  }
};
