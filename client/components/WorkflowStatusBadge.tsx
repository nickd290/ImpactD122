import React from 'react';
import { JobWorkflowStatus } from '../types';

interface WorkflowStatusBadgeProps {
  status: JobWorkflowStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  simplified?: boolean; // Use 5-stage simplified display
}

// ============================================
// SIMPLIFIED 5-STAGE WORKFLOW (for production)
// ============================================
export const SIMPLIFIED_STAGES = [
  { stage: 'NEW', label: 'New', statuses: ['NEW_JOB'] },
  { stage: 'PROOFING', label: 'Proofing', statuses: ['AWAITING_PROOF_FROM_VENDOR', 'PROOF_RECEIVED', 'PROOF_SENT_TO_CUSTOMER', 'AWAITING_CUSTOMER_RESPONSE'] },
  { stage: 'APPROVED', label: 'Approved', statuses: ['APPROVED_PENDING_VENDOR'] },
  { stage: 'PRODUCTION', label: 'Production', statuses: ['IN_PRODUCTION'] },
  { stage: 'SHIPPED', label: 'Shipped', statuses: ['COMPLETED'] },
] as const;

// Map detailed status to simplified stage
export function getSimplifiedStage(status: string): { stage: string; label: string; subLabel?: string } {
  // Financial stages (hide from production views)
  if (status === 'INVOICED' || status === 'PAID') {
    return { stage: 'COMPLETE', label: 'Complete', subLabel: status === 'PAID' ? 'Paid' : 'Invoiced' };
  }
  if (status === 'CANCELLED') {
    return { stage: 'CANCELLED', label: 'Cancelled' };
  }

  for (const simplified of SIMPLIFIED_STAGES) {
    if (simplified.statuses.includes(status as any)) {
      // Add sub-label for proofing stages
      let subLabel: string | undefined;
      if (simplified.stage === 'PROOFING') {
        if (status === 'AWAITING_PROOF_FROM_VENDOR') subLabel = 'Waiting for proof';
        else if (status === 'PROOF_RECEIVED') subLabel = 'Proof received';
        else if (status === 'PROOF_SENT_TO_CUSTOMER') subLabel = 'Sent to customer';
        else if (status === 'AWAITING_CUSTOMER_RESPONSE') subLabel = 'Awaiting response';
      }
      return { stage: simplified.stage, label: simplified.label, subLabel };
    }
  }
  return { stage: 'NEW', label: 'New' };
}

// Get simplified stage index (for progress dots)
export function getSimplifiedStageIndex(status: string): number {
  const simplified = getSimplifiedStage(status);
  return SIMPLIFIED_STAGES.findIndex(s => s.stage === simplified.stage);
}

// ============================================
// FULL 10-STAGE WORKFLOW (legacy, for detailed views)
// ============================================
export const WORKFLOW_STAGES = [
  { status: 'NEW_JOB', label: 'New Job' },
  { status: 'AWAITING_PROOF_FROM_VENDOR', label: 'PO Sent / Awaiting Proof' },
  { status: 'PROOF_RECEIVED', label: 'Proof Received' },
  { status: 'PROOF_SENT_TO_CUSTOMER', label: 'Sent to Customer' },
  { status: 'AWAITING_CUSTOMER_RESPONSE', label: 'Awaiting Response' },
  { status: 'APPROVED_PENDING_VENDOR', label: 'Approved - Notify Vendor' },
  { status: 'IN_PRODUCTION', label: 'In Production' },
  { status: 'COMPLETED', label: 'Shipped' },
  { status: 'INVOICED', label: 'Invoiced' },
  { status: 'PAID', label: 'Paid' },
] as const;

// Helper to get stage index (for determining completion state)
export function getStageIndex(status: string): number {
  return WORKFLOW_STAGES.findIndex(s => s.status === status);
}

// Status configuration with colors and labels
export const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; emoji?: string }> = {
  NEW_JOB: {
    label: 'New Job',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
    emoji: '🟡',
  },
  AWAITING_PROOF_FROM_VENDOR: {
    label: 'Awaiting Proof',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-800',
    emoji: '🟠',
  },
  PROOF_RECEIVED: {
    label: 'Proof Received',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    emoji: '🔵',
  },
  PROOF_SENT_TO_CUSTOMER: {
    label: 'Sent to Customer',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-800',
    emoji: '🟣',
  },
  AWAITING_CUSTOMER_RESPONSE: {
    label: 'Awaiting Response',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-800',
    emoji: '⏳',
  },
  APPROVED_PENDING_VENDOR: {
    label: 'Approved - Pending Vendor',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
    emoji: '✅',
  },
  IN_PRODUCTION: {
    label: 'In Production',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
    emoji: '⚙️',
  },
  COMPLETED: {
    label: 'Completed',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    emoji: '✅',
  },
  INVOICED: {
    label: 'Invoiced',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    emoji: '📄',
  },
  PAID: {
    label: 'Paid',
    bgColor: 'bg-green-200',
    textColor: 'text-green-800',
    emoji: '💵',
  },
  CANCELLED: {
    label: 'Cancelled',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    emoji: '❌',
  },
};

