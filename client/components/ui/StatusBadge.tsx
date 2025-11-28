import React from 'react';

type JobStatus = 'ACTIVE' | 'PAID' | 'CANCELLED';

interface StatusBadgeProps {
  status: JobStatus;
  large?: boolean;
}

export function StatusBadge({ status, large }: StatusBadgeProps) {
  const statusColors: Record<JobStatus, string> = {
    ACTIVE: 'bg-yellow-100 text-yellow-800',
    PAID: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  const statusLabels: Record<JobStatus, string> = {
    ACTIVE: 'Active',
    PAID: 'Paid',
    CANCELLED: 'Cancelled',
  };

  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'} ${large ? 'text-sm px-4 py-2' : ''}`}
    >
      {statusLabels[status] || status}
    </span>
  );
}
