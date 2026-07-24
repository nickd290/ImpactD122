import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Upload, Sparkles, RefreshCw, DollarSign, CheckCircle2,
  Banknote, FileWarning, ChevronRight,
} from 'lucide-react';
import { Button } from './ui';
import { JobDetailModal } from './JobDetailModal';
import { InlineEditableCell } from './InlineEditableCell';
import { pdfApi, dashboardApi, bradfordApi } from '../lib/api';
import { cn } from '../lib/utils';

type AppView = 'DASHBOARD' | 'ACTION_ITEMS' | 'JOBS' | 'JOB_BOARD' | 'PRODUCTION_BOARD' | 'CUSTOMERS' | 'VENDORS' | 'FINANCIALS' | 'PARTNER_STATS' | 'PAPER_INVENTORY' | 'ACCOUNTING' | 'COMMUNICATIONS' | 'VENDOR_RFQS';

interface MoneyJob {
  id: string;
  jobNo?: string;
  number?: string;
  title?: string;
  status?: string;
  sellPrice?: number;
  deliveryDate?: string;
  invoiceEmailedAt?: string;
  invoiceGeneratedAt?: string;
  customerInvoiceNumber?: string;
  customerPONumber?: string;
  partnerPONumber?: string;
  paperSource?: string;
  customerPaymentDate?: string;
  customerPaymentAmount?: number;
  payee?: 'BGE' | 'JD';
  Company?: { id: string; name: string };
  customer?: { id: string; name: string };
}

interface MoneyBucket {
  count: number;
  dollars: number;
  jobs: MoneyJob[];
}

interface MoneySnapshot {
  unpaidInvoices: MoneyBucket;
  recentlyPaid: MoneyBucket;
  needsProductionPay: MoneyBucket;
  missingBgePO: MoneyBucket;
  inProductionCount: number;
}

interface DashboardViewProps {
  jobs: MoneyJob[];
  onCreateJob: () => void;
  onShowSpecParser: () => void;
  onShowPOUploader: () => void;
  onViewAllJobs: () => void;
  onSelectJob?: (job: MoneyJob) => void;
  onEditJob?: (job: MoneyJob) => void;
  onRefresh?: () => void;
  onViewChange?: (view: AppView) => void;
  pendingEmailsCount?: number;
  unpaidInvoicesTotal?: number;
}

const EMPTY_BUCKET: MoneyBucket = { count: 0, dollars: 0, jobs: [] };

function jobLabel(job: MoneyJob) {
  return job.jobNo || job.number || '—';
}

