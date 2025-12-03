import { Router } from 'express';
import { emailInvoice, emailPO, emailArtworkNotification } from '../controllers/emailController';

const router = Router();

// Email invoice to customer
router.post('/invoice/:jobId', emailInvoice);

// Email PO to vendor
router.post('/po/:poId', emailPO);

// Email artwork notification to vendor
router.post('/artwork/:jobId', emailArtworkNotification);

export default router;
