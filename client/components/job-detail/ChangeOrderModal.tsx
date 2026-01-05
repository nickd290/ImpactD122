import React, { useState, useEffect } from 'react';
import { X, FileText, Clock, CheckCircle, XCircle, Save, Trash2, Send, Check, AlertTriangle } from 'lucide-react';
import type { ChangeOrder, ChangeOrderStatus, CreateChangeOrderInput, UpdateChangeOrderInput } from '../../types';
import { changeOrdersApi } from '../../lib/api';

// Status badge styling
const STATUS_CONFIG: Record<ChangeOrderStatus, { bg: string; text: string; icon: React.ComponentType<any>; label: string }> = {
  DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600', icon: FileText, label: 'Draft' },
  PENDING_APPROVAL: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock, label: 'Pending Approval' },
  APPROVED: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Approved' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-600', icon: XCircle, label: 'Rejected' },
};

interface ChangeOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  changeOrder?: ChangeOrder; // undefined = create mode
  onSuccess: () => void;
}

function StatusBadge({ status }: { status: ChangeOrderStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${config.bg} ${config.text} text-sm font-medium rounded-full`}>
      <Icon className="w-4 h-4" />
      {config.label}
    </span>
  );
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ChangeOrderModal({
  isOpen,
  onClose,
  jobId,
  changeOrder,
  onSuccess,
}: ChangeOrderModalProps) {
  const isCreateMode = !changeOrder;
  const isDraft = changeOrder?.status === 'DRAFT';
  const isPending = changeOrder?.status === 'PENDING_APPROVAL';
  const isEditable = isCreateMode || isDraft;

  // Form state
  const [summary, setSummary] = useState('');
  const [requiresNewPO, setRequiresNewPO] = useState(false);
  const [requiresReprice, setRequiresReprice] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Action states
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens or changeOrder changes
  useEffect(() => {
    if (isOpen) {
      if (changeOrder) {
        setSummary(changeOrder.summary);
        setRequiresNewPO(changeOrder.requiresNewPO);
        setRequiresReprice(changeOrder.requiresReprice);
      } else {
        setSummary('');
        setRequiresNewPO(false);
        setRequiresReprice(false);
      }
      setRejectionReason('');
      setShowRejectConfirm(false);
      setShowDeleteConfirm(false);
      setError(null);
    }
  }, [isOpen, changeOrder]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!summary.trim()) {
      setError('Summary is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (isCreateMode) {
        const data: CreateChangeOrderInput = {
          summary: summary.trim(),
          requiresNewPO,
          requiresReprice,
        };
        await changeOrdersApi.create(jobId, data);
      } else if (changeOrder) {
        const data: UpdateChangeOrderInput = {
          summary: summary.trim(),
          requiresNewPO,
          requiresReprice,
        };
        await changeOrdersApi.update(changeOrder.id, data);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save change order');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!changeOrder) return;

    setIsDeleting(true);
    setError(null);

    try {
      await changeOrdersApi.delete(changeOrder.id);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete change order');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSubmit = async () => {
    if (!changeOrder) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await changeOrdersApi.submit(changeOrder.id);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit for approval');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!changeOrder) return;

    setIsApproving(true);
    setError(null);

    try {
      await changeOrdersApi.approve(changeOrder.id);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve change order');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!changeOrder) return;

    setIsRejecting(true);
    setError(null);

    try {
      await changeOrdersApi.reject(changeOrder.id, rejectionReason || undefined);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject change order');
    } finally {
      setIsRejecting(false);
      setShowRejectConfirm(false);
    }
  };

  const isLoading = isSaving || isDeleting || isSubmitting || isApproving || isRejecting;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80]">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isCreateMode ? 'bg-blue-100' : STATUS_CONFIG[changeOrder!.status].bg}`}>
              {isCreateMode ? (
                <FileText className="w-5 h-5 text-blue-600" />
              ) : (
                <StatusBadge status={changeOrder!.status} />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isCreateMode ? 'Create Change Order' : changeOrder!.changeOrderNo}
              </h2>
              {!isCreateMode && (
                <p className="text-sm text-gray-500">
                  Created {formatDate(changeOrder!.createdAt)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* Error display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Summary */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Summary *
            </label>
            {isEditable ? (
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Describe what changed and why..."
                disabled={isLoading}
              />
            ) : (
              <p className="text-gray-900 bg-gray-50 rounded-lg p-3">{changeOrder?.summary}</p>
            )}
          </div>

          {/* Flags */}
          <div className="mb-4 space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requiresNewPO}
                onChange={(e) => setRequiresNewPO(e.target.checked)}
                disabled={!isEditable || isLoading}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className={`text-sm ${isEditable ? 'text-gray-700' : 'text-gray-500'}`}>
                Requires new PO to vendor
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requiresReprice}
                onChange={(e) => setRequiresReprice(e.target.checked)}
                disabled={!isEditable || isLoading}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className={`text-sm ${isEditable ? 'text-gray-700' : 'text-gray-500'}`}>
                Requires repricing
              </span>
            </label>
          </div>

          {/* Approval info (for approved/rejected) */}
          {changeOrder?.status === 'APPROVED' && changeOrder.approvedAt && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">
                <span className="font-medium">Approved</span> on {formatDate(changeOrder.approvedAt)}
                {changeOrder.approvedBy && ` by ${changeOrder.approvedBy}`}
              </p>
            </div>
          )}

          {changeOrder?.status === 'REJECTED' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
                <span className="font-medium">Rejected</span>
                {changeOrder.rejectionReason && (
                  <>: {changeOrder.rejectionReason}</>
                )}
              </p>
            </div>
          )}

          {/* Reject confirmation */}
          {showRejectConfirm && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Reject this change order?</p>
                  <p className="text-sm text-yellow-700 mt-1">Optionally provide a reason:</p>
                </div>
              </div>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 text-sm"
                rows={2}
                placeholder="Rejection reason (optional)"
                disabled={isRejecting}
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => setShowRejectConfirm(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                  disabled={isRejecting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={isRejecting}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {isRejecting ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          )}

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">
                  Are you sure you want to delete this change order? This cannot be undone.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className="flex items-center justify-between gap-3 p-5 border-t border-gray-200 bg-gray-50 rounded-b-lg flex-shrink-0">
          {/* Left side - destructive actions */}
          <div>
            {isDraft && !showDeleteConfirm && !showRejectConfirm && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-md text-sm font-medium disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>

          {/* Right side - primary actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
              disabled={isLoading}
            >
              {isEditable ? 'Cancel' : 'Close'}
            </button>

            {/* Create mode: Save only */}
            {isCreateMode && (
              <button
                onClick={handleSave}
                disabled={isLoading || !summary.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Creating...' : 'Create Draft'}
              </button>
            )}

            {/* Draft mode: Save + Submit */}
            {isDraft && !showDeleteConfirm && (
              <>
                <button
                  onClick={handleSave}
                  disabled={isLoading || !summary.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isLoading || !summary.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? 'Submitting...' : 'Submit for Approval'}
                </button>
              </>
            )}

            {/* Pending mode: Approve + Reject */}
            {isPending && !showRejectConfirm && (
              <>
                <button
                  onClick={() => setShowRejectConfirm(true)}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {isApproving ? 'Approving...' : 'Approve'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
