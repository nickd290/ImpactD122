/**
 * Simplified job pipeline for Impact Direct ops.
 *
 * Floor sequence:
 *   New → Proofing → Production (approved/running) → Complete
 *
 * Money (after / during Complete):
 *   Invoiced → Customer paid → Impact pays BGE *or* JD → Settled
 *
 * DB still stores fine-grained JobWorkflowStatus values; this layer
 * maps them for UI filters, kanban, and status dropdowns.
 */

export type OpsStage = 'new' | 'proofing' | 'production' | 'complete';

export type MoneyStage = 'await_client' | 'pay_vendor' | 'settled';

/** Canonical DB status written when user picks a simple stage */
export const OPS_TO_WORKFLOW: Record<OpsStage, string> = {
  new: 'NEW_JOB',
  proofing: 'AWAITING_CUSTOMER_RESPONSE',
  production: 'IN_PRODUCTION',
  complete: 'COMPLETED',
};

export const OPS_STAGE_META: Record<
  OpsStage,
  { label: string; short: string; description: string }
> = {
  new: {
    label: 'New',
    short: 'New',
    description: 'Just entered — not in proof yet',
  },
  proofing: {
    label: 'Proofing',
    short: 'Proof',
    description: 'Proof cycle with vendor / customer',
  },
  production: {
    label: 'Production',
    short: 'Prod',
    description: 'Approved and on press / in production',
  },
  complete: {
    label: 'Complete',
    short: 'Done',
    description: 'Produced — invoice / collect / pay BGE or JD',
  },
};

const PROOFING_STATUSES = new Set([
  'AWAITING_PROOF_FROM_VENDOR',
  'PROOF_RECEIVED',
  'PROOF_SENT_TO_CUSTOMER',
  'AWAITING_CUSTOMER_RESPONSE',
]);

const PRODUCTION_STATUSES = new Set([
  'APPROVED_PENDING_VENDOR',
  'IN_PRODUCTION',
]);

const COMPLETE_STATUSES = new Set(['COMPLETED', 'INVOICED', 'PAID']);

export function effectiveWorkflow(job: {
  workflowStatus?: string | null;
  workflowStatusOverride?: string | null;
}): string {
  return job.workflowStatusOverride || job.workflowStatus || 'NEW_JOB';
}

export function getOpsStage(job: {
  status?: string | null;
  workflowStatus?: string | null;
  workflowStatusOverride?: string | null;
}): OpsStage {
  if (job.status === 'CANCELLED') return 'complete';
  const wf = effectiveWorkflow(job);
  if (COMPLETE_STATUSES.has(wf) || job.status === 'PAID') return 'complete';
  if (PRODUCTION_STATUSES.has(wf)) return 'production';
  if (PROOFING_STATUSES.has(wf)) return 'proofing';
  return 'new';
}

export function opsStageLabel(job: {
  status?: string | null;
  workflowStatus?: string | null;
  workflowStatusOverride?: string | null;
}): string {
  return OPS_STAGE_META[getOpsStage(job)].label;
}

/** Client paid Impact */
export function isClientPaid(job: {
  status?: string | null;
  customerPaymentDate?: string | null;
  customerPaymentPaid?: boolean | null;
}): boolean {
  if (job.status === 'PAID') return true;
  if (job.customerPaymentPaid === true) return true;
  return !!job.customerPaymentDate;
}

/** Customer invoice on file (PDF generated, legacy #, or workflow INVOICED+) */
export function isInvoiced(job: {
  invoiceGeneratedAt?: string | null;
  customerInvoiceNumber?: string | null;
  invoiceNumber?: string | null;
  workflowStatus?: string | null;
  workflowStatusOverride?: string | null;
}): boolean {
  if (job.invoiceGeneratedAt) return true;
  if (job.customerInvoiceNumber) return true;
  const wf = job.workflowStatusOverride || job.workflowStatus || '';
  return wf === 'INVOICED' || wf === 'PAID';
}

/** Default AR terms when customer has none set */
export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

export const PAYMENT_TERMS_OPTIONS: { days: number; label: string }[] = [
  { days: 0, label: 'Due on receipt' },
  { days: 15, label: 'Net 15' },
  { days: 30, label: 'Net 30' },
  { days: 45, label: 'Net 45' },
  { days: 60, label: 'Net 60' },
  { days: 90, label: 'Net 90' },
];

export function paymentTermsLabel(days?: number | null): string {
  const d = days == null ? DEFAULT_PAYMENT_TERMS_DAYS : Number(days);
  const hit = PAYMENT_TERMS_OPTIONS.find((o) => o.days === d);
  if (hit) return hit.label;
  if (d === 0) return 'Due on receipt';
  return `Net ${d}`;
}

