import React from 'react';

type JobStatus =
  | 'DRAFT'
  | 'QUOTED'
  | 'APPROVED'
  | 'PO_ISSUED'
  | 'IN_PRODUCTION'
  | 'SHIPPED'
  | 'INVOICED'
  | 'PAID'
  | 'CANCELLED';

interface StatusBadgeProps {
  status: JobStatus;
  large?: boolean;
}

export function StatusBadge({ status, large }: StatusBadgeProps) {
  const statusColors: Record<JobStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    QUOTED: 'bg-blue-100 text-blue-800',
    APPROVED: 'bg-green-100 text-green-800',
    PO_ISSUED: 'bg-purple-100 text-purple-800',
    IN_PRODUCTION: 'bg-yellow-100 text-yellow-800',
    SHIPPED: 'bg-indigo-100 text-indigo-800',
    INVOICED: 'bg-impact-orange text-white',
    PAID: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  const statusLabels: Record<JobStatus, string> = {
    DRAFT: 'Draft',
    QUOTED: 'Quoted',
    APPROVED: 'Approved',
    PO_ISSUED: 'PO Issued',
    IN_PRODUCTION: 'In Production',
    SHIPPED: 'Shipped',
    INVOICED: 'Invoiced',
    PAID: 'Paid',
    CANCELLED: 'Cancelled',
  };

  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusColors[status]} ${large ? 'text-sm px-4 py-2' : ''}`}
    >
      {statusLabels[status] || status}
    </span>
  );
}
