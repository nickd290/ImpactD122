import { Router } from 'express';
import { generateQuote, generateInvoice, generateVendorPO, generatePurchaseOrderPDF } from '../controllers/pdfController';

const router = Router();

router.get('/quote/:jobId', generateQuote);
router.get('/invoice/:jobId', generateInvoice);
router.get('/vendor-po/:jobId', generateVendorPO);
router.get('/po/:poId', generatePurchaseOrderPDF);

export default router;
