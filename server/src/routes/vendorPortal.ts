import { Router } from 'express';
import { upload } from '../middleware/upload';
import {
  getVendorPortal,
  confirmPO,
  updateVendorStatus,
  uploadVendorProofs,
  downloadFile,
  downloadAllFiles,
  downloadPO,
} from '../controllers/vendorPortalController';

const router = Router();

// Get portal data
router.get('/:token', getVendorPortal);

// Confirm PO receipt
router.post('/:token/confirm', confirmPO);

// Update vendor status
router.post('/:token/status', updateVendorStatus);

// Upload vendor proofs (up to 10 files)
router.post('/:token/upload', upload.array('files', 10), uploadVendorProofs);

// Download single file
router.get('/:token/files/:fileId', downloadFile);

// Download all files as zip
router.get('/:token/download-all', downloadAllFiles);

// Download PO PDF
router.get('/:token/po', downloadPO);

export default router;
