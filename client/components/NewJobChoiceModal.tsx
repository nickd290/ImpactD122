import React from 'react';
import { X, FileUp, PenLine } from 'lucide-react';

interface NewJobChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChooseUpload: () => void;
  onChooseManual: () => void;
}

export function NewJobChoiceModal({
  isOpen,
  onClose,
  onChooseUpload,
  onChooseManual
}: NewJobChoiceModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Create New Job</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-gray-600 text-sm mb-4">
            How would you like to create this job?
          </p>

          {/* Option 1: Upload & Parse */}
          <button
            onClick={onChooseUpload}
            className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                <FileUp className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-700">
                  Upload & Parse Document
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Upload a PO or spec document. AI will extract job details and pre-fill the form.
                </p>
              </div>
            </div>
          </button>

          {/* Option 2: Manual Entry */}
          <button
            onClick={onChooseManual}
            className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all group text-left"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                <PenLine className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 group-hover:text-green-700">
                  Manual Entry
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Start with a blank form and enter all job details manually.
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
