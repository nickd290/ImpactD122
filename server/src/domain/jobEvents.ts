/**
 * Job Event Type System
 * Minimal event vocabulary covering workflow + payments
 */

// ============================================
// EVENT TYPES (Minimal Set)
// ============================================

/**
 * Why this set is minimal but sufficient:
 *
 * 1. WORKFLOW EVENTS (7): Cover the linear workflow progression.
 *    We collapse some statuses into single events where the distinction
 *    is "waiting" vs "done" (e.g., PROOF_RECEIVED covers the transition,
 *    AWAITING_CUSTOMER_RESPONSE is just a wait state).
 *
 * 2. PAYMENT EVENTS (6): Direct mapping to the 4-step payment flow
 *    plus invoice tracking. These are discrete financial milestones.
 *
 * 3. DOCUMENT EVENTS (3): PO, proof, and invoice are the 3 key documents.
 *
 * 4. SYSTEM EVENTS (2): Lock and manual override for admin actions.
 *
 * Total: 18 event types (vs 11 workflow statuses + 6 payment actions = 17 existing)
 * We add only 1 net new concept (WORKFLOW_OVERRIDE) while making payments first-class.
 */

export const JOB_EVENT_TYPES = {
  // Workflow stage events
  JOB_CREATED: 'JOB_CREATED',
  PO_SENT_TO_VENDOR: 'PO_SENT_TO_VENDOR',
  PROOF_RECEIVED_FROM_VENDOR: 'PROOF_RECEIVED_FROM_VENDOR',
  PROOF_SENT_TO_CUSTOMER: 'PROOF_SENT_TO_CUSTOMER',
  PROOF_APPROVED: 'PROOF_APPROVED',
  PRODUCTION_STARTED: 'PRODUCTION_STARTED',
  JOB_COMPLETED: 'JOB_COMPLETED',

  // Payment flow events (4-step + invoice)
  INVOICE_SENT: 'INVOICE_SENT',
  CUSTOMER_PAYMENT_RECEIVED: 'CUSTOMER_PAYMENT_RECEIVED',
  VENDOR_PAYMENT_SENT: 'VENDOR_PAYMENT_SENT',
  BRADFORD_PAYMENT_SENT: 'BRADFORD_PAYMENT_SENT',
  JD_INVOICE_SENT: 'JD_INVOICE_SENT',
  JD_PAYMENT_RECEIVED: 'JD_PAYMENT_RECEIVED',

  // Document events
  PO_CREATED: 'PO_CREATED',
  PROOF_UPLOADED: 'PROOF_UPLOADED',
  INVOICE_GENERATED: 'INVOICE_GENERATED',

  // System events
  JOB_LOCKED: 'JOB_LOCKED',
  WORKFLOW_OVERRIDE: 'WORKFLOW_OVERRIDE',
} as const;

export type JobEventType = typeof JOB_EVENT_TYPES[keyof typeof JOB_EVENT_TYPES];

// ============================================
// EVENT METADATA TYPES (per-event payloads)
// ============================================

export interface PaymentEventMetadata {
  amount?: number;
  currency?: string;
  reference?: string;
}

export interface DocumentEventMetadata {
  documentId?: string;
  documentType?: 'PO' | 'PROOF' | 'INVOICE';
  fileName?: string;
}

export interface WorkflowOverrideMetadata {
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
}

export type JobEventMetadata =
  | PaymentEventMetadata
  | DocumentEventMetadata
  | WorkflowOverrideMetadata
  | Record<string, unknown>;

// ============================================
// MAIN EVENT INTERFACE
// ============================================

export interface JobEvent {
  /** Event type from JOB_EVENT_TYPES */
  type: JobEventType;

  /** Job ID this event relates to */
  jobId: string;

  /** When the event occurred (ISO string) */
  occurredAt: string;

  /** Who triggered the event (user ID, system, webhook source) */
  actor?: string;

  /** Event-specific data */
  metadata?: JobEventMetadata;

  /** Where the event originated (api, webhook, system, portal) */
  source?: 'api' | 'webhook' | 'system' | 'portal' | 'email';
}

// ============================================
// HELPER: Create a typed event
// ============================================

export function createJobEvent(
  type: JobEventType,
  jobId: string,
  options?: {
    actor?: string;
    metadata?: JobEventMetadata;
    source?: JobEvent['source'];
  }
): JobEvent {
  return {
    type,
    jobId,
    occurredAt: new Date().toISOString(),
    ...options,
  };
}
