import React, { useState, useEffect } from 'react';
import { Plus, Upload, Sparkles, AlertCircle, Clock, FileText } from 'lucide-react';
import { Button } from './ui';
import { JobDrawer } from './JobDrawer';
import { jobsApi } from '../lib/api';

interface Job {
  id: string;
  number: string;
  title: string;
  status: string;
  workflowStatus?: string;
  workflowStatusOverride?: string;
  sellPrice?: number;
  dueDate?: string;
  customer?: { id: string; name: string };
  vendor?: { name: string; isPartner?: boolean };
  createdAt?: string;
  bradfordRefNumber?: string;
  customerPONumber?: string;
  quantity?: number;
  // Financial fields
  profit?: {
    sellPrice?: number;
    totalCost?: number;
    spread?: number;
    paperMarkup?: number;
    bradfordTotal?: number;
    impactTotal?: number;
  };
  // Payment tracking
  customerPaymentDate?: string;
  customerPaymentAmount?: number;
  bradfordPaymentDate?: string;
  bradfordPaymentAmount?: number;
  vendorPaymentDate?: string;
  vendorPaymentAmount?: number;
  // Purchase orders for CPM data
  purchaseOrders?: any[];
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
  jobs: propJobs,
  onCreateJob,
  onShowSpecParser,
  onShowPOUploader,
  onViewAllJobs,
  onSelectJob,
  onEditJob,
  onRefresh,
}: DashboardViewProps) {
  const now = new Date();

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate job financials (same logic as FinancialsView)
  const getJobFinancials = (job: Job) => {
    const profit = job.profit || {};

    if (profit.totalCost && profit.totalCost > 0) {
      return {
        sellPrice: profit.sellPrice || Number(job.sellPrice) || 0,
        totalCost: profit.totalCost || 0,
        spread: profit.spread || 0,
        impactTotal: profit.impactTotal || 0,
      };
    }

    // Fallback CPM calculation
    const impactToBradfordPO = (job.purchaseOrders || []).find(
      (po: any) => po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford'
    );
    const bradfordToJDPO = (job.purchaseOrders || []).find(
      (po: any) => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
    );

    const paperCPM = impactToBradfordPO?.paperCPM || 0;
    const printCPM = bradfordToJDPO?.printCPM || 0;
    const qty = job.quantity || 0;
    const sellPrice = profit.sellPrice || Number(job.sellPrice) || 0;
    const hasCPMData = paperCPM > 0 && printCPM > 0;

    if (hasCPMData && qty > 0) {
      const paperCost = paperCPM * (qty / 1000);
      const paperMarkup = paperCost * 0.18;
      const mfgCost = printCPM * (qty / 1000);
      const totalCost = paperCost + paperMarkup + mfgCost;
      const spread = sellPrice - totalCost;

      return {
        sellPrice,
        totalCost,
        spread,
        impactTotal: spread / 2,
      };
    }

    return {
      sellPrice,
      totalCost: profit.totalCost || 0,
      spread: profit.spread || 0,
      impactTotal: profit.impactTotal || 0,
    };
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 mx-auto"></div>
          <p className="mt-4 text-zinc-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

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
            {jobsNeedingBradfordPO.map((job) => {
              const fin = getJobFinancials(job);
              return (
                <div
                  key={job.id}
                  onClick={() => handleJobClick(job)}
                  className="p-4 cursor-pointer hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {job.number} - {job.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {job.customer?.name || 'No customer'}
                        {job.dueDate && ` · Due ${formatDate(job.dueDate)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      {fin.sellPrice > 0 && (
                        <div className="text-right">
                          <p className="text-sm font-medium text-green-600 tabular-nums">{formatCurrency(fin.sellPrice)}</p>
                          {fin.spread !== 0 && (
                            <p className={`text-xs tabular-nums ${fin.spread >= 0 ? 'text-zinc-500' : 'text-red-500'}`}>
                              {fin.spread >= 0 ? '+' : ''}{formatCurrency(fin.spread)} spread
                            </p>
                          )}
                        </div>
                      )}
                      <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
                        Need Bradford PO#
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
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
            {actionItems.map(({ job, reason }) => {
              const fin = getJobFinancials(job);
              return (
                <div
                  key={job.id}
                  onClick={() => handleJobClick(job)}
                  className={`p-4 cursor-pointer transition-colors ${
                    reason === 'OVERDUE' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {job.number} - {job.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {job.customer?.name || 'No customer'}
                        {job.dueDate && ` · Due ${formatDate(job.dueDate)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      {fin.sellPrice > 0 && (
                        <div className="text-right">
                          <p className="text-sm font-medium text-green-600 tabular-nums">{formatCurrency(fin.sellPrice)}</p>
                          {fin.spread !== 0 && (
                            <p className={`text-xs tabular-nums ${fin.spread >= 0 ? 'text-zinc-500' : 'text-red-500'}`}>
                              {fin.spread >= 0 ? '+' : ''}{formatCurrency(fin.spread)} spread
                            </p>
                          )}
                        </div>
                      )}
                      {getReasonBadge(reason)}
                    </div>
                  </div>
                </div>
              );
            })}
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
        onRefresh={handleRefresh}
      />
    </div>
  );
}
