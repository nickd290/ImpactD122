import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Package,
  RefreshCw,
  FileText,
  Truck,
  CreditCard,
  Send,
  Eye,
  MessageSquare,
  Play,
  GripVertical,
  Filter,
  X,
  Check,
  XCircle,
  Minus,
  Image,
  Database
} from 'lucide-react';
import { cn } from '../lib/utils';
import { jobsApi } from '../lib/api';
import { getNextWorkflowStatuses } from './WorkflowStatusBadge';

// ============================================
// TYPES
// ============================================

interface QCIndicators {
  artwork: 'sent' | 'missing' | 'partial';
  artworkCount: number;
  data: 'sent' | 'missing' | 'na';
  dataCount: number;
  proofStatus: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | null;
  hasProof: boolean;
  hasTracking: boolean;
  trackingNumber: string | null;
}

interface PipelineJob {
  id: string;
  jobNo: string;
  title: string;
  workflowStatus: string;
  deliveryDate: string | null;
  mailDate: string | null;
  inHomesDate: string | null;
  createdAt: string;
  quantity: number;
  sizeName: string | null;
  sellPrice: number;
  spread: number;
  customerPONumber: string | null;
  customerName: string;
  customerId: string;
  vendorName: string;
  vendorId: string;
  hasPO: boolean;
  poNumber: string | null;
  poSentAt: string | null;
  vendorConfirmedAt: string | null;
  vendorStatus: string | null;
  qc: QCIndicators;
  activeTask: string | null;
}

interface PipelineStage {
  status: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  headerBg: string;
}

interface JobPipelineBoardProps {
  onSelectJob: (jobId: string) => void;
  onRefresh?: () => void;
}

// ============================================
// PIPELINE STAGE CONFIG
// ============================================

