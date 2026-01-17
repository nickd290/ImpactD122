/**
 * Email Thread Service
 * Manages Gmail thread tracking, job matching, and event creation.
 *
 * Key Features:
 * - Upsert JobEmailThread records by Gmail threadId
 * - Match emails to jobs via thread → PO → domain matching
 * - Create JobEvent records with idempotency (messageId unique)
 * - Link threads to jobs after job creation
 */

import { prisma } from '../utils/prisma';
import { JobEventType, JobWorkflowStatus } from '@prisma/client';
import { subDays } from 'date-fns';
import { processNewEvent, shouldAutoUpdateStatus } from './statusReducer';

// ========================================
// Types
// ========================================

export interface UpsertThreadInput {
  threadId: string;
  firstMessageId: string;
  subject: string;
  from: string;
  customerPONumber?: string;
  lastMessageAt?: Date;
}

export interface CreateEventInput {
  threadId: string;
  messageId: string;
  type: JobEventType;
  confidence: number;
  source: string;
  signals?: string[];
  links?: string[];
  jobId?: string;
  needsReview?: boolean;
  reviewNote?: string;
}

export interface MatchResult {
  jobId: string | null;
  jobNo: string | null;
  confidence: number;
  method: 'THREAD' | 'PO_MATCH' | 'PO_DOMAIN' | 'MULTIPLE_MATCHES' | 'NO_MATCH';
  candidates?: Array<{ id: string; jobNo: string; customerPONumber: string | null }>;
}

export interface EmailMatchInput {
  threadId: string;
  subject: string;
  body?: string;
  from: string;
  customerPONumber?: string;
}

// ========================================
// Regex Patterns
// ========================================

// PO Number patterns (flexible)
const PO_PATTERNS = [
  /PO\s*#?\s*([A-Z0-9\-\.]+)/i,           // PO44517, PO 44430, PO#44517
  /(?:Purchase Order|P\.O\.)\s*#?\s*([A-Z0-9\-\.]+)/i,
  /TEL-\d{4}-\d{3}(?:-\d+)?/i,            // TEL-2025-001-2
  /Job\s*#?\s*(J-\d+)/i,                   // Job # J-2069
];

