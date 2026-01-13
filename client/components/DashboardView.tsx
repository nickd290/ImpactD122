import React from 'react';
import { Plus, Upload, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from './ui';

interface Job {
  id: string;
  number: string;
  title: string;
  status: string;
  sellPrice?: number;
  dueDate?: string;
  customer?: { name: string };
  createdAt?: string;
  profit?: { spread?: number };
}

interface DashboardViewProps {
  jobs: Job[];
  onCreateJob: () => void;
  onShowSpecParser: () => void;
  onShowPOUploader: () => void;
  onViewAllJobs: () => void;
  onSelectJob?: (job: Job) => void;
}

export function DashboardView({
  jobs,
  onCreateJob,
  onShowSpecParser,
  onShowPOUploader,
  onViewAllJobs,
  onSelectJob
}: DashboardViewProps) {
  // Calculate metrics
  const activeJobs = jobs.filter(j => j.status === 'ACTIVE');
  const paidJobs = jobs.filter(j => j.status === 'PAID');

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const jobsDueThisWeek = activeJobs.filter(j => {
    if (!j.dueDate) return false;
    const due = new Date(j.dueDate);
    return due >= now && due <= weekFromNow;
  });

  const overdueJobs = activeJobs.filter(j => {
    if (!j.dueDate) return false;
    return new Date(j.dueDate) < now;
  });

  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const monthRevenue = paidJobs
    .filter(j => {
      if (!j.createdAt) return false;
      const d = new Date(j.createdAt);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .reduce((sum, j) => sum + (j.sellPrice || 0), 0);

  const totalSpread = jobs.reduce((sum, j) => sum + (j.profit?.spread || 0), 0);
  const marginPercent = monthRevenue > 0 ? (totalSpread / monthRevenue * 100) : 0;

  const needsAttention = [...overdueJobs, ...jobsDueThisWeek.slice(0, 3)].slice(0, 5);
  const recentJobs = jobs.slice(0, 5);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleJobClick = (job: Job) => {
    if (onSelectJob) {
      onSelectJob(job);
    } else {
      onViewAllJobs();
    }
  };

  // Get current month name
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="p-8 lg:p-12 max-w-6xl animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between mb-12">
        <div>
          <h1 className="font-display text-3xl font-light tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-wide">{monthName}</p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Hero Metrics Row - Editorial Style */}
      <div className="grid grid-cols-4 gap-12 mb-16 pb-10 border-b border-border">
        <MetricCard
          value={activeJobs.length.toString()}
          label="Active Jobs"
        />

        <MetricCard
          value={jobsDueThisWeek.length.toString()}
          label="Due This Week"
          alert={overdueJobs.length > 0 ? `${overdueJobs.length} overdue` : undefined}
        />

        <MetricCard
          value={formatCurrency(monthRevenue)}
          label="Revenue"
        />

        <MetricCard
          value={formatCurrency(totalSpread)}
          label="Total Spread"
          subtitle={marginPercent > 0 ? `${marginPercent.toFixed(0)}% margin` : undefined}
          negative={totalSpread < 0}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-16">
        {/* Needs Attention */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="section-header">Needs Attention</h2>
            {needsAttention.length > 0 && (
              <span className="text-xs font-mono tabular-nums text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {needsAttention.length}
              </span>
            )}
          </div>

          {needsAttention.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">All caught up</p>
          ) : (
            <div className="space-y-0">
              {needsAttention.map((job) => {
                const isOverdue = job.dueDate && new Date(job.dueDate) < now;
                return (
                  <div
                    key={job.id}
                    onClick={() => handleJobClick(job)}
                    className="py-4 border-b border-border last:border-0 cursor-pointer group hover:bg-accent/30 -mx-3 px-3 rounded-sm transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground group-hover:text-foreground/80 truncate">
                          {job.title || job.number}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                          <span className="font-mono tracking-wider">{job.number}</span>
                          <span className="text-border">·</span>
                          <span>{job.customer?.name || 'No customer'}</span>
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {isOverdue ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-danger">
                            <AlertCircle className="w-3 h-3" />
                            Overdue
                          </span>
                        ) : job.dueDate ? (
                          <span className="text-xs text-muted-foreground">Due {formatDate(job.dueDate)}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Jobs */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="section-header">Recent Jobs</h2>
            <button
              onClick={onViewAllJobs}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors tracking-wide uppercase"
            >
              View all
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">No jobs yet</p>
          ) : (
            <div className="space-y-0">
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => handleJobClick(job)}
                  className="py-4 border-b border-border last:border-0 cursor-pointer group hover:bg-accent/30 -mx-3 px-3 rounded-sm transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground group-hover:text-foreground/80 truncate">
                        {job.title || job.number}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <span className="font-mono tracking-wider">{job.number}</span>
                        <span className="text-border">·</span>
                        <span>{job.customer?.name || 'No customer'}</span>
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <StatusIndicator status={job.status} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Editorial Metric Card
function MetricCard({
  value,
  label,
  subtitle,
  alert,
  negative
}: {
  value: string;
  label: string;
  subtitle?: string;
  alert?: string;
  negative?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className={`metric-display text-5xl ${negative ? 'text-status-danger' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="section-header">{label}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground font-mono">{subtitle}</p>
      )}
      {alert && (
        <p className="text-xs text-status-danger font-medium flex items-center gap-1 mt-1">
          <AlertCircle className="w-3 h-3" />
          {alert}
        </p>
      )}
    </div>
  );
}

// Status indicator with semantic colors
function StatusIndicator({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    ACTIVE: { color: 'bg-status-warning', label: 'Active' },
    PAID: { color: 'bg-status-success', label: 'Paid' },
    CANCELLED: { color: 'bg-status-neutral', label: 'Cancelled' },
  };

  const { color, label } = config[status] || { color: 'bg-status-neutral', label: status };

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
