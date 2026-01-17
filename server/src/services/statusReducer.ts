/**
 * Status Reducer Service
 * Computes workflow status from JobEvent timeline using event sourcing pattern.
 *
 * Key Rules:
 * - Status can only move FORWARD (higher order) except for REVISION_REQUEST
 * - REVISION_REQUEST is the only event that can regress status
 * - Late-arriving emails don't regress status (logged but ignored)
 */

import { JobEvent, JobEventType, JobWorkflowStatus } from '@prisma/client';

// Status progression order (lower = earlier in workflow)
export const STATUS_ORDER: Record<JobWorkflowStatus, number> = {
  NEW_JOB: 0,
  AWAITING_PROOF_FROM_VENDOR: 1,
  PROOF_RECEIVED: 2,
  PROOF_SENT_TO_CUSTOMER: 3,
  AWAITING_CUSTOMER_RESPONSE: 4,
  APPROVED_PENDING_VENDOR: 5,
  IN_PRODUCTION: 6,
  COMPLETED: 7,
  INVOICED: 8,
  PAID: 9,
  CANCELLED: 10,
};

// Map event types to the status they should transition to
export const EVENT_TO_STATUS: Partial<Record<JobEventType, JobWorkflowStatus>> = {
  JOB_CREATED: 'NEW_JOB',
  PROOF_RECEIVED: 'PROOF_RECEIVED',
  PROOF_SENT_TO_CUSTOMER: 'PROOF_SENT_TO_CUSTOMER',
  REVISION_REQUEST: 'AWAITING_PROOF_FROM_VENDOR', // Can regress
  APPROVED: 'APPROVED_PENDING_VENDOR',
  APPROVAL_CONFIRMED: 'APPROVED_PENDING_VENDOR',
  SHIPPED: 'IN_PRODUCTION',
};

export interface StatusReducerResult {
  currentStatus: JobWorkflowStatus;
  newStatus: JobWorkflowStatus;
  shouldUpdate: boolean;
  reason: string;
  isRegression: boolean;
}

/**
 * Compute the workflow status from a timeline of events
 * @param events - Array of JobEvent records (will be sorted by createdAt)
 * @param currentStatus - Current workflow status on the job
 * @returns StatusReducerResult with the computed status and update decision
 */
export function computeWorkflowStatus(
  events: Pick<JobEvent, 'type' | 'createdAt' | 'confidence'>[],
  currentStatus: JobWorkflowStatus = 'NEW_JOB'
): StatusReducerResult {
  if (events.length === 0) {
    return {
      currentStatus,
      newStatus: currentStatus,
      shouldUpdate: false,
      reason: 'No events to process',
      isRegression: false,
    };
  }

  // Sort events by creation time (oldest first)
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let computedStatus: JobWorkflowStatus = 'NEW_JOB';

  for (const event of sorted) {
    const targetStatus = EVENT_TO_STATUS[event.type];
    if (!targetStatus) continue; // Skip events that don't map to status (e.g., OTHER)

    const currentOrder = STATUS_ORDER[computedStatus];
    const targetOrder = STATUS_ORDER[targetStatus];

    // REVISION_REQUEST is special - it CAN regress status
    if (event.type === 'REVISION_REQUEST') {
      computedStatus = 'AWAITING_PROOF_FROM_VENDOR';
      continue;
    }

    // Normal forward progression only
    if (targetOrder > currentOrder) {
      computedStatus = targetStatus;
    }
    // Late emails that would regress are ignored (logged in caller)
  }

  const currentOrder = STATUS_ORDER[currentStatus];
  const newOrder = STATUS_ORDER[computedStatus];
  const isRegression = newOrder < currentOrder;

  // Don't update if it would regress (unless it was a revision)
  const hasRevision = sorted.some((e) => e.type === 'REVISION_REQUEST');
  const shouldUpdate = !isRegression || hasRevision;

  return {
    currentStatus,
    newStatus: computedStatus,
    shouldUpdate,
    reason: isRegression && !hasRevision
      ? `Computed status ${computedStatus} is earlier than current ${currentStatus} - skipping update`
      : `Transitioning from ${currentStatus} to ${computedStatus}`,
    isRegression,
  };
}

/**
 * Process a single new event and determine if status should update
 * @param newEvent - The new event being added
 * @param currentStatus - Current workflow status
 * @returns StatusReducerResult
 */
export function processNewEvent(
  newEvent: Pick<JobEvent, 'type' | 'createdAt' | 'confidence'>,
  currentStatus: JobWorkflowStatus
): StatusReducerResult {
  const targetStatus = EVENT_TO_STATUS[newEvent.type];

  if (!targetStatus) {
    return {
      currentStatus,
      newStatus: currentStatus,
      shouldUpdate: false,
      reason: `Event type ${newEvent.type} does not map to a status transition`,
      isRegression: false,
    };
  }

  const currentOrder = STATUS_ORDER[currentStatus];
  const targetOrder = STATUS_ORDER[targetStatus];
  const isRegression = targetOrder < currentOrder;

  // REVISION_REQUEST is special - always allow regression
  if (newEvent.type === 'REVISION_REQUEST') {
    return {
      currentStatus,
      newStatus: targetStatus,
      shouldUpdate: true,
      reason: `Revision requested - regressing from ${currentStatus} to ${targetStatus}`,
      isRegression: true,
    };
  }

  // Normal events: only update if moving forward
  if (targetOrder > currentOrder) {
    return {
      currentStatus,
      newStatus: targetStatus,
      shouldUpdate: true,
      reason: `Progressing from ${currentStatus} to ${targetStatus}`,
      isRegression: false,
    };
  }

  // Would regress - don't update
  if (isRegression) {
    return {
      currentStatus,
      newStatus: currentStatus,
      shouldUpdate: false,
      reason: `Event ${newEvent.type} would regress status from ${currentStatus} to ${targetStatus} - ignoring`,
      isRegression: true,
    };
  }

  // Same status - no change needed
  return {
    currentStatus,
    newStatus: currentStatus,
    shouldUpdate: false,
    reason: `Already at status ${currentStatus}`,
    isRegression: false,
  };
}

/**
 * Determine confidence threshold for auto-updating status
 * Low confidence events are logged but don't trigger status changes
 */
export const CONFIDENCE_THRESHOLD = 0.7;

export function shouldAutoUpdateStatus(confidence: number): boolean {
  return confidence >= CONFIDENCE_THRESHOLD;
}
