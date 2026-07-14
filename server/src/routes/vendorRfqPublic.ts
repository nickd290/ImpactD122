import { Router } from 'express';
import {
  getQuoteForm,
  submitVendorQuote,
} from '../controllers/vendorRfqController';

const router = Router();

// Public routes - vendor quote submission form (token-based, no internal auth)
router.get('/quote/:rfqId/:token', getQuoteForm);
router.post('/quote/:rfqId/:token', submitVendorQuote);

export default router;