// Simplified stage colors (5 stages)
export const SIMPLIFIED_STAGE_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; emoji: string }> = {
  NEW: { label: 'New', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800', emoji: '🆕' },
  PROOFING: { label: 'Proofing', bgColor: 'bg-purple-100', textColor: 'text-purple-800', emoji: '📋' },
  APPROVED: { label: 'Approved', bgColor: 'bg-green-100', textColor: 'text-green-800', emoji: '✓' },
  PRODUCTION: { label: 'Production', bgColor: 'bg-blue-100', textColor: 'text-blue-800', emoji: '⚙️' },
  SHIPPED: { label: 'Shipped', bgColor: 'bg-emerald-100', textColor: 'text-emerald-800', emoji: '📦' },
  COMPLETE: { label: 'Complete', bgColor: 'bg-gray-100', textColor: 'text-gray-600', emoji: '✅' },
  CANCELLED: { label: 'Cancelled', bgColor: 'bg-red-100', textColor: 'text-red-700', emoji: '❌' },
};

const SIZE_CLASSES = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-base px-3 py-1.5',
};

export function WorkflowStatusBadge({ status, size = 'md', showLabel = true, simplified = false }: WorkflowStatusBadgeProps) {
  // Use simplified display if requested
  if (simplified) {
    const simplifiedInfo = getSimplifiedStage(status);
    const simpleConfig = SIMPLIFIED_STAGE_CONFIG[simplifiedInfo.stage] || SIMPLIFIED_STAGE_CONFIG.NEW;

    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium rounded-full ${simpleConfig.bgColor} ${simpleConfig.textColor} ${SIZE_CLASSES[size]}`}
        title={simplifiedInfo.subLabel} // Show detailed status on hover
      >
        <span className="text-xs">{simpleConfig.emoji}</span>
        {showLabel && <span>{simpleConfig.label}</span>}
        {simplifiedInfo.subLabel && showLabel && (
          <span className="text-[10px] opacity-70">({simplifiedInfo.subLabel})</span>
        )}
      </span>
    );
  }

  // Original detailed display
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

// Helper to get the next logical status for action buttons
export function getNextWorkflowStatuses(currentStatus: string): Array<{ status: string; label: string; action: string }> {
  const transitions: Record<string, Array<{ status: string; label: string; action: string }>> = {
    NEW_JOB: [
      { status: 'AWAITING_PROOF_FROM_VENDOR', label: 'PO Sent', action: 'Mark PO Sent' },
    ],
    AWAITING_PROOF_FROM_VENDOR: [
      { status: 'PROOF_RECEIVED', label: 'Proof Received', action: 'Mark Proof Received' },
    ],
    PROOF_RECEIVED: [
      { status: 'PROOF_SENT_TO_CUSTOMER', label: 'Proof Sent', action: 'Send Proof to Customer' },
    ],
    PROOF_SENT_TO_CUSTOMER: [
      { status: 'AWAITING_CUSTOMER_RESPONSE', label: 'Awaiting Response', action: 'Mark Awaiting Response' },
      { status: 'APPROVED_PENDING_VENDOR', label: 'Approved', action: 'Mark Approved' },
    ],
    AWAITING_CUSTOMER_RESPONSE: [
      { status: 'APPROVED_PENDING_VENDOR', label: 'Approved', action: 'Mark Approved' },
      { status: 'PROOF_RECEIVED', label: 'Revisions Needed', action: 'Request Revisions' },
    ],
    APPROVED_PENDING_VENDOR: [
      { status: 'IN_PRODUCTION', label: 'In Production', action: 'Notify Vendor to Proceed' },
    ],
    IN_PRODUCTION: [
      { status: 'COMPLETED', label: 'Completed', action: 'Mark Completed' },
    ],
    COMPLETED: [
      { status: 'INVOICED', label: 'Invoiced', action: 'Mark Invoiced' },
    ],
    INVOICED: [
      { status: 'PAID', label: 'Paid', action: 'Mark Paid' },
    ],
    PAID: [],
    CANCELLED: [],
  };

  return transitions[currentStatus] || [];
}

export default WorkflowStatusBadge;
