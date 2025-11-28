import express from 'express';
import { getBradfordStats, updateBradfordPO } from '../controllers/bradfordStatsController';

const router = express.Router();

// Get Bradford statistics
router.get('/stats', getBradfordStats);

// Update Bradford PO number for a job
router.put('/jobs/:jobId/po', updateBradfordPO);

export default router;
