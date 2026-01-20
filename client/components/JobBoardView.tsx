import React, { useMemo, useState, useEffect } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { AlertCircle, Clock, ExternalLink, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { JobDrawer } from './JobDrawer';
import { WorkflowStatusDropdown } from './WorkflowStatusDropdown';
import { jobsApi } from '../lib/api';

// Job type matching API response
interface Job {
  id: string;
  jobNo: string;
  title: string;
  status: string;
  workflowStatus?: string;
  workflowStatusOverride?: string;
  dueDate?: string;
  mailDate?: string;
  inHomesDate?: string;
  customer?: { id: string; name: string; email?: string };
  vendor?: { id: string; name: string; isPartner?: boolean; email?: string };
  sellPrice?: number;
  profit?: { spread?: number; totalCost?: number };
}

interface JobBoardViewProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
  onEditJob?: (job: Job) => void;
  onRefresh?: () => void;
}

// Kanban column definitions
const KANBAN_COLUMNS = [
  {
    id: 'new',
    label: 'New',
    statuses: ['NEW_JOB'],
    color: 'bg-slate-100 border-slate-300',
    headerColor: 'text-slate-700',
  },
  {
    id: 'proofing',
    label: 'Proofing',
    statuses: ['AWAITING_PROOF_FROM_VENDOR', 'PROOF_RECEIVED'],
    color: 'bg-blue-50 border-blue-200',
    headerColor: 'text-blue-700',
  },
  {
    id: 'customer-review',
    label: 'Customer Review',
    statuses: ['PROOF_SENT_TO_CUSTOMER', 'AWAITING_CUSTOMER_RESPONSE'],
    color: 'bg-purple-50 border-purple-200',
    headerColor: 'text-purple-700',
  },
  {
    id: 'approved',
    label: 'Approved',
    statuses: ['APPROVED_PENDING_VENDOR'],
    color: 'bg-emerald-50 border-emerald-200',
    headerColor: 'text-emerald-700',
  },
  {
    id: 'production',
    label: 'In Production',
    statuses: ['IN_PRODUCTION'],
    color: 'bg-amber-50 border-amber-200',
    headerColor: 'text-amber-700',
  },
  {
    id: 'done',
    label: 'Done',
    statuses: ['COMPLETED', 'INVOICED', 'PAID'],
    color: 'bg-green-50 border-green-200',
    headerColor: 'text-green-700',
  },
];

function getEffectiveStatus(job: Job): string {
  return job.workflowStatusOverride || job.workflowStatus || 'NEW_JOB';
}

// Stage progression order
const STAGE_ORDER = [
  'NEW_JOB',
  'AWAITING_PROOF_FROM_VENDOR',
  'PROOF_RECEIVED',
  'PROOF_SENT_TO_CUSTOMER',
  'AWAITING_CUSTOMER_RESPONSE',
  'APPROVED_PENDING_VENDOR',
  'IN_PRODUCTION',
  'COMPLETED',
];

function getNextStatus(current: string): string | null {
  const idx = STAGE_ORDER.indexOf(current);
  return idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
}

function getDeadlineInfo(job: Job): { text: string; isUrgent: boolean } | null {
  const deadline = job.dueDate || job.mailDate || job.inHomesDate;
  if (!deadline) return null;

  const days = differenceInDays(parseISO(deadline), new Date());

  if (days < 0) {
    return { text: `${Math.abs(days)}d overdue`, isUrgent: true };
  } else if (days === 0) {
    return { text: 'Due today', isUrgent: true };
  } else if (days <= 3) {
    return { text: `${days}d left`, isUrgent: true };
  } else {
    return { text: `${days}d`, isUrgent: false };
  }
}

interface KanbanCardProps {
  job: Job;
  onClick: () => void;
  onStatusChange: (jobId: string, newStatus: string) => Promise<void>;
}

