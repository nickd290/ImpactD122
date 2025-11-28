import { Router } from 'express';
import { emailInvoice, emailPO } from '../controllers/emailController';

const router = Router();

// Email invoice to customer
router.post('/invoice/:jobId', emailInvoice);

// Email PO to vendor
router.post('/po/:poId', emailPO);

export default router;
