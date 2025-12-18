import { Router } from 'express';
import {
  getOrCreatePortal,
  accessPortal,
  downloadPortalPO,
  downloadPortalFile,
} from '../controllers/portalController';
import {
  confirmPO,
  updateVendorStatus,
  uploadVendorProofs,
  downloadAllFiles,
} from '../controllers/vendorPortalController';
import multer from 'multer';

const router = Router();

// Configure multer for vendor proof uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Protected endpoint - create/get portal link for a job
router.post('/jobs/:jobId/portal', getOrCreatePortal);

// Public endpoints - no auth required
router.get('/portal/:token', accessPortal);
router.get('/portal/:token/po', downloadPortalPO);
router.get('/portal/:token/files/:fileId', downloadPortalFile);

// Vendor portal endpoints (public - token-based auth)
router.post('/portal/:token/confirm', confirmPO);
router.post('/portal/:token/status', updateVendorStatus);
router.post('/portal/:token/upload', upload.array('files', 10), uploadVendorProofs);
router.get('/portal/:token/download-all', downloadAllFiles);

export default router;
