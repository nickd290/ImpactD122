import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, Clock, Package, ChevronDown, ChevronRight, Truck, FileText, X, Check, ClipboardList, MessageSquare, LayoutGrid, Calendar } from 'lucide-react';
import { Button, Badge } from './ui';
import { cn } from '../lib/utils';
import { jobsApi } from '../lib/api';
import { getSimplifiedStage, SIMPLIFIED_STAGES, SIMPLIFIED_STAGE_CONFIG } from './WorkflowStatusBadge';
import { WhatsMissing } from './WhatsMissing';

interface MaterialStatus {
  type: string;
  status: 'received' | 'pending' | 'issue' | 'na';
  note?: string;
}

interface ComponentStatus {
  id: string;
  name: string;
  artworkStatus: string;
  artworkLink?: string;
  materialStatus: string;
  trackingNumber?: string;
  trackingCarrier?: string;
  expectedArrival?: string;
  receivedAt?: string;
  notes?: string;
  dueDate?: string;
}

interface MeetingJob {
  id: string;
  jobNo: string;
  title: string;
  customerName: string;
  customerId?: string;
  vendorName: string;
  vendorId?: string;
  customerPONumber?: string;
  deliveryDate?: string;
  mailDate?: string;
  daysUntilDue: number | null;
  urgency: 'overdue' | 'today' | 'this_week' | 'later' | 'no_date';
  materials: MaterialStatus[];
  missing: string[];
  issues: string[];
  hasIssues: boolean;
  components: ComponentStatus[];
  hasComponents: boolean;
  hasPO: boolean;
  poSent: boolean;
  poNumber?: string;
  artReceived: boolean;
  dataReceived: boolean;
  activeTask?: string;
  proofStatus?: string;
  workflowStatus: string;
  // Shipping info
  inHomesDate?: string;
  shipToAddress?: string;
  shipToCity?: string;
  shipToState?: string;
  shipToZip?: string;
  shipToName?: string;
  shippingMethod?: string;
}

interface MeetingStats {
  total: number;
  needsArt: number;
  needsData: number;
  hasIssues: number;
  awaitingComponents: number;
  noPO: number;
}

interface ProductionMeetingViewProps {
  onSelectJob: (jobId: string) => void;
}

// Format date for display
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Urgency badge
function UrgencyBadge({ urgency, daysUntilDue }: { urgency: string; daysUntilDue: number | null }) {
  const config = {
    overdue: { bg: 'bg-red-100', text: 'text-red-800', label: daysUntilDue ? `${Math.abs(daysUntilDue)}d late` : 'Overdue' },
    today: { bg: 'bg-red-100', text: 'text-red-800', label: 'Today' },
    this_week: { bg: 'bg-amber-100', text: 'text-amber-800', label: daysUntilDue ? `${daysUntilDue}d` : 'This Week' },
    later: { bg: 'bg-gray-100', text: 'text-gray-700', label: daysUntilDue ? `${daysUntilDue}d` : 'Later' },
    no_date: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'No Date' },
  }[urgency] || { bg: 'bg-gray-100', text: 'text-gray-600', label: urgency };

  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', config.bg, config.text)}>
      {config.label}
    </span>
  );
}

// Material status indicator
function MaterialIndicator({ material }: { material: MaterialStatus }) {
  const hasNote = !!material.note;

  const statusConfig = {
    received: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    pending: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    issue: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
    na: { icon: null, color: 'text-gray-400', bg: 'bg-gray-50' },
  }[material.status] || { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-50' };

  const Icon = statusConfig.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
        statusConfig.bg,
        statusConfig.color,
        hasNote && 'ring-2 ring-orange-300'
      )}
      title={material.note || undefined}
    >
      {Icon && <Icon className="w-3 h-3" />}
      <span>{material.type}</span>
      {hasNote && <MessageSquare className="w-3 h-3 text-orange-500" />}
    </div>
  );
}

