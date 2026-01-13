import { Router } from 'express';
import { approveProof, getProofApprovals, getJobProofs } from '../controllers/proofController';

const router = Router();

// Get all proofs for a job
router.get('/job/:jobId', getJobProofs);

// Approve or request changes on a proof
router.post('/:proofId/approve', approveProof);

// Get approval history for a proof
router.get('/:proofId/approvals', getProofApprovals);

export default router;
