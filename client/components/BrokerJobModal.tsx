/**
 * BrokerJobModal - Production-focused job detail view
 *
 * Priority: GET JOBS DONE
 * 1. FILES - Can we go to production?
 * 2. DUE DATE - When does this need to ship?
 * 3. Job essentials - Name, Size, Quantity, Vendor
 * 4. Status - Where are we in the workflow?
 * 5. Money - (collapsed) - Not the focus
 */

import React, { useState, useEffect } from 'react';
import {
  X, ChevronDown, ChevronRight, Upload, FileText, Image, Database,
  Check, AlertTriangle, Truck, Send, CheckCircle2, Edit2, MessageSquare,
  User, Building2, Reply, Loader2, Link2, ExternalLink, Save
} from 'lucide-react';
import { cn } from '../lib/utils';
import { StatusStrip } from './job-detail/StatusStrip';
import { filesApi, communicationsApi } from '../lib/api';

interface BrokerJob {
  id: string;
  jobNo?: string;
  number?: string;
  title: string;
  status: string;
  sellPrice?: number;
  quantity?: number;
  dueDate?: string;
  customerPONumber?: string;
  sizeName?: string;
  customer?: { id: string; name: string; email?: string };
  vendor?: { id: string; name: string; email?: string };
  specs?: {
    productType?: string;
    colors?: string;
    flatSize?: string;
    finishedSize?: string;
    paperType?: string;
    coating?: string;
    finishing?: string;
    artworkUrl?: string;
    artworkToFollow?: boolean;
  };
  profit?: {
    sellPrice: number;
    totalCost: number;
    spread: number;
  };
  artOverride?: boolean;
  dataOverride?: string;
  portal?: {
    confirmedAt?: string;
    vendorStatus?: string;
    trackingNumber?: string;
  };
  files?: Array<{
    id: string;
    name: string;
    kind: string;
    size: number;
  }>;
  workflowStatus?: string;
  purchaseOrders?: Array<{
    id: string;
    poNumber?: string;
    emailedAt?: string;
  }>;
  notes?: string;
}

interface BrokerJobModalProps {
  job: BrokerJob | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onRefresh?: () => void;
}

