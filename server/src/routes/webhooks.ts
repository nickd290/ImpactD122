import { Router } from 'express';
import {
  receiveJobWebhook,
  webhookHealth,
} from '../controllers/webhooksController';

const router = Router();

// Health check for webhook endpoint
router.get('/health', webhookHealth);

// Receive jobs from external portals (e.g., Impact Customer Portal)
router.post('/jobs', receiveJobWebhook);

export default router;
