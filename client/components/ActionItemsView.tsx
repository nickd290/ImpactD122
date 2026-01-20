import React, { useMemo, useState, useEffect } from 'react';
import {
  AlertCircle, Clock, FileX, Mail, Receipt, ChevronRight,
  Upload, Send, CheckCircle, Filter, Inbox
} from 'lucide-react';
import { differenceInDays, parseISO, format } from 'date-fns';
import { cn } from '../lib/utils';
import { Badge } from './ui';
import { jobsApi } from '../lib/api';

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
  vendor?: { id: string; name: string };
  customerPOFile?: string;
  qcArtwork?: string;
  qcDataFiles?: string;
  sellPrice?: number;
  invoiceGeneratedAt?: string;
  profit?: { spread?: number };
}

interface Communication {
  id: string;
  subject: string;
  jobId: string;
  job?: { jobNo: string; title: string };
  direction: 'INBOUND' | 'OUTBOUND';
  fromAddress?: string;
  status: string;
  receivedAt?: string;
}

interface ActionItemsViewProps {
  jobs: Job[];
  communications?: Communication[];
  onJobClick: (job: Job) => void;
  onCommunicationClick?: (comm: Communication) => void;
  onUploadArtwork?: (job: Job) => void;
  onSendInvoice?: (job: Job) => void;
}

type ActionCategory = 'all' | 'overdue' | 'missing' | 'emails' | 'billing';

interface ActionItem {
  id: string;
  type: 'overdue' | 'missing_artwork' | 'missing_data' | 'pending_email' | 'ready_to_bill' | 'unpaid';
  priority: number; // Lower = more urgent
  job?: Job;
  communication?: Communication;
  title: string;
  subtitle: string;
  daysInfo?: string;
  action?: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
  };
}

function getDeadline(job: Job): Date | null {
  const dateStr = job.dueDate || job.mailDate || job.inHomesDate;
  return dateStr ? parseISO(dateStr) : null;
}

function getDaysOverdue(job: Job): number | null {
  const deadline = getDeadline(job);
  if (!deadline) return null;
  const days = differenceInDays(new Date(), deadline);
  return days > 0 ? days : null;
}

