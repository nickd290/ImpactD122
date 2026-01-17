/**
 * Email Sync Routes
 * Webhook endpoints for n8n Gmail thread integration.
 *
 * All endpoints (except health) require x-webhook-secret header.
 */

import { Router } from 'express';
import {
  validateEmailSyncSecret,
  upsertThreadHandler,
  createEventHandler,
  matchEmailHandler,
  getNeedsReviewHandler,
  linkThreadHandler,
  resolveReviewHandler,
  classifyTextHandler,
  emailSyncHealth,
} from '../controllers/emailSyncController';

const router = Router();

// Health check (no auth required)
router.get('/health', emailSyncHealth);

// All other routes require webhook secret
router.use(validateEmailSyncSecret);

// Upsert a thread (create or update)
router.post('/thread', upsertThreadHandler);

// Create an event (idempotent by messageId)
router.post('/event', createEventHandler);

// Match an email to a job
router.post('/match', matchEmailHandler);

// Link a thread to a job
router.post('/link-thread', linkThreadHandler);

// Get items needing human review
router.get('/needs-review', getNeedsReviewHandler);

// Resolve a review flag
router.post('/resolve-review', resolveReviewHandler);

// Classify text (extract PO, proof links)
router.post('/classify', classifyTextHandler);

export default router;
