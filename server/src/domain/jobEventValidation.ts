/**
 * Job Event Validation & Inference
 *
 * Placeholder implementation - scaffolding for future event-driven workflow.
 */

import { JobEvent, JOB_EVENT_TYPES, JobEventType } from './jobEvents';

// ============================================
// STAGE INFERENCE RESULT
// ============================================

export interface InferredStages {
  /** Current workflow stage based on events */
  workflowStage: string;

  /** Current payment stage based on events */
  moneyStage: string;

  /** Blockers preventing next step */
  blockers: string[];
}

// ============================================
// WORKFLOW STAGE DEFINITIONS
// ============================================

const WORKFLOW_STAGES = {
  UNKNOWN: 'UNKNOWN',
  CREATED: 'CREATED',
  AWAITING_PROOF: 'AWAITING_PROOF',
  PROOF_IN_REVIEW: 'PROOF_IN_REVIEW',
  APPROVED: 'APPROVED',
  IN_PRODUCTION: 'IN_PRODUCTION',
  COMPLETED: 'COMPLETED',
} as const;

const MONEY_STAGES = {
  UNKNOWN: 'UNKNOWN',
  NOT_INVOICED: 'NOT_INVOICED',
  INVOICED: 'INVOICED',
  CUSTOMER_PAID: 'CUSTOMER_PAID',
  VENDOR_PAID: 'VENDOR_PAID',
  BRADFORD_PAID: 'BRADFORD_PAID',
  FULLY_SETTLED: 'FULLY_SETTLED',
} as const;

// ============================================
// EVENT → STAGE MAPPING
// ============================================

const WORKFLOW_EVENT_TO_STAGE: Partial<Record<JobEventType, string>> = {
  [JOB_EVENT_TYPES.JOB_CREATED]: WORKFLOW_STAGES.CREATED,
  [JOB_EVENT_TYPES.PO_SENT_TO_VENDOR]: WORKFLOW_STAGES.AWAITING_PROOF,
  [JOB_EVENT_TYPES.PROOF_RECEIVED_FROM_VENDOR]: WORKFLOW_STAGES.PROOF_IN_REVIEW,
  [JOB_EVENT_TYPES.PROOF_SENT_TO_CUSTOMER]: WORKFLOW_STAGES.PROOF_IN_REVIEW,
  [JOB_EVENT_TYPES.PROOF_APPROVED]: WORKFLOW_STAGES.APPROVED,
  [JOB_EVENT_TYPES.PRODUCTION_STARTED]: WORKFLOW_STAGES.IN_PRODUCTION,
  [JOB_EVENT_TYPES.JOB_COMPLETED]: WORKFLOW_STAGES.COMPLETED,
};

const PAYMENT_EVENT_TO_STAGE: Partial<Record<JobEventType, string>> = {
  [JOB_EVENT_TYPES.INVOICE_SENT]: MONEY_STAGES.INVOICED,
  [JOB_EVENT_TYPES.CUSTOMER_PAYMENT_RECEIVED]: MONEY_STAGES.CUSTOMER_PAID,
  [JOB_EVENT_TYPES.VENDOR_PAYMENT_SENT]: MONEY_STAGES.VENDOR_PAID,
  [JOB_EVENT_TYPES.BRADFORD_PAYMENT_SENT]: MONEY_STAGES.BRADFORD_PAID,
  [JOB_EVENT_TYPES.JD_PAYMENT_RECEIVED]: MONEY_STAGES.FULLY_SETTLED,
};

// ============================================
// MAIN INFERENCE FUNCTION
// ============================================

/**
 * Infers workflow and payment stages from a list of events.
 *
 * PLACEHOLDER IMPLEMENTATION:
 * - Returns UNKNOWN if no events
 * - Finds the "latest" stage by scanning events in order
 * - Does NOT validate event sequence (yet)
 *
 * @param events - Array of JobEvent objects, ideally sorted by occurredAt
 * @returns Inferred stages and any blockers
 */
export function inferStagesFromEvents(events: JobEvent[]): InferredStages {
  // No events = unknown state
  if (!events || events.length === 0) {
    return {
      workflowStage: WORKFLOW_STAGES.UNKNOWN,
      moneyStage: MONEY_STAGES.UNKNOWN,
      blockers: ['No events recorded'],
    };
  }

  let workflowStage: string = WORKFLOW_STAGES.UNKNOWN;
  let moneyStage: string = MONEY_STAGES.NOT_INVOICED;
  const blockers: string[] = [];

  // Process events in order (assumes sorted by occurredAt)
  for (const event of events) {
    // Check workflow events
    const wfStage = WORKFLOW_EVENT_TO_STAGE[event.type];
    if (wfStage) {
      workflowStage = wfStage;
    }

    // Check payment events
    const payStage = PAYMENT_EVENT_TO_STAGE[event.type];
    if (payStage) {
      moneyStage = payStage;
    }
  }

  // Add blockers based on stage gaps (placeholder logic)
  if (workflowStage === WORKFLOW_STAGES.COMPLETED && moneyStage === MONEY_STAGES.NOT_INVOICED) {
    blockers.push('Job completed but not invoiced');
  }

  if (moneyStage === MONEY_STAGES.INVOICED) {
    blockers.push('Awaiting customer payment');
  }

  return {
    workflowStage,
    moneyStage,
    blockers,
  };
}

// ============================================
// VALIDATION HELPERS (Placeholder)
// ============================================

/**
 * Validates that an event can occur given current state.
 * PLACEHOLDER - always returns true for now.
 */
export function canEventOccur(
  event: JobEvent,
  currentEvents: JobEvent[]
): { valid: boolean; reason?: string } {
  // TODO: Implement actual validation logic
  // - Check event sequence rules
  // - Verify prerequisites (e.g., can't pay vendor before customer pays)
  // - Enforce pathway-specific rules (P1 vs P2 vs P3)

  // Suppress unused parameter warnings
  void event;
  void currentEvents;

  return { valid: true };
}

/**
 * Gets the next expected events based on current state.
 * PLACEHOLDER - returns empty array for now.
 */
export function getNextExpectedEvents(
  currentEvents: JobEvent[]
): JobEventType[] {
  // TODO: Implement based on workflow state machine

  // Suppress unused parameter warning
  void currentEvents;

  return [];
}
