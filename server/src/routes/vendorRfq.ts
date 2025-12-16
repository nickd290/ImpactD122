import { Router } from 'express';
import {
  listRFQs,
  getRFQ,
  createRFQ,
  updateRFQ,
  deleteRFQ,
  sendRFQ,
  recordQuote,
  awardToVendor,
  convertToJob,
  getQuoteForm,
  submitVendorQuote,
} from '../controllers/vendorRfqController';

const router = Router();

// ====== PUBLIC ROUTES (no auth required) ======
// Vendor quote submission form
router.get('/quote/:rfqId/:token', getQuoteForm);
router.post('/quote/:rfqId/:token', submitVendorQuote);

// List all RFQs with optional filters
router.get('/', listRFQs);

// Get single RFQ detail
router.get('/:id', getRFQ);

// Create new RFQ
router.post('/', createRFQ);

// Update RFQ (draft only)
router.patch('/:id', updateRFQ);

// Delete RFQ (draft only)
router.delete('/:id', deleteRFQ);

// Send RFQ emails to vendors
router.post('/:id/send', sendRFQ);

// Record vendor quote response (manual entry)
router.post('/:id/quotes', recordQuote);

// Award RFQ to vendor
router.post('/:id/award/:vendorId', awardToVendor);

// Convert awarded RFQ to job
router.post('/:id/convert-to-job', convertToJob);

export default router;
