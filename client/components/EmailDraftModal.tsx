import React, { useState } from 'react';
import { Mail, Loader2, Copy, X } from 'lucide-react';
import { aiApi } from '../lib/api';

interface EmailDraftModalProps {
  job: any;
  onClose: () => void;
}

export function EmailDraftModal({ job, onClose }: EmailDraftModalProps) {
  const [emailType, setEmailType] = useState<'QUOTE' | 'INVOICE' | 'VENDOR_PO'>('QUOTE');
  const [recipientName, setRecipientName] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!recipientName.trim()) {
      setError('Please enter recipient name');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await aiApi.generateEmail(job, recipientName, emailType);
      setDraft(result.draft);
    } catch (err: any) {
      setError(err.message || 'Failed to generate email');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-2">
            <Mail className="w-6 h-6 text-impact-red" />
            <h3 className="text-xl font-bold">Generate Email Draft</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Job Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              Job: <span className="font-medium text-gray-900">{job.number} - {job.title}</span>
            </p>
          </div>

          {/* Form */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Type
              </label>
              <select
                value={emailType}
                onChange={(e) => setEmailType(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                disabled={loading}
              >
                <option value="QUOTE">Quote</option>
                <option value="INVOICE">Invoice</option>
                <option value="VENDOR_PO">Vendor PO</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recipient Name
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder={emailType === 'VENDOR_PO' ? job.vendor?.name : job.customer?.name}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                disabled={loading}
              />
            </div>
          </div>

          {/* Generate Button */}
          {!draft && (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Generating with AI...</span>
                </>
              ) : (
                <>
                  <Mail className="w-5 h-5" />
                  <span>Generate Email Draft</span>
                </>
              )}
            </button>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Draft Display */}
          {draft && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  Email Draft
                </label>
                <button
                  onClick={handleCopy}
                  className="flex items-center space-x-1 text-sm text-orange-600 hover:text-orange-700"
                >
                  <Copy className="w-4 h-4" />
                  <span>{copied ? 'Copied!' : 'Copy to clipboard'}</span>
                </button>
              </div>
              <div className="bg-gray-50 border rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
                  {draft}
                </pre>
              </div>
              <button
                onClick={() => {
                  setDraft('');
                  setRecipientName('');
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Generate Another
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