interface Communication {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  party: 'CUSTOMER' | 'VENDOR';
  fromEmail: string;
  fromName?: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  status: string;
  createdAt: string;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

function getDaysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatCurrency(amount?: number): string {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function categorizeFiles(files?: Array<{ kind: string }>) {
  if (!files || !Array.isArray(files)) return { artwork: 0, data: 0, proofs: 0, po: 0 };
  return {
    artwork: files.filter(f => f.kind === 'ARTWORK').length,
    data: files.filter(f => f.kind === 'DATA_FILE').length,
    proofs: files.filter(f => f.kind === 'PROOF' || f.kind === 'VENDOR_PROOF').length,
    po: files.filter(f => f.kind === 'PO_PDF' || f.kind === 'CUSTOMER_PO').length,
  };
}

export function BrokerJobModal({
  job,
  isOpen,
  onClose,
  onEdit,
  onRefresh,
}: BrokerJobModalProps) {
  const [financialsExpanded, setFinancialsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [messagesExpanded, setMessagesExpanded] = useState(true);
  const [messages, setMessages] = useState<Communication[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [artworkUrl, setArtworkUrl] = useState('');
  const [isSavingUrl, setIsSavingUrl] = useState(false);

  // Sync artwork URL when job changes
  useEffect(() => {
    if (job?.specs?.artworkUrl) {
      setArtworkUrl(job.specs.artworkUrl);
    } else {
      setArtworkUrl('');
    }
  }, [job?.id, job?.specs?.artworkUrl]);

  // Fetch messages when modal opens
  useEffect(() => {
    if (isOpen && job?.id) {
      setLoadingMessages(true);
      communicationsApi.getByJob(job.id)
        .then((data) => {
          setMessages(data || []);
        })
        .catch((err) => {
          console.error('Failed to load messages:', err);
          setMessages([]);
        })
        .finally(() => {
          setLoadingMessages(false);
        });
    }
  }, [isOpen, job?.id]);

  if (!isOpen || !job) return null;

  const jobNumber = job.jobNo || job.number || 'New Job';
  const fileCounts = categorizeFiles(job.files);
  const daysUntil = getDaysUntil(job.dueDate);

  // Status indicators
  const hasArtwork = job.artOverride || fileCounts.artwork > 0;
  const hasData = job.dataOverride === 'SENT' || fileCounts.data > 0;
  const dataNA = job.dataOverride === 'NA';
  const poSent = job.purchaseOrders?.some(po => po.emailedAt) || false;
  const vendorConfirmed = !!job.portal?.confirmedAt;
  const hasProof = fileCounts.proofs > 0;
  const proofApproved = job.workflowStatus === 'APPROVED_PENDING_VENDOR' ||
                        job.workflowStatus === 'IN_PRODUCTION' ||
                        job.workflowStatus === 'COMPLETED';
  const hasTracking = !!job.portal?.trackingNumber;

  // What's missing?
  const missing: string[] = [];
  if (!hasArtwork) missing.push('Artwork');
  if (!hasData && !dataNA) missing.push('Data');
  if (!hasProof && poSent) missing.push('Proofs');

  // Financials
  const sellPrice = job.profit?.sellPrice || job.sellPrice || 0;
  const totalCost = job.profit?.totalCost || 0;
  const spread = job.profit?.spread || (sellPrice - totalCost);
  const marginPercent = sellPrice > 0 ? (spread / sellPrice) * 100 : 0;

  // File upload handler
  const handleFileUpload = async (kind: 'ARTWORK' | 'DATA_FILE', e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      for (const file of Array.from(files)) {
        formData.append('files', file);
      }
      formData.append('kind', kind);
      await filesApi.upload(job.id, formData);
      onRefresh?.();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  // Save artwork URL handler
  const handleSaveArtworkUrl = async () => {
    if (!artworkUrl.trim() && !job.specs?.artworkUrl) return; // Nothing to save

    setIsSavingUrl(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specs: {
            ...job.specs,
            artworkUrl: artworkUrl.trim() || null,
          },
        }),
      });
      if (!response.ok) throw new Error('Failed to save');
      onRefresh?.();
    } catch (err) {
      console.error('Failed to save artwork URL:', err);
    } finally {
      setIsSavingUrl(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* ═══════════════════════════════════════════════════════════════
            HEADER - Job essentials + BIG DUE DATE
        ═══════════════════════════════════════════════════════════════ */}
        <div className="bg-slate-900 text-white p-5">
          <div className="flex items-start justify-between gap-4">
            {/* Left: Job info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-semibold text-slate-400">
                  {jobNumber}
                </span>
                <button
                  onClick={onClose}
                  className="ml-auto p-1 rounded hover:bg-white/10 transition-colors lg:hidden"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h2 className="text-xl font-bold truncate mb-2">
                {job.title || 'Untitled Job'}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-300">
                {job.sizeName && (
                  <span className="font-semibold text-white">{job.sizeName}</span>
                )}
                {job.quantity && (
                  <span className="font-semibold text-white">{job.quantity.toLocaleString()} qty</span>
                )}
                {job.customerPONumber && (
                  <span className="font-mono text-slate-400">
                    PO: {job.customerPONumber}
                  </span>
                )}
                {job.vendor?.name && (
                  <span className="flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" />
                    {job.vendor.name}
                  </span>
                )}
              </div>
            </div>

            {/* Right: BIG DUE DATE BOX */}
            <div className="flex items-start gap-3">
              {job.dueDate && (
                <div className={cn(
                  'px-4 py-3 rounded-lg text-center min-w-[90px]',
                  daysUntil !== null && daysUntil <= 3 ? 'bg-red-500' :
                  daysUntil !== null && daysUntil <= 7 ? 'bg-amber-500' :
                  'bg-white/20'
                )}>
                  <div className="text-[10px] uppercase tracking-wider opacity-80">Due</div>
                  <div className="text-xl font-bold">{formatDate(job.dueDate)}</div>
                  {daysUntil !== null && (
                    <div className="text-xs font-medium opacity-90">
                      {daysUntil === 0 ? 'TODAY' :
                       daysUntil === 1 ? 'Tomorrow' :
                       daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` :
                       `${daysUntil} days`}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={onClose}
                className="hidden lg:block p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            BODY - Scrollable content
        ═══════════════════════════════════════════════════════════════ */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ─────────────────────────────────────────────────────────────
              FILES PANEL - THE MAIN EVENT
          ───────────────────────────────────────────────────────────── */}
          <div className="bg-slate-100 rounded-xl p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
              Production Files
            </h3>
            <div className="grid grid-cols-4 gap-4">
              {/* Artwork */}
              <div className={cn(
                'flex flex-col items-center p-4 rounded-xl border-2 transition-all',
                fileCounts.artwork > 0
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-300 bg-white border-dashed'
              )}>
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center mb-2',
                  fileCounts.artwork > 0 ? 'bg-emerald-500' : 'bg-slate-200'
                )}>
                  {fileCounts.artwork > 0 ? (
                    <Check className="w-5 h-5 text-white" strokeWidth={3} />
                  ) : (
                    <Image className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <span className="text-sm font-semibold text-slate-700">Artwork</span>
                <span className={cn(
                  'text-xs font-medium',
                  fileCounts.artwork > 0 ? 'text-emerald-600' : 'text-slate-400'
                )}>
                  {fileCounts.artwork > 0 ? `${fileCounts.artwork} files` : 'None'}
                </span>
                <label className="mt-3 cursor-pointer">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.tiff,.ai,.eps,.psd"
                    className="hidden"
                    onChange={(e) => handleFileUpload('ARTWORK', e)}
                    disabled={isUploading}
                  />
                  <span className="text-xs text-blue-600 hover:underline font-medium">
                    + Upload
                  </span>
                </label>
              </div>

              {/* Data */}
              <div className={cn(
                'flex flex-col items-center p-4 rounded-xl border-2 transition-all',
                (fileCounts.data > 0 || dataNA)
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-300 bg-white border-dashed'
              )}>
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center mb-2',
                  (fileCounts.data > 0 || dataNA) ? 'bg-emerald-500' : 'bg-slate-200'
                )}>
                  {(fileCounts.data > 0 || dataNA) ? (
                    <Check className="w-5 h-5 text-white" strokeWidth={3} />
                  ) : (
                    <Database className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <span className="text-sm font-semibold text-slate-700">Data</span>
                <span className={cn(
                  'text-xs font-medium',
                  (fileCounts.data > 0 || dataNA) ? 'text-emerald-600' : 'text-slate-400'
                )}>
                  {dataNA ? 'N/A' : fileCounts.data > 0 ? `${fileCounts.data} files` : 'None'}
                </span>
                {!dataNA && (
                  <label className="mt-3 cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept=".csv,.xlsx,.xls,.txt"
                      className="hidden"
                      onChange={(e) => handleFileUpload('DATA_FILE', e)}
                      disabled={isUploading}
                    />
                    <span className="text-xs text-blue-600 hover:underline font-medium">
                      + Upload
                    </span>
                  </label>
                )}
              </div>

              {/* Proofs */}
              <div className={cn(
                'flex flex-col items-center p-4 rounded-xl border-2 transition-all',
                fileCounts.proofs > 0
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-300 bg-white border-dashed'
              )}>
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center mb-2',
                  fileCounts.proofs > 0 ? 'bg-emerald-500' : 'bg-slate-200'
                )}>
                  {fileCounts.proofs > 0 ? (
                    <Check className="w-5 h-5 text-white" strokeWidth={3} />
                  ) : (
                    <FileText className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <span className="text-sm font-semibold text-slate-700">Proofs</span>
                <span className={cn(
                  'text-xs font-medium',
                  fileCounts.proofs > 0 ? 'text-emerald-600' : 'text-slate-400'
                )}>
                  {fileCounts.proofs > 0 ? `${fileCounts.proofs} files` : 'None'}
                </span>
              </div>

              {/* PO */}
              <div className={cn(
                'flex flex-col items-center p-4 rounded-xl border-2 transition-all',
                poSent
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-300 bg-white border-dashed'
              )}>
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center mb-2',
                  poSent ? 'bg-emerald-500' : 'bg-slate-200'
                )}>
                  {poSent ? (
                    <Check className="w-5 h-5 text-white" strokeWidth={3} />
                  ) : (
                    <Send className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <span className="text-sm font-semibold text-slate-700">PO</span>
                <span className={cn(
                  'text-xs font-medium',
                  poSent ? 'text-emerald-600' : 'text-slate-400'
                )}>
                  {poSent ? 'Sent' : 'Not Sent'}
                </span>
              </div>
            </div>

            {/* Missing indicator */}
            {missing.length > 0 && (
              <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-800">
                  Missing: {missing.join(', ')}
                </span>
              </div>
            )}

            {/* Artwork URL - Always editable */}
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700 uppercase">Artwork Link</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={artworkUrl}
                  onChange={(e) => setArtworkUrl(e.target.value)}
                  placeholder="Paste Sharefile, Dropbox, or other artwork link..."
                  className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                {artworkUrl && artworkUrl !== job.specs?.artworkUrl && (
                  <button
                    onClick={handleSaveArtworkUrl}
                    disabled={isSavingUrl}
                    className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isSavingUrl ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save
                  </button>
                )}
                {artworkUrl && (
                  <a
                    href={artworkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                    title="Open link"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Job Specs - Show print details */}
          {job.specs && (job.specs.paperType || job.specs.colors || job.specs.coating || job.specs.finishing) && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                Print Specs
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {job.specs.paperType && (
                  <div>
                    <span className="text-slate-500">Paper:</span>{' '}
                    <span className="font-medium text-slate-800">{job.specs.paperType}</span>
                  </div>
                )}
                {job.specs.colors && (
                  <div>
                    <span className="text-slate-500">Colors:</span>{' '}
                    <span className="font-medium text-slate-800">{job.specs.colors}</span>
                  </div>
                )}
                {job.specs.coating && (
                  <div>
                    <span className="text-slate-500">Coating:</span>{' '}
                    <span className="font-medium text-slate-800">{job.specs.coating}</span>
                  </div>
                )}
                {job.specs.finishing && (
                  <div>
                    <span className="text-slate-500">Finishing:</span>{' '}
                    <span className="font-medium text-slate-800">{job.specs.finishing}</span>
                  </div>
                )}
                {job.specs.flatSize && (
                  <div>
                    <span className="text-slate-500">Flat Size:</span>{' '}
                    <span className="font-medium text-slate-800">{job.specs.flatSize}</span>
                  </div>
                )}
                {job.specs.finishedSize && (
                  <div>
                    <span className="text-slate-500">Finished:</span>{' '}
                    <span className="font-medium text-slate-800">{job.specs.finishedSize}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {job.notes && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Notes
              </h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}

          {/* Status Strip */}
          <StatusStrip
            hasArtwork={hasArtwork}
            hasData={hasData}
            dataNA={dataNA}
            poSent={poSent}
            vendorConfirmed={vendorConfirmed}
            hasProof={hasProof}
            proofApproved={proofApproved}
            hasTracking={hasTracking}
          />

          {/* Vendor Status (if in production) */}
          {job.portal?.vendorStatus && job.portal.vendorStatus !== 'PENDING' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm">
                <Truck className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-blue-800">
                  Vendor: {job.portal.vendorStatus.replace(/_/g, ' ')}
                </span>
              </div>
              {job.portal.trackingNumber && (
                <div className="mt-2 text-sm text-blue-700">
                  Tracking: <span className="font-mono">{job.portal.trackingNumber}</span>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              MESSAGES PANEL - Email thread with customer/vendor
          ───────────────────────────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setMessagesExpanded(!messagesExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                {messagesExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
                <MessageSquare className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">
                  Messages
                </span>
                {messages.length > 0 && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                    {messages.length}
                  </span>
                )}
              </div>
              {loadingMessages && (
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              )}
            </button>

            {messagesExpanded && (
              <div className="border-t border-slate-200">
                {loadingMessages ? (
                  <div className="p-8 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    <span className="text-sm">Loading messages...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <span className="text-sm">No messages yet</span>
                  </div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                    {messages.slice().reverse().map((msg) => {
                      const isCustomer = msg.party === 'CUSTOMER';
                      const isInbound = msg.direction === 'INBOUND';
                      const timeAgo = formatTimeAgo(new Date(msg.createdAt));

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            'p-3',
                            isCustomer ? 'bg-blue-50/50' : 'bg-amber-50/50'
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center',
                              isCustomer ? 'bg-blue-500' : 'bg-amber-500'
                            )}>
                              {isCustomer ? (
                                <User className="w-3.5 h-3.5 text-white" />
                              ) : (
                                <Building2 className="w-3.5 h-3.5 text-white" />
                              )}
                            </div>
                            <span className={cn(
                              'text-xs font-semibold',
                              isCustomer ? 'text-blue-700' : 'text-amber-700'
                            )}>
                              {isInbound ? (msg.fromName || msg.fromEmail) : 'You'}
                            </span>
                            <span className="text-xs text-slate-400 ml-auto">
                              {timeAgo}
                            </span>
                          </div>
                          <div className="ml-8">
                            <p className="text-sm font-medium text-slate-800 mb-0.5">
                              {msg.subject}
                            </p>
                            {msg.textBody && (
                              <p className="text-sm text-slate-600 line-clamp-2">
                                {msg.textBody.substring(0, 150)}
                                {msg.textBody.length > 150 ? '...' : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reply buttons */}
                <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    Reply to Customer
                  </button>
                  {job.vendor && (
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      Reply to Vendor
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Financials - Collapsed by default */}
          <button
            onClick={() => setFinancialsExpanded(!financialsExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              {financialsExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Financials
              </span>
            </div>
            <span className="text-sm text-slate-600 font-mono">
              {formatCurrency(sellPrice)} / {formatCurrency(totalCost)} / {formatCurrency(spread)} ({marginPercent.toFixed(0)}%)
            </span>
          </button>

          {financialsExpanded && (
            <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Sell</div>
                <div className="text-lg font-bold text-slate-900">{formatCurrency(sellPrice)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Cost</div>
                <div className="text-lg font-bold text-slate-600">{formatCurrency(totalCost)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Spread</div>
                <div className={cn(
                  'text-lg font-bold',
                  marginPercent >= 20 ? 'text-emerald-600' :
                  marginPercent >= 15 ? 'text-amber-600' :
                  'text-red-600'
                )}>
                  {formatCurrency(spread)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            FOOTER - Action buttons
        ═══════════════════════════════════════════════════════════════ */}
        <div className="border-t border-slate-200 p-4 bg-slate-50">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit Job
            </button>

            <div className="flex items-center gap-2">
              {!poSent && (
                <button
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Send PO
                </button>
              )}
              {poSent && !hasProof && (
                <button
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Request Proof
                </button>
              )}
              {hasProof && !proofApproved && (
                <button
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve
                </button>
              )}
              {proofApproved && !hasTracking && (
                <button
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
                >
                  <Truck className="w-4 h-4" />
                  Check Shipping
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BrokerJobModal;
