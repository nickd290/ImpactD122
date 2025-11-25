import { Router } from 'express';
import { generateQuote, generateInvoice, generateVendorPO } from '../controllers/pdfController';

const router = Router();

router.get('/quote/:jobId', generateQuote);
router.get('/invoice/:jobId', generateInvoice);
router.get('/vendor-po/:jobId', generateVendorPO);

export default router;
