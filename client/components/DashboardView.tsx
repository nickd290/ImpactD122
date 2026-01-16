import React, { useState } from 'react';
import { Plus, Upload, Sparkles, AlertCircle, Clock, FileText } from 'lucide-react';
import { Button } from './ui';
import { JobDrawer } from './JobDrawer';

interface Job {
  id: string;
  number: string;
  title: string;
  status: string;
  workflowStatus?: string;
  workflowStatusOverride?: string;
  sellPrice?: number;
  dueDate?: string;
  customer?: { name: string };
  vendor?: { name: string; isPartner?: boolean };
  createdAt?: string;
  bradfordRefNumber?: string;
  profit?: { spread?: number };
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
  pendingEmailsCount?: number;
  unpaidInvoicesTotal?: number;
}

export function DashboardView({
  jobs,
  onCreateJob,
  onShowSpecParser,
  onShowPOUploader,
  onViewAllJobs,
  onSelectJob,
  onEditJob,
  onRefresh,
}: DashboardViewProps) {
  const now = new Date();

  // Drawer state for slide-out panel
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Get effective workflow status (override takes precedence)
  const getEffectiveStatus = (job: Job) => job.workflowStatusOverride || job.workflowStatus || 'NEW_JOB';

  // Jobs missing Bradford PO number (bradfordRefNumber field is empty/null)
  // Only for jobs with Bradford as vendor
  const jobsNeedingBradfordPO = jobs.filter(j => {
    const isBradfordJob = j.vendor?.name?.toLowerCase().includes('bradford') || j.vendor?.isPartner;
    return j.status === 'ACTIVE' && isBradfordJob && !j.bradfordRefNumber;
  });

  // Jobs needing action:
  // 1. Overdue jobs
  // 2. Jobs with proofs received (awaiting review)
  // 3. Jobs awaiting customer response
  const overdueJobs = jobs.filter(j => {
    if (j.status !== 'ACTIVE' || !j.dueDate) return false;
    return new Date(j.dueDate) < now;
  });

  const proofReceivedJobs = jobs.filter(j => {
    if (j.status !== 'ACTIVE') return false;
    const status = getEffectiveStatus(j);
    return status === 'PROOF_RECEIVED';
  });

  const awaitingResponseJobs = jobs.filter(j => {
    if (j.status !== 'ACTIVE') return false;
    const status = getEffectiveStatus(j);
    return status === 'AWAITING_CUSTOMER_RESPONSE' || status === 'PROOF_SENT_TO_CUSTOMER';
  });

  // Combine action items (deduplicated)
  const actionItemsMap = new Map<string, { job: Job; reason: string; priority: number }>();

  overdueJobs.forEach(job => {
    actionItemsMap.set(job.id, { job, reason: 'OVERDUE', priority: 1 });
  });

  proofReceivedJobs.forEach(job => {
    if (!actionItemsMap.has(job.id)) {
      actionItemsMap.set(job.id, { job, reason: 'PROOF_RECEIVED', priority: 2 });
    }
  });

  awaitingResponseJobs.forEach(job => {
    if (!actionItemsMap.has(job.id)) {
      actionItemsMap.set(job.id, { job, reason: 'AWAITING_RESPONSE', priority: 3 });
    }
  });

  const actionItems = Array.from(actionItemsMap.values())
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 10);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleJobClick = (job: Job) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
    if (onSelectJob) {
      onSelectJob(job);
    }
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

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-600 text-white">
            <AlertCircle className="w-3 h-3" />
            Overdue
          </span>
        );
      case 'PROOF_RECEIVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-600 text-white">
            <FileText className="w-3 h-3" />
            Proof Ready
          </span>
        );
      case 'AWAITING_RESPONSE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-600 text-white">
            <Clock className="w-3 h-3" />
            Awaiting Response
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-8 lg:p-12 max-w-4xl animate-fade-in">
      {/* Header with Actions */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <div className="flex items-center gap-2">
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

      {/* Bradford PO Numbers Needed */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Bradford PO Numbers Needed
          </h2>
          {jobsNeedingBradfordPO.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
              {jobsNeedingBradfordPO.length}
            </span>
          )}
        </div>

        {jobsNeedingBradfordPO.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">All Bradford jobs have PO numbers</p>
          </div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-lg divide-y divide-zinc-100">
            {jobsNeedingBradfordPO.map((job) => (
              <div
                key={job.id}
                onClick={() => handleJobClick(job)}
                className="p-4 cursor-pointer hover:bg-zinc-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {job.number} - {job.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {job.customer?.name || 'No customer'}
                      {job.dueDate && ` · Due ${formatDate(job.dueDate)}`}
                    </p>
                  </div>
                  <span className="text-xs text-amber-600 font-medium">
                    Need Bradford PO#
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Jobs Needing Action */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Jobs Needing Action
          </h2>
          {actionItems.length > 0 && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              overdueJobs.length > 0 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {actionItems.length}
            </span>
          )}
        </div>

        {actionItems.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">All caught up!</p>
            <p className="text-xs text-emerald-600 mt-1">No jobs need immediate attention</p>
          </div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-lg divide-y divide-zinc-100">
            {actionItems.map(({ job, reason }) => (
              <div
                key={job.id}
                onClick={() => handleJobClick(job)}
                className={`p-4 cursor-pointer transition-colors ${
                  reason === 'OVERDUE' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {job.number} - {job.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {job.customer?.name || 'No customer'}
                      {job.dueDate && ` · Due ${formatDate(job.dueDate)}`}
                    </p>
                  </div>
                  {getReasonBadge(reason)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job Drawer - Slide out from right */}
      <JobDrawer
        job={selectedJob ? {
          ...selectedJob,
          number: selectedJob.number,
        } : null}
        isOpen={isDrawerOpen}
        onClose={handleDrawerClose}
        onEdit={handleEdit}
        onRefresh={onRefresh}
      />
    </div>
  );
}
