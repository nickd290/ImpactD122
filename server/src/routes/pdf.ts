import { Router } from 'express';
import { generateQuote, generateInvoice, generateVendorPO, generatePurchaseOrderPDF, generateCustomerStatement } from '../controllers/pdfController';

const router = Router();

router.get('/quote/:jobId', generateQuote);
router.get('/invoice/:jobId', generateInvoice);
router.get('/vendor-po/:jobId', generateVendorPO);
router.get('/po/:poId', generatePurchaseOrderPDF);
router.get('/statement/:companyId', generateCustomerStatement);

export default router;