// Proof link patterns
const PROOF_LINK_PATTERN = /https?:\/\/(?:www\.)?(dropbox\.com|we\.tl|drive\.google\.com)[^\s"<>]+/gi;

// Domain extraction
const EMAIL_DOMAIN_PATTERN = /@([a-z0-9.-]+)/i;

// ========================================
// Utility Functions
// ========================================

/**
 * Extract PO number from text using multiple patterns
 */
export function extractPONumber(text: string): string | null {
  for (const pattern of PO_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
    // For patterns without capture group (like TEL-*)
    if (match && match[0]) {
      return match[0].toUpperCase();
    }
  }
  return null;
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string | null {
  const match = email.match(EMAIL_DOMAIN_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extract proof links from text
 */
export function extractProofLinks(text: string): string[] {
  const matches = text.match(PROOF_LINK_PATTERN);
  return matches || [];
}

/**
 * Normalize subject line for matching
 * Removes Re:, Fwd:, [IDP-*], etc.
 */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(Re:|Fwd:|FW:|RE:|re:|fwd:)\s*/gi, '')
    .replace(/\[IDP-[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ========================================
// Core Service Functions
// ========================================

/**
 * Upsert a JobEmailThread record
 * Creates if threadId doesn't exist, updates if it does
 */
export async function upsertThread(input: UpsertThreadInput) {
  const normalizedSubject = normalizeSubject(input.subject);
  const customerDomain = extractDomain(input.from);
  const poNumber = input.customerPONumber || extractPONumber(input.subject);

  const now = new Date();

  const thread = await prisma.jobEmailThread.upsert({
    where: { threadId: input.threadId },
    create: {
      threadId: input.threadId,
      firstMessageId: input.firstMessageId,
      subjectNormalized: normalizedSubject,
      customerPONumber: poNumber,
      customerDomain: customerDomain,
      lastMessageAt: input.lastMessageAt || now,
      lastSyncedAt: now,
    },
    update: {
      lastMessageAt: input.lastMessageAt || now,
      lastSyncedAt: now,
      // Update PO if not set and we found one
      ...(poNumber && !prisma.jobEmailThread ? { customerPONumber: poNumber } : {}),
    },
    include: {
      job: {
        select: { id: true, jobNo: true, workflowStatus: true },
      },
    },
  });

  return thread;
}

/**
 * Match an email to a job using cascading strategy:
 * 1. Direct thread match (threadId → JobEmailThread → Job)
 * 2. PO match within 30 days
 * 3. PO + domain match for disambiguation
 */
export async function matchEmailToJob(input: EmailMatchInput): Promise<MatchResult> {
  // 1. Direct thread match (highest confidence)
  const threadMatch = await prisma.jobEmailThread.findUnique({
    where: { threadId: input.threadId },
    include: {
      job: { select: { id: true, jobNo: true } },
    },
  });

  if (threadMatch?.job) {
    return {
      jobId: threadMatch.job.id,
      jobNo: threadMatch.job.jobNo,
      confidence: 1.0,
      method: 'THREAD',
    };
  }

  // 2. PO + Time window match
  const poNumber = input.customerPONumber || extractPONumber(input.subject + (input.body || ''));
  const domain = extractDomain(input.from);

  if (poNumber) {
    const thirtyDaysAgo = subDays(new Date(), 30);

    const candidates = await prisma.job.findMany({
      where: {
        customerPONumber: poNumber,
        createdAt: { gte: thirtyDaysAgo },
        deletedAt: null,
      },
      select: {
        id: true,
        jobNo: true,
        customerPONumber: true,
        customerId: true,
        Company: {
          select: { email: true },
        },
      },
    });

    if (candidates.length === 1) {
      return {
        jobId: candidates[0].id,
        jobNo: candidates[0].jobNo,
        confidence: 0.9,
        method: 'PO_MATCH',
      };
    }

    if (candidates.length > 1 && domain) {
      // Try to disambiguate by domain
      const domainMatches = candidates.filter((c) => {
        const customerEmail = c.Company?.email || '';
        const customerDomain = extractDomain(customerEmail);
        return customerDomain === domain;
      });

      if (domainMatches.length === 1) {
        return {
          jobId: domainMatches[0].id,
          jobNo: domainMatches[0].jobNo,
          confidence: 0.85,
          method: 'PO_DOMAIN',
        };
      }

      // Multiple matches - needs human review
      return {
        jobId: null,
        jobNo: null,
        confidence: 0,
        method: 'MULTIPLE_MATCHES',
        candidates: candidates.map((c) => ({
          id: c.id,
          jobNo: c.jobNo,
          customerPONumber: c.customerPONumber,
        })),
      };
    }
  }

  // 3. No match found
  return {
    jobId: null,
    jobNo: null,
    confidence: 0,
    method: 'NO_MATCH',
  };
}

/**
 * Create a JobEvent record with idempotency (messageId unique)
 * Also handles status updates if confidence is high enough
 */
export async function createEvent(input: CreateEventInput) {
  // Check idempotency - if messageId already exists, return existing
  const existing = await prisma.jobEvent.findUnique({
    where: { messageId: input.messageId },
  });

  if (existing) {
    return { event: existing, created: false, statusUpdated: false };
  }

  // First ensure thread exists
  const thread = await prisma.jobEmailThread.findUnique({
    where: { threadId: input.threadId },
  });

  if (!thread) {
    throw new Error(`Thread ${input.threadId} not found. Upsert thread first.`);
  }

  // Create the event
  const event = await prisma.jobEvent.create({
    data: {
      threadId: input.threadId,
      messageId: input.messageId,
      jobId: input.jobId || thread.jobId,
      type: input.type,
      confidence: input.confidence,
      source: input.source,
      signals: input.signals || [],
      links: input.links || [],
      needsReview: input.needsReview || false,
      reviewNote: input.reviewNote,
    },
    include: {
      job: {
        select: { id: true, jobNo: true, workflowStatus: true },
      },
    },
  });

  // If event is linked to a job and confidence is high, update status
  let statusUpdated = false;
  if (event.job && shouldAutoUpdateStatus(input.confidence) && !input.needsReview) {
    const result = processNewEvent(
      { type: input.type, createdAt: event.createdAt, confidence: input.confidence },
      event.job.workflowStatus
    );

    if (result.shouldUpdate) {
      await prisma.job.update({
        where: { id: event.job.id },
        data: {
          workflowStatus: result.newStatus,
          workflowUpdatedAt: new Date(),
        },
      });
      statusUpdated = true;
      console.log(`📧 Status updated: ${event.job.jobNo} ${result.currentStatus} → ${result.newStatus}`);
    } else {
      console.log(`📧 Status not updated for ${event.job.jobNo}: ${result.reason}`);
    }
  }

  return { event, created: true, statusUpdated };
}

/**
 * Link a thread to a job (called after job creation)
 */
export async function linkThreadToJob(threadId: string, jobId: string) {
  const thread = await prisma.jobEmailThread.update({
    where: { threadId },
    data: { jobId },
    include: {
      job: { select: { id: true, jobNo: true } },
    },
  });

  // Also update any orphan events for this thread
  await prisma.jobEvent.updateMany({
    where: {
      threadId,
      jobId: null,
    },
    data: { jobId },
  });

  return thread;
}

/**
 * Get events that need human review
 */
export async function getEventsNeedingReview(limit = 50) {
  return prisma.jobEvent.findMany({
    where: { needsReview: true },
    include: {
      job: { select: { id: true, jobNo: true } },
      thread: { select: { threadId: true, subjectNormalized: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Get threads without linked jobs (orphans)
 */
export async function getOrphanThreads(limit = 50) {
  return prisma.jobEmailThread.findMany({
    where: { jobId: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Resolve a review flag on an event
 */
export async function resolveEventReview(eventId: string, jobId?: string, note?: string) {
  const update: any = {
    needsReview: false,
  };

  if (jobId) {
    update.jobId = jobId;
  }

  if (note) {
    update.reviewNote = note;
  }

  return prisma.jobEvent.update({
    where: { id: eventId },
    data: update,
  });
}
