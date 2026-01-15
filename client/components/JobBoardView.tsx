import React, { useState, useMemo } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { AlertCircle, Clock, CheckCircle, Filter, Upload, Mail, Send, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { Badge, Button } from './ui';

// Job type matching API response
interface Job {
  id: string;
  jobNo: string;
  title: string;
  status: string;
  workflowStatus?: string;
  dueDate?: string;
  mailDate?: string;
  inHomesDate?: string;
  customer?: { id: string; name: string; email?: string };
  vendor?: { id: string; name: string; isPartner?: boolean; email?: string };
  customerPOFile?: string;
  customerPONumber?: string;
  qcArtwork?: string;
  qcDataFiles?: string;
  qcMailing?: string;
  pathway?: string;
  updatedAt?: string;
  sellPrice?: number;
  profit?: { spread?: number; totalCost?: number };
  purchaseOrders?: { id: string; emailedAt?: string }[];
}

interface JobBoardViewProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
  onUploadArtwork?: (job: Job) => void;
  onEmailCustomer?: (job: Job) => void;
  onEmailVendor?: (job: Job) => void;
  onMarkPOSent?: (job: Job) => void;
}

type BoardStatus = 'red' | 'yellow' | 'green';
type StatusFilter = 'all' | 'red' | 'yellow' | 'green';

function getMissingItems(job: Job): string[] {
  const missing: string[] = [];

  if (!job.customerPOFile) {
    missing.push('Customer PO');
  }

  if (job.qcArtwork === 'PENDING') {
    missing.push('Artwork');
  }
  if (job.qcDataFiles === 'PENDING') {
    missing.push('Data Files');
  }
  if (job.qcMailing === 'INCOMPLETE') {
    missing.push('Mailing Info');
  }

  if (job.workflowStatus === 'AWAITING_PROOF_FROM_VENDOR') {
    missing.push('Proof from Vendor');
  }
  if (job.workflowStatus === 'AWAITING_CUSTOMER_RESPONSE') {
    missing.push('Customer Approval');
  }

  return missing;
}

function calculateBoardStatus(job: Job): BoardStatus {
  if (job.status === 'COMPLETED') {
    return 'green';
  }

  const deadline = job.dueDate || job.mailDate || job.inHomesDate;
  if (deadline) {
    const daysToDeadline = differenceInDays(parseISO(deadline), new Date());
    if (daysToDeadline <= 3) {
      return 'red';
    }
  }

  const missingItems = getMissingItems(job);
  if (missingItems.length > 0) {
    return 'yellow';
  }

  return 'green';
}

function getDeadlineText(job: Job): string | null {
  const deadline = job.dueDate || job.mailDate || job.inHomesDate;
  if (!deadline) return null;

  const days = differenceInDays(parseISO(deadline), new Date());

  if (days < 0) {
    return `${Math.abs(days)}d overdue`;
  } else if (days === 0) {
    return 'Due today';
  } else if (days === 1) {
    return 'Due tomorrow';
  } else {
    return `${days}d remaining`;
  }
}

interface JobBoardCardProps {
  job: Job;
  onClick: () => void;
  onUploadArtwork?: () => void;
  onEmailCustomer?: () => void;
  onEmailVendor?: () => void;
  onMarkPOSent?: () => void;
}