// Component row for multi-piece jobs
function ComponentRow({ component }: { component: ComponentStatus }) {
  const artStatus = component.artworkStatus === 'RECEIVED' ? 'received' : component.artworkStatus === 'NA' ? 'na' : 'pending';
  const matStatus = component.materialStatus === 'RECEIVED' ? 'received' : component.materialStatus === 'IN_TRANSIT' ? 'in_transit' : component.materialStatus === 'NA' ? 'na' : 'pending';

  return (
    <div className="flex items-center gap-3 py-1 text-xs">
      <span className="font-medium text-gray-700 w-24 truncate">{component.name}</span>

      {/* Art status */}
      <span className={cn(
        'px-1.5 py-0.5 rounded',
        artStatus === 'received' ? 'bg-green-100 text-green-700' :
        artStatus === 'na' ? 'bg-gray-100 text-gray-500' :
        'bg-amber-100 text-amber-700'
      )}>
        Art: {artStatus === 'received' ? '✓' : artStatus === 'na' ? '-' : '?'}
      </span>

      {/* Material/arrival status */}
      {matStatus !== 'na' && (
        <span className={cn(
          'px-1.5 py-0.5 rounded',
          matStatus === 'received' ? 'bg-green-100 text-green-700' :
          matStatus === 'in_transit' ? 'bg-blue-100 text-blue-700' :
          'bg-amber-100 text-amber-700'
        )}>
          {matStatus === 'received' ? 'Received' :
           matStatus === 'in_transit' ? `Transit${component.expectedArrival ? ` - ${formatDate(component.expectedArrival)}` : ''}` :
           'Pending'}
        </span>
      )}

      {component.trackingNumber && (
        <span className="text-gray-500 truncate max-w-[100px]" title={component.trackingNumber}>
          {component.trackingCarrier}: {component.trackingNumber}
        </span>
      )}

      {component.notes && (
        <span className="text-orange-600 truncate max-w-[150px]" title={component.notes}>
          {component.notes}
        </span>
      )}
    </div>
  );
}

