import { Router } from 'express';
import {
  accessPortal,
  downloadPortalPO,
  downloadPortalFile,
} from '../controllers/portalController';
import {
  confirmPO,
  updateVendorStatus,
  uploadVendorProofs,
  submitVendorProofLink,
  downloadAllFiles,
} from '../controllers/vendorPortalController';
import {
  getApprovalPage,
  submitApproval,
  getApprovalFile,
  addApprovalComment,
} from '../controllers/proofSheetController';
import multer from 'multer';

const router = Router();

// Configure multer for vendor proof uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Public endpoints - token-based auth (no internal auth required)
router.get('/portal/:token', accessPortal);
router.get('/portal/:token/po', downloadPortalPO);
router.get('/portal/:token/files/:fileId', downloadPortalFile);

// Vendor portal endpoints (public - token-based auth)
router.post('/portal/:token/confirm', confirmPO);
router.post('/portal/:token/status', updateVendorStatus);
router.post('/portal/:token/upload', upload.array('files', 10), uploadVendorProofs);
router.post('/portal/:token/proof-link', submitVendorProofLink);
router.get('/portal/:token/download-all', downloadAllFiles);

// Customer proof review (magic link - no login). Must stay on the public
// router so it mounts BEFORE the internal auth gate in index.ts.
router.get('/approve/:token', getApprovalPage);
router.post('/approve/:token', submitApproval);
router.get('/approve/:token/files/:fileId', getApprovalFile);
router.post('/approve/:token/comments', addApprovalComment);

export default router;
