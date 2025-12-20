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
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-xl font-medium text-zinc-900">Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1">{monthName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onCreateJob} size="sm" className="bg-zinc-900 hover:bg-zinc-800">
            <Plus className="w-4 h-4 mr-1.5" />
            New Job
          </Button>
          <Button onClick={onShowPOUploader} variant="outline" size="sm" className="border-zinc-200 text-zinc-600 hover:text-zinc-900">
            <Upload className="w-4 h-4 mr-1.5" />
            Upload PO
          </Button>
          <Button onClick={onShowSpecParser} variant="outline" size="sm" className="border-zinc-200 text-zinc-600 hover:text-zinc-900">
            <Sparkles className="w-4 h-4 mr-1.5" />
            Parse Specs
          </Button>
        </div>
      </div>

      {/* Metrics Row - No Cards */}
      <div className="grid grid-cols-4 gap-8 mb-12 pb-8 border-b border-zinc-100">
        <div>
          <p className="text-3xl font-medium tabular-nums text-zinc-900">{activeJobs.length}</p>
          <p className="text-sm text-zinc-500 mt-1">Active Jobs</p>
        </div>

        <div>
          <p className="text-3xl font-medium tabular-nums text-zinc-900">{jobsDueThisWeek.length}</p>
          <p className="text-sm text-zinc-500 mt-1">Due This Week</p>
          {overdueJobs.length > 0 && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {overdueJobs.length} overdue
            </p>
          )}
        </div>

        <div>
          <p className="text-3xl font-medium tabular-nums text-zinc-900">{formatCurrency(monthRevenue)}</p>
          <p className="text-sm text-zinc-500 mt-1">Revenue</p>
        </div>

        <div>
          <p className={`text-3xl font-medium tabular-nums ${totalSpread >= 0 ? 'text-zinc-900' : 'text-red-600'}`}>
            {formatCurrency(totalSpread)}
          </p>
          <p className="text-sm text-zinc-500 mt-1">Total Spread</p>
          {marginPercent > 0 && (
            <p className="text-xs text-zinc-400 mt-1">{marginPercent.toFixed(0)}% margin</p>
          )}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-12">
        {/* Needs Attention */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-500">Needs Attention</h2>
            {needsAttention.length > 0 && (
              <span className="text-xs tabular-nums text-zinc-400">{needsAttention.length}</span>
            )}
          </div>

          {needsAttention.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4">All caught up</p>
          ) : (
            <div className="space-y-0">
              {needsAttention.map((job) => {
                const isOverdue = job.dueDate && new Date(job.dueDate) < now;
                return (
                  <div
                    key={job.id}
                    onClick={() => handleJobClick(job)}
                    className="py-3 border-b border-zinc-100 last:border-0 cursor-pointer group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-900 group-hover:text-zinc-600 truncate">
                          {job.title || job.number}
                        </p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {job.number} · {job.customer?.name || 'No customer'}
                        </p>
                      </div>
                      <div className="ml-4 flex-shrink-0">
                        {isOverdue ? (
                          <span className="text-xs text-red-600 font-medium">Overdue</span>
                        ) : job.dueDate ? (
                          <span className="text-xs text-zinc-400">Due {formatDate(job.dueDate)}</span>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-500">Recent Jobs</h2>
            <button
              onClick={onViewAllJobs}
              className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1 transition-colors"
            >
              View all
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {recentJobs.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4">No jobs yet</p>
          ) : (
            <div className="space-y-0">
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => handleJobClick(job)}
                  className="py-3 border-b border-zinc-100 last:border-0 cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900 group-hover:text-zinc-600 truncate">
                        {job.title || job.number}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {job.number} · {job.customer?.name || 'No customer'}
                      </p>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <StatusText status={job.status} />
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

// Simple status text - no badge background
function StatusText({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: 'text-amber-600',
    PAID: 'text-green-600',
    CANCELLED: 'text-zinc-400',
  };

  const labels: Record<string, string> = {
    ACTIVE: 'Active',
    PAID: 'Paid',
    CANCELLED: 'Cancelled',
  };

  return (
    <span className={`text-xs ${colors[status] || 'text-zinc-400'}`}>
      {labels[status] || status}
    </span>
  );
}
