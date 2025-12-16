import React, { useState } from 'react';
import { X, Edit2, Save, MoreHorizontal, Mail, FileText, Receipt, Send, Download } from 'lucide-react';

interface JobHeaderProps {
  jobNumber: string;
  title: string;
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

export function JobHeader({
  jobNumber,
  title,
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
        {/* Job Title */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg font-semibold text-gray-900 flex-shrink-0">{jobNumber}</span>
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
          {isPartner && (
            <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded flex-shrink-0">
              PARTNER
            </span>
          )}
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