function customerName(job: MoneyJob) {
  return job.Company?.name || job.customer?.name || 'No customer';
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

export function DashboardView({
  jobs: propJobs,
  onCreateJob,
  onShowSpecParser,
  onShowPOUploader,
  onViewAllJobs,
  onSelectJob,
  onEditJob,
  onRefresh,
}: DashboardViewProps) {
  const [money, setMoney] = useState<MoneySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<MoneyJob | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await dashboardApi.getMoney();
      if (res?.data) {
        setMoney(res.data as MoneySnapshot);
      } else {
        throw new Error(res?.error || 'No dashboard data returned');
      }
    } catch (err: any) {
      console.error('Dashboard load failed:', err);
      setLoadError(err?.message || 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = async () => {
    await loadDashboard();
    onRefresh?.();
  };

  const handleJobClick = (job: MoneyJob) => {
    const full = propJobs?.find((j) => j.id === job.id) || job;
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

  /** Save a BGE PO inline, then drop the row from the missing-PO card */
  const handleSaveBgePO = async (jobId: string, poNumber: string) => {
    await bradfordApi.updatePO(jobId, poNumber);
    if (!poNumber.trim()) return;
    setMoney((prev) =>
      prev
        ? {
            ...prev,
            missingBgePO: {
              ...prev.missingBgePO,
              count: Math.max(0, prev.missingBgePO.count - 1),
              jobs: prev.missingBgePO.jobs.filter((j) => j.id !== jobId),
            },
          }
        : prev
    );
  };

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

  const unpaid = money?.unpaidInvoices || EMPTY_BUCKET;
  const recentlyPaid = money?.recentlyPaid || EMPTY_BUCKET;
  const payProduction = money?.needsProductionPay || EMPTY_BUCKET;
  const missingPO = money?.missingBgePO || EMPTY_BUCKET;

  return (
    <div className="max-w-6xl animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#2B3A4A] tracking-tight">Ops Dashboard</h1>
          <button
            type="button"
            onClick={onViewAllJobs}
            className="text-sm text-zinc-500 mt-0.5 hover:text-[#C0512A]"
          >
            {money?.inProductionCount ?? 0} jobs in production
          </button>
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
          Could not load dashboard: {loadError}
        </div>
      )}

      {/* Four money cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MoneyCard
          title="Unpaid invoices"
          subtitle="Invoiced — client hasn't paid us"
          icon={<DollarSign className="w-4 h-4" />}
          tone="rust"
          bucket={unpaid}
          empty="All invoices paid"
        >
          {unpaid.jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onClick={() => handleJobClick(job)}
              meta={
                job.customerInvoiceNumber
                  ? `Inv ${job.customerInvoiceNumber}`
                  : `Invoiced ${formatDate(job.invoiceGeneratedAt || job.invoiceEmailedAt) || '—'}`
              }
              amount={Number(job.sellPrice) || 0}
              amountClass="text-[#C0512A]"
            />
          ))}
        </MoneyCard>

        <MoneyCard
          title="Recently paid"
          subtitle="Client cash in — last 30 days"
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="emerald"
          bucket={recentlyPaid}
          empty="No payments in the last 30 days"
        >
          {recentlyPaid.jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onClick={() => handleJobClick(job)}
              meta={`Paid ${formatDate(job.customerPaymentDate) || '—'}`}
              amount={Number(job.customerPaymentAmount) || Number(job.sellPrice) || 0}
              amountClass="text-emerald-700"
            />
          ))}
        </MoneyCard>

        <MoneyCard
          title="Need to pay BGE or JD"
          subtitle="Client paid us — one production payee still owed"
          icon={<Banknote className="w-4 h-4" />}
          tone="orange"
          bucket={payProduction}
          empty="Nothing owed"
        >
          {payProduction.jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onClick={() => handleJobClick(job)}
              meta={`Paid ${formatDate(job.customerPaymentDate) || '—'}`}
              amount={Number(job.sellPrice) || 0}
              amountClass="text-orange-700"
              pill={job.payee}
            />
          ))}
        </MoneyCard>

        <MoneyCard
          title="Missing BGE PO"
          subtitle="Bradford paper — no BGE PO number on file"
          icon={<FileWarning className="w-4 h-4" />}
          tone="amber"
          bucket={missingPO}
          empty="All BGE POs on file"
          hideDollars
        >
          {missingPO.jobs.map((job) => (
            <li key={job.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-zinc-50">
              <button
                type="button"
                onClick={() => handleJobClick(job)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#2B3A4A] tabular-nums">
                    {jobLabel(job)}
                  </span>
                  <span className="text-sm text-zinc-700 truncate max-w-[220px]">
                    {job.title}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{customerName(job)}</p>
              </button>
              <div className="shrink-0 w-32" onClick={(e) => e.stopPropagation()}>
                <InlineEditableCell
                  value={job.partnerPONumber || ''}
                  onSave={(value) => handleSaveBgePO(job.id, value)}
                  placeholder="BGE PO #"
                  emptyText="+ Add BGE PO"
                  className="text-xs"
                />
              </div>
            </li>
          ))}
        </MoneyCard>
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

const TONES: Record<string, { header: string; icon: string; count: string }> = {
  rust: { header: 'border-[#C0512A]/25', icon: 'text-[#C0512A] bg-orange-50', count: 'text-[#C0512A]' },
  emerald: { header: 'border-emerald-200', icon: 'text-emerald-700 bg-emerald-50', count: 'text-emerald-700' },
  orange: { header: 'border-orange-200', icon: 'text-orange-700 bg-orange-50', count: 'text-orange-700' },
  amber: { header: 'border-amber-200', icon: 'text-amber-700 bg-amber-50', count: 'text-amber-700' },
};

function MoneyCard({
  title,
  subtitle,
  icon,
  tone,
  bucket,
  empty,
  hideDollars,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES | string;
  bucket: MoneyBucket;
  empty: string;
  hideDollars?: boolean;
  children: React.ReactNode;
}) {
  const t = TONES[tone] || TONES.rust;
  return (
    <div className={cn('bg-white border rounded-xl shadow-sm overflow-hidden', t.header)}>
      <div className="px-4 py-3 border-b border-zinc-100 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', t.icon)}>
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#2B3A4A]">{title}</h2>
            <p className="text-xs text-zinc-500 truncate">{subtitle}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-xl font-semibold tabular-nums leading-none', t.count)}>
            {bucket.count}
          </p>
          {!hideDollars && (
            <p className="text-xs text-zinc-500 tabular-nums mt-1">
              {formatCurrency(bucket.dollars)}
            </p>
          )}
        </div>
      </div>
      {bucket.count === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-100 max-h-[380px] overflow-y-auto">{children}</ul>
      )}
    </div>
  );
}

function JobRow({
  job,
  onClick,
  meta,
  amount,
  amountClass,
  pill,
}: {
  job: MoneyJob;
  onClick: () => void;
  meta?: string;
  amount: number;
  amountClass?: string;
  pill?: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-zinc-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#2B3A4A] tabular-nums">
              {jobLabel(job)}
            </span>
            <span className="text-sm text-zinc-700 truncate max-w-[220px]">{job.title}</span>
            {pill && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-100 text-orange-800">
                Pay {pill}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 truncate">
            {customerName(job)}
            {meta && ` · ${meta}`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {amount > 0 && (
            <span className={cn('text-sm font-medium tabular-nums', amountClass || 'text-zinc-700')}>
              {formatCurrency(amount)}
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-zinc-300" />
        </div>
      </button>
    </li>
  );
}
