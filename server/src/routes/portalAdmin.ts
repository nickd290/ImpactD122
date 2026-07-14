import { Router } from 'express';
import { getOrCreatePortal } from '../controllers/portalController';

const router = Router();

// Protected endpoint - create/get portal link for a job (requires internal auth)
router.post('/jobs/:jobId/portal', getOrCreatePortal);

export default router;
