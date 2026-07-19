import React from 'react';
import { JobWorkflowStatus } from '../types';

interface WorkflowStatusBadgeProps {
  status: JobWorkflowStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

// Simplified floor stages (money is separate filters, not workflow steps)
export const WORKFLOW_STAGES = [
  { status: 'NEW_JOB', label: 'New' },
  { status: 'AWAITING_CUSTOMER_RESPONSE', label: 'Proofing' },
  { status: 'IN_PRODUCTION', label: 'Production' },
  { status: 'COMPLETED', label: 'Complete' },
] as const;

// Helper to get stage index (maps legacy fine-grained statuses into 4 floor stages)
export function getStageIndex(status: string): number {
  const proofing = [
    'AWAITING_PROOF_FROM_VENDOR',
    'PROOF_RECEIVED',
    'PROOF_SENT_TO_CUSTOMER',
    'AWAITING_CUSTOMER_RESPONSE',
  ];
  const production = ['APPROVED_PENDING_VENDOR', 'IN_PRODUCTION'];
  const complete = ['COMPLETED', 'INVOICED', 'PAID'];
  if (status === 'NEW_JOB') return 0;
  if (proofing.includes(status)) return 1;
  if (production.includes(status)) return 2;
  if (complete.includes(status)) return 3;
  return WORKFLOW_STAGES.findIndex((s) => s.status === status);
}

// Status configuration — legacy DB values collapse to simple labels
export const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; emoji?: string }> = {
  NEW_JOB: { label: 'New', bgColor: 'bg-slate-100', textColor: 'text-slate-800' },
  AWAITING_PROOF_FROM_VENDOR: { label: 'Proofing', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  PROOF_RECEIVED: { label: 'Proofing', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  PROOF_SENT_TO_CUSTOMER: { label: 'Proofing', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  AWAITING_CUSTOMER_RESPONSE: { label: 'Proofing', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  APPROVED_PENDING_VENDOR: { label: 'Production', bgColor: 'bg-amber-100', textColor: 'text-amber-800' },
  IN_PRODUCTION: { label: 'Production', bgColor: 'bg-amber-100', textColor: 'text-amber-800' },
  COMPLETED: { label: 'Complete', bgColor: 'bg-emerald-100', textColor: 'text-emerald-800' },
  INVOICED: { label: 'Complete', bgColor: 'bg-emerald-100', textColor: 'text-emerald-800' },
  PAID: { label: 'Complete', bgColor: 'bg-emerald-100', textColor: 'text-emerald-800' },
  CANCELLED: { label: 'Cancelled', bgColor: 'bg-red-100', textColor: 'text-red-700' },
};

const SIZE_CLASSES = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5',
};

export function WorkflowStatusBadge({ status, size = 'md', showLabel = true }: WorkflowStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    emoji: '❓',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${config.bgColor} ${config.textColor} ${SIZE_CLASSES[size]}`}
    >
      {config.emoji && <span className="text-xs">{config.emoji}</span>}
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

// Next step in simplified floor: New → Proofing → Production → Complete
export function getNextWorkflowStatuses(currentStatus: string): Array<{ status: string; label: string; action: string }> {
  const proofing = new Set([
    'AWAITING_PROOF_FROM_VENDOR',
    'PROOF_RECEIVED',
    'PROOF_SENT_TO_CUSTOMER',
    'AWAITING_CUSTOMER_RESPONSE',
  ]);
  const production = new Set(['APPROVED_PENDING_VENDOR', 'IN_PRODUCTION']);
  const complete = new Set(['COMPLETED', 'INVOICED', 'PAID']);

  if (currentStatus === 'NEW_JOB') {
    return [{ status: 'AWAITING_CUSTOMER_RESPONSE', label: 'Proofing', action: 'Start proofing' }];
  }
  if (proofing.has(currentStatus)) {
    return [{ status: 'IN_PRODUCTION', label: 'Production', action: 'Approved → production' }];
  }
  if (production.has(currentStatus)) {
    return [{ status: 'COMPLETED', label: 'Complete', action: 'Mark complete' }];
  }
  if (complete.has(currentStatus)) {
    return []; // money via payment marks, not workflow
  }
  return [{ status: 'AWAITING_CUSTOMER_RESPONSE', label: 'Proofing', action: 'Start proofing' }];
}

export default WorkflowStatusBadge;
