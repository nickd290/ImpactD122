/**
 * JobDrawer - Slide-out drawer for job details
 *
 * Key features:
 * - Slide-out from right (480px width)
 * - Job # and Customer PO # are most prominent
 * - Inline editing for: Due Date, Customer PO, Status, Notes
 * - Shipping info section with dates and tracking
 * - All specs, files, messages, financials accessible
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X, ChevronDown, ChevronRight, ChevronUp, Upload, FileText, Image, Database,
  Check, AlertTriangle, Truck, Send, CheckCircle2, Edit2, MessageSquare,
  User, Building2, Reply, Loader2, Link2, ExternalLink, Save, Calendar,
  Package, FileDown, Receipt, DollarSign, Mail, MapPin, CreditCard
} from 'lucide-react';
import { cn } from '../lib/utils';
import { StatusStrip } from './job-detail/StatusStrip';
import { WorkflowStatusDropdown } from './WorkflowStatusDropdown';
import { filesApi, communicationsApi, jobsApi, pdfApi } from '../lib/api';
import { InlineEditableCell } from './InlineEditableCell';

// Comprehensive specs interface matching all ImpactD122 data
interface JobSpecsExpanded {
  // Basic
  productType?: string;
  colors?: string;
  flatSize?: string;
  finishedSize?: string;
  paperType?: string;
  coating?: string;
  finishing?: string;
  artworkUrl?: string;
  artworkToFollow?: boolean;

  // Print Production (new)
  folds?: string;
  perforations?: string;
  dieCut?: string;
  bleed?: string;
  proofType?: string;
  bindingStyle?: string;
  printSides?: string;
  frontColors?: string;
  backColors?: string;

  // Booklet specific (new)
  coverType?: 'SELF' | 'PLUS';
  coverPaperType?: string;
  pageCount?: number;

  // Shipping instructions (new)
  shipToName?: string;
  shipToAddress?: string;
  shipVia?: string;
  specialInstructions?: string;
  artworkInstructions?: string;
  packingInstructions?: string;
  labelingInstructions?: string;

  // Version/component info (new)
  versions?: Array<{ name: string; quantity: number }> | string;
  components?: string[] | string;
}

interface BrokerJob {
  id: string;
  jobNo?: string;
  number?: string;
  title: string;
  status: string;
  sellPrice?: number;
  quantity?: number;
  dueDate?: string;
  mailDate?: string;
  inHomesDate?: string;
  customerPONumber?: string;
  sizeName?: string;
  customer?: { id: string; name: string; email?: string };
  vendor?: { id: string; name: string; email?: string };
  specs?: JobSpecsExpanded;
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
    trackingCarrier?: string;
  };
  trackingOverride?: string;
  trackingCarrierOverride?: string;
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
  createdAt?: string;

  // === NEW: Production Info (from Prisma) ===
  pathway?: 'P1' | 'P2' | 'P3';
  paperSource?: 'BRADFORD' | 'VENDOR' | 'CUSTOMER';
  partnerPONumber?: string; // Bradford ref
  bradfordPaperType?: string;

  // === NEW: Mailing Details ===
  matchType?: '2-WAY' | '3-WAY' | string;
  mailFormat?: 'SELF_MAILER' | 'POSTCARD' | 'ENVELOPE';
  hasVersions?: boolean;
  hasData?: boolean;

  // === NEW: Shipping Info ===
  vendorShipToName?: string;
  vendorShipToAddress?: string;
  vendorShipToCity?: string;
  vendorShipToState?: string;
  vendorShipToZip?: string;
  vendorShipToPhone?: string;
  vendorSpecialInstructions?: string;
  packingSlipNotes?: string;

  // === NEW: Payment Tracking ===
  customerPaymentDate?: string;
  customerPaymentAmount?: number;
  vendorPaymentDate?: string;
  vendorPaymentAmount?: number;
  bradfordPaymentPaid?: boolean;
  bradfordPaymentDate?: string;
  jdInvoiceEmailedAt?: string;
  jdInvoiceEmailedTo?: string;
}

interface JobDrawerProps {
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

function formatFullDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDueDateColor(daysUntil: number | null): string {
  if (daysUntil === null) return 'bg-slate-500';
  if (daysUntil < 0) return 'bg-red-600';      // OVERDUE
  if (daysUntil <= 2) return 'bg-orange-500';  // Urgent
  if (daysUntil <= 5) return 'bg-amber-500';   // Soon
  return 'bg-emerald-500';                     // Safe
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

// Inline editable textarea component
function InlineEditableTextarea({
  value,
  onSave,
  placeholder = 'Click to add notes...',
  rows = 3,
}: {
  value: string | null | undefined;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  rows?: number;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(value || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (editValue === (value || '')) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          rows={rows}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm border border-blue-400 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          disabled={isSaving}
        />
        {isSaving && (
          <div className="flex items-center gap-2 text-xs text-blue-600">
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving...
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={handleStartEdit}
      className={cn(
        'px-3 py-2 rounded-lg cursor-pointer transition-colors min-h-[60px]',
        value ? 'bg-slate-50 hover:bg-slate-100' : 'bg-slate-50 hover:bg-blue-50 border-2 border-dashed border-slate-200'
      )}
    >
      {value ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-sm text-slate-400 italic">{placeholder}</p>
      )}
    </div>
  );
}

// Collapsible section for shipping & instructions
function CollapsibleInstructions({
  job,
  formatFullDate,
}: {
  job: BrokerJob;
  formatFullDate: (dateStr?: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Build full address
  const fullAddress = [
    job.vendorShipToAddress,
    job.vendorShipToCity && job.vendorShipToState
      ? `${job.vendorShipToCity}, ${job.vendorShipToState} ${job.vendorShipToZip || ''}`
      : null,
  ].filter(Boolean).join('\n');

  return (
    <div className="border-b border-zinc-100">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-3 bg-amber-50 hover:bg-amber-100 transition-colors"
      >
        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          Shipping & Instructions
        </span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-amber-600" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-600" />
        )}
      </button>
      {isOpen && (
        <div className="px-5 py-4 space-y-4 bg-amber-50/50">
          {/* Ship To Address */}
          {(job.vendorShipToName || fullAddress) && (
            <div className="bg-white border border-amber-200 rounded-lg p-3">
              <h5 className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-2">Ship To</h5>
              {job.vendorShipToName && (
                <p className="text-sm font-semibold text-slate-800">{job.vendorShipToName}</p>
              )}
              {fullAddress && (
                <p className="text-sm text-slate-600 whitespace-pre-line">{fullAddress}</p>
              )}
              {job.vendorShipToPhone && (
                <p className="text-xs text-slate-500 mt-1">Tel: {job.vendorShipToPhone}</p>
              )}
            </div>
          )}

          {/* Ship Via */}
          {job.specs?.shipVia && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Ship Via:</span>
              <span className="text-sm font-medium text-slate-700">{job.specs.shipVia}</span>
            </div>
          )}

          {/* Instructions Blocks */}
          {job.vendorSpecialInstructions && (
            <InstructionBlock label="Vendor Instructions" value={job.vendorSpecialInstructions} />
          )}
          {job.specs?.specialInstructions && (
            <InstructionBlock label="Special Instructions" value={job.specs.specialInstructions} />
          )}
          {job.specs?.artworkInstructions && (
            <InstructionBlock label="Artwork Instructions" value={job.specs.artworkInstructions} />
          )}
          {job.specs?.packingInstructions && (
            <InstructionBlock label="Packing Instructions" value={job.specs.packingInstructions} />
          )}
          {job.specs?.labelingInstructions && (
            <InstructionBlock label="Labeling Instructions" value={job.specs.labelingInstructions} />
          )}
          {job.packingSlipNotes && (
            <InstructionBlock label="Packing Slip Notes" value={job.packingSlipNotes} />
          )}
        </div>
      )}
    </div>
  );
}