const PIPELINE_STAGES: PipelineStage[] = [
  {
    status: 'NEW_JOB',
    label: 'New Jobs',
    shortLabel: 'New',
    icon: <Package className="w-4 h-4" />,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    headerBg: 'bg-slate-100'
  },
  {
    status: 'AWAITING_PROOF_FROM_VENDOR',
    label: 'PO Sent',
    shortLabel: 'Awaiting Proof',
    icon: <Send className="w-4 h-4" />,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    headerBg: 'bg-slate-100'
  },
  {
    status: 'PROOF_RECEIVED',
    label: 'Proof Received',
    shortLabel: 'Proof In',
    icon: <FileText className="w-4 h-4" />,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    headerBg: 'bg-slate-100'
  },
  {
    status: 'PROOF_SENT_TO_CUSTOMER',
    label: 'With Customer',
    shortLabel: 'To Customer',
    icon: <Eye className="w-4 h-4" />,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    headerBg: 'bg-slate-100'
  },
  {
    status: 'AWAITING_CUSTOMER_RESPONSE',
    label: 'Awaiting Response',
    shortLabel: 'Waiting',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    headerBg: 'bg-slate-100'
  },
  {
    status: 'APPROVED_PENDING_VENDOR',
    label: 'Approved',
    shortLabel: 'Approved',
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    headerBg: 'bg-slate-100'
  },
  {
    status: 'IN_PRODUCTION',
    label: 'In Production',
    shortLabel: 'Printing',
    icon: <Play className="w-4 h-4" />,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    headerBg: 'bg-slate-100'
  },
  {
    status: 'COMPLETED',
    label: 'Shipped',
    shortLabel: 'Shipped',
    icon: <Truck className="w-4 h-4" />,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    headerBg: 'bg-slate-100'
  },
  {
    status: 'INVOICED',
    label: 'Invoiced',
    shortLabel: 'Invoiced',
    icon: <FileText className="w-4 h-4" />,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    headerBg: 'bg-slate-100'
  },
  {
    status: 'PAID',
    label: 'Paid',
    shortLabel: 'Paid',
    icon: <CreditCard className="w-4 h-4" />,
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    headerBg: 'bg-slate-100'
  },
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getDueStatus(dateString: string | null): {
  text: string;
  urgency: 'overdue' | 'urgent' | 'soon' | 'ok' | 'none';
  days: number | null;
} {
  if (!dateString) return { text: '', urgency: 'none', days: null };

  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)}d late`, urgency: 'overdue', days: diffDays };
  }
  if (diffDays === 0) {
    return { text: 'Today', urgency: 'urgent', days: 0 };
  }
  if (diffDays === 1) {
    return { text: 'Tomorrow', urgency: 'urgent', days: 1 };
  }
  if (diffDays <= 3) {
    return { text: `${diffDays}d`, urgency: 'soon', days: diffDays };
  }
  return { text: `${diffDays}d`, urgency: 'ok', days: diffDays };
}

function getCardUrgency(job: PipelineJob): 'red' | 'amber' | 'green' {
  const dueStatus = getDueStatus(job.deliveryDate || job.mailDate || job.inHomesDate);

  if (dueStatus.urgency === 'overdue' || dueStatus.urgency === 'urgent') {
    return 'red';
  }

  if (job.qc.artwork === 'missing' || job.qc.data === 'missing') {
    return 'amber';
  }

  if (dueStatus.urgency === 'soon') {
    return 'amber';
  }

  return 'green';
}

// ============================================
// JOB CARD COMPONENT
// ============================================

interface JobCardProps {
  job: PipelineJob;
  onClick: () => void;
  onAdvance: (nextStatus: string) => void;
  isUpdating: boolean;
}

function JobCard({ job, onClick, onAdvance, isUpdating }: JobCardProps) {
  const urgency = getCardUrgency(job);
  const dueStatus = getDueStatus(job.deliveryDate || job.mailDate || job.inHomesDate);
  const nextStatuses = getNextWorkflowStatuses(job.workflowStatus);

  const cardStyles = {
    red: 'bg-gradient-to-br from-red-50 via-red-50 to-red-100 border-red-300 hover:border-red-400 ring-red-200',
    amber: 'bg-gradient-to-br from-amber-50 via-amber-50 to-amber-100 border-amber-300 hover:border-amber-400 ring-amber-200',
    green: 'bg-white border-slate-200 hover:border-slate-300 ring-slate-200',
  };

  const handleAdvanceClick = (e: React.MouseEvent, status: string) => {
    e.stopPropagation();
    onAdvance(status);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative p-3 rounded-lg border-2 cursor-pointer transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5 active:translate-y-0',
        cardStyles[urgency],
        isUpdating && 'opacity-50 pointer-events-none animate-pulse',
        job.activeTask && 'ring-2 ring-amber-400 ring-offset-1'
      )}
    >
      {/* Header Row: CUSTOMER NAME (prominent) + Due Badge */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-sm font-bold text-slate-900 truncate flex-1" title={job.customerName}>
          {job.customerName || 'No Customer'}
        </div>
        {dueStatus.urgency !== 'none' && (
          <div className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums shrink-0',
            dueStatus.urgency === 'overdue' && 'bg-red-600 text-white',
            dueStatus.urgency === 'urgent' && 'bg-red-500 text-white',
            dueStatus.urgency === 'soon' && 'bg-amber-500 text-white',
            dueStatus.urgency === 'ok' && 'bg-slate-200 text-slate-600',
          )}>
            <Clock className="w-2.5 h-2.5" />
            {dueStatus.text}
          </div>
        )}
      </div>

      {/* Job # */}
      <div className="font-mono text-[11px] text-slate-500 mb-1">
        {job.jobNo}
      </div>

      {/* Job Title */}
      {job.title && (
        <div className="text-xs font-medium text-slate-700 truncate mb-1" title={job.title}>
          {job.title}
        </div>
      )}

      {/* Size + Quantity */}
      {(job.sizeName || job.quantity > 0) && (
        <div className="flex items-center gap-2 text-[11px] text-slate-600 mb-1">
          {job.sizeName && <span className="font-medium">{job.sizeName}</span>}
          {job.quantity > 0 && <span>• {job.quantity.toLocaleString()} qty</span>}
        </div>
      )}

      {/* Customer PO */}
      {job.customerPONumber && (
        <div className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded inline-block mb-1">
          PO: {job.customerPONumber}
        </div>
      )}

      {/* Sell Price + Spread */}
      {job.sellPrice > 0 && (
        <div className="flex items-center gap-2 text-[11px] mb-1.5">
          <span className="font-semibold text-slate-800">
            ${job.sellPrice.toLocaleString()}
          </span>
          {job.spread !== undefined && job.spread !== 0 && (
            <span className={`font-medium ${job.spread >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              → ${job.spread.toLocaleString()} spread
            </span>
          )}
        </div>
      )}

      {/* Active Task Indicator */}
      {job.activeTask && (
        <div className="text-[10px] text-amber-800 bg-amber-100 rounded px-1.5 py-1 mb-2 truncate font-medium border border-amber-200">
          {job.activeTask}
        </div>
      )}

      {/* Footer: Files & Vendor Status */}
      <div className="pt-2 border-t border-slate-200/60 space-y-1.5">
        {/* Files Row */}
        <div className="flex items-center gap-2 text-[10px]">
          {/* Artwork */}
          <span className={cn(
            'flex items-center gap-0.5 font-medium',
            job.qc.artwork === 'missing' ? 'text-red-600' : 'text-emerald-600'
          )}>
            {job.qc.artwork === 'missing' ? <XCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
            Art{job.qc.artworkCount > 0 && `(${job.qc.artworkCount})`}
          </span>

          {/* Data */}
          <span className={cn(
            'flex items-center gap-0.5 font-medium',
            job.qc.data === 'missing' ? 'text-red-600' :
            job.qc.data === 'na' ? 'text-slate-400' : 'text-emerald-600'
          )}>
            {job.qc.data === 'missing' ? <XCircle className="w-3 h-3" /> :
             job.qc.data === 'na' ? <Minus className="w-3 h-3" /> : <Check className="w-3 h-3" />}
            Data{job.qc.dataCount > 0 && `(${job.qc.dataCount})`}
          </span>

          {/* Proof */}
          <span className={cn(
            'flex items-center gap-0.5 font-medium',
            !job.qc.hasProof ? 'text-slate-400' :
            job.qc.proofStatus === 'APPROVED' ? 'text-emerald-600' :
            job.qc.proofStatus === 'CHANGES_REQUESTED' ? 'text-amber-600' : 'text-blue-600'
          )}>
            {!job.qc.hasProof ? <Minus className="w-3 h-3" /> :
             job.qc.proofStatus === 'APPROVED' ? <Check className="w-3 h-3" /> :
             job.qc.proofStatus === 'CHANGES_REQUESTED' ? <AlertTriangle className="w-3 h-3" /> :
             <Clock className="w-3 h-3" />}
            Proof
          </span>
        </div>

        {/* Vendor Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px]">
            {/* Vendor Name */}
            {job.vendorName && (
              <span className="font-semibold text-slate-700 truncate max-w-[100px]" title={job.vendorName}>
                → {job.vendorName}
              </span>
            )}

            {/* Vendor Confirmed */}
            <span className={cn(
              'flex items-center gap-0.5 font-medium',
              job.vendorConfirmedAt ? 'text-emerald-600' : 'text-slate-400'
            )}>
              {job.vendorConfirmedAt ? <Check className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              Conf
            </span>

            {/* Vendor Status */}
            {job.vendorStatus && job.vendorStatus !== 'PENDING' && (
              <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold uppercase text-[9px]">
                {job.vendorStatus.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          {/* Quick Advance Button */}
          {nextStatuses.length > 0 && (
            <button
              onClick={(e) => handleAdvanceClick(e, nextStatuses[0].status)}
              disabled={isUpdating}
              className={cn(
                'flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-bold',
                'bg-slate-900 text-white hover:bg-slate-700 transition-colors',
                'opacity-0 group-hover:opacity-100 focus:opacity-100'
              )}
              title={`Move to ${nextStatuses[0].label}`}
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// PIPELINE COLUMN COMPONENT
// ============================================

interface PipelineColumnProps {
  stage: PipelineStage;
  jobs: PipelineJob[];
  onSelectJob: (jobId: string) => void;
  onAdvanceJob: (jobId: string, newStatus: string) => void;
  updatingJobId: string | null;
}

function PipelineColumn({ stage, jobs, onSelectJob, onAdvanceJob, updatingJobId }: PipelineColumnProps) {
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const urgencyOrder = { red: 0, amber: 1, green: 2 };
      const aUrgency = urgencyOrder[getCardUrgency(a)];
      const bUrgency = urgencyOrder[getCardUrgency(b)];
      if (aUrgency !== bUrgency) return aUrgency - bUrgency;

      const aDate = a.deliveryDate || a.mailDate || a.inHomesDate || '';
      const bDate = b.deliveryDate || b.mailDate || b.inHomesDate || '';
      return aDate.localeCompare(bDate);
    });
  }, [jobs]);

  const urgentCount = jobs.filter(j => getCardUrgency(j) === 'red').length;
  const warningCount = jobs.filter(j => getCardUrgency(j) === 'amber').length;

  return (
    <div className="flex flex-col h-full min-w-[260px] w-[260px] shrink-0">
      {/* Column Header */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2.5 rounded-t-xl border-2 border-b-0',
        stage.headerBg,
        stage.borderColor
      )}>
        <span className={stage.color}>{stage.icon}</span>
        <span className={cn('text-sm font-bold flex-1', stage.color)}>
          {stage.shortLabel}
        </span>
        <div className="flex items-center gap-1">
          {urgentCount > 0 && (
            <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full bg-red-500 text-white">
              {urgentCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full bg-amber-400 text-white">
              {warningCount}
            </span>
          )}
          <span className={cn(
            'w-6 h-5 flex items-center justify-center text-[10px] font-bold rounded-full',
            jobs.length > 0 ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500'
          )}>
            {jobs.length}
          </span>
        </div>
      </div>

      {/* Cards Container */}
      <div className={cn(
        'flex-1 overflow-y-auto p-2 space-y-2 rounded-b-xl border-2 border-t-0',
        stage.bgColor,
        stage.borderColor
      )}
      style={{ maxHeight: 'calc(100vh - 220px)' }}
      >
        {sortedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <Package className="w-6 h-6 mb-2 opacity-40" />
            <span className="text-xs">No jobs</span>
          </div>
        ) : (
          sortedJobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onClick={() => onSelectJob(job.id)}
              onAdvance={(status) => onAdvanceJob(job.id, status)}
              isUpdating={updatingJobId === job.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================
// MAIN PIPELINE BOARD COMPONENT
// ============================================

export function JobPipelineBoard({ onSelectJob, onRefresh }: JobPipelineBoardProps) {
  const [allJobs, setAllJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showPaidColumn, setShowPaidColumn] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await jobsApi.getWorkflowView();

      const jobs: PipelineJob[] = [];
      (data.stages || []).forEach((stage: any) => {
        stage.jobs.forEach((job: any) => {
          jobs.push(job);
        });
      });

      setAllJobs(jobs);
    } catch (err: any) {
      setError(err.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdvanceJob = async (jobId: string, newStatus: string) => {
    setUpdatingJobId(jobId);
    try {
      await jobsApi.updateWorkflowStatus(jobId, newStatus);
      await fetchData();
      onRefresh?.();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingJobId(null);
    }
  };

  // Extract customers for filter
  const customers = useMemo(() => {
    const customerMap = new Map<string, { id: string; name: string; count: number }>();
    allJobs.forEach(job => {
      const existing = customerMap.get(job.customerId);
      if (existing) {
        existing.count++;
      } else {
        customerMap.set(job.customerId, {
          id: job.customerId,
          name: job.customerName,
          count: 1,
        });
      }
    });
    return Array.from(customerMap.values()).sort((a, b) => b.count - a.count);
  }, [allJobs]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    let jobs = allJobs;
    if (selectedCustomerId) {
      jobs = jobs.filter(job => job.customerId === selectedCustomerId);
    }
    return jobs;
  }, [allJobs, selectedCustomerId]);

  // Group by stage
  const jobsByStage = useMemo(() => {
    const grouped = new Map<string, PipelineJob[]>();
    PIPELINE_STAGES.forEach(stage => {
      grouped.set(stage.status, []);
    });
    filteredJobs.forEach(job => {
      const stageJobs = grouped.get(job.workflowStatus);
      if (stageJobs) {
        stageJobs.push(job);
      }
    });
    return grouped;
  }, [filteredJobs]);

  // Visible stages (hide PAID by default)
  const visibleStages = useMemo(() => {
    return PIPELINE_STAGES.filter(stage => {
      if (stage.status === 'PAID' && !showPaidColumn) return false;
      return true;
    });
  }, [showPaidColumn]);

  // Stats
  const totalJobs = filteredJobs.length;
  const urgentCount = filteredJobs.filter(j => getCardUrgency(j) === 'red').length;
  const paidCount = jobsByStage.get('PAID')?.length || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Loading pipeline...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-slate-50 rounded-xl border border-slate-200 gap-4">
        <AlertTriangle className="w-10 h-10 text-red-500" />
        <p className="text-red-600 font-medium">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold tracking-tight">Job Pipeline</h2>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-white/20 rounded-lg text-sm font-mono tabular-nums">
              {totalJobs} active
            </span>
            {urgentCount > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500 rounded-lg text-sm font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                {urgentCount} urgent
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle Paid Column */}
          <button
            onClick={() => setShowPaidColumn(!showPaidColumn)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              showPaidColumn
                ? 'bg-green-500 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white/80'
            )}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Paid ({paidCount})
          </button>
          {/* Refresh */}
          <button
            onClick={() => { fetchData(); onRefresh?.(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Customer Filter Bar */}
      {customers.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 overflow-x-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <button
            onClick={() => setSelectedCustomerId(null)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap',
              !selectedCustomerId
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
            )}
          >
            All Customers
            <span className="font-mono text-[10px] opacity-70">({allJobs.length})</span>
          </button>
          {customers.slice(0, 10).map(customer => (
            <button
              key={customer.id}
              onClick={() => setSelectedCustomerId(customer.id === selectedCustomerId ? null : customer.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap',
                selectedCustomerId === customer.id
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
              )}
            >
              {customer.name}
              <span className="font-mono text-[10px] opacity-70">({customer.count})</span>
            </button>
          ))}
          {selectedCustomerId && (
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
              title="Clear filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Pipeline Columns - Horizontal Scroll */}
      <div className="flex-1 overflow-x-auto p-4 bg-gradient-to-b from-slate-100 to-slate-50">
        <div className="flex gap-3 h-full pb-2">
          {visibleStages.map(stage => (
            <PipelineColumn
              key={stage.status}
              stage={stage}
              jobs={jobsByStage.get(stage.status) || []}
              onSelectJob={onSelectJob}
              onAdvanceJob={handleAdvanceJob}
              updatingJobId={updatingJobId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default JobPipelineBoard;
