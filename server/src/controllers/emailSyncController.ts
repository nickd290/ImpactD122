/**
 * Email Sync Controller
 * Webhook endpoints for n8n Gmail thread integration.
 *
 * All endpoints require `x-webhook-secret` header matching EMAIL_SYNC_WEBHOOK_SECRET env var.
 */

import { Request, Response } from 'express';
import { JobEventType } from '@prisma/client';
import {
  upsertThread,
  matchEmailToJob,
  createEvent,
  linkThreadToJob,
  getEventsNeedingReview,
  getOrphanThreads,
  resolveEventReview,
  extractPONumber,
  extractProofLinks,
  type UpsertThreadInput,
  type CreateEventInput,
  type EmailMatchInput,
} from '../services/emailThreadService';
import { prisma } from '../utils/prisma';
import {
  badRequest,
  unauthorized,
  notFound,
  conflict,
  serverError,
} from '../utils/apiErrors';

// ========================================
// Auth Middleware
// ========================================

const EMAIL_SYNC_SECRET = process.env.EMAIL_SYNC_WEBHOOK_SECRET;

export function validateEmailSyncSecret(req: Request, res: Response, next: () => void) {
  const providedSecret = req.headers['x-webhook-secret'];

  if (!EMAIL_SYNC_SECRET) {
    console.error('❌ EMAIL_SYNC_WEBHOOK_SECRET not configured');
    return serverError(res, 'Webhook secret not configured');
  }

  if (providedSecret !== EMAIL_SYNC_SECRET) {
    return unauthorized(res, 'Invalid webhook secret');
  }

  next();
}

// ========================================
// Endpoints
// ========================================

/**
 * POST /api/email-sync/thread
 * Upsert a JobEmailThread record
 */
export async function upsertThreadHandler(req: Request, res: Response) {
  try {
    const { threadId, firstMessageId, subject, from, customerPONumber, lastMessageAt } = req.body;

    if (!threadId || !firstMessageId || !subject || !from) {
      return badRequest(res, 'Missing required fields: threadId, firstMessageId, subject, from');
    }

    const input: UpsertThreadInput = {
      threadId,
      firstMessageId,
      subject,
      from,
      customerPONumber,
      lastMessageAt: lastMessageAt ? new Date(lastMessageAt) : undefined,
    };

    const thread = await upsertThread(input);

    res.json({
      success: true,
      thread: {
        id: thread.id,
        threadId: thread.threadId,
        jobId: thread.jobId,
        jobNo: thread.job?.jobNo || null,
        customerPONumber: thread.customerPONumber,
        customerDomain: thread.customerDomain,
        subjectNormalized: thread.subjectNormalized,
      },
    });
  } catch (error) {
    console.error('❌ Error upserting thread:', error);
    return serverError(res, 'Failed to upsert thread');
  }
}

/**
 * POST /api/email-sync/event
 * Create a JobEvent record (idempotent by messageId)
 */
export async function createEventHandler(req: Request, res: Response) {
  try {
    const {
      threadId,
      messageId,
      type,
      confidence,
      source,
      signals,
      links,
      jobId,
      needsReview,
      reviewNote,
    } = req.body;

    if (!threadId || !messageId || !type || confidence === undefined || !source) {
      return badRequest(res, 'Missing required fields: threadId, messageId, type, confidence, source');
    }

    // Validate event type
    if (!Object.values(JobEventType).includes(type)) {
      return badRequest(res, `Invalid event type: ${type}`);
    }

    const input: CreateEventInput = {
      threadId,
      messageId,
      type,
      confidence: parseFloat(confidence),
      source,
      signals: signals || [],
      links: links || [],
      jobId,
      needsReview: needsReview || false,
      reviewNote,
    };

    const result = await createEvent(input);

    // Get jobNo if we have a jobId (may not be included in return type)
    let jobNo: string | null = null;
    if (result.event.jobId) {
      const job = await prisma.job.findUnique({
        where: { id: result.event.jobId },
        select: { jobNo: true },
      });
      jobNo = job?.jobNo || null;
    }

    res.json({
      success: true,
      created: result.created,
      statusUpdated: result.statusUpdated,
      event: {
        id: result.event.id,
        messageId: result.event.messageId,
        type: result.event.type,
        confidence: result.event.confidence,
        jobId: result.event.jobId,
        jobNo,
        needsReview: result.event.needsReview,
      },
    });
  } catch (error: any) {
    console.error('❌ Error creating event:', error);

    // Handle thread not found error
    if (error.message?.includes('not found')) {
      return notFound(res, error.message);
    }

    return serverError(res, 'Failed to create event');
  }
}

