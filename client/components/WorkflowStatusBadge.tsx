import React from 'react';
import { JobWorkflowStatus } from '../types';

interface WorkflowStatusBadgeProps {
  status: JobWorkflowStatus | string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

// Status configuration with colors and labels
const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; emoji?: string }> = {
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
