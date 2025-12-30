import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, Clock, AlertCircle, Circle, FileText, Database, Package, Truck, RefreshCw } from 'lucide-react';
import { Button, Badge } from './ui';
import { cn } from '../lib/utils';
import { jobsApi } from '../lib/api';

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

// QC Badge component
function QCBadge({
  status,
  label,
  count,
  isOverride
}: {
  status: 'sent' | 'missing' | 'na' | 'approved' | 'pending' | 'changes' | 'confirmed' | 'waiting';
  label: string;
  count?: number;
  isOverride?: boolean;
}) {
  const getStatusStyle = () => {
    switch (status) {
      case 'sent':
      case 'approved':
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'missing':
      case 'changes':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
      case 'waiting':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'na':
        return 'bg-gray-100 text-gray-500 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'sent':
      case 'approved':
      case 'confirmed':
        return <CheckCircle2 className="w-3 h-3" />;
      case 'missing':
      case 'changes':
        return <AlertCircle className="w-3 h-3" />;
      case 'pending':
      case 'waiting':
        return <Clock className="w-3 h-3" />;
      case 'na':
        return <Circle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border',
        getStatusStyle(),
        isOverride && 'ring-2 ring-orange-400 ring-offset-1'
      )}
      title={isOverride ? 'Manually set' : undefined}
    >
      {getIcon()}
      <span>{label}</span>
      {count !== undefined && count > 0 && <span className="opacity-70">({count})</span>}
    </span>
  );
}

// Format date for display
function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  // Render QC indicators for a job
  const renderQCIndicators = (job: WorkflowJob) => {
    const qc = job.qc;

    return (
      <div className="flex items-center gap-2 flex-wrap">
        {/* Artwork */}
        <QCBadge
          status={qc.artwork}
          label="Art"
          count={qc.artworkCount}
          isOverride={qc.artworkIsOverride}
        />

        {/* Data Files */}
        <QCBadge
          status={qc.data}
          label="Data"
          count={qc.data !== 'na' ? qc.dataCount : undefined}
          isOverride={qc.dataIsOverride}
        />

        {/* Vendor Confirmation */}
        <QCBadge
          status={qc.vendorConfirmed ? 'confirmed' : 'waiting'}
          label="Vendor"
          isOverride={qc.vendorIsOverride}
        />

        {/* Proof Status */}
        {(qc.hasProof || qc.proofIsOverride) && (
          <QCBadge
            status={
              qc.proofStatus === 'APPROVED' ? 'approved' :
              qc.proofStatus === 'CHANGES_REQUESTED' ? 'changes' :
              'pending'
            }
            label={`Proof${qc.proofVersion > 0 ? ` v${qc.proofVersion}` : ''}`}
            isOverride={qc.proofIsOverride}
          />
        )}

        {/* Tracking */}
        {qc.hasTracking && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200',
              qc.trackingIsOverride && 'ring-2 ring-orange-400 ring-offset-1'
            )}
            title={qc.trackingIsOverride ? 'Manually set' : undefined}
          >
            <Truck className="w-3 h-3" />
            Shipped
          </span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-red-600">{error}</p>
        <Button onClick={fetchWorkflowData} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Jobs Control Station</h2>
          <Badge variant="outline">
            {selectedCustomerId ? `${filteredJobCount} of ${totalActive}` : totalActive} Active Jobs
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            fetchWorkflowData();
            onRefresh?.();
          }}
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Customer Tabs */}
      {customers.length > 1 && (
        <div className="px-4 py-2 bg-white border-b overflow-x-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedCustomerId(null)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                !selectedCustomerId
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              All ({totalActive})
            </button>
            {customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => setSelectedCustomerId(customer.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                  selectedCustomerId === customer.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {customer.name} ({customer.jobCount})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Workflow Stages */}
      <div className="divide-y divide-gray-200">
        {filteredStages.map((stage) => {
          const isCollapsed = collapsedStages.has(stage.status);

          return (
            <div key={stage.status} className="bg-white">
              {/* Stage Header */}
              <button
                onClick={() => toggleStage(stage.status)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
                <span className="font-medium text-gray-900">{stage.label}</span>
                <Badge
                  variant={stage.count > 0 ? 'default' : 'outline'}
                  className={stage.count > 0 ? 'bg-blue-600' : ''}
                >
                  {stage.count}
                </Badge>
              </button>

              {/* Jobs Table */}
              {!isCollapsed && stage.jobs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-20">Job #</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-24">Cust PO</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Customer</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Vendor</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 w-20">Price</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 w-20">Spread</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 w-16">Qty</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-20">Due</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">QC Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stage.jobs.map((job) => {
                        const dueInfo = getDaysUntil(job.deliveryDate);

                        return (
                          <tr
                            key={job.id}
                            onClick={() => onSelectJob(job.id)}
                            className="hover:bg-blue-50 cursor-pointer transition-colors"
                          >
                            <td className="px-3 py-2">
                              <span className="font-mono text-blue-600 font-medium text-xs">
                                {job.jobNo}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="font-mono text-gray-600 text-xs truncate block max-w-[80px]">
                                {job.customerPONumber || '-'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-900">
                                {job.customerName}
                              </div>
                              {job.title && (
                                <div className="text-xs text-gray-500">
                                  {job.title}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-700 truncate max-w-[120px]">
                              {job.vendorName}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">
                              ${job.sellPrice?.toLocaleString() || '0'}
                            </td>
                            <td className={cn(
                              "px-3 py-2 text-right font-medium",
                              job.spread >= 0 ? 'text-green-600' : 'text-red-600'
                            )}>
                              ${job.spread?.toLocaleString() || '0'}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">
                              {job.quantity?.toLocaleString() || '-'}
                            </td>
                            <td className="px-3 py-2">
                              <span className={cn(
                                'font-medium text-xs',
                                dueInfo.urgent ? 'text-red-600' : 'text-gray-700'
                              )}>
                                {dueInfo.text}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {renderQCIndicators(job)}
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
                <div className="px-4 py-6 text-center text-gray-500 text-sm">
                  No jobs in this stage
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State for No Stages */}
      {filteredStages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Package className="w-12 h-12 mb-4 opacity-50" />
          <p>{selectedCustomerId ? 'No jobs for this customer' : 'No active jobs to display'}</p>
          {selectedCustomerId && (
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
            >
              Show all customers
            </button>
          )}
        </div>
      )}
    </div>
  );
}
