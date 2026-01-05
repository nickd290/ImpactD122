import React, { useState } from 'react';
import { X, Edit2, Save, MoreHorizontal, Mail, FileText, Receipt, Send, Download } from 'lucide-react';
import type { ChangeOrderStatus } from '../../types';

// Pathway badge styling
const PATHWAY_STYLES = {
  P1: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'P1' },
  P2: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'P2' },
  P3: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'P3' },
} as const;

// CO badge styling
const CO_STATUS_STYLES = {
  DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600' },
  PENDING_APPROVAL: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  APPROVED: { bg: 'bg-green-100', text: 'text-green-700' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-600' },
} as const;

type Pathway = 'P1' | 'P2' | 'P3';

interface LatestCOInfo {
  version: number;
  status: ChangeOrderStatus;
}

interface JobHeaderProps {
  jobNumber: string;
  title: string;
  baseJobId?: string | null;  // Canonical job ID (e.g., ME2-3000)
  pathway?: Pathway | null;   // P1, P2, or P3
  effectiveCOVersion?: number | null;  // Latest approved CO version
  latestCO?: LatestCOInfo | null;      // Latest CO (any status)
  isPartner?: boolean;
  isEditMode: boolean;
  isSaving: boolean;
  editedTitle?: string;
  onTitleChange: (title: string) => void;
  onClose: () => void;
  onEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onGeneratePO?: () => void;
  onGenerateInvoice?: () => void;
  onGenerateQuote?: () => void;
  onSendEmail?: (type: 'invoice' | 'po') => void;
}

// Helper to render CO badge
function COBadge({ effectiveCOVersion, latestCO }: { effectiveCOVersion?: number | null; latestCO?: LatestCOInfo | null }) {
  // No COs at all
  if (!latestCO) {
    return (
      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-medium rounded" title="No Change Orders">
        No CO
      </span>
    );
  }

  const { version: latestVersion, status: latestStatus } = latestCO;
  const effective = effectiveCOVersion ?? 0;

  // Latest is APPROVED and is the effective version
  if (latestStatus === 'APPROVED' && latestVersion === effective) {
    const style = CO_STATUS_STYLES.APPROVED;
    return (
      <span className={`px-1.5 py-0.5 ${style.bg} ${style.text} text-[10px] font-bold rounded`} title="Approved Change Order">
        CO{effective} Approved
      </span>
    );
  }

  // Latest is PENDING_APPROVAL and newer than effective
  if (latestStatus === 'PENDING_APPROVAL' && latestVersion > effective) {
    const style = CO_STATUS_STYLES.PENDING_APPROVAL;
    const effectiveLabel = effective > 0 ? `CO${effective}` : 'Base';
    return (
      <span className={`px-1.5 py-0.5 ${style.bg} ${style.text} text-[10px] font-bold rounded`} title={`Pending approval, effective: ${effectiveLabel}`}>
        CO{latestVersion} Pending <span className="font-normal">(eff: {effectiveLabel})</span>
      </span>
    );
  }

  // Latest is DRAFT and newer than effective
  if (latestStatus === 'DRAFT' && latestVersion > effective) {
    const style = CO_STATUS_STYLES.DRAFT;
    const effectiveLabel = effective > 0 ? `CO${effective}` : 'Base';
    return (
      <span className={`px-1.5 py-0.5 ${style.bg} ${style.text} text-[10px] font-medium rounded`} title={`Draft change order, effective: ${effectiveLabel}`}>
        CO{latestVersion} Draft <span className="text-gray-400">(eff: {effectiveLabel})</span>
      </span>
    );
  }

  // Latest is REJECTED - show effective if exists, otherwise base
  if (latestStatus === 'REJECTED') {
    if (effective > 0) {
      const style = CO_STATUS_STYLES.APPROVED;
      return (
        <span className={`px-1.5 py-0.5 ${style.bg} ${style.text} text-[10px] font-bold rounded`} title="Latest CO rejected, showing effective">
          CO{effective} Approved
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-medium rounded" title="Latest CO rejected, no approved CO">
        No CO
      </span>
    );
  }

  // Fallback: show effective if exists
  if (effective > 0) {
    const style = CO_STATUS_STYLES.APPROVED;
    return (
      <span className={`px-1.5 py-0.5 ${style.bg} ${style.text} text-[10px] font-bold rounded`}>
        CO{effective} Approved
      </span>
    );
  }

  // No effective, show "No CO"
  return (
    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-medium rounded">
      No CO
    </span>
  );
}

export function JobHeader({
  jobNumber,
  title,
  baseJobId,
  pathway,
  effectiveCOVersion,
  latestCO,
  isPartner,
  isEditMode,
  isSaving,
  editedTitle,
  onTitleChange,
  onClose,
  onEdit,
  onSave,
  onCancelEdit,
  onGeneratePO,
  onGenerateInvoice,
  onGenerateQuote,
  onSendEmail,
}: JobHeaderProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  return (
    <div className={`border-b px-5 py-3 flex-shrink-0 ${isEditMode ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`}>
      {/* Edit mode indicator */}
      {isEditMode && (
        <div className="flex items-center gap-2 text-blue-600 text-xs font-medium mb-2">
          <Edit2 className="w-3 h-3" />
          Editing - Save when done
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        {/* Job Title + IDs */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Job Number + Base Job ID */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-lg font-semibold text-gray-900">{jobNumber}</span>
            {baseJobId && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-sm font-mono text-gray-500" title="Canonical Job ID">
                  {baseJobId}
                </span>
              </>
            )}
          </div>
          <span className="text-gray-300">·</span>
          {isEditMode ? (
            <input
              type="text"
              value={editedTitle ?? title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:ring-1 focus:ring-blue-500"
              placeholder="Job title"
            />
          ) : (
            <span className="text-gray-600 text-sm truncate">{title}</span>
          )}
          {/* Badges: Pathway + CO + Partner */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {pathway && PATHWAY_STYLES[pathway] && (
              <span
                className={`px-1.5 py-0.5 ${PATHWAY_STYLES[pathway].bg} ${PATHWAY_STYLES[pathway].text} text-[10px] font-bold rounded`}
                title={`Pathway ${pathway}`}
              >
                {PATHWAY_STYLES[pathway].label}
              </span>
            )}
            <COBadge effectiveCOVersion={effectiveCOVersion} latestCO={latestCO} />
            {isPartner && (
              <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded">
                PARTNER
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditMode ? (
            <>
              <button
                onClick={onSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={onCancelEdit}
                disabled={isSaving}
                className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md text-sm"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-md hover:bg-gray-800 text-sm font-medium"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>

              {/* More Actions Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>

                {showMoreMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowMoreMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                      {onGeneratePO && (
                        <button
                          onClick={() => { onGeneratePO(); setShowMoreMenu(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <FileText className="w-4 h-4" />
                          Download PO PDF
                        </button>
                      )}
                      {onGenerateInvoice && (
                        <button
                          onClick={() => { onGenerateInvoice(); setShowMoreMenu(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Receipt className="w-4 h-4" />
                          Download Invoice
                        </button>
                      )}
                      {onGenerateQuote && (
                        <button
                          onClick={() => { onGenerateQuote(); setShowMoreMenu(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Download className="w-4 h-4" />
                          Download Quote
                        </button>
                      )}
                      <div className="border-t border-gray-100 my-1" />
                      {onSendEmail && (
                        <>
                          <button
                            onClick={() => { onSendEmail('invoice'); setShowMoreMenu(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Send className="w-4 h-4" />
                            Email Invoice
                          </button>
                          <button
                            onClick={() => { onSendEmail('po'); setShowMoreMenu(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Mail className="w-4 h-4" />
                            Email PO to Vendor
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
