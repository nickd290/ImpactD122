import React from 'react';
import { Plus, FileText, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import type { ChangeOrder, ChangeOrderStatus } from '../../types';

// Status badge styling
const STATUS_CONFIG: Record<ChangeOrderStatus, { bg: string; text: string; icon: React.ComponentType<any>; label: string }> = {
  DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600', icon: FileText, label: 'Draft' },
  PENDING_APPROVAL: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock, label: 'Pending' },
  APPROVED: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Approved' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-600', icon: XCircle, label: 'Rejected' },
};

interface ChangeOrderListProps {
  changeOrders: ChangeOrder[];
  isLoading?: boolean;
  effectiveCOVersion?: number | null;
  onSelectCO: (co: ChangeOrder) => void;
  onCreateCO: () => void;
}

function StatusBadge({ status }: { status: ChangeOrderStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${config.bg} ${config.text} text-xs font-medium rounded-full`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ChangeOrderList({
  changeOrders,
  isLoading,
  effectiveCOVersion,
  onSelectCO,
  onCreateCO,
}: ChangeOrderListProps) {
  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500">
        <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full mx-auto mb-2" />
        Loading change orders...
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-900">Change Orders</h3>
          {changeOrders.length > 0 && (
            <span className="text-xs text-gray-500">({changeOrders.length})</span>
          )}
        </div>
        <button
          onClick={onCreateCO}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Change Order
        </button>
      </div>

      {/* Empty State */}
      {changeOrders.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 mb-1">No change orders yet</p>
          <p className="text-xs text-gray-500">
            Create a change order to track modifications to this job
          </p>
        </div>
      ) : (
        /* Change Orders Table */
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">CO #</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Created</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {changeOrders.map((co) => (
                <tr
                  key={co.id}
                  onClick={() => onSelectCO(co)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium text-gray-900">
                        {co.changeOrderNo}
                      </span>
                      {co.version === effectiveCOVersion && co.status === 'APPROVED' && (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">
                          EFFECTIVE
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={co.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(co.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700 line-clamp-1">
                      {co.summary}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info Note */}
      {effectiveCOVersion && (
        <div className="mt-3 text-xs text-gray-500">
          Effective version: CO{effectiveCOVersion} (latest approved)
        </div>
      )}
    </div>
  );
}
