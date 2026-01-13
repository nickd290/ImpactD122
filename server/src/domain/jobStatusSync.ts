/**
 * Job Status Synchronization
 *
 * Ensures status and workflowStatus stay aligned.
 */

import { JobStatus, JobWorkflowStatus } from '@prisma/client';

/**
 * Returns the workflowStatus that should be set when status changes.
 * Only enforces sync for terminal statuses (PAID, CANCELLED).
 *
 * @param newStatus - The new job status being set
 * @param currentWorkflowStatus - The current workflow status
 * @returns The workflowStatus to use (may be unchanged)
 */
export function syncWorkflowFromStatus(
  newStatus: JobStatus,
  currentWorkflowStatus: JobWorkflowStatus
): JobWorkflowStatus {
  // When status → PAID, ensure workflowStatus is PAID or INVOICED
  if (newStatus === JobStatus.PAID) {
    const allowedStatuses: JobWorkflowStatus[] = [
      JobWorkflowStatus.PAID,
      JobWorkflowStatus.INVOICED,
    ];
    if (!allowedStatuses.includes(currentWorkflowStatus)) {
      return JobWorkflowStatus.PAID;
    }
  }

  // When status → CANCELLED, workflowStatus should also be CANCELLED
  if (newStatus === JobStatus.CANCELLED) {
    return JobWorkflowStatus.CANCELLED;
  }

  // For ACTIVE, leave workflowStatus unchanged
  return currentWorkflowStatus;
}