/**
 * POST /api/email-sync/match
 * Match an email to a job using thread/PO/domain matching
 */
export async function matchEmailHandler(req: Request, res: Response) {
  try {
    const { threadId, subject, body, from, customerPONumber } = req.body;

    if (!threadId || !subject || !from) {
      return badRequest(res, 'Missing required fields: threadId, subject, from');
    }

    const input: EmailMatchInput = {
      threadId,
      subject,
      body,
      from,
      customerPONumber,
    };

    const result = await matchEmailToJob(input);

    res.json({
      success: true,
      match: result,
    });
  } catch (error) {
    console.error('❌ Error matching email:', error);
    return serverError(res, 'Failed to match email');
  }
}

/**
 * GET /api/email-sync/needs-review
 * List events and threads needing human review
 */
export async function getNeedsReviewHandler(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const [events, orphanThreads] = await Promise.all([
      getEventsNeedingReview(limit),
      getOrphanThreads(limit),
    ]);

    res.json({
      success: true,
      eventsNeedingReview: events.map((e) => ({
        id: e.id,
        messageId: e.messageId,
        type: e.type,
        confidence: e.confidence,
        source: e.source,
        signals: e.signals,
        reviewNote: e.reviewNote,
        jobNo: e.job?.jobNo || null,
        subject: e.thread?.subjectNormalized || null,
        createdAt: e.createdAt,
      })),
      orphanThreads: orphanThreads.map((t) => ({
        id: t.id,
        threadId: t.threadId,
        customerPONumber: t.customerPONumber,
        customerDomain: t.customerDomain,
        subjectNormalized: t.subjectNormalized,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error('❌ Error fetching needs review:', error);
    return serverError(res, 'Failed to fetch items needing review');
  }
}

/**
 * POST /api/email-sync/link-thread
 * Link a thread to a job (usually called after job creation)
 */
export async function linkThreadHandler(req: Request, res: Response) {
  try {
    const { threadId, jobId } = req.body;

    if (!threadId || !jobId) {
      return badRequest(res, 'Missing required fields: threadId, jobId');
    }

    // Verify job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, jobNo: true },
    });

    if (!job) {
      return notFound(res, `Job ${jobId} not found`);
    }

    const thread = await linkThreadToJob(threadId, jobId);

    res.json({
      success: true,
      thread: {
        id: thread.id,
        threadId: thread.threadId,
        jobId: thread.jobId,
        jobNo: thread.job?.jobNo || null,
      },
    });
  } catch (error) {
    console.error('❌ Error linking thread:', error);
    return serverError(res, 'Failed to link thread');
  }
}

/**
 * POST /api/email-sync/resolve-review
 * Resolve a review flag on an event
 */
export async function resolveReviewHandler(req: Request, res: Response) {
  try {
    const { eventId, jobId, note } = req.body;

    if (!eventId) {
      return badRequest(res, 'Missing required field: eventId');
    }

    const event = await resolveEventReview(eventId, jobId, note);

    res.json({
      success: true,
      event: {
        id: event.id,
        messageId: event.messageId,
        jobId: event.jobId,
        needsReview: event.needsReview,
      },
    });
  } catch (error) {
    console.error('❌ Error resolving review:', error);
    return serverError(res, 'Failed to resolve review');
  }
}

/**
 * POST /api/email-sync/classify
 * Helper endpoint to extract PO numbers and proof links from text
 * (Useful for n8n to pre-process before calling other endpoints)
 */
export async function classifyTextHandler(req: Request, res: Response) {
  try {
    const { subject, body } = req.body;

    if (!subject && !body) {
      return badRequest(res, 'At least one of subject or body is required');
    }

    const fullText = `${subject || ''} ${body || ''}`;
    const poNumber = extractPONumber(fullText);
    const proofLinks = extractProofLinks(fullText);

    res.json({
      success: true,
      extracted: {
        poNumber,
        proofLinks,
      },
    });
  } catch (error) {
    console.error('❌ Error classifying text:', error);
    return serverError(res, 'Failed to classify text');
  }
}

/**
 * GET /api/email-sync/health
 * Health check endpoint
 */
export async function emailSyncHealth(req: Request, res: Response) {
  res.json({
    success: true,
    service: 'email-sync',
    timestamp: new Date().toISOString(),
    secretConfigured: !!EMAIL_SYNC_SECRET,
  });
}
