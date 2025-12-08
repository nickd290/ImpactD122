import express from 'express';
import { getBradfordStats, updateBradfordPO, captureBradfordPOFromEmail } from '../controllers/bradfordStatsController';

const router = express.Router();

// Get Bradford statistics
router.get('/stats', getBradfordStats);

// Update Bradford PO number for a job
router.put('/jobs/:jobId/po', updateBradfordPO);

// Capture Bradford PO from email subject (for Zapier integration)
// POST /api/bradford/capture-po
// Body: { subject: "BGE LTD Print Order PO# 1227880 J-2045" }
// Or: { bradfordPO: "1227880", jobNo: "J-2045" }
router.post('/capture-po', captureBradfordPOFromEmail);

// Also support GET for easier Zapier setup (use query params)
// GET /api/bradford/capture-po?subject=BGE%20LTD%20Print%20Order%20PO%23%201227880%20J-2045
router.get('/capture-po', captureBradfordPOFromEmail);

export default router;