// Instruction block component
function InstructionBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-amber-100 border border-amber-300 rounded-lg p-3">
      <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-amber-900 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

// Payment Status Section Component
function PaymentStatusSection({
  job,
  formatFullDate,
}: {
  job: BrokerJob;
  formatFullDate: (dateStr?: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Only show if there's any payment data
  const hasPaymentData = job.customerPaymentDate || job.vendorPaymentDate ||
    job.bradfordPaymentDate || job.jdInvoiceEmailedAt;

  if (!hasPaymentData && !job.pathway) return null;

  return (
    <div className="border-b border-zinc-100">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <CreditCard className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Payment Status</span>
        </div>
        {/* Quick status indicators */}
        <div className="flex items-center gap-1">
          {job.customerPaymentDate && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Customer Paid" />
          )}
          {job.vendorPaymentDate && (
            <span className="w-2 h-2 rounded-full bg-blue-500" title="Vendor Paid" />
          )}
          {job.pathway === 'P1' && job.bradfordPaymentDate && (
            <span className="w-2 h-2 rounded-full bg-purple-500" title="Bradford Paid" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="px-5 pb-4 pt-2">
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            {/* Customer Paid */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Customer Paid</span>
              {job.customerPaymentDate ? (
                <span className="text-xs font-semibold text-emerald-600">
                  {formatFullDate(job.customerPaymentDate)}
                  {job.customerPaymentAmount && ` • ${formatCurrency(job.customerPaymentAmount)}`}
                </span>
              ) : (
                <span className="text-xs text-slate-400">Not yet</span>
              )}
            </div>

            {/* Vendor Paid */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Vendor Paid</span>
              {job.vendorPaymentDate ? (
                <span className="text-xs font-semibold text-blue-600">
                  {formatFullDate(job.vendorPaymentDate)}
                  {job.vendorPaymentAmount && ` • ${formatCurrency(job.vendorPaymentAmount)}`}
                </span>
              ) : (
                <span className="text-xs text-slate-400">Not yet</span>
              )}
            </div>

            {/* Bradford Paid (P1 only) */}
            {job.pathway === 'P1' && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Bradford Paid</span>
                {job.bradfordPaymentDate ? (
                  <span className="text-xs font-semibold text-purple-600">
                    {formatFullDate(job.bradfordPaymentDate)}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">Not yet</span>
                )}
              </div>
            )}

            {/* JD Invoice */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">JD Invoice</span>
              {job.jdInvoiceEmailedAt ? (
                <span className="text-xs font-semibold text-indigo-600">
                  Sent {formatFullDate(job.jdInvoiceEmailedAt)}
                  {job.jdInvoiceEmailedTo && (
                    <span className="text-slate-400 font-normal"> to {job.jdInvoiceEmailedTo}</span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-slate-400">Not sent</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function JobDrawer({
  job,
  isOpen,
  onClose,
  onEdit,
  onRefresh,
}: JobDrawerProps) {
  const [financialsExpanded, setFinancialsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [messagesExpanded, setMessagesExpanded] = useState(false);
  const [messages, setMessages] = useState<Communication[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [artworkUrl, setArtworkUrl] = useState('');
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [docsMenuOpen, setDocsMenuOpen] = useState(false);

  // Close drawer on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Sync artwork URL when job changes
  useEffect(() => {
    if (job?.specs?.artworkUrl) {
      setArtworkUrl(job.specs.artworkUrl);
    } else {
      setArtworkUrl('');
    }
  }, [job?.id, job?.specs?.artworkUrl]);

  // Fetch messages when drawer opens
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

  if (!job) return null;

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
  const hasTracking = !!job.portal?.trackingNumber || !!job.trackingOverride;
  const trackingNumber = job.trackingOverride || job.portal?.trackingNumber;
  const trackingCarrier = job.trackingCarrierOverride || job.portal?.trackingCarrier;

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

  // Inline update handler
  const handleInlineUpdate = async (field: string, value: string) => {
    try {
      const updateData: Record<string, any> = {};
      if (field === 'dueDate') {
        updateData.dueDate = value ? new Date(value).toISOString() : null;
      } else if (field === 'customerPONumber') {
        updateData.customerPONumber = value || null;
      } else if (field === 'notes') {
        updateData.notes = value || null;
      } else if (field === 'status') {
        updateData.status = value;
      }

      await jobsApi.update(job.id, updateData);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to update:', error);
      throw error;
    }
  };

  // Workflow status change handler
  const handleWorkflowStatusChange = async (newStatus: string): Promise<void> => {
    try {
      await jobsApi.updateWorkflowStatus(job.id, newStatus);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to update workflow status:', error);
      throw error;
    }
  };

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
    if (!artworkUrl.trim() && !job.specs?.artworkUrl) return;

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
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 transition-opacity duration-300',
          isOpen ? 'bg-black/20' : 'bg-transparent pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full z-50',
          'w-[520px] max-w-[calc(100vw-60px)]',
          'bg-white shadow-2xl border-l border-zinc-200',
          'transform transition-transform duration-300 ease-out',
          'flex flex-col',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* ═══════════════════════════════════════════════════════════════
            HEADER - Job # and Customer PO most prominent
        ═══════════════════════════════════════════════════════════════ */}
        <div className="bg-slate-900 text-white px-5 py-4 flex-shrink-0">
          {/* Row 1: Job # (HUGE) + Due Date + Close */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <span className="job-number-lg text-white">
                {jobNumber}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Due Date Badge */}
              {job.dueDate && (
                <div className={cn(
                  'px-3 py-2 rounded-lg text-center min-w-[85px]',
                  getDueDateColor(daysUntil)
                )}>
                  <div className="text-[9px] uppercase tracking-wider opacity-80">Due</div>
                  <div className="text-lg font-bold leading-tight">{formatDate(job.dueDate)}</div>
                  {daysUntil !== null && (
                    <div className="text-[10px] font-medium opacity-90">
                      {daysUntil === 0 ? 'TODAY' :
                       daysUntil === 1 ? 'Tomorrow' :
                       daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` :
                       `${daysUntil}d`}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Row 2: Customer PO (second most prominent) */}
          {job.customerPONumber && (
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Customer PO</span>
              <span className="font-mono text-xl font-bold text-white tracking-wide">
                {job.customerPONumber}
              </span>
            </div>
          )}

          {/* Row 3: Title + Quick info */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-200 text-sm truncate max-w-[300px]" title={job.title}>
              {job.title || 'Untitled Job'}
            </span>
            {job.customer?.name && (
              <span className="px-2 py-0.5 bg-white/10 text-xs font-medium rounded text-slate-300">
                {job.customer.name}
              </span>
            )}
            {job.vendor?.name && (
              <span className="px-2 py-0.5 bg-amber-500/30 text-xs font-medium rounded text-amber-200">
                <Truck className="w-3 h-3 inline mr-1" />
                {job.vendor.name}
              </span>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            BODY - Scrollable content
        ═══════════════════════════════════════════════════════════════ */}
        <div className="flex-1 overflow-y-auto">

          {/* PRODUCTION INFO BADGES - Pathway, Paper Source, Bradford Ref */}
          {(job.pathway || job.paperSource || job.partnerPONumber) && (
            <div className="px-5 py-3 border-b border-zinc-100 bg-slate-100 flex flex-wrap gap-2">
              {job.pathway && (
                <span className={cn(
                  'px-2.5 py-1 text-xs font-bold rounded',
                  job.pathway === 'P1' ? 'bg-blue-600 text-white' :
                  job.pathway === 'P2' ? 'bg-emerald-600 text-white' :
                  'bg-amber-600 text-white'
                )}>
                  {job.pathway}
                </span>
              )}
              {job.paperSource && (
                <span className="px-2.5 py-1 text-xs font-medium bg-slate-200 text-slate-700 rounded">
                  Paper: {job.paperSource}
                </span>
              )}
              {job.partnerPONumber && (
                <span className="px-2.5 py-1 text-xs font-mono bg-slate-200 text-slate-700 rounded">
                  Bradford: {job.partnerPONumber}
                </span>
              )}
              {job.matchType && (
                <span className="px-2.5 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                  {job.matchType} Match
                </span>
              )}
              {job.mailFormat && (
                <span className="px-2.5 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">
                  {job.mailFormat.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          )}

          {/* SPECS GRID - Quick scannable info */}
          <div className="px-5 py-4 border-b border-zinc-100 bg-slate-50">
            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
              {/* Row 1: Basic specs */}
              {job.quantity && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Qty</span>
                  <span className="text-sm font-semibold text-slate-800">{job.quantity.toLocaleString()}</span>
                </div>
              )}
              {job.sizeName && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Size</span>
                  <span className="text-sm font-semibold text-slate-800">{job.sizeName}</span>
                </div>
              )}
              {job.specs?.productType && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Product</span>
                  <span className="text-sm font-medium text-slate-700">{job.specs.productType}</span>
                </div>
              )}
              {job.specs?.paperType && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Paper</span>
                  <span className="text-sm font-medium text-slate-700">{job.specs.paperType}</span>
                </div>
              )}
              {job.specs?.colors && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Colors</span>
                  <span className="text-sm font-medium text-slate-700">{job.specs.colors}</span>
                </div>
              )}
              {job.specs?.printSides && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Sides</span>
                  <span className="text-sm font-medium text-slate-700">{job.specs.printSides}</span>
                </div>
              )}
              {job.specs?.coating && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Coating</span>
                  <span className="text-sm font-medium text-slate-700">{job.specs.coating}</span>
                </div>
              )}
              {job.specs?.finishing && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Finishing</span>
                  <span className="text-sm font-medium text-slate-700">{job.specs.finishing}</span>
                </div>
              )}
              {job.specs?.bleed && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Bleed</span>
                  <span className="text-sm font-medium text-slate-700">{job.specs.bleed}</span>
                </div>
              )}
            </div>

            {/* Print Production Details - Only if any exist */}
            {(job.specs?.folds || job.specs?.perforations || job.specs?.dieCut || job.specs?.proofType || job.specs?.bindingStyle) && (
              <>
                <div className="border-t border-slate-200 my-3" />
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Print Production</h4>
                <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                  {job.specs?.folds && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Folds</span>
                      <span className="text-sm font-medium text-slate-700">{job.specs.folds}</span>
                    </div>
                  )}
                  {job.specs?.perforations && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Perforations</span>
                      <span className="text-sm font-medium text-slate-700">{job.specs.perforations}</span>
                    </div>
                  )}
                  {job.specs?.dieCut && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Die Cut</span>
                      <span className="text-sm font-medium text-slate-700">{job.specs.dieCut}</span>
                    </div>
                  )}
                  {job.specs?.bindingStyle && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Binding</span>
                      <span className="text-sm font-medium text-slate-700">{job.specs.bindingStyle}</span>
                    </div>
                  )}
                  {job.specs?.proofType && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Proof Type</span>
                      <span className="text-sm font-medium text-slate-700">{job.specs.proofType}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Booklet Specs - Only for booklet jobs */}
            {(job.specs?.coverType || job.specs?.coverPaperType || job.specs?.pageCount) && (
              <>
                <div className="border-t border-slate-200 my-3" />
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Booklet Details</h4>
                <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                  {job.specs?.coverType && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Cover Type</span>
                      <span className="text-sm font-semibold text-slate-800">
                        {job.specs.coverType === 'SELF' ? 'Self Cover' : 'Plus Cover'}
                      </span>
                    </div>
                  )}
                  {job.specs?.coverPaperType && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Cover Paper</span>
                      <span className="text-sm font-medium text-slate-700">{job.specs.coverPaperType}</span>
                    </div>
                  )}
                  {job.specs?.pageCount && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Pages</span>
                      <span className="text-sm font-semibold text-slate-800">{job.specs.pageCount}pp</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Mailing Details - Only for mailing jobs */}
            {(job.mailFormat || job.hasVersions || job.specs?.versions || job.specs?.components) && (
              <>
                <div className="border-t border-slate-200 my-3" />
                <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  Mailing Details
                </h4>
                <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                  {job.specs?.versions && (
                    <div className="col-span-3">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Versions</span>
                      <span className="text-sm font-medium text-slate-700">
                        {Array.isArray(job.specs.versions)
                          ? job.specs.versions.map(v => `${v.name}: ${v.quantity?.toLocaleString() || '—'}`).join(', ')
                          : job.specs.versions}
                      </span>
                    </div>
                  )}
                  {job.specs?.components && (
                    <div className="col-span-3">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Components</span>
                      <span className="text-sm font-medium text-slate-700">
                        {Array.isArray(job.specs.components)
                          ? job.specs.components.join(', ')
                          : job.specs.components}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* SHIPPING & INSTRUCTIONS - Collapsible */}
          {(job.vendorShipToName || job.vendorShipToAddress || job.vendorSpecialInstructions ||
            job.specs?.specialInstructions || job.specs?.artworkInstructions ||
            job.specs?.packingInstructions || job.specs?.labelingInstructions || job.packingSlipNotes) && (
            <CollapsibleInstructions
              job={job}
              formatFullDate={formatFullDate}
            />
          )}

          {/* SHIPPING INFO */}
          {(job.mailDate || job.inHomesDate || trackingNumber) && (
            <div className="px-5 py-4 border-b border-zinc-100 bg-blue-50">
              <h3 className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                Shipping
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {job.mailDate && (
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-blue-500 block">Mail Date</span>
                    <span className="text-sm font-semibold text-blue-800">{formatFullDate(job.mailDate)}</span>
                  </div>
                )}
                {job.inHomesDate && (
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-blue-500 block">In-Homes</span>
                    <span className="text-sm font-semibold text-blue-800">{formatFullDate(job.inHomesDate)}</span>
                  </div>
                )}
                {trackingNumber && (
                  <div className="col-span-3">
                    <span className="text-[10px] uppercase tracking-wider text-blue-500 block">Tracking</span>
                    <span className="text-sm font-mono text-blue-800">
                      {trackingNumber}
                      {trackingCarrier && <span className="text-blue-600 ml-2">({trackingCarrier})</span>}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* EDITABLE FIELDS */}
          <div className="px-5 py-4 border-b border-zinc-100 space-y-4">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
              Quick Edit
            </h3>

            {/* Due Date - Inline Editable */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                Due Date
              </span>
              <InlineEditableCell
                value={job.dueDate}
                onSave={(v) => handleInlineUpdate('dueDate', v)}
                type="date"
                emptyText="Set due date"
                className="text-sm font-semibold"
              />
            </div>

            {/* Customer PO - Inline Editable */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Customer PO #</span>
              <InlineEditableCell
                value={job.customerPONumber}
                onSave={(v) => handleInlineUpdate('customerPONumber', v)}
                placeholder="Enter PO #"
                emptyText="Add PO #"
                className="text-sm font-mono"
              />
            </div>

            {/* Notes - Textarea */}
            <div>
              <span className="text-sm font-medium text-slate-600 block mb-2">Notes</span>
              <InlineEditableTextarea
                value={job.notes}
                onSave={(v) => handleInlineUpdate('notes', v)}
                placeholder="Click to add notes..."
                rows={3}
              />
            </div>
          </div>

          {/* FILES PANEL */}
          <div className="px-5 py-4 border-b border-zinc-100">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">
              Production Files
            </h3>
            <div className="grid grid-cols-4 gap-3">
              {/* Artwork */}
              <div className={cn(
                'flex flex-col items-center p-3 rounded-xl border-2 transition-all',
                fileCounts.artwork > 0
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-200 bg-white border-dashed'
              )}>
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center mb-1.5',
                  fileCounts.artwork > 0 ? 'bg-emerald-500' : 'bg-slate-200'
                )}>
                  {fileCounts.artwork > 0 ? (
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  ) : (
                    <Image className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-700">Artwork</span>
                <span className={cn(
                  'text-[10px] font-medium',
                  fileCounts.artwork > 0 ? 'text-emerald-600' : 'text-slate-400'
                )}>
                  {fileCounts.artwork > 0 ? `${fileCounts.artwork} files` : 'None'}
                </span>
                <label className="mt-2 cursor-pointer">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.tiff,.ai,.eps,.psd"
                    className="hidden"
                    onChange={(e) => handleFileUpload('ARTWORK', e)}
                    disabled={isUploading}
                  />
                  <span className="text-[10px] text-blue-600 hover:underline font-medium">
                    + Upload
                  </span>
                </label>
              </div>

              {/* Data */}
              <div className={cn(
                'flex flex-col items-center p-3 rounded-xl border-2 transition-all',
                (fileCounts.data > 0 || dataNA)
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-200 bg-white border-dashed'
              )}>
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center mb-1.5',
                  (fileCounts.data > 0 || dataNA) ? 'bg-emerald-500' : 'bg-slate-200'
                )}>
                  {(fileCounts.data > 0 || dataNA) ? (
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  ) : (
                    <Database className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-700">Data</span>
                <span className={cn(
                  'text-[10px] font-medium',
                  (fileCounts.data > 0 || dataNA) ? 'text-emerald-600' : 'text-slate-400'
                )}>
                  {dataNA ? 'N/A' : fileCounts.data > 0 ? `${fileCounts.data} files` : 'None'}
                </span>
                {!dataNA && (
                  <label className="mt-2 cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept=".csv,.xlsx,.xls,.txt"
                      className="hidden"
                      onChange={(e) => handleFileUpload('DATA_FILE', e)}
                      disabled={isUploading}
                    />
                    <span className="text-[10px] text-blue-600 hover:underline font-medium">
                      + Upload
                    </span>
                  </label>
                )}
              </div>

              {/* Proofs */}
              <div className={cn(
                'flex flex-col items-center p-3 rounded-xl border-2 transition-all',
                fileCounts.proofs > 0
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-200 bg-white border-dashed'
              )}>
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center mb-1.5',
                  fileCounts.proofs > 0 ? 'bg-emerald-500' : 'bg-slate-200'
                )}>
                  {fileCounts.proofs > 0 ? (
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  ) : (
                    <FileText className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-700">Proofs</span>
                <span className={cn(
                  'text-[10px] font-medium',
                  fileCounts.proofs > 0 ? 'text-emerald-600' : 'text-slate-400'
                )}>
                  {fileCounts.proofs > 0 ? `${fileCounts.proofs} files` : 'None'}
                </span>
              </div>

              {/* PO */}
              <div className={cn(
                'flex flex-col items-center p-3 rounded-xl border-2 transition-all',
                poSent
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-200 bg-white border-dashed'
              )}>
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center mb-1.5',
                  poSent ? 'bg-emerald-500' : 'bg-slate-200'
                )}>
                  {poSent ? (
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  ) : (
                    <Send className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <span className="text-xs font-semibold text-slate-700">PO</span>
                <span className={cn(
                  'text-[10px] font-medium',
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
                <span className="text-xs font-medium text-amber-800">
                  Missing: {missing.join(', ')}
                </span>
              </div>
            )}

            {/* Artwork URL */}
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Link2 className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] font-semibold text-blue-700 uppercase">Artwork Link</span>
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
                    {isSavingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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

          {/* Status Strip */}
          <div className="px-5 py-4 border-b border-zinc-100">
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
          </div>

          {/* Workflow Status Dropdown */}
          <div className="px-5 py-4 border-b border-zinc-100">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Workflow Stage</span>
              <WorkflowStatusDropdown
                status={job.workflowStatus || 'NEW_JOB'}
                onStatusChange={handleWorkflowStatusChange}
              />
            </div>
          </div>

          {/* Vendor Status */}
          {job.portal?.vendorStatus && job.portal.vendorStatus !== 'PENDING' && (
            <div className="px-5 py-4 border-b border-zinc-100">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-blue-800">
                    Vendor: {job.portal.vendorStatus.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Messages Panel */}
          <div className="border-b border-zinc-100">
            <button
              onClick={() => setMessagesExpanded(!messagesExpanded)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                {messagesExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
                <MessageSquare className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Messages</span>
                {messages.length > 0 && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                    {messages.length}
                  </span>
                )}
              </div>
              {loadingMessages && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
            </button>

            {messagesExpanded && (
              <div className="border-t border-slate-100">
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
                  <div className="max-h-[250px] overflow-y-auto divide-y divide-slate-100">
                    {messages.slice().reverse().slice(0, 5).map((msg) => {
                      const isCustomer = msg.party === 'CUSTOMER';
                      const isInbound = msg.direction === 'INBOUND';
                      const timeAgo = formatTimeAgo(new Date(msg.createdAt));

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            'px-5 py-3',
                            isCustomer ? 'bg-blue-50/50' : 'bg-amber-50/50'
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className={cn(
                              'w-5 h-5 rounded-full flex items-center justify-center',
                              isCustomer ? 'bg-blue-500' : 'bg-amber-500'
                            )}>
                              {isCustomer ? (
                                <User className="w-3 h-3 text-white" />
                              ) : (
                                <Building2 className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <span className={cn(
                              'text-xs font-semibold',
                              isCustomer ? 'text-blue-700' : 'text-amber-700'
                            )}>
                              {isInbound ? (msg.fromName || msg.fromEmail) : 'You'}
                            </span>
                            <span className="text-xs text-slate-400 ml-auto">{timeAgo}</span>
                          </div>
                          <div className="ml-7">
                            <p className="text-sm font-medium text-slate-800 truncate">{msg.subject}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reply buttons */}
                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors">
                    <Reply className="w-3.5 h-3.5" />
                    Customer
                  </button>
                  {job.vendor && (
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors">
                      <Reply className="w-3.5 h-3.5" />
                      Vendor
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Payment Status */}
          <PaymentStatusSection job={job} formatFullDate={formatFullDate} />

          {/* Financials */}
          <div>
            <button
              onClick={() => setFinancialsExpanded(!financialsExpanded)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                {financialsExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
                <DollarSign className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Financials</span>
              </div>
              <span className="text-sm text-slate-600 font-mono">
                {formatCurrency(spread)} ({marginPercent.toFixed(0)}%)
              </span>
            </button>

            {financialsExpanded && (
              <div className="px-5 pb-4">
                <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Sell</div>
                    <div className="text-lg font-bold text-slate-900">{formatCurrency(sellPrice)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Cost</div>
                    <div className="text-lg font-bold text-slate-600">{formatCurrency(totalCost)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Spread</div>
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
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            FOOTER - Action buttons
        ═══════════════════════════════════════════════════════════════ */}
        <div className="border-t border-zinc-200 px-5 py-3 bg-slate-50 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit Job
            </button>

            <div className="flex items-center gap-2">
              {/* Docs Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setDocsMenuOpen(!docsMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  Docs
                  <ChevronDown className="w-3 h-3" />
                </button>
                {docsMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setDocsMenuOpen(false)}
                    />
                    <div className="absolute bottom-full right-0 mb-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                      <button
                        onClick={() => { pdfApi.generateQuote(job.id); setDocsMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                      >
                        <FileText className="w-4 h-4" />
                        Download Quote
                      </button>
                      <button
                        onClick={() => { pdfApi.generateVendorPO(job.id); setDocsMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                      >
                        <FileDown className="w-4 h-4" />
                        Download Vendor PO
                      </button>
                      <button
                        onClick={() => { pdfApi.generateInvoice(job.id); setDocsMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                      >
                        <Receipt className="w-4 h-4" />
                        Download Invoice
                      </button>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={() => { setDocsMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                      >
                        <Mail className="w-4 h-4" />
                        Email Invoice
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Primary CTA - changes based on workflow */}
              {!poSent && (
                <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors">
                  <Send className="w-4 h-4" />
                  Send PO
                </button>
              )}
              {poSent && !hasProof && (
                <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                  <FileText className="w-4 h-4" />
                  Request Proof
                </button>
              )}
              {hasProof && !proofApproved && (
                <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors">
                  <CheckCircle2 className="w-4 h-4" />
                  Approve
                </button>
              )}
              {proofApproved && !hasTracking && (
                <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors">
                  <Truck className="w-4 h-4" />
                  Check Shipping
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default JobDrawer;
