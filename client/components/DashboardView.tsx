import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Upload, Sparkles, AlertCircle, Clock, FileText, FileX,
  Package, Receipt, DollarSign, Calendar, RefreshCw, ChevronRight,
  Flame, Truck, Inbox, Briefcase, LayoutGrid, ArrowRight,
} from 'lucide-react';
import { Button } from './ui';
import { JobDetailModal } from './JobDetailModal';
import { pdfApi, jobsApi, financialsApi, dashboardApi } from '../lib/api';
import { cn } from '../lib/utils';

type AppView = 'DASHBOARD' | 'ACTION_ITEMS' | 'JOBS' | 'JOB_BOARD' | 'PRODUCTION_BOARD' | 'CUSTOMERS' | 'VENDORS' | 'FINANCIALS' | 'PARTNER_STATS' | 'PAPER_INVENTORY' | 'ACCOUNTING' | 'COMMUNICATIONS' | 'VENDOR_RFQS';

interface Job {
  id: string;
  number?: string;
  jobNo?: string;
  title: string;
  status: string;
  workflowStatus?: string;
  workflowStatusOverride?: string;
  sellPrice?: number;
  dueDate?: string;
  deliveryDate?: string;
  mailDate?: string;
  customer?: { id: string; name: string };
  Company?: { id: string; name: string };
  vendor?: { name: string; isPartner?: boolean };
  Vendor?: { name: string };
  createdAt?: string;
  bradfordRefNumber?: string;
  customerPONumber?: string;
  quantity?: number;
  profit?: {
    sellPrice?: number;
    totalCost?: number;
    spread?: number;
    paperMarkup?: number;
    bradfordTotal?: number;
    impactTotal?: number;
  };
  customerPaymentDate?: string;
  customerPaymentAmount?: number;
  bradfordPaymentDate?: string;
  bradfordPaymentPaid?: boolean;
  jdPaymentDate?: string;
  jdPaymentPaid?: boolean;
  purchaseOrders?: any[];
  proofUrgency?: string;
  invoiceEmailedAt?: string;
}

interface WhatsNextData {
  hotProofs: Job[];
  awaitingApproval: Job[];
  missingFiles: Job[];
  materialsInTransit: Job[];
  poNotConfirmed: Job[];
  readyToInvoice: Job[];
  unpaidInvoices: Job[];
  dueThisWeek: Job[];
  summary: {
    urgent: number;
    needsAction: number;
    awaitingResponse: number;
    readyToBill: number;
    unpaid: number;
    dueThisWeek: number;
    totalActive: number;
  };
}

interface FinancialSummary {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageMargin: number;
  totalBradfordShare: number;
  totalImpactShare: number;
  totalPaperMarkup: number;
  activeRevenue: number;
  activeJobCount: number;
  unpaidCost: number;
  totalJobs: number;
}

interface DashboardViewProps {
  jobs: Job[];
  onCreateJob: () => void;
  onShowSpecParser: () => void;
  onShowPOUploader: () => void;
  onViewAllJobs: () => void;
  onSelectJob?: (job: Job) => void;
  onEditJob?: (job: Job) => void;
  onRefresh?: () => void;
  onViewChange?: (view: AppView) => void;
  pendingEmailsCount?: number;
  unpaidInvoicesTotal?: number;
}

type BucketKey =
  | 'hotProofs'
  | 'awaitingApproval'
  | 'missingFiles'
  | 'poNotConfirmed'
  | 'materialsInTransit'
  | 'readyToInvoice'
  | 'unpaidInvoices'
  | 'dueThisWeek';

