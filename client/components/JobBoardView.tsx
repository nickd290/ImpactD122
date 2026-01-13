import React, { useState, useMemo } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { AlertCircle, Clock, CheckCircle, Filter } from 'lucide-react';
import { cn } from '../lib/utils';
import { Badge } from './ui';

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
  customer?: { id: string; name: string };
  vendor?: { id: string; name: string; isPartner?: boolean };
  customerPOFile?: string;
  customerPONumber?: string;
  qcArtwork?: string;
  qcDataFiles?: string;
  qcMailing?: string;
  pathway?: string;
  updatedAt?: string;
}

interface JobBoardViewProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
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

function JobBoardCard({ job, onClick }: { job: Job; onClick: () => void }) {
  const status = calculateBoardStatus(job);
  const missingItems = getMissingItems(job);
  const deadlineText = getDeadlineText(job);

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
      onClick={onClick}
      className={cn(
        'p-5 rounded-lg border-2 cursor-pointer transition-all hover:shadow-lg',
        cardStyles[status]
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-1">
          <span className="job-number text-base text-foreground">{job.jobNo}</span>
          <h3 className="text-sm text-muted-foreground truncate max-w-[180px]" title={job.title}>
            {job.title || 'Untitled Job'}
          </h3>
        </div>
        <Badge variant={statusLabels[status].variant}>
          {statusLabels[status].text}
        </Badge>
      </div>

      {/* Customer */}
      <p className="text-xs text-muted-foreground mb-2">
        {job.customer?.name || 'No customer'}
      </p>

      {/* Customer PO */}
      {job.customerPONumber && (
        <p className="job-number text-sm text-foreground mb-3">
          PO: {job.customerPONumber}
        </p>
      )}

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

      {/* Missing Items */}
      {missingItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="section-header mb-2">Missing</p>
          <div className="flex flex-wrap gap-1.5">
            {missingItems.map((item) => (
              <span
                key={item}
                className="px-2 py-0.5 bg-background/80 text-muted-foreground text-[10px] rounded font-medium"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Partner Badge */}
      {job.vendor?.isPartner && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <Badge variant="p3">Bradford Partner</Badge>
        </div>
      )}

      {/* Last Edited */}
      {job.updatedAt && (
        <div className="mt-3 pt-2 border-t border-border/50 text-[10px] text-muted-foreground/70 font-mono">
          Last edited: {new Date(job.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}
    </div>
  );
}

export function JobBoardView({ jobs, onJobClick }: JobBoardViewProps) {
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
