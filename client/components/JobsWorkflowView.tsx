import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, Clock, AlertCircle, Package, RefreshCw, X, Check, ClipboardList } from 'lucide-react';
import { Button, Badge } from './ui';
import { cn } from '../lib/utils';
import { jobsApi } from '../lib/api';
import { WORKFLOW_STAGES, getNextWorkflowStatuses } from './WorkflowStatusBadge';

interface QCIndicators {
  artwork: 'sent' | 'missing' | 'partial';
  artworkCount: number;
  artworkIsOverride: boolean;
  data: 'sent' | 'missing' | 'na';
  dataCount: number;
  dataIsOverride: boolean;
  vendorConfirmed: boolean;
  vendorConfirmedAt: string | null;
  vendorConfirmedBy: string | null;
  vendorIsOverride: boolean;
  vendorStatus: string | null;
  proofStatus: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | null;
  proofVersion: number;
  hasProof: boolean;
  proofIsOverride: boolean;
  hasTracking: boolean;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingIsOverride: boolean;
}

interface WorkflowJob {
  id: string;
  jobNo: string;
  title: string;
  workflowStatus: string;
  workflowUpdatedAt: string | null;
  deliveryDate: string | null;
  mailDate: string | null;
  inHomesDate: string | null;
  createdAt: string;
  quantity: number;
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
  qc: QCIndicators;
  activeTask: string | null;
  activeTaskCreatedAt: string | null;
  activeTaskCreatedBy: string | null;
}

interface WorkflowStage {
  status: string;
  label: string;
  count: number;
  jobs: WorkflowJob[];
}

interface JobsWorkflowViewProps {
  onSelectJob: (jobId: string) => void;
  onRefresh?: () => void;
}