export function ActionItemsView({
  jobs: propJobs,
  communications = [],
  onJobClick,
  onCommunicationClick,
  onUploadArtwork,
  onSendInvoice,
}: ActionItemsViewProps) {
  const [filter, setFilter] = useState<ActionCategory>('all');

  // Local jobs state - fetch our own data
  const [localJobs, setLocalJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  // Use localJobs instead of prop jobs
  const jobs = localJobs;

  const actionItems = useMemo(() => {
    const items: ActionItem[] = [];
    const activeJobs = jobs.filter(j => j.status === 'ACTIVE');

    // 1. Overdue jobs (highest priority)
    activeJobs.forEach(job => {
      const daysOverdue = getDaysOverdue(job);
      if (daysOverdue && daysOverdue > 0) {
        items.push({
          id: `overdue-${job.id}`,
          type: 'overdue',
          priority: 1,
          job,
          title: job.title || job.jobNo,
          subtitle: job.customer?.name || 'No customer',
          daysInfo: `${daysOverdue}d overdue`,
        });
      }
    });

    // 2. Missing artwork
    activeJobs.forEach(job => {
      if (job.qcArtwork === 'PENDING' && !getDaysOverdue(job)) {
        items.push({
          id: `artwork-${job.id}`,
          type: 'missing_artwork',
          priority: 2,
          job,
          title: job.title || job.jobNo,
          subtitle: job.customer?.name || 'No customer',
          action: onUploadArtwork ? {
            label: 'Upload',
            icon: <Upload className="w-3.5 h-3.5" />,
            onClick: () => onUploadArtwork(job),
          } : undefined,
        });
      }
    });

    // 3. Missing data files
    activeJobs.forEach(job => {
      if (job.qcDataFiles === 'PENDING' && job.qcArtwork !== 'PENDING' && !getDaysOverdue(job)) {
        items.push({
          id: `data-${job.id}`,
          type: 'missing_data',
          priority: 2,
          job,
          title: job.title || job.jobNo,
          subtitle: job.customer?.name || 'No customer',
        });
      }
    });

    // 4. Pending communications
    const pendingComms = communications.filter(c => c.status === 'PENDING');
    pendingComms.forEach(comm => {
      items.push({
        id: `email-${comm.id}`,
        type: 'pending_email',
        priority: 3,
        communication: comm,
        title: comm.subject || 'No subject',
        subtitle: comm.job?.jobNo ? `${comm.job.jobNo} - ${comm.fromAddress || 'Unknown sender'}` : comm.fromAddress || 'Unknown sender',
        daysInfo: comm.receivedAt ? format(parseISO(comm.receivedAt), 'MMM d') : undefined,
      });
    });

    // 5. Ready to bill (shipped but not invoiced)
    activeJobs.forEach(job => {
      if (job.workflowStatus === 'SHIPPED' && !job.invoiceGeneratedAt) {
        items.push({
          id: `bill-${job.id}`,
          type: 'ready_to_bill',
          priority: 4,
          job,
          title: job.title || job.jobNo,
          subtitle: `${job.customer?.name || 'No customer'} - ${formatCurrency(job.sellPrice || 0)}`,
          action: onSendInvoice ? {
            label: 'Invoice',
            icon: <Send className="w-3.5 h-3.5" />,
            onClick: () => onSendInvoice(job),
          } : undefined,
        });
      }
    });

    // Sort by priority, then by days overdue
    return items.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const aDays = a.job ? getDaysOverdue(a.job) || 0 : 0;
      const bDays = b.job ? getDaysOverdue(b.job) || 0 : 0;
      return bDays - aDays; // More overdue first
    });
  }, [jobs, communications, onUploadArtwork, onSendInvoice]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (filter === 'all') return actionItems;
    const typeMap: Record<ActionCategory, ActionItem['type'][]> = {
      all: [],
      overdue: ['overdue'],
      missing: ['missing_artwork', 'missing_data'],
      emails: ['pending_email'],
      billing: ['ready_to_bill', 'unpaid'],
    };
    return actionItems.filter(item => typeMap[filter].includes(item.type));
  }, [actionItems, filter]);

  // Counts for filter badges
  const counts = useMemo(() => ({
    all: actionItems.length,
    overdue: actionItems.filter(i => i.type === 'overdue').length,
    missing: actionItems.filter(i => ['missing_artwork', 'missing_data'].includes(i.type)).length,
    emails: actionItems.filter(i => i.type === 'pending_email').length,
    billing: actionItems.filter(i => ['ready_to_bill', 'unpaid'].includes(i.type)).length,
  }), [actionItems]);

  const handleItemClick = (item: ActionItem) => {
    if (item.job) {
      onJobClick(item.job);
    } else if (item.communication && onCommunicationClick) {
      onCommunicationClick(item.communication);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 mx-auto"></div>
          <p className="mt-4 text-zinc-500 text-sm">Loading action items...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-12 max-w-4xl animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-light tracking-tight text-foreground">
            Action Items
          </h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-wide">
            {actionItems.length} items need attention
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg mb-8">
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          icon={<Inbox className="w-4 h-4" />}
          label="All"
          count={counts.all}
        />
        <FilterChip
          active={filter === 'overdue'}
          onClick={() => setFilter('overdue')}
          icon={<AlertCircle className="w-4 h-4 text-status-danger" />}
          label="Overdue"
          count={counts.overdue}
          variant="danger"
        />
        <FilterChip
          active={filter === 'missing'}
          onClick={() => setFilter('missing')}
          icon={<FileX className="w-4 h-4 text-status-warning" />}
          label="Missing Files"
          count={counts.missing}
          variant="warning"
        />
        <FilterChip
          active={filter === 'emails'}
          onClick={() => setFilter('emails')}
          icon={<Mail className="w-4 h-4 text-status-info" />}
          label="Emails"
          count={counts.emails}
          variant="info"
        />
        <FilterChip
          active={filter === 'billing'}
          onClick={() => setFilter('billing')}
          icon={<Receipt className="w-4 h-4 text-status-success" />}
          label="Billing"
          count={counts.billing}
          variant="success"
        />
      </div>

      {/* Action Items List */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle className="w-12 h-12 text-status-success mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">
            {filter === 'all' ? 'No action items at the moment.' : `No ${filter} items.`}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredItems.map(item => (
            <ActionItemRow
              key={item.id}
              item={item}
              onClick={() => handleItemClick(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Filter chip component
function FilterChip({
  active,
  onClick,
  icon,
  label,
  count,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  variant?: 'danger' | 'warning' | 'info' | 'success';
}) {
  const variantClasses = {
    danger: 'text-status-danger',
    warning: 'text-status-warning',
    info: 'text-status-info',
    success: 'text-status-success',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md transition-all text-sm',
        active
          ? 'bg-card shadow-sm border border-border font-medium'
          : 'hover:bg-card/50'
      )}
    >
      {icon}
      <span className={cn(variant ? variantClasses[variant] : 'text-foreground')}>
        {label}
      </span>
      {count > 0 && (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

// Single action item row
function ActionItemRow({
  item,
  onClick,
}: {
  item: ActionItem;
  onClick: () => void;
}) {
  const typeConfig: Record<ActionItem['type'], {
    icon: React.ReactNode;
    badge: { label: string; variant: 'danger' | 'warning' | 'info' | 'success' | 'neutral' };
  }> = {
    overdue: {
      icon: <AlertCircle className="w-5 h-5 text-status-danger" />,
      badge: { label: 'Overdue', variant: 'danger' },
    },
    missing_artwork: {
      icon: <FileX className="w-5 h-5 text-status-warning" />,
      badge: { label: 'Need Artwork', variant: 'warning' },
    },
    missing_data: {
      icon: <FileX className="w-5 h-5 text-status-warning" />,
      badge: { label: 'Need Data', variant: 'warning' },
    },
    pending_email: {
      icon: <Mail className="w-5 h-5 text-status-info" />,
      badge: { label: 'Reply', variant: 'info' },
    },
    ready_to_bill: {
      icon: <Receipt className="w-5 h-5 text-status-success" />,
      badge: { label: 'Bill', variant: 'success' },
    },
    unpaid: {
      icon: <Clock className="w-5 h-5 text-status-warning" />,
      badge: { label: 'Unpaid', variant: 'warning' },
    },
  };

  const config = typeConfig[item.type];

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-all',
        'hover:bg-card hover:shadow-sm border border-transparent hover:border-border',
        item.type === 'overdue' && 'bg-status-danger-bg/50'
      )}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        {config.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {item.job && (
            <span className="job-number text-sm text-muted-foreground">
              {item.job.jobNo}
            </span>
          )}
          <span className="text-sm font-medium text-foreground truncate">
            {item.title}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {item.subtitle}
        </p>
      </div>

      {/* Days info */}
      {item.daysInfo && (
        <div className={cn(
          'flex-shrink-0 text-xs font-mono tabular-nums',
          item.type === 'overdue' ? 'text-status-danger font-semibold' : 'text-muted-foreground'
        )}>
          {item.daysInfo}
        </div>
      )}

      {/* Badge */}
      <Badge variant={config.badge.variant} className="flex-shrink-0">
        {config.badge.label}
      </Badge>

      {/* Quick action button */}
      {item.action && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            item.action?.onClick();
          }}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors"
        >
          {item.action.icon}
          {item.action.label}
        </button>
      )}

      {/* Chevron */}
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