function JobBoardCard({ job, onClick, onUploadArtwork, onEmailCustomer, onEmailVendor, onMarkPOSent }: JobBoardCardProps) {
  const status = calculateBoardStatus(job);
  const missingItems = getMissingItems(job);
  const deadlineText = getDeadlineText(job);
  const needsArtwork = job.qcArtwork === 'PENDING';
  const hasPO = (job.purchaseOrders?.length ?? 0) > 0;
  const poSent = job.purchaseOrders?.some(po => po.emailedAt);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const spread = job.profit?.spread ?? (job.sellPrice ? job.sellPrice - (job.profit?.totalCost ?? 0) : 0);

  // Full card tinting based on status
  const cardStyles = {
    red: 'bg-status-danger-bg border-status-danger-border hover:border-status-danger',
    yellow: 'bg-status-warning-bg border-status-warning-border hover:border-status-warning',
    green: 'bg-status-success-bg border-status-success-border hover:border-status-success',
  };

  const statusLabels = {
    red: { text: 'Urgent', variant: 'danger' as const },
    yellow: { text: 'Attention', variant: 'warning' as const },
    green: { text: 'On Track', variant: 'success' as const },
  };

  return (
    <div
      className={cn(
        'p-4 rounded-lg border-2 transition-all hover:shadow-lg flex flex-col',
        cardStyles[status]
      )}
    >
      {/* Header - Job # and Spread */}
      <div className="flex items-start justify-between mb-2">
        <span className="job-number text-base text-foreground">{job.jobNo}</span>
        {job.sellPrice && (
          <span className={cn(
            'text-sm font-semibold tabular-nums',
            spread >= 0 ? 'text-emerald-700' : 'text-red-600'
          )}>
            {formatCurrency(spread)}
          </span>
        )}
      </div>

      {/* Title - Allow 2 lines */}
      <h3
        className="text-sm font-medium text-foreground mb-1 line-clamp-2 cursor-pointer hover:text-foreground/80"
        onClick={onClick}
        title={job.title}
      >
        {job.title || 'Untitled Job'}
      </h3>

      {/* Customer */}
      <p className="text-xs text-muted-foreground mb-2">
        {job.customer?.name || 'No customer'}
      </p>

      {/* Deadline - Emphasized */}
      {deadlineText && (
        <div className={cn(
          'flex items-center gap-2 text-sm mb-3 font-mono tabular-nums',
          status === 'red' ? 'text-status-danger font-semibold' : 'text-muted-foreground'
        )}>
          <Clock className="w-4 h-4" />
          <span>{deadlineText}</span>
        </div>
      )}

      {/* Missing Items - Simplified */}
      {missingItems.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-amber-700">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">
              Needs: {missingItems.slice(0, 2).join(', ')}
              {missingItems.length > 2 && ` +${missingItems.length - 2}`}
            </span>
          </div>
        </div>
      )}

      {/* Workflow Stage */}
      {job.workflowStatus && (
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {job.workflowStatus.replace(/_/g, ' ')}
          </span>
          {job.vendor?.isPartner && (
            <Badge variant="p3" className="text-[9px]">Partner</Badge>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-auto pt-3 border-t border-border/50 flex flex-wrap gap-1.5">
        <button
          onClick={onClick}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </button>

        {needsArtwork && onUploadArtwork && (
          <button
            onClick={(e) => { e.stopPropagation(); onUploadArtwork(); }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded transition-colors"
          >
            <Upload className="w-3 h-3" />
            Upload
          </button>
        )}

        {onEmailCustomer && (
          <button
            onClick={(e) => { e.stopPropagation(); onEmailCustomer(); }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
          >
            <Mail className="w-3 h-3" />
            Cust
          </button>
        )}

        {job.vendor && onEmailVendor && (
          <button
            onClick={(e) => { e.stopPropagation(); onEmailVendor(); }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded transition-colors"
          >
            <Mail className="w-3 h-3" />
            Vendor
          </button>
        )}

        {hasPO && !poSent && onMarkPOSent && (
          <button
            onClick={(e) => { e.stopPropagation(); onMarkPOSent(); }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded transition-colors"
          >
            <Send className="w-3 h-3" />
            Send PO
          </button>
        )}

        {poSent && (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-600">
            <CheckCircle className="w-3 h-3" />
            PO Sent
          </span>
        )}
      </div>
    </div>
  );
}

export function JobBoardView({
  jobs,
  onJobClick,
  onUploadArtwork,
  onEmailCustomer,
  onEmailVendor,
  onMarkPOSent,
}: JobBoardViewProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const activeJobs = useMemo(() => {
    const inProgressStatuses = ['ACTIVE', 'PENDING', 'COMPLETED'];
    return jobs.filter(j => inProgressStatuses.includes(j.status));
  }, [jobs]);

  const stats = useMemo(() => {
    const counts = { red: 0, yellow: 0, green: 0 };
    activeJobs.forEach(job => {
      const status = calculateBoardStatus(job);
      counts[status]++;
    });
    return counts;
  }, [activeJobs]);

  const filteredJobs = useMemo(() => {
    if (statusFilter === 'all') return activeJobs;
    return activeJobs.filter(job => calculateBoardStatus(job) === statusFilter);
  }, [activeJobs, statusFilter]);

  const sortedJobs = useMemo(() => {
    const priority = { red: 0, yellow: 1, green: 2 };
    return [...filteredJobs].sort((a, b) => {
      const aPriority = priority[calculateBoardStatus(a)];
      const bPriority = priority[calculateBoardStatus(b)];
      if (aPriority !== bPriority) return aPriority - bPriority;

      const aDeadline = a.dueDate || a.mailDate || a.inHomesDate;
      const bDeadline = b.dueDate || b.mailDate || b.inHomesDate;
      if (aDeadline && bDeadline) {
        return parseISO(aDeadline).getTime() - parseISO(bDeadline).getTime();
      }
      return 0;
    });
  }, [filteredJobs]);

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-light tracking-tight text-foreground">Job Board</h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-wide">
            {activeJobs.length} active jobs
          </p>
        </div>
      </div>

      {/* Stats/Filter Bar */}
      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
        <FilterButton
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
          icon={<Filter className="w-4 h-4" />}
          label="All"
          count={activeJobs.length}
        />
        <FilterButton
          active={statusFilter === 'red'}
          onClick={() => setStatusFilter('red')}
          icon={<AlertCircle className="w-4 h-4 text-status-danger" />}
          label="Urgent"
          count={stats.red}
          variant="danger"
        />
        <FilterButton
          active={statusFilter === 'yellow'}
          onClick={() => setStatusFilter('yellow')}
          icon={<Clock className="w-4 h-4 text-status-warning" />}
          label="Attention"
          count={stats.yellow}
          variant="warning"
        />
        <FilterButton
          active={statusFilter === 'green'}
          onClick={() => setStatusFilter('green')}
          icon={<CheckCircle className="w-4 h-4 text-status-success" />}
          label="On Track"
          count={stats.green}
          variant="success"
        />
      </div>

      {/* Jobs Grid - Increased gaps */}
      {sortedJobs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No jobs match the selected filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedJobs.map(job => (
            <JobBoardCard
              key={job.id}
              job={job}
              onClick={() => onJobClick(job)}
              onUploadArtwork={onUploadArtwork ? () => onUploadArtwork(job) : undefined}
              onEmailCustomer={onEmailCustomer ? () => onEmailCustomer(job) : undefined}
              onEmailVendor={onEmailVendor ? () => onEmailVendor(job) : undefined}
              onMarkPOSent={onMarkPOSent ? () => onMarkPOSent(job) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Filter button component
function FilterButton({
  active,
  onClick,
  icon,
  label,
  count,
  variant
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  variant?: 'danger' | 'warning' | 'success';
}) {
  const variantClasses = {
    danger: 'text-status-danger',
    warning: 'text-status-warning',
    success: 'text-status-success',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-md transition-all',
        active
          ? 'bg-card shadow-sm border border-border'
          : 'hover:bg-card/50'
      )}
    >
      {icon}
      <span className={cn(
        'text-sm font-medium',
        variant ? variantClasses[variant] : 'text-foreground'
      )}>
        {label}
      </span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        ({count})
      </span>
    </button>
  );
}