const BUCKETS: {
  key: BucketKey;
  label: string;
  icon: React.ReactNode;
  accent: string;
  empty: string;
}[] = [
  { key: 'hotProofs', label: 'Hot proofs', icon: <Flame className="w-3.5 h-3.5" />, accent: 'text-red-600 bg-red-50 border-red-100', empty: 'No hot proofs' },
  { key: 'missingFiles', label: 'Missing files', icon: <FileX className="w-3.5 h-3.5" />, accent: 'text-amber-700 bg-amber-50 border-amber-100', empty: 'All files in' },
  { key: 'poNotConfirmed', label: 'PO not confirmed', icon: <Inbox className="w-3.5 h-3.5" />, accent: 'text-orange-700 bg-orange-50 border-orange-100', empty: 'All POs confirmed' },
  { key: 'awaitingApproval', label: 'Awaiting customer', icon: <Clock className="w-3.5 h-3.5" />, accent: 'text-blue-700 bg-blue-50 border-blue-100', empty: 'None waiting' },
  { key: 'materialsInTransit', label: 'Materials in transit', icon: <Truck className="w-3.5 h-3.5" />, accent: 'text-violet-700 bg-violet-50 border-violet-100', empty: 'None in transit' },
  { key: 'dueThisWeek', label: 'Due this week', icon: <Calendar className="w-3.5 h-3.5" />, accent: 'text-indigo-700 bg-indigo-50 border-indigo-100', empty: 'Nothing due this week' },
  { key: 'readyToInvoice', label: 'Ready to invoice', icon: <Receipt className="w-3.5 h-3.5" />, accent: 'text-emerald-700 bg-emerald-50 border-emerald-100', empty: 'Nothing to bill' },
  { key: 'unpaidInvoices', label: 'Unpaid invoices', icon: <DollarSign className="w-3.5 h-3.5" />, accent: 'text-[#C0512A] bg-orange-50 border-orange-100', empty: 'All paid' },
];

const WORKFLOW_LABELS: Record<string, string> = {
  NEW_JOB: 'New',
  SPECS_CONFIRMED: 'Specs',
  AWAITING_ARTWORK: 'Awaiting art',
  ARTWORK_RECEIVED: 'Art in',
  PROOF_REQUESTED: 'Proof req',
  PROOF_RECEIVED: 'Proof in',
  PROOF_SENT_TO_CUSTOMER: 'Proof sent',
  AWAITING_CUSTOMER_RESPONSE: 'Awaiting cust',
  PROOF_APPROVED: 'Approved',
  IN_PRODUCTION: 'Production',
  SHIPPED: 'Shipped',
  MAILED: 'Mailed',
  COMPLETED: 'Done',
  INVOICED: 'Invoiced',
};

function jobLabel(job: Job) {
  return job.number || job.jobNo || '—';
}

function customerName(job: Job) {
  return job.customer?.name || job.Company?.name || 'No customer';
}

