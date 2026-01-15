import React from 'react';

type JobStatus = 'ACTIVE' | 'PAID' | 'CANCELLED' | 'OVERDUE';

interface StatusBadgeProps {
  status: JobStatus;
  large?: boolean;
}

export function StatusBadge({ status, large }: StatusBadgeProps) {
  const statusColors: Record<JobStatus, string> = {
    ACTIVE: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    PAID: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    CANCELLED: 'bg-red-100 text-red-800 border border-red-200',
    OVERDUE: 'bg-red-600 text-white font-semibold',
  };

  const statusLabels: Record<JobStatus, string> = {
    ACTIVE: 'Active',
    PAID: 'Paid',
    CANCELLED: 'Cancelled',
    OVERDUE: 'Overdue',
  };

  const baseClasses = large
    ? 'px-4 py-1.5 text-sm font-semibold'
    : 'px-3 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-block rounded-full ${baseClasses} ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}
    >
      {statusLabels[status] || status}
    </span>
  );
}