export function ProductionMeetingView({ onSelectJob }: ProductionMeetingViewProps) {
  const [jobs, setJobs] = useState<MeetingJob[]>([]);
  const [stats, setStats] = useState<MeetingStats | null>(null);
  const [grouped, setGrouped] = useState<Record<string, MeetingJob[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'missing' | 'issues' | 'components'>('all');
  const [viewMode, setViewMode] = useState<'stage' | 'urgency'>('stage'); // Default to stage view

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await jobsApi.getProductionMeeting();
      setJobs(data.jobs || []);
      setStats(data.stats || null);
      setGrouped(data.grouped || {});
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Toggle section collapse
  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  // Toggle job expansion (for components)
  const toggleJobExpand = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  // Filter jobs
  const filterJobs = (jobList: MeetingJob[]) => {
    switch (filter) {
      case 'missing':
        return jobList.filter(j => j.missing.length > 0);
      case 'issues':
        return jobList.filter(j => j.hasIssues);
      case 'components':
        return jobList.filter(j => j.hasComponents);
      default:
        return jobList;
    }
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
        <Button onClick={fetchData} variant="outline">Retry</Button>
      </div>
    );
  }

  // Group jobs by simplified stage
  const jobsByStage = React.useMemo(() => {
    const byStage: Record<string, MeetingJob[]> = {};
    SIMPLIFIED_STAGES.forEach(s => { byStage[s.stage] = []; });

    jobs.forEach(job => {
      const simplified = getSimplifiedStage(job.workflowStatus);
      if (byStage[simplified.stage]) {
        byStage[simplified.stage].push(job);
      } else {
        byStage['NEW'].push(job);
      }
    });

    return byStage;
  }, [jobs]);

  // Sections based on view mode
  const sections = viewMode === 'stage'
    ? SIMPLIFIED_STAGES.map(stage => ({
        key: stage.stage,
        label: stage.label,
        jobs: jobsByStage[stage.stage] || [],
        color: `border-l-4 ${SIMPLIFIED_STAGE_CONFIG[stage.stage]?.bgColor || 'border-gray-300'}`,
        bgColor: SIMPLIFIED_STAGE_CONFIG[stage.stage]?.bgColor || 'bg-gray-50',
        emoji: SIMPLIFIED_STAGE_CONFIG[stage.stage]?.emoji || '',
      }))
    : [
        { key: 'overdue', label: 'Overdue', jobs: grouped.overdue || [], color: 'border-red-500', bgColor: 'bg-red-50', emoji: '🔴' },
        { key: 'today', label: 'Due Today', jobs: grouped.today || [], color: 'border-red-400', bgColor: 'bg-red-50', emoji: '🔴' },
        { key: 'this_week', label: 'Due This Week', jobs: grouped.this_week || [], color: 'border-amber-400', bgColor: 'bg-amber-50', emoji: '🟡' },
        { key: 'later', label: 'Later', jobs: grouped.later || [], color: 'border-gray-300', bgColor: 'bg-gray-50', emoji: '⚪' },
        { key: 'no_date', label: 'No Due Date', jobs: grouped.no_date || [], color: 'border-gray-200', bgColor: 'bg-gray-50', emoji: '❓' },
      ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Production Meeting</h1>
            <p className="text-sm text-gray-500 mt-1">ThreeZ Daily Review - Material Readiness</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('stage')}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'stage' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                By Stage
              </button>
              <button
                onClick={() => setViewMode('urgency')}
                className={cn(
                  'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'urgency' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <Calendar className="w-3.5 h-3.5" />
                By Due Date
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        {stats && (
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{stats.total}</span>
              <span className="text-gray-500">Active</span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            {stats.needsArt > 0 && (
              <button
                onClick={() => setFilter(filter === 'missing' ? 'all' : 'missing')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded',
                  filter === 'missing' ? 'bg-amber-100' : 'hover:bg-gray-100'
                )}
              >
                <span className="text-amber-600 font-medium">{stats.needsArt}</span>
                <span className="text-gray-600">Need Art</span>
              </button>
            )}
            {stats.needsData > 0 && (
              <button
                onClick={() => setFilter(filter === 'missing' ? 'all' : 'missing')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded',
                  filter === 'missing' ? 'bg-amber-100' : 'hover:bg-gray-100'
                )}
              >
                <span className="text-amber-600 font-medium">{stats.needsData}</span>
                <span className="text-gray-600">Need Data</span>
              </button>
            )}
            {stats.hasIssues > 0 && (
              <button
                onClick={() => setFilter(filter === 'issues' ? 'all' : 'issues')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded',
                  filter === 'issues' ? 'bg-orange-100' : 'hover:bg-gray-100'
                )}
              >
                <AlertCircle className="w-4 h-4 text-orange-500" />
                <span className="text-orange-600 font-medium">{stats.hasIssues}</span>
                <span className="text-gray-600">With Issues</span>
              </button>
            )}
            {stats.awaitingComponents > 0 && (
              <button
                onClick={() => setFilter(filter === 'components' ? 'all' : 'components')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded',
                  filter === 'components' ? 'bg-blue-100' : 'hover:bg-gray-100'
                )}
              >
                <Package className="w-4 h-4 text-blue-500" />
                <span className="text-blue-600 font-medium">{stats.awaitingComponents}</span>
                <span className="text-gray-600">Awaiting Parts</span>
              </button>
            )}
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="text-gray-500 hover:text-gray-700 text-xs underline"
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Job List */}
      <div className="flex-1 overflow-auto">
        {sections.map(section => {
          const filteredJobs = filterJobs(section.jobs);
          if (filteredJobs.length === 0 && section.key !== 'overdue' && section.key !== 'today') return null;

          const isCollapsed = collapsedSections.has(section.key);

          return (
            <div key={section.key} className={cn('border-b', section.bgColor)}>
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.key)}
                className={cn(
                  'w-full flex items-center gap-3 px-6 py-3 text-left border-l-4',
                  section.color
                )}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
                <span className="font-semibold text-gray-900">{section.label}</span>
                <Badge variant={filteredJobs.length > 0 ? 'default' : 'outline'}>
                  {filteredJobs.length}
                </Badge>
              </button>

              {/* Jobs */}
              {!isCollapsed && (
                <div className="bg-white">
                  {filteredJobs.length === 0 ? (
                    <div className="px-6 py-4 text-sm text-gray-500 text-center">
                      No jobs in this section
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-y text-xs text-gray-600">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium w-24">Job</th>
                          <th className="px-4 py-2 text-left font-medium">Customer / Title</th>
                          <th className="px-4 py-2 text-left font-medium w-28">Customer PO</th>
                          <th className="px-4 py-2 text-left font-medium w-24">Due</th>
                          <th className="px-4 py-2 text-left font-medium w-28">Ship Date</th>
                          <th className="px-4 py-2 text-left font-medium w-32">Ship To</th>
                          <th className="px-4 py-2 text-left font-medium">What's Needed</th>
                          <th className="px-4 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredJobs.map(job => {
                          const isExpanded = expandedJobs.has(job.id);

                          return (
                            <React.Fragment key={job.id}>
                              <tr
                                onClick={() => onSelectJob(job.id)}
                                className={cn(
                                  'cursor-pointer hover:bg-blue-50 transition-colors',
                                  job.hasIssues && 'bg-orange-50/50',
                                  job.activeTask && 'bg-amber-50 border-l-4 border-l-amber-400'
                                )}
                              >
                                {/* Job # */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {job.hasComponents && (
                                      <button
                                        onClick={(e) => toggleJobExpand(job.id, e)}
                                        className="p-0.5 hover:bg-gray-200 rounded"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="w-3 h-3 text-gray-500" />
                                        ) : (
                                          <ChevronRight className="w-3 h-3 text-gray-500" />
                                        )}
                                      </button>
                                    )}
                                    <span className="font-mono text-blue-600 font-medium text-xs">
                                      {job.jobNo}
                                    </span>
                                  </div>
                                </td>

                                {/* Customer / Title */}
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{job.customerName}</div>
                                  {job.title && (
                                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{job.title}</div>
                                  )}
                                  {job.activeTask && (
                                    <div className="text-xs text-amber-700 font-medium mt-1 truncate max-w-[200px]">
                                      Task: {job.activeTask}
                                    </div>
                                  )}
                                </td>

                                {/* Customer PO */}
                                <td className="px-4 py-3">
                                  {job.customerPONumber ? (
                                    <span className="font-medium text-gray-900">{job.customerPONumber}</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>

                                {/* Due Date */}
                                <td className="px-4 py-3">
                                  <UrgencyBadge urgency={job.urgency} daysUntilDue={job.daysUntilDue} />
                                </td>

                                {/* Ship Date */}
                                <td className="px-4 py-3">
                                  {job.inHomesDate ? (
                                    <span className="text-gray-700 text-xs">{formatDate(job.inHomesDate)}</span>
                                  ) : (
                                    <span className="text-gray-400 text-xs">-</span>
                                  )}
                                </td>

                                {/* Ship To */}
                                <td className="px-4 py-3">
                                  {job.shipToCity || job.shipToState ? (
                                    <div className="text-xs">
                                      <span className="text-gray-700">{[job.shipToCity, job.shipToState].filter(Boolean).join(', ')}</span>
                                      {job.shippingMethod && (
                                        <div className="text-gray-500 text-[10px] mt-0.5">{job.shippingMethod}</div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs">-</span>
                                  )}
                                </td>

                                {/* What's Needed */}
                                <td className="px-4 py-3">
                                  {job.missing.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {job.missing.map((item, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-medium">
                                          {item}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-green-600 text-xs font-medium flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Ready
                                    </span>
                                  )}
                                </td>

                                {/* Status / Issues */}
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-1">
                                    {job.materials.map((mat, i) => (
                                      <MaterialIndicator key={i} material={mat} />
                                    ))}
                                  </div>
                                  {job.issues.length > 0 && (
                                    <div className="mt-1 text-xs text-orange-600 truncate max-w-[200px]" title={job.issues.join('; ')}>
                                      {job.issues[0]}
                                    </div>
                                  )}
                                </td>
                              </tr>

                              {/* Expanded components */}
                              {isExpanded && job.hasComponents && (
                                <tr>
                                  <td colSpan={8} className="bg-gray-50 px-8 py-3 border-l-4 border-l-blue-300">
                                    <div className="text-xs text-gray-600 font-medium mb-2">Components:</div>
                                    {job.components.map(comp => (
                                      <ComponentRow key={comp.id} component={comp} />
                                    ))}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
