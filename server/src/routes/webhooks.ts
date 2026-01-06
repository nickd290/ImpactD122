import { Router } from 'express';
import {
  receiveJobWebhook,
  receiveCampaignWebhook,
  receiveEmailToJobWebhook,
  webhookHealth,
  linkExternalJob,
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

// Link an existing job to external job ID (for syncing jobs created separately)
router.post('/link-job', linkExternalJob);

export default router;
