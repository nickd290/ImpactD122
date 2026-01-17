import express from 'express';
import { getWhatsNext, setProofUrgency } from '../controllers/dashboardController';

const router = express.Router();

// Get "What's Next" dashboard data - all action buckets
router.get('/whats-next', getWhatsNext);

// Set proof urgency for a job (HOT, CRITICAL, NORMAL, or null to clear)
router.put('/jobs/:jobId/proof-urgency', setProofUrgency);

export default router;
