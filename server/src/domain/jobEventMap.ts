/**
 * Mappings between existing statuses/actions and JobEventTypes
 */

import { JOB_EVENT_TYPES, JobEventType } from './jobEvents';

// ============================================
// WORKFLOW STATUS → EVENT TYPE MAPPING
// ============================================

/**
 * Maps JobWorkflowStatus enum values to recommended JobEventType.
 *
 * AMBIGUITY NOTES:
 * - AWAITING_* statuses are "wait states" not discrete events.
 *   We map them to the event that STARTS the wait.
 * - CANCELLED has no event equivalent (it's a terminal state, not a transition).
 * - Some statuses collapse into one event (e.g., PROOF_RECEIVED and
 *   PROOF_SENT_TO_CUSTOMER are both part of the proof flow).
 */
export const WORKFLOW_STATUS_TO_EVENT: Record<string, JobEventType | null> = {
  // Stage: Job creation
  'NEW_JOB': JOB_EVENT_TYPES.JOB_CREATED,

  // Stage: Vendor proof cycle
  'AWAITING_PROOF_FROM_VENDOR': JOB_EVENT_TYPES.PO_SENT_TO_VENDOR,
  // ^ We sent PO, now waiting. The event is "we sent it."

  'PROOF_RECEIVED': JOB_EVENT_TYPES.PROOF_RECEIVED_FROM_VENDOR,

  // Stage: Customer approval cycle
  'PROOF_SENT_TO_CUSTOMER': JOB_EVENT_TYPES.PROOF_SENT_TO_CUSTOMER,

  'AWAITING_CUSTOMER_RESPONSE': JOB_EVENT_TYPES.PROOF_SENT_TO_CUSTOMER,
  // ^ Collapsed with above - same event started the wait

  'APPROVED_PENDING_VENDOR': JOB_EVENT_TYPES.PROOF_APPROVED,
  // ^ Customer approved, vendor notification pending

  // Stage: Production
  'IN_PRODUCTION': JOB_EVENT_TYPES.PRODUCTION_STARTED,

  'COMPLETED': JOB_EVENT_TYPES.JOB_COMPLETED,

  // Stage: Payment (these are payment-track, not workflow-track)
  'INVOICED': JOB_EVENT_TYPES.INVOICE_SENT,
  // ^ Ambiguous: could be INVOICE_GENERATED or INVOICE_SENT
  // We choose SENT because INVOICED implies customer was notified

  'PAID': JOB_EVENT_TYPES.CUSTOMER_PAYMENT_RECEIVED,
  // ^ Final workflow status maps to first payment event
  // The full payment flow is orthogonal to workflow status

  // Terminal state
  'CANCELLED': null,
  // ^ No event - cancellation could be a separate event type if needed
};

// ============================================
// PAYMENT ACTION → EVENT TYPE MAPPING
// ============================================

/**
 * Maps payment endpoint actions to JobEventType.
 *
 * These are the 6 payment-related actions from jobsPaymentController.ts.
 * Each maps 1:1 to a payment event type.
 */
export const PAYMENT_ACTION_TO_EVENT: Record<string, JobEventType> = {
  // Step 0: Invoice tracking
  'invoice-sent': JOB_EVENT_TYPES.INVOICE_SENT,
  'mark-invoice-sent': JOB_EVENT_TYPES.INVOICE_SENT,

  // Step 1: Customer → Impact
  'customer-paid': JOB_EVENT_TYPES.CUSTOMER_PAYMENT_RECEIVED,
  'mark-customer-paid': JOB_EVENT_TYPES.CUSTOMER_PAYMENT_RECEIVED,

  // Step 2: Impact → Vendor (non-Bradford)
  'vendor-paid': JOB_EVENT_TYPES.VENDOR_PAYMENT_SENT,
  'mark-vendor-paid': JOB_EVENT_TYPES.VENDOR_PAYMENT_SENT,

  // Step 3: Impact → Bradford (P1 jobs)
  'bradford-paid': JOB_EVENT_TYPES.BRADFORD_PAYMENT_SENT,
  'mark-bradford-paid': JOB_EVENT_TYPES.BRADFORD_PAYMENT_SENT,

  // Step 3b: JD Invoice sent to Bradford
  'send-jd-invoice': JOB_EVENT_TYPES.JD_INVOICE_SENT,

  // Step 4: Bradford → JD
  'jd-paid': JOB_EVENT_TYPES.JD_PAYMENT_RECEIVED,
  'mark-jd-paid': JOB_EVENT_TYPES.JD_PAYMENT_RECEIVED,
};

// ============================================
// REVERSE MAPPINGS (for validation)
// ============================================

/**
 * Which workflow statuses can follow a given event?
 * Used for validation - ensures events lead to valid states.
 */
export const EVENT_TO_VALID_WORKFLOW_STATUSES: Partial<Record<JobEventType, string[]>> = {
  [JOB_EVENT_TYPES.JOB_CREATED]: ['NEW_JOB', 'AWAITING_PROOF_FROM_VENDOR'],
  [JOB_EVENT_TYPES.PO_SENT_TO_VENDOR]: ['AWAITING_PROOF_FROM_VENDOR'],
  [JOB_EVENT_TYPES.PROOF_RECEIVED_FROM_VENDOR]: ['PROOF_RECEIVED', 'PROOF_SENT_TO_CUSTOMER'],
  [JOB_EVENT_TYPES.PROOF_SENT_TO_CUSTOMER]: ['PROOF_SENT_TO_CUSTOMER', 'AWAITING_CUSTOMER_RESPONSE'],
  [JOB_EVENT_TYPES.PROOF_APPROVED]: ['APPROVED_PENDING_VENDOR', 'IN_PRODUCTION'],
  [JOB_EVENT_TYPES.PRODUCTION_STARTED]: ['IN_PRODUCTION'],
  [JOB_EVENT_TYPES.JOB_COMPLETED]: ['COMPLETED', 'INVOICED'],
  [JOB_EVENT_TYPES.INVOICE_SENT]: ['INVOICED'],
  [JOB_EVENT_TYPES.CUSTOMER_PAYMENT_RECEIVED]: ['PAID'],
};

// ============================================
// HELPER: Get event for status transition
// ============================================

export function getEventForWorkflowStatus(status: string): JobEventType | null {
  return WORKFLOW_STATUS_TO_EVENT[status] ?? null;
}

export function getEventForPaymentAction(action: string): JobEventType | null {
  return PAYMENT_ACTION_TO_EVENT[action] ?? null;
}
