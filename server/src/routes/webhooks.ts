import { Router } from 'express';
import {
  receiveJobWebhook,
  receiveCampaignWebhook,
  receiveEmailToJobWebhook,
  webhookHealth,
} from '../controllers/webhooksController';

const router = Router();

// Health check for webhook endpoint
router.get('/health', webhookHealth);

// Receive jobs from external portals (e.g., Impact Customer Portal)
router.post('/jobs', receiveJobWebhook);

// Receive campaigns from Impact Customer Portal
router.post('/campaigns', receiveCampaignWebhook);

// Email-to-Job import (from n8n/Zapier email forwarding)
router.post('/email-to-job', receiveEmailToJobWebhook);

export default router;