/** Terms days: job override → customer → default 30 */
export function getPaymentTermsDays(job: {
  paymentTermsDays?: number | null;
  customer?: { paymentTermsDays?: number | null } | null;
}): number {
  if (job.paymentTermsDays != null && !Number.isNaN(Number(job.paymentTermsDays))) {
    return Math.max(0, Number(job.paymentTermsDays));
  }
  if (job.customer?.paymentTermsDays != null && !Number.isNaN(Number(job.customer.paymentTermsDays))) {
    return Math.max(0, Number(job.customer.paymentTermsDays));
  }
  return DEFAULT_PAYMENT_TERMS_DAYS;
}

/** Invoice date (when billed) — never treat as production due */
export function getInvoiceDate(job: {
  invoiceGeneratedAt?: string | null | Date;
}): Date | null {
  if (!job.invoiceGeneratedAt) return null;
  const d = new Date(job.invoiceGeneratedAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Payment due = invoice date + customer terms. null if not invoiced. */
export function getPaymentDueDate(job: {
  invoiceGeneratedAt?: string | null | Date;
  paymentTermsDays?: number | null;
  customer?: { paymentTermsDays?: number | null } | null;
  paymentDueDate?: string | null | Date;
}): Date | null {
  if (job.paymentDueDate) {
    const d = new Date(job.paymentDueDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const inv = getInvoiceDate(job);
  if (!inv) return null;
  const due = new Date(inv);
  due.setHours(0, 0, 0, 0);
  due.setDate(due.getDate() + getPaymentTermsDays(job));
  return due;
}

/** AR overdue: invoiced, client not paid, past payment due (terms-based) */
export function isPaymentOverdue(job: {
  status?: string | null;
  customerPaymentDate?: string | null;
  customerPaymentPaid?: boolean | null;
  invoiceGeneratedAt?: string | null | Date;
  customerInvoiceNumber?: string | null;
  invoiceNumber?: string | null;
  workflowStatus?: string | null;
  workflowStatusOverride?: string | null;
  paymentTermsDays?: number | null;
  customer?: { paymentTermsDays?: number | null } | null;
  paymentDueDate?: string | null | Date;
}): boolean {
  if (isClientPaid(job)) return false;
  if (!isInvoiced(job)) return false;
  const due = getPaymentDueDate(job);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

export function getDaysPaymentOverdue(job: Parameters<typeof isPaymentOverdue>[0]): number | null {
  if (!isPaymentOverdue(job)) return null;
  const due = getPaymentDueDate(job);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Production delivery / mail deadline (floor only).
 * NOT payment due — migrated invoice dates must not live here.
 */
export function getDeliveryDate(job: {
  deliveryDate?: string | null | Date;
  dueDate?: string | null | Date;
  mailDate?: string | null | Date;
}): Date | null {
  const raw = job.deliveryDate || job.dueDate || job.mailDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Floor late: still on production board and past delivery/mail date */
export function isProductionLate(job: {
  status?: string | null;
  workflowStatus?: string | null;
  workflowStatusOverride?: string | null;
  deliveryDate?: string | null | Date;
  dueDate?: string | null | Date;
  mailDate?: string | null | Date;
}): boolean {
  if (job.status === 'PAID' || job.status === 'CANCELLED') return false;
  const ops = getOpsStage(job);
  if (ops === 'complete') return false; // floor done — AR uses payment terms
  const del = getDeliveryDate(job);
  if (!del) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(del);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

export function getDaysProductionLate(job: Parameters<typeof isProductionLate>[0]): number | null {
  if (!isProductionLate(job)) return null;
  const del = getDeliveryDate(job);
  if (!del) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(del);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function isBgePaid(job: {
  bradfordPaymentDate?: string | null;
  bradfordPaymentPaid?: boolean | null;
}): boolean {
  if (job.bradfordPaymentPaid === true) return true;
  return !!job.bradfordPaymentDate;
}

export function isJdPaid(job: {
  jdPaymentDate?: string | null;
  jdPaymentPaid?: boolean | null;
}): boolean {
  if (job.jdPaymentPaid === true) return true;
  return !!job.jdPaymentDate;
}

/** Impact pays one production payee — BGE on Bradford paper, else JD */
export function impactProductionPayee(job: {
  paperSource?: string | null;
  jdPaymentDate?: string | null;
  jdPaymentPaid?: boolean | null;
  bradfordPaymentDate?: string | null;
  bradfordPaymentPaid?: boolean | null;
}): 'BGE' | 'JD' {
  if (isJdPaid(job) && !isBgePaid(job)) return 'JD';
  if (isBgePaid(job) && !isJdPaid(job)) return 'BGE';
  const src = (job.paperSource || 'BRADFORD').toUpperCase();
  if (src === 'VENDOR' || src === 'CUSTOMER') return 'JD';
  return 'BGE';
}

export function isImpactProductionPaid(job: {
  jdPaymentDate?: string | null;
  jdPaymentPaid?: boolean | null;
  bradfordPaymentDate?: string | null;
  bradfordPaymentPaid?: boolean | null;
}): boolean {
  return isBgePaid(job) || isJdPaid(job);
}

/** Client paid us; Impact still owes BGE or JD */
export function needsVendorPay(job: {
  status?: string | null;
  customerPaymentDate?: string | null;
  customerPaymentPaid?: boolean | null;
  jdPaymentDate?: string | null;
  jdPaymentPaid?: boolean | null;
  bradfordPaymentDate?: string | null;
  bradfordPaymentPaid?: boolean | null;
}): boolean {
  if (!isClientPaid(job)) return false;
  if (job.status === 'CANCELLED') return false;
  return !isImpactProductionPaid(job);
}

export function getMoneyStage(job: {
  status?: string | null;
  customerPaymentDate?: string | null;
  customerPaymentPaid?: boolean | null;
  jdPaymentDate?: string | null;
  jdPaymentPaid?: boolean | null;
  bradfordPaymentDate?: string | null;
  bradfordPaymentPaid?: boolean | null;
}): MoneyStage {
  if (job.status === 'CANCELLED') return 'settled';
  if (isImpactProductionPaid(job) && isClientPaid(job)) return 'settled';
  if (isImpactProductionPaid(job) && !isClientPaid(job)) return 'await_client';
  if (needsVendorPay(job)) return 'pay_vendor';
  return 'await_client';
}

export function moneyStatusLabel(job: {
  status?: string | null;
  paperSource?: string | null;
  customerPaymentDate?: string | null;
  customerPaymentPaid?: boolean | null;
  jdPaymentDate?: string | null;
  jdPaymentPaid?: boolean | null;
  bradfordPaymentDate?: string | null;
  bradfordPaymentPaid?: boolean | null;
}): { label: string; className: string } {
  if (job.status === 'CANCELLED') {
    return { label: '—', className: 'text-zinc-400' };
  }
  if (!isClientPaid(job)) {
    return { label: 'Await client', className: 'text-amber-700' };
  }
  if (isImpactProductionPaid(job)) {
    return { label: 'Settled', className: 'text-emerald-700' };
  }
  const payee = impactProductionPayee(job);
  return {
    label: payee === 'BGE' ? 'Pay BGE' : 'Pay JD',
    className: 'text-[#C0512A]',
  };
}

/** Simple status options for dropdowns (what staff pick) */
export const SIMPLE_STATUS_OPTIONS: Array<{
  value: string;
  ops: OpsStage;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
}> = [
  {
    value: 'NEW_JOB',
    ops: 'new',
    label: 'New',
    shortLabel: 'New',
    color: 'text-slate-700',
    bgColor: 'bg-slate-100',
  },
  {
    value: 'AWAITING_CUSTOMER_RESPONSE',
    ops: 'proofing',
    label: 'Proofing',
    shortLabel: 'Proof',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
  {
    value: 'IN_PRODUCTION',
    ops: 'production',
    label: 'Production',
    shortLabel: 'Prod',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
  },
  {
    value: 'COMPLETED',
    ops: 'complete',
    label: 'Complete',
    shortLabel: 'Done',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-100',
  },
];

/** Map any raw workflow status to the simple option shown in UI */
export function simpleStatusForWorkflow(wf: string): (typeof SIMPLE_STATUS_OPTIONS)[number] {
  const ops =
    COMPLETE_STATUSES.has(wf)
      ? 'complete'
      : PRODUCTION_STATUSES.has(wf)
        ? 'production'
        : PROOFING_STATUSES.has(wf)
          ? 'proofing'
          : 'new';
  return SIMPLE_STATUS_OPTIONS.find((o) => o.ops === ops) || SIMPLE_STATUS_OPTIONS[0];
}

/** Next step in the simplified floor sequence */
export function nextOpsStage(current: OpsStage): OpsStage | null {
  const order: OpsStage[] = ['new', 'proofing', 'production', 'complete'];
  const i = order.indexOf(current);
  if (i < 0 || i >= order.length - 1) return null;
  return order[i + 1];
}