function KanbanCard({ job, onClick, onStatusChange }: KanbanCardProps) {
  const currentStatus = getEffectiveStatus(job);
  const deadlineInfo = getDeadlineInfo(job);
  const spread = job.profit?.spread ?? (job.sellPrice ? job.sellPrice - (job.profit?.totalCost ?? 0) : 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 bg-white rounded-lg border border-zinc-200 shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-zinc-300',
        deadlineInfo?.isUrgent && 'border-red-300 bg-red-50'
      )}
    >
      {/* Header - Job # and Spread */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-muted-foreground">{job.jobNo}</span>
        {job.sellPrice && (
          <span className={cn(
            'text-xs font-semibold tabular-nums',
            spread >= 0 ? 'text-emerald-600' : 'text-red-600'
          )}>
            {formatCurrency(spread)}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground mb-1 line-clamp-2" title={job.title}>
        {job.title || 'Untitled Job'}
      </h3>

      {/* Customer */}
      <p className="text-xs text-muted-foreground mb-2">
        {job.customer?.name || 'No customer'}
      </p>

      {/* Footer - Status dropdown and deadline */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100">
        <WorkflowStatusDropdown
          status={currentStatus}
          onStatusChange={(newStatus) => onStatusChange(job.id, newStatus)}
          compact
          size="sm"
        />
        <div className="flex items-center gap-2">
          {deadlineInfo && (
            <span className={cn(
              'flex items-center gap-1 text-xs',
              deadlineInfo.isUrgent ? 'text-red-600 font-medium' : 'text-muted-foreground'
            )}>
              {deadlineInfo.isUrgent && <AlertCircle className="w-3 h-3" />}
              <Clock className="w-3 h-3" />
              {deadlineInfo.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function JobBoardView({ jobs: propJobs, onJobClick, onEditJob, onRefresh }: JobBoardViewProps) {
  // Local jobs state - fetch our own data
  const [localJobs, setLocalJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Drawer state for slide-out panel
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Load jobs on mount
  const loadJobs = async () => {
    try {
      setIsLoading(true);
      const response = await jobsApi.getAll();
      setLocalJobs(response.jobs || []);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  // Wrap onRefresh to also reload local jobs
  const handleRefresh = async () => {
    await loadJobs();
    onRefresh?.();
  };

  // Use localJobs instead of prop jobs
  const jobs = localJobs;

  const handleCardClick = (job: Job) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setSelectedJob(null);
  };

  const handleEdit = () => {
    if (selectedJob && onEditJob) {
      onEditJob(selectedJob);
      handleDrawerClose();
    }
  };

  // Update job workflow status
  const handleStatusChange = async (jobId: string, newStatus: string): Promise<void> => {
    try {
      await jobsApi.updateWorkflowStatus(jobId, newStatus);
      await handleRefresh();
    } catch (error) {
      console.error('Failed to update status:', error);
      throw error;
    }
  };

  // Group jobs by workflow status into columns
  const columnData = useMemo(() => {
    // Only include active jobs (exclude PAID status or CANCELLED)
    const activeJobs = jobs.filter(j => j.status === 'ACTIVE');

    return KANBAN_COLUMNS.map(column => {
      const columnJobs = activeJobs.filter(job => {
        const status = getEffectiveStatus(job);
        return column.statuses.includes(status);
      });

      // Sort by deadline (urgent first)
      columnJobs.sort((a, b) => {
        const aDeadline = a.dueDate || a.mailDate || a.inHomesDate;
        const bDeadline = b.dueDate || b.mailDate || b.inHomesDate;
        if (!aDeadline && !bDeadline) return 0;
        if (!aDeadline) return 1;
        if (!bDeadline) return -1;
        return parseISO(aDeadline).getTime() - parseISO(bDeadline).getTime();
      });

      return {
        ...column,
        jobs: columnJobs,
      };
    });
  }, [jobs]);

  const totalActiveJobs = columnData.reduce((sum, col) => sum + col.jobs.length, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 mx-auto"></div>
          <p className="mt-4 text-zinc-500 text-sm">Loading board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Kanban</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {totalActiveJobs} active jobs across {KANBAN_COLUMNS.length} stages
        </p>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
        {columnData.map(column => (
          <div
            key={column.id}
            className={cn(
              'flex-shrink-0 w-72 flex flex-col rounded-lg border-2',
              column.color
            )}
          >
            {/* Column Header */}
            <div className="p-3 border-b border-inherit">
              <div className="flex items-center justify-between">
                <h2 className={cn('text-sm font-semibold', column.headerColor)}>
                  {column.label}
                </h2>
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full bg-white/80',
                  column.headerColor
                )}>
                  {column.jobs.length}
                </span>
              </div>
            </div>

            {/* Column Content */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-240px)]">
              {column.jobs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No jobs
                </p>
              ) : (
                column.jobs.map(job => (
                  <KanbanCard
                    key={job.id}
                    job={job}
                    onClick={() => handleCardClick(job)}
                    onStatusChange={handleStatusChange}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Job Drawer - Slide out from right */}
      <JobDrawer
        job={selectedJob ? {
          ...selectedJob,
          number: selectedJob.jobNo,
        } : null}
        isOpen={isDrawerOpen}
        onClose={handleDrawerClose}
        onEdit={handleEdit}
        onRefresh={handleRefresh}
      />
    </div>
  );
}
