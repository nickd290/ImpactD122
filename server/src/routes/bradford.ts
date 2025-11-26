import express from 'express';
import { getBradfordStats } from '../controllers/bradfordStatsController';

const router = express.Router();

// Get Bradford statistics
router.get('/stats', getBradfordStats);

export default router;
