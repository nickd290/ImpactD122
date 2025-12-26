// Job status helper utilities
// Extracted from BradfordStatsView for shared use

/**
 * Check if job payment workflow is complete (all 3 payments made)
 * Customer → Impact → Bradford → JD
 */
export function isJobCompleted(job: any, fullJob?: any): boolean {
  const j = fullJob || job;
  return !!(j?.customerPaymentDate && j?.bradfordPaymentDate && j?.jdPaymentDate);
}

/**
 * Check if job has incoming money (customer paid, awaiting Bradford payment)
 * Impact holds the funds, needs to pay Bradford
 */
export function isJobIncoming(job: any, fullJob?: any): boolean {
  const j = fullJob || job;
  return !!(j?.customerPaymentDate && !j?.bradfordPaymentDate);
}

/**
 * Check if job has outgoing money (Bradford paid, awaiting JD payment)
 * Bradford holds the funds, needs to pay JD
 */
export function isJobOutgoing(job: any, fullJob?: any): boolean {
  const j = fullJob || job;
  return !!(j?.bradfordPaymentDate && !j?.jdPaymentDate);
}

/**
 * Check if job needs action (missing Bradford ref, or payment pending)
 */
export function jobNeedsAction(job: any, fullJob?: any): boolean {
  const j = fullJob || job;
  return !job.bradfordRef || isJobIncoming(job, j) || isJobOutgoing(job, j);
}

/**
 * Get the current payment step (1-4) for a job
 * 1: Awaiting customer payment
 * 2: Customer paid, awaiting Bradford payment
 * 3: Bradford paid, awaiting JD payment
 * 4: Complete
 */
export function getPaymentStep(job: any): number {
  if (!job.customerPaymentDate) return 1;
  if (!job.bradfordPaymentDate) return 2;
  if (!job.jdPaymentDate) return 3;
  return 4;
}

/**
 * Get payment status label for display
 */
export function getPaymentStatusLabel(job: any): string {
  const step = getPaymentStep(job);
  switch (step) {
    case 1: return 'Awaiting Payment';
    case 2: return 'Customer Paid';
    case 3: return 'Bradford Paid';
    case 4: return 'Complete';
    default: return 'Unknown';
  }
}

/**
 * Get payment status color class
 */
export function getPaymentStatusColor(job: any): string {
  const step = getPaymentStep(job);
  switch (step) {
    case 1: return 'text-zinc-500';
    case 2: return 'text-amber-600';
    case 3: return 'text-blue-600';
    case 4: return 'text-green-600';
    default: return 'text-zinc-400';
  }
}

/**
 * Check if paper is "used" (job production complete)
 */
export function isPaperUsed(job: any, fullJob?: any): boolean {
  const j = fullJob || job;
  return job.status === 'PAID' ||
    j?.vendorStatus === 'PRINTING_COMPLETE' ||
    j?.vendorStatus === 'SHIPPED' ||
    (j?.deliveryDate && new Date(j.deliveryDate) < new Date());
}

/**
 * Get paper status label for inventory tracking
 */
export function getPaperStatusLabel(job: any, fullJob?: any): string {
  const j = fullJob || job;
  if (job.status === 'PAID') return 'Paid';
  if (j?.vendorStatus === 'SHIPPED') return 'Shipped';
  if (j?.vendorStatus === 'PRINTING_COMPLETE') return 'Printed';
  return 'Active';
}
