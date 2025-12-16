import React from 'react';
import { Plus, Upload, Sparkles, ArrowRight, AlertCircle, Clock, DollarSign, Briefcase } from 'lucide-react';
import { Button } from './ui';
import { Badge } from './ui';

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
  // Calculate real metrics
  const activeJobs = jobs.filter(j => j.status === 'ACTIVE');
  const paidJobs = jobs.filter(j => j.status === 'PAID');

  // Jobs due this week
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const jobsDueThisWeek = activeJobs.filter(j => {
    if (!j.dueDate) return false;
    const due = new Date(j.dueDate);
    return due >= now && due <= weekFromNow;
  });

  // Overdue jobs
  const overdueJobs = activeJobs.filter(j => {
    if (!j.dueDate) return false;
    return new Date(j.dueDate) < now;
  });

  // This month revenue (from paid jobs)
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const monthRevenue = paidJobs
    .filter(j => {
      if (!j.createdAt) return false;
      const d = new Date(j.createdAt);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .reduce((sum, j) => sum + (j.sellPrice || 0), 0);

  // Total spread from all jobs
  const totalSpread = jobs.reduce((sum, j) => sum + (j.profit?.spread || 0), 0);

  // Jobs needing attention (overdue or due soon)
  const needsAttention = [...overdueJobs, ...jobsDueThisWeek.slice(0, 3)].slice(0, 5);

  // Recent jobs (last 5)
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

  return (
    <div className="p-6 max-w-6xl">
      {/* Header with Quick Actions */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your print brokerage</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onCreateJob} size="sm">
            <Plus className="w-4 h-4 mr-1" />
            New Job
          </Button>
          <Button onClick={onShowPOUploader} variant="outline" size="sm">
            <Upload className="w-4 h-4 mr-1" />
            Upload PO
          </Button>
          <Button onClick={onShowSpecParser} variant="outline" size="sm">
            <Sparkles className="w-4 h-4 mr-1" />
            Parse Specs
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Jobs</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{activeJobs.length}</p>
            </div>
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Due This Week</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{jobsDueThisWeek.length}</p>
            </div>
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          {overdueJobs.length > 0 && (
            <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {overdueJobs.length} overdue
            </p>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Month Revenue</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{formatCurrency(monthRevenue)}</p>
            </div>
            <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Spread</p>
              <p className={`text-2xl font-semibold mt-1 ${totalSpread >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(totalSpread)}
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Needs Attention */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-medium text-foreground">Needs Attention</h3>
            </div>
            {needsAttention.length > 0 && (
              <Badge variant="warning" className="text-xs">{needsAttention.length}</Badge>
            )}
          </div>
          <div className="divide-y divide-border">
            {needsAttention.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                All caught up! No urgent jobs.
              </div>
            ) : (
              needsAttention.map((job) => {
                const isOverdue = job.dueDate && new Date(job.dueDate) < now;
                return (
                  <div
                    key={job.id}
                    onClick={() => handleJobClick(job)}
                    className="px-4 py-3 hover:bg-accent/50 cursor-pointer flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground">{job.number} · {job.customer?.name || 'No customer'}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {isOverdue ? (
                        <span className="text-xs text-red-600 font-medium">Overdue</span>
                      ) : job.dueDate ? (
                        <span className="text-xs text-amber-600">Due {formatDate(job.dueDate)}</span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Recent Jobs</h3>
            <button
              onClick={onViewAllJobs}
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-border">
            {recentJobs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No jobs yet. Create your first job to get started.
              </div>
            ) : (
              recentJobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => handleJobClick(job)}
                  className="px-4 py-3 hover:bg-accent/50 cursor-pointer flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground">{job.number} · {job.customer?.name || 'No customer'}</p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact status badge
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-amber-100 text-amber-700',
    PAID: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