// Days until due date
function getDaysUntil(dateString: string | null): { text: string; urgent: boolean } {
  if (!dateString) return { text: '-', urgent: false };
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d late`, urgent: true };
  if (diffDays === 0) return { text: 'Today', urgent: true };
  if (diffDays === 1) return { text: 'Tomorrow', urgent: true };
  if (diffDays <= 3) return { text: `${diffDays}d`, urgent: true };
  return { text: `${diffDays}d`, urgent: false };
}

export function JobsWorkflowView({ onSelectJob, onRefresh }: JobsWorkflowViewProps) {
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Task modal state
  const [taskModalJobId, setTaskModalJobId] = useState<string | null>(null);
  const [taskModalJobNo, setTaskModalJobNo] = useState<string>('');
  const [taskText, setTaskText] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  // Status update state
  const [updatingStatusJobId, setUpdatingStatusJobId] = useState<string | null>(null);

  // Handle workflow status change
  const handleStatusChange = async (jobId: string, newStatus: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setUpdatingStatusJobId(jobId);
    try {
      await jobsApi.updateWorkflowStatus(jobId, newStatus);
      fetchWorkflowData();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingStatusJobId(null);
    }
  };

  // Extract unique customers from all jobs
  const customers = useMemo(() => {
    const customerMap = new Map<string, { id: string; name: string; jobCount: number }>();
    stages.forEach(stage => {
      stage.jobs.forEach(job => {
        const existing = customerMap.get(job.customerId);
        if (existing) {
          existing.jobCount++;
        } else {
          customerMap.set(job.customerId, {
            id: job.customerId,
            name: job.customerName,
            jobCount: 1,
          });
        }
      });
    });
    return Array.from(customerMap.values()).sort((a, b) => b.jobCount - a.jobCount);
  }, [stages]);

  // Filter stages by selected customer
  const filteredStages = useMemo(() => {
    if (!selectedCustomerId) return stages;
    return stages.map(stage => ({
      ...stage,
      jobs: stage.jobs.filter(job => job.customerId === selectedCustomerId),
      count: stage.jobs.filter(job => job.customerId === selectedCustomerId).length,
    })).filter(stage => stage.count > 0);
  }, [stages, selectedCustomerId]);

  // Count filtered jobs
  const filteredJobCount = useMemo(() => {
    return filteredStages.reduce((sum, stage) => sum + stage.count, 0);
  }, [filteredStages]);

  // Fetch workflow data
  const fetchWorkflowData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await jobsApi.getWorkflowView();
      setStages(data.stages || []);
      setTotalActive(data.totalActive || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load workflow data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflowData();
  }, []);

  // Toggle stage collapse
  const toggleStage = (status: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  // Open task modal
  const openTaskModal = (jobId: string, jobNo: string, existingTask: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    setTaskModalJobId(jobId);
    setTaskModalJobNo(jobNo);
    setTaskText(existingTask || '');
  };

  // Save task
  const handleSaveTask = async () => {
    if (!taskModalJobId || !taskText.trim()) return;
    setSavingTask(true);
    try {
      await jobsApi.setTask(taskModalJobId, taskText.trim());
      setTaskModalJobId(null);
      setTaskText('');
      fetchWorkflowData();
    } catch (err) {
      console.error('Failed to save task:', err);
    } finally {
      setSavingTask(false);
    }
  };

  // Complete task
  const handleCompleteTask = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompletingTaskId(jobId);
    try {
      await jobsApi.completeTask(jobId);
      fetchWorkflowData();
    } catch (err) {
      console.error('Failed to complete task:', err);
    } finally {
      setCompletingTaskId(null);
    }
  };

  // Get QC status
  const getQCStatus = (qc: QCIndicators): { text: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral' } => {
    if (qc.hasTracking) return { text: 'Shipped', variant: 'info' };

    const missing: string[] = [];
    if (qc.artwork === 'missing') missing.push('Art');
    if (qc.data === 'missing') missing.push('Data');

    if (missing.length === 0) {
      if (qc.proofStatus === 'CHANGES_REQUESTED') return { text: 'Changes', variant: 'warning' };
      if (qc.proofStatus === 'PENDING' || (qc.hasProof && qc.proofStatus !== 'APPROVED')) return { text: 'Proof Pending', variant: 'warning' };
      if (qc.proofStatus === 'APPROVED') return { text: 'Ready', variant: 'success' };
      return { text: 'Files Ready', variant: 'success' };
    }

    return { text: `Need ${missing.join(', ')}`, variant: 'danger' };
  };

  // Render QC badge
  const renderQCBadge = (job: WorkflowJob) => {
    const status = getQCStatus(job.qc);
    const hasOverride = job.qc.artworkIsOverride || job.qc.dataIsOverride || job.qc.vendorIsOverride || job.qc.proofIsOverride;

    return (
      <Badge
        variant={status.variant}
        className={cn(hasOverride && 'ring-2 ring-status-warning ring-offset-1')}
        title={hasOverride ? 'Has manual overrides' : undefined}
      >
        {status.text}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-status-danger">{error}</p>
        <Button onClick={fetchWorkflowData} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border">
        <div className="flex items-center gap-4">
          <h2 className="font-display text-xl font-medium text-foreground tracking-tight">Jobs Control Station</h2>
          <span className="text-sm text-muted-foreground font-mono tabular-nums bg-muted px-2 py-0.5 rounded">
            {selectedCustomerId ? `${filteredJobCount} of ${totalActive}` : totalActive} active
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            fetchWorkflowData();
            onRefresh?.();
          }}
        >
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Customer Tabs - Editorial underline style */}
      {customers.length > 1 && (
        <div className="px-6 py-3 bg-card border-b border-border overflow-x-auto">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setSelectedCustomerId(null)}
              className={cn(
                'pb-2 text-sm font-medium tracking-wide transition-colors border-b-2',
                !selectedCustomerId
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              <span className="uppercase text-[11px] tracking-[0.08em]">All</span>
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">({totalActive})</span>
            </button>
            {customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                className={cn(
                  'pb-2 text-sm font-medium tracking-wide transition-colors border-b-2 whitespace-nowrap',
                  selectedCustomerId === customer.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <span className="uppercase text-[11px] tracking-[0.08em]">{customer.name}</span>
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">({customer.jobCount})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Workflow Stages */}
      <div className="divide-y divide-border">
        {filteredStages.map((stage) => {
          const isCollapsed = collapsedStages.has(stage.status);

          return (
            <div key={stage.status} className="bg-card">
              {/* Stage Header */}
              <button
                onClick={() => toggleStage(stage.status)}
                className="w-full flex items-center gap-4 px-6 py-4 bg-muted/50 hover:bg-muted transition-colors text-left"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="font-display text-base font-medium text-foreground">{stage.label}</span>
                <span className={cn(
                  'px-2 py-0.5 rounded text-xs font-mono tabular-nums',
                  stage.count > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  {stage.count}
                </span>
              </button>

              {/* Jobs Table */}
              {!isCollapsed && stage.jobs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left section-header w-24">Job #</th>
                        <th className="px-4 py-3 text-left section-header w-28">Customer PO</th>
                        <th className="px-4 py-3 text-left section-header">Customer</th>
                        <th className="px-4 py-3 text-left section-header w-28">Vendor</th>
                        <th className="px-4 py-3 text-left section-header w-40">Status</th>
                        <th className="px-4 py-3 text-left section-header w-20">Due</th>
                        <th className="px-4 py-3 text-right section-header w-24">Price</th>
                        <th className="px-4 py-3 text-right section-header w-24">Spread</th>
                        <th className="px-4 py-3 text-left section-header w-28">QC</th>
                        <th className="px-4 py-3 text-center section-header w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stage.jobs.map((job) => {
                        const dueInfo = getDaysUntil(job.deliveryDate);
                        const hasTask = !!job.activeTask;

                        return (
                          <tr
                            key={job.id}
                            onClick={() => onSelectJob(job.id)}
                            className={cn(
                              "cursor-pointer transition-colors",
                              hasTask
                                ? "bg-status-warning-bg hover:bg-status-warning-bg/80 border-l-4 border-l-status-warning"
                                : "hover:bg-accent/50"
                            )}
                          >
                            {/* Job # */}
                            <td className="px-4 py-4">
                              <span className="job-number text-status-info">
                                {job.jobNo}
                              </span>
                            </td>
                            {/* Customer PO */}
                            <td className="px-4 py-4">
                              {job.customerPONumber ? (
                                <span className="job-number text-base text-foreground">
                                  {job.customerPONumber}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              )}
                            </td>
                            {/* Customer + Title + Task */}
                            <td className="px-4 py-4">
                              <div className="font-medium text-foreground">
                                {job.customerName}
                              </div>
                              {job.title && (
                                <div className="text-xs text-muted-foreground truncate max-w-[200px] mt-0.5">
                                  {job.title}
                                </div>
                              )}
                              {hasTask && (
                                <div className="text-xs text-status-warning font-medium mt-1.5 truncate max-w-[200px] flex items-center gap-1" title={job.activeTask || ''}>
                                  <ClipboardList className="w-3 h-3" />
                                  {job.activeTask}
                                </div>
                              )}
                            </td>
                            {/* Vendor */}
                            <td className="px-4 py-4 text-muted-foreground text-xs truncate max-w-[120px]">
                              {job.vendorName}
                            </td>
                            {/* Status Dropdown */}
                            <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const currentStage = WORKFLOW_STAGES.find(s => s.status === job.workflowStatus);
                                const nextStages = getNextWorkflowStatuses(job.workflowStatus);
                                const isUpdating = updatingStatusJobId === job.id;

                                return (
                                  <select
                                    value={job.workflowStatus}
                                    onChange={(e) => handleStatusChange(job.id, e.target.value, e)}
                                    disabled={isUpdating}
                                    className={cn(
                                      'text-xs px-2 py-1.5 rounded border border-border cursor-pointer w-full',
                                      'bg-background hover:bg-accent focus:ring-2 focus:ring-ring',
                                      isUpdating && 'opacity-50 cursor-wait'
                                    )}
                                  >
                                    <option value={job.workflowStatus}>
                                      {currentStage?.label || job.workflowStatus}
                                    </option>
                                    {nextStages.length > 0 && (
                                      <optgroup label="Move to...">
                                        {nextStages.map(stage => (
                                          <option key={stage.status} value={stage.status}>
                                            → {stage.label}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </select>
                                );
                              })()}
                            </td>
                            {/* Due */}
                            <td className="px-4 py-4">
                              <span className={cn(
                                'font-mono text-xs tabular-nums',
                                dueInfo.urgent ? 'text-status-danger font-semibold' : 'text-muted-foreground'
                              )}>
                                {dueInfo.text}
                              </span>
                            </td>
                            {/* Price */}
                            <td className="px-4 py-4 text-right font-mono text-xs tabular-nums text-foreground">
                              ${job.sellPrice?.toLocaleString() || '0'}
                            </td>
                            {/* Spread */}
                            <td className={cn(
                              "px-4 py-4 text-right font-mono text-xs tabular-nums font-medium",
                              job.spread >= 0 ? 'text-status-success' : 'text-status-danger'
                            )}>
                              ${job.spread?.toLocaleString() || '0'}
                            </td>
                            {/* QC Status */}
                            <td className="px-4 py-4">
                              {renderQCBadge(job)}
                            </td>
                            {/* Actions */}
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-center gap-1">
                                {hasTask && (
                                  <button
                                    onClick={(e) => handleCompleteTask(job.id, e)}
                                    className="p-1.5 text-status-success hover:bg-status-success-bg rounded transition-colors"
                                    title="Complete task"
                                    disabled={completingTaskId === job.id}
                                  >
                                    {completingTaskId === job.id ? (
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Check className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={(e) => openTaskModal(job.id, job.jobNo, job.activeTask, e)}
                                  className={cn(
                                    "p-1.5 rounded transition-colors",
                                    hasTask
                                      ? "text-status-warning hover:bg-status-warning-bg"
                                      : "text-muted-foreground hover:text-status-info hover:bg-status-info-bg"
                                  )}
                                  title={hasTask ? "Edit task" : "Add task"}
                                >
                                  <ClipboardList className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Empty State */}
              {!isCollapsed && stage.jobs.length === 0 && (
                <div className="px-6 py-8 text-center text-muted-foreground text-sm">
                  No jobs in this stage
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State for No Stages */}
      {filteredStages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mb-4 opacity-40" />
          <p>{selectedCustomerId ? 'No jobs for this customer' : 'No active jobs to display'}</p>
          {selectedCustomerId && (
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="mt-3 text-status-info hover:text-status-info/80 text-sm font-medium"
            >
              Show all customers
            </button>
          )}
        </div>
      )}

      {/* Task Modal */}
      {taskModalJobId && (
        <div className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-50" onClick={() => setTaskModalJobId(null)}>
          <div className="bg-card rounded-lg shadow-xl w-full max-w-md mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-status-warning-bg rounded-t-lg">
              <h3 className="font-display font-medium text-foreground">
                Task - Job <span className="font-mono">{taskModalJobNo}</span>
              </h3>
              <button
                onClick={() => setTaskModalJobId(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-muted-foreground mb-3">
                Jobs with tasks are highlighted until marked complete.
              </p>
              <textarea
                value={taskText}
                onChange={(e) => setTaskText(e.target.value)}
                placeholder="What needs to be done for this job?"
                className="w-full h-28 px-3 py-2 border border-border rounded-lg resize-none bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-status-warning"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-border bg-muted/30 rounded-b-lg">
              <Button variant="outline" onClick={() => setTaskModalJobId(null)}>
                Cancel
              </Button>
              <Button
                variant="warning"
                onClick={handleSaveTask}
                disabled={!taskText.trim() || savingTask}
              >
                {savingTask ? 'Saving...' : 'Set Task'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