function formatDate(date?: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatCompact(amount: number) {
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(amount >= 10_000 ? 0 : 1)}k`;
  return formatCurrency(amount);
}

export function DashboardView({
  jobs: propJobs,
  onCreateJob,
  onShowSpecParser,
  onShowPOUploader,
  onViewAllJobs,
  onSelectJob,
  onEditJob,
  onRefresh,
  onViewChange,
}: DashboardViewProps) {
  const [localJobs, setLocalJobs] = useState<Job[]>([]);
  const [whatsNext, setWhatsNext] = useState<WhatsNextData | null>(null);
  const [financials, setFinancials] = useState<FinancialSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<BucketKey | 'all'>('all');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);

      const [jobsRes, whatsRes, finRes] = await Promise.all([
        jobsApi.getAll().catch(() => ({ jobs: propJobs || [] })),
        dashboardApi.getWhatsNext().catch(() => null),
        financialsApi.getSummary().catch(() => null),
      ]);

      setLocalJobs(jobsRes?.jobs || propJobs || []);
      if (whatsRes?.data) {
        setWhatsNext(whatsRes.data);
      } else if (whatsRes && !whatsRes.error) {
        // handle unwrapped shape
        if (whatsRes.summary) setWhatsNext(whatsRes as WhatsNextData);
      }
      if (finRes) setFinancials(finRes);
    } catch (err: any) {
      console.error('Dashboard load failed:', err);
      setLoadError(err?.message || 'Failed to load dashboard');
      setLocalJobs(propJobs || []);
    } finally {
      setIsLoading(false);
    }
  }, [propJobs]);

  useEffect(() => {
    loadDashboard();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    await loadDashboard();
    onRefresh?.();
  };

  const jobs = localJobs.length ? localJobs : propJobs || [];

  const overdueJobs = useMemo(() => {
    const now = new Date();
    return jobs.filter((j) => {
      if (j.status !== 'ACTIVE') return false;
      const d = j.dueDate || j.deliveryDate || j.mailDate;
      return d && new Date(d) < now;
    });
  }, [jobs]);

  const pipelineByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs
      .filter((j) => j.status === 'ACTIVE')
      .forEach((j) => {
        const key = j.workflowStatusOverride || j.workflowStatus || 'NEW_JOB';
        counts[key] = (counts[key] || 0) + 1;
      });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [jobs]);

  const activeSellPipeline = useMemo(() => {
    return jobs
      .filter((j) => j.status === 'ACTIVE')
      .reduce((sum, j) => sum + (Number(j.sellPrice) || Number(j.profit?.sellPrice) || 0), 0);
  }, [jobs]);

  const unpaidArEstimate = useMemo(() => {
    if (whatsNext?.unpaidInvoices?.length) {
      return whatsNext.unpaidInvoices.reduce(
        (sum, j) => sum + (Number(j.sellPrice) || 0),
        0
      );
    }
    return 0;
  }, [whatsNext]);

  /**
   * Sheet rule (Job Overview): if client paid Impact, next is pay BGE and/or JD.
   */
  const vendorPayQueue = useMemo(() => {
    return jobs.filter((j) => {
      if (j.status === 'CANCELLED') return false;
      const clientPaid = !!(j.customerPaymentDate || j.status === 'PAID');
      if (!clientPaid) return false;
      const bgePaid = !!(j.bradfordPaymentDate || j.bradfordPaymentPaid);
      const jdPaid = !!(j.jdPaymentDate || j.jdPaymentPaid);
      return !bgePaid || !jdPaid;
    });
  }, [jobs]);

  const vendorPayDollars = useMemo(
    () =>
      vendorPayQueue.reduce(
        (sum, j) => sum + (Number(j.sellPrice) || Number(j.profit?.sellPrice) || 0),
        0
      ),
    [vendorPayQueue]
  );

  const handleJobClick = (job: Job) => {
    // Prefer full job from local list (has more fields)
    const full = jobs.find((j) => j.id === job.id) || job;
    setSelectedJob(full);
    setIsModalOpen(true);
    onSelectJob?.(full);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedJob(null);
  };

  const handleEdit = () => {
    if (selectedJob && onEditJob) {
      onEditJob(selectedJob);
      handleModalClose();
    }
  };

  const bucketJobs = (key: BucketKey): Job[] => {
    if (!whatsNext) return [];
    return whatsNext[key] || [];
  };

  const displayJobs: Job[] = useMemo(() => {
    if (activeBucket === 'all') {
      // Priority stack when viewing all: overdue → hot → missing → due → unpaid
      const map = new Map<string, { job: Job; reason: string; priority: number }>();
      overdueJobs.forEach((j) => map.set(j.id, { job: j, reason: 'OVERDUE', priority: 0 }));
      if (whatsNext) {
        whatsNext.hotProofs?.forEach((j) => {
          if (!map.has(j.id)) map.set(j.id, { job: j, reason: 'HOT', priority: 1 });
        });
        whatsNext.missingFiles?.forEach((j) => {
          if (!map.has(j.id)) map.set(j.id, { job: j, reason: 'FILES', priority: 2 });
        });
        whatsNext.dueThisWeek?.forEach((j) => {
          if (!map.has(j.id)) map.set(j.id, { job: j, reason: 'DUE', priority: 3 });
        });
        whatsNext.readyToInvoice?.forEach((j) => {
          if (!map.has(j.id)) map.set(j.id, { job: j, reason: 'BILL', priority: 4 });
        });
        whatsNext.unpaidInvoices?.forEach((j) => {
          if (!map.has(j.id)) map.set(j.id, { job: j, reason: 'UNPAID', priority: 5 });
        });
      }
      return Array.from(map.values())
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 12)
        .map((x) => ({ ...x.job, _reason: x.reason } as Job & { _reason?: string }));
    }
    return bucketJobs(activeBucket).slice(0, 20);
  }, [activeBucket, whatsNext, overdueJobs]);

  const summary = whatsNext?.summary;
  const totalActions =
    (summary?.urgent || 0) +
    (summary?.needsAction || 0) +
    (summary?.readyToBill || 0) +
    overdueJobs.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2B3A4A] mx-auto" />
          <p className="mt-4 text-zinc-500 text-sm">Loading ops dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#2B3A4A] tracking-tight">Ops Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {summary?.totalActive ?? jobs.filter((j) => j.status === 'ACTIVE').length} active
            {totalActions > 0 ? ` · ${totalActions} need attention` : ' · all clear'}
            {overdueJobs.length > 0 && (
              <span className="text-red-600 font-medium"> · {overdueJobs.length} overdue</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleRefresh} variant="outline" size="sm" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={onCreateJob} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Job
          </Button>
          <Button onClick={onShowPOUploader} variant="outline" size="sm">
            <Upload className="w-4 h-4 mr-1.5" />
            Upload PO
          </Button>
          <Button onClick={onShowSpecParser} variant="outline" size="sm">
            <Sparkles className="w-4 h-4 mr-1.5" />
            Parse Specs
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Partial load: {loadError}. Showing available data.
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile
          label="Active jobs"
          value={String(summary?.totalActive ?? financials?.activeJobCount ?? jobs.filter((j) => j.status === 'ACTIVE').length)}
          sub="in pipeline"
          onClick={onViewAllJobs}
        />
        <KpiTile
          label="Pipeline $"
          value={formatCompact(financials?.activeRevenue ?? activeSellPipeline)}
          sub="active sell"
          onClick={() => onViewChange?.('FINANCIALS')}
        />
        <KpiTile
          label="Impact share"
          value={formatCompact(financials?.totalImpactShare || 0)}
          sub="all-time margin"
          accent
          onClick={() => onViewChange?.('FINANCIALS')}
        />
        <KpiTile
          label="Unpaid AR"
          value={String(summary?.unpaid ?? 0)}
          sub={unpaidArEstimate > 0 ? formatCompact(unpaidArEstimate) : 'invoices open'}
          danger={(summary?.unpaid || 0) > 0}
          onClick={() => setActiveBucket('unpaidInvoices')}
        />
        <KpiTile
          label="Ready to bill"
          value={String(summary?.readyToBill ?? 0)}
          sub="completed / unbilled"
          onClick={() => setActiveBucket('readyToInvoice')}
        />
        <KpiTile
          label="Due this week"
          value={String(summary?.dueThisWeek ?? 0)}
          sub={overdueJobs.length ? `${overdueJobs.length} overdue` : 'on calendar'}
          danger={overdueJobs.length > 0}
          onClick={() => setActiveBucket('dueThisWeek')}
        />
        <KpiTile
          label="Pay BGE/JD"
          value={String(vendorPayQueue.length)}
          sub={vendorPayQueue.length ? formatCompact(vendorPayDollars) : 'client paid · vendor due'}
          danger={vendorPayQueue.length > 0}
          onClick={() => onViewChange?.('JOBS')}
        />
      </div>

      {/* Client paid → vendor pay queue (sheet rule) */}
      {vendorPayQueue.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <h2 className="text-sm font-semibold text-[#2B3A4A]">
                Client paid → pay BGE / JD
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {vendorPayQueue.length} jobs · customer money in · Bradford or JD still open
              </p>
            </div>
            <button
              type="button"
              onClick={() => onViewChange?.('JOBS')}
              className="text-xs font-semibold text-[#C0512A] hover:underline"
            >
              Open Jobs filter
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {vendorPayQueue.slice(0, 12).map((j) => {
              const bge = !!(j.bradfordPaymentDate || j.bradfordPaymentPaid);
              const jd = !!(j.jdPaymentDate || j.jdPaymentPaid);
              return (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => handleJobClick(j)}
                  className="text-xs font-medium px-2.5 py-1 rounded-md bg-white border border-orange-200 text-[#2B3A4A] hover:border-[#C0512A]"
                >
                  {jobLabel(j)}
                  <span className="text-zinc-400 ml-1">
                    {!bge ? 'BGE' : ''}
                    {!bge && !jd ? '+' : ''}
                    {!jd ? 'JD' : ''}
                  </span>
                </button>
              );
            })}
            {vendorPayQueue.length > 12 && (
              <span className="text-xs text-orange-700 self-center">
                +{vendorPayQueue.length - 12} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: action buckets + list */}
        <div className="xl:col-span-8 space-y-4">
          {/* Bucket chips */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveBucket('all')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                activeBucket === 'all'
                  ? 'bg-[#2B3A4A] text-white border-[#2B3A4A]'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
              )}
            >
              Needs attention
              <span className={cn(
                'tabular-nums px-1.5 py-0.5 rounded-full text-[10px]',
                activeBucket === 'all' ? 'bg-white/20' : 'bg-zinc-100'
              )}>
                {displayJobs.length}
              </span>
            </button>
            {BUCKETS.map((b) => {
              const count = bucketJobs(b.key).length;
              if (!whatsNext && count === 0) return null;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setActiveBucket(b.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    activeBucket === b.key
                      ? 'bg-[#2B3A4A] text-white border-[#2B3A4A]'
                      : count > 0
                        ? cn(b.accent, 'hover:opacity-90')
                        : 'bg-white text-zinc-400 border-zinc-100'
                  )}
                >
                  {b.icon}
                  {b.label}
                  <span className="tabular-nums font-semibold">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Job action list */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#2B3A4A]">
                {activeBucket === 'all'
                  ? 'Priority queue'
                  : BUCKETS.find((b) => b.key === activeBucket)?.label || 'Jobs'}
              </h2>
              <button
                type="button"
                onClick={onViewAllJobs}
                className="text-xs text-[#C0512A] font-medium hover:underline inline-flex items-center gap-1"
              >
                All jobs <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {displayJobs.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Package className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-emerald-700">
                  {activeBucket === 'all'
                    ? 'All caught up'
                    : BUCKETS.find((b) => b.key === activeBucket)?.empty || 'Nothing here'}
                </p>
                <p className="text-xs text-zinc-500 mt-1">No jobs in this bucket</p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {displayJobs.map((job) => {
                  const reason = (job as any)._reason as string | undefined;
                  const due = job.dueDate || job.deliveryDate || job.mailDate;
                  const sell = Number(job.sellPrice) || Number(job.profit?.sellPrice) || 0;
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        onClick={() => handleJobClick(job)}
                        className={cn(
                          'w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-zinc-50 transition-colors',
                          reason === 'OVERDUE' && 'bg-red-50/60 hover:bg-red-50'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-[#2B3A4A] tabular-nums">
                              {jobLabel(job)}
                            </span>
                            <span className="text-sm text-zinc-700 truncate max-w-[280px]">
                              {job.title}
                            </span>
                            {reason && <ReasonPill reason={reason} />}
                            {job.proofUrgency === 'HOT' || job.proofUrgency === 'CRITICAL' ? (
                              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-600 text-white">
                                {job.proofUrgency}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">
                            {customerName(job)}
                            {due && ` · Due ${formatDate(due)}`}
                            {job.workflowStatus && (
                              <span className="text-zinc-400">
                                {' · '}
                                {WORKFLOW_LABELS[job.workflowStatus] || job.workflowStatus}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {sell > 0 && (
                            <span className="text-sm font-medium text-emerald-700 tabular-nums">
                              {formatCurrency(sell)}
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-zinc-300" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Overdue callout */}
          {overdueJobs.length > 0 && activeBucket === 'all' && (
            <div className="rounded-xl border border-red-200 bg-red-50/80 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-semibold text-red-800">
                  {overdueJobs.length} overdue job{overdueJobs.length === 1 ? '' : 's'}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {overdueJobs.slice(0, 8).map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => handleJobClick(j)}
                    className="text-xs font-medium px-2.5 py-1 rounded-md bg-white border border-red-200 text-red-800 hover:bg-red-100"
                  >
                    {jobLabel(j)}
                  </button>
                ))}
                {overdueJobs.length > 8 && (
                  <span className="text-xs text-red-600 self-center">+{overdueJobs.length - 8} more</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right rail */}
        <div className="xl:col-span-4 space-y-4">
          {/* Cash / margin snapshot */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#2B3A4A]">Money snapshot</h2>
              <button
                type="button"
                onClick={() => onViewChange?.('FINANCIALS')}
                className="text-xs text-[#C0512A] font-medium hover:underline"
              >
                Financials
              </button>
            </div>
            {financials ? (
              <div className="space-y-3">
                <MoneyRow label="Total revenue" value={formatCurrency(financials.totalRevenue)} />
                <MoneyRow label="Total cost" value={formatCurrency(financials.totalCost)} muted />
                <MoneyRow
                  label="Gross profit"
                  value={formatCurrency(financials.totalProfit)}
                  strong
                />
                <div className="h-px bg-zinc-100" />
                <MoneyRow label="Impact share" value={formatCurrency(financials.totalImpactShare)} accent />
                <MoneyRow label="Bradford share" value={formatCurrency(financials.totalBradfordShare)} muted />
                <MoneyRow
                  label="Paper markup (18%)"
                  value={formatCurrency(financials.totalPaperMarkup)}
                  muted
                />
                <div className="h-px bg-zinc-100" />
                <MoneyRow
                  label="Active pipeline"
                  value={formatCurrency(financials.activeRevenue)}
                />
                <MoneyRow
                  label="Avg margin"
                  value={`${(financials.averageMargin || 0).toFixed(1)}%`}
                />
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Financials unavailable</p>
            )}
          </div>

          {/* Pipeline by status */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#2B3A4A]">Pipeline stages</h2>
              <button
                type="button"
                onClick={() => onViewChange?.('JOB_BOARD')}
                className="text-xs text-[#C0512A] font-medium hover:underline"
              >
                Kanban
              </button>
            </div>
            {pipelineByStatus.length === 0 ? (
              <p className="text-sm text-zinc-500">No active jobs</p>
            ) : (
              <div className="space-y-2">
                {pipelineByStatus.map(([status, count]) => {
                  const max = pipelineByStatus[0][1] || 1;
                  const pct = Math.max(8, Math.round((count / max) * 100));
                  return (
                    <div key={status} className="group">
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-zinc-600 truncate">
                          {WORKFLOW_LABELS[status] || status.replace(/_/g, ' ')}
                        </span>
                        <span className="tabular-nums font-semibold text-[#2B3A4A]">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#C0512A]/80 group-hover:bg-[#C0512A] transition-colors"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Jump links */}
          <div className="grid grid-cols-2 gap-2">
            <JumpCard
              icon={<Briefcase className="w-4 h-4" />}
              label="Jobs"
              onClick={onViewAllJobs}
            />
            <JumpCard
              icon={<LayoutGrid className="w-4 h-4" />}
              label="Kanban"
              onClick={() => onViewChange?.('JOB_BOARD')}
            />
            <JumpCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Financials"
              onClick={() => onViewChange?.('FINANCIALS')}
            />
            <JumpCard
              icon={<FileText className="w-4 h-4" />}
              label="Action items"
              onClick={() => onViewChange?.('ACTION_ITEMS')}
            />
          </div>
        </div>
      </div>

      <JobDetailModal
        job={selectedJob as any}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onEdit={handleEdit}
        onDownloadPO={() => selectedJob && pdfApi.generateVendorPO(selectedJob.id)}
        onDownloadInvoice={() => selectedJob && pdfApi.generateInvoice(selectedJob.id)}
        onDownloadQuote={() => selectedJob && pdfApi.generateQuote(selectedJob.id)}
        onRefresh={handleRefresh}
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  accent,
  danger,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left rounded-xl border bg-white p-3.5 shadow-sm transition-all',
        'hover:border-[#C0512A]/40 hover:shadow',
        danger && 'border-red-200 bg-red-50/40',
        accent && 'border-[#C0512A]/25'
      )}
    >
      <p className="text-[11px] uppercase tracking-wide font-medium text-zinc-500">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums mt-1 tracking-tight',
          danger ? 'text-red-700' : accent ? 'text-[#C0512A]' : 'text-[#2B3A4A]'
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{sub}</p>}
    </button>
  );
}

function MoneyRow({
  label,
  value,
  muted,
  strong,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={cn('text-zinc-500', strong && 'text-zinc-800 font-medium')}>{label}</span>
      <span
        className={cn(
          'tabular-nums font-medium',
          muted && 'text-zinc-500',
          strong && 'text-[#2B3A4A]',
          accent && 'text-[#C0512A]',
          !muted && !strong && !accent && 'text-zinc-800'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function JumpCard({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-[#2B3A4A] hover:border-[#C0512A]/40 hover:bg-zinc-50 transition-colors"
    >
      <span className="text-[#C0512A]">{icon}</span>
      {label}
    </button>
  );
}

function ReasonPill({ reason }: { reason: string }) {
  const map: Record<string, { label: string; className: string }> = {
    OVERDUE: { label: 'Overdue', className: 'bg-red-600 text-white' },
    HOT: { label: 'Hot proof', className: 'bg-red-100 text-red-700' },
    FILES: { label: 'Files', className: 'bg-amber-100 text-amber-800' },
    DUE: { label: 'Due soon', className: 'bg-indigo-100 text-indigo-700' },
    BILL: { label: 'Bill', className: 'bg-emerald-100 text-emerald-800' },
    UNPAID: { label: 'Unpaid', className: 'bg-orange-100 text-[#C0512A]' },
  };
  const cfg = map[reason] || { label: reason, className: 'bg-zinc-100 text-zinc-600' };
  return (
    <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded', cfg.className)}>
      {cfg.label}
    </span>
  );
}
