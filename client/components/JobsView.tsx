import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Search, Sparkles, Upload, FileText, Edit, Trash2, FileSpreadsheet, CheckSquare, Square, ChevronDown, ChevronRight, MoreVertical, DollarSign, Printer, Receipt, Building2, Copy, FileDown, Mail, ArrowUpDown, Clock, AlertCircle, Filter, CheckCircle2, RotateCcw, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Tabs } from './ui';
import { Input } from './ui';
import { Badge } from './ui';
import { StatusBadge } from './ui/StatusBadge';
import { JobDetailModal } from './JobDetailModal';
import { InlineEditableCell } from './InlineEditableCell';
import { StatusDropdown } from './StatusDropdown';
import { cn } from '../lib/utils';
import { pdfApi, jobsApi } from '../lib/api';
import {
  type OpsStage,
  getOpsStage,
  opsStageLabel,
  isClientPaid,
  isInvoiced,
  needsVendorPay,
  impactProductionPayee,
  moneyStatusBadges,
  getMoneyStage,
  effectiveWorkflow,
  isPaymentOverdue,
  getDaysPaymentOverdue,
  isProductionLate,
  getDaysProductionLate,
  getPaymentDueDate,
  getDeliveryDate,
  paymentTermsLabel,
  getPaymentTermsDays,
} from '../lib/jobPipeline';

interface Job {
  id: string;
  title: string;
  number: string;
  status: string;
  workflowStatus?: string;
  workflowStatusOverride?: string;
  isDuplicate?: boolean;
  customerPONumber?: string;
  partnerPONumber?: string;
  customer?: { id: string; name: string };
  vendor?: { name: string; isPartner?: boolean };
  createdAt?: string;
  updatedAt?: string;
  quantity?: number;
  dueDate?: string;
  mailDate?: string;
  inHomesDate?: string;
  lineItems?: any[];
  // Document tracking fields
  quoteGeneratedAt?: string;
  quoteGeneratedCount?: number;
  poGeneratedAt?: string;
  poGeneratedCount?: number;
  invoiceGeneratedAt?: string;
  invoiceGeneratedCount?: number;
  customerInvoiceNumber?: string;
  invoiceNumber?: string;
  paymentTermsDays?: number;
  paymentDueDate?: string;
  deliveryDate?: string;
  // Invoice/payment tracking
  hasPaidInvoice?: boolean;
  invoices?: { id: string; amount: number | null; paidAt: string | null }[];
  sellPrice?: number;
  profit?: { totalCost?: number };
  purchaseOrders?: any[];
  customerPaymentDate?: string;
  customerPaymentAmount?: number;
  customerPaymentPaid?: boolean;
  bradfordPaymentDate?: string;
  bradfordPaymentPaid?: boolean;
  jdPaymentDate?: string;
  jdPaymentPaid?: boolean;
  paperSource?: string;
}

/**
 * Primary filters — floor sequence + money after complete.
 * Active = still on floor (new / proof / production).
 */
type BoardTab =
  | 'active'
  | 'new'
  | 'proofing'
  | 'production'
  | 'complete'
  | 'await_client'
  | 'pay_vendors'
  | 'settled'
  | 'all';

function isJobDone(job: Job): boolean {
  if (job.status === 'PAID' || job.status === 'CANCELLED') return true;
  return getOpsStage(job) === 'complete';
}

function jobMatchesTab(
  job: Job,
  tab: BoardTab,
  optimisticallyPaidIds?: Set<string>
): boolean {
  if (tab === 'all') return true;
  if (job.status === 'CANCELLED' && tab !== 'all') return false;

  const ops = getOpsStage(job);
  const clientPaid = optimisticallyPaidIds?.has(job.id) || isClientPaid(job);
  const money = clientPaid
    ? needsVendorPay({ ...job, customerPaymentDate: job.customerPaymentDate || 'paid' })
      ? 'pay_vendor'
      : 'settled'
    : getMoneyStage(job);

  switch (tab) {
    case 'active':
      return ops === 'new' || ops === 'proofing' || ops === 'production';
    case 'new':
      return ops === 'new';
    case 'proofing':
      return ops === 'proofing';
    case 'production':
      return ops === 'production';
    case 'complete':
      return ops === 'complete';
    case 'await_client':
      return ops === 'complete' && !clientPaid;
    case 'pay_vendors':
      return needsVendorPay(job) || (clientPaid && money === 'pay_vendor');
    case 'settled':
      return money === 'settled' || (clientPaid && !needsVendorPay(job) && ops === 'complete');
    default:
      return true;
  }
}

interface JobsViewProps {
  jobs: Job[];
  customers: any[];
  vendors: any[];
  selectedJob: Job | null;
  onSelectJob: (job: Job) => void;
  onCreateJob: () => void;
  onEditJob: (job: Job) => void;
  onDeleteJob: (job: Job) => void;
  onCopyJob?: (job: Job) => void;
  onUpdateStatus: (jobId: string, status: string) => void;
  onUpdateJob?: (jobId: string, jobData: any) => Promise<void>;
  onRefresh: () => void;
  onShowSpecParser: () => void;
  onShowPOUploader: () => void;
  onShowEmailDraft: (job: Job) => void;
  onShowExcelImporter?: () => void;
  isDrawerOpen?: boolean;
  onOpenDrawer?: () => void;
  onCloseDrawer?: () => void;
}

export function JobsView({
  jobs,
  customers,
  vendors,
  selectedJob,
  onSelectJob,
  onCreateJob,
  onEditJob,
  onDeleteJob,
  onCopyJob,
  onUpdateStatus,
  onUpdateJob,
  onRefresh,
  onShowSpecParser,
  onShowPOUploader,
  onShowEmailDraft,
  onShowExcelImporter,
  isDrawerOpen: controlledOpen,
  onOpenDrawer,
  onCloseDrawer,
}: JobsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  /** Default = floor work; money tabs surface client-paid → still owe BGE/JD */
  const [activeTab, setActiveTab] = useState<BoardTab>('active');
  // Local open state; parent can also force open (search / action items)
  const [localOpen, setLocalOpen] = useState(false);
  useEffect(() => {
    if (controlledOpen) setLocalOpen(true);
  }, [controlledOpen, selectedJob?.id]);
  const isDrawerOpen = localOpen;
  const setIsDrawerOpen = (open: boolean) => {
    setLocalOpen(open);
    if (open) onOpenDrawer?.();
    else onCloseDrawer?.();
  };

  // Local jobs state - fetch our own data instead of relying on props
  const [localJobs, setLocalJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Sorting state
  const [sortBy, setSortBy] = useState<'recent' | 'due' | 'alpha' | 'customer'>('recent');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Secondary: overdue / due-soon only (money is primary tabs)
  const [quickFilter, setQuickFilter] = useState<'all' | 'overdue' | 'due-soon'>('all');
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [collapsedCustomers, setCollapsedCustomers] = useState<Set<string>>(new Set());
  const [isPaymentMenuOpen, setIsPaymentMenuOpen] = useState(false);
  const [isDocMenuOpen, setIsDocMenuOpen] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const paymentMenuRef = useRef<HTMLDivElement>(null);
  const docMenuRef = useRef<HTMLDivElement>(null);
  const [optimisticallyPaidIds, setOptimisticallyPaidIds] = useState<Set<string>>(new Set());
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [statementCustomerId, setStatementCustomerId] = useState('');
  /** Mark invoiced (legacy / migration) modal */
  const [invoiceModalJob, setInvoiceModalJob] = useState<Job | null>(null);
  const [invoiceModalNo, setInvoiceModalNo] = useState('');
  const [invoiceModalDate, setInvoiceModalDate] = useState('');
  const [invoiceModalSaving, setInvoiceModalSaving] = useState(false);

  // Load jobs on mount and when refresh is triggered
  const loadLocalJobs = async () => {
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

  // Fetch jobs on mount
  useEffect(() => {
    loadLocalJobs();
  }, []);

  // Wrap onRefresh to also reload local jobs
  const handleRefresh = async () => {
    await loadLocalJobs();
    onRefresh();
  };

  const tabFilteredJobs = useMemo(() => {
    return localJobs.filter((job) => jobMatchesTab(job, activeTab, optimisticallyPaidIds));
  }, [localJobs, activeTab, optimisticallyPaidIds]);

  const tabCounts = useMemo(() => {
    const counts: Record<BoardTab, number> = {
      active: 0,
      new: 0,
      proofing: 0,
      production: 0,
      complete: 0,
      await_client: 0,
      pay_vendors: 0,
      settled: 0,
      all: localJobs.length,
    };
    for (const job of localJobs) {
      (['active', 'new', 'proofing', 'production', 'complete', 'await_client', 'pay_vendors', 'settled'] as BoardTab[]).forEach(
        (t) => {
          if (jobMatchesTab(job, t, optimisticallyPaidIds)) counts[t]++;
        }
      );
    }
    return counts;
  }, [localJobs, optimisticallyPaidIds]);

  const floorTabs: { id: BoardTab; label: string; count: number; title: string }[] = [
    { id: 'active', label: 'Active', count: tabCounts.active, title: 'New + Proofing + Production' },
    { id: 'new', label: 'New', count: tabCounts.new, title: 'Just entered' },
    { id: 'proofing', label: 'Proofing', count: tabCounts.proofing, title: 'Proof cycle' },
    { id: 'production', label: 'Production', count: tabCounts.production, title: 'Approved / on press' },
    { id: 'complete', label: 'Complete', count: tabCounts.complete, title: 'Produced — money next' },
  ];

  const moneyTabs: { id: BoardTab; label: string; count: number; title: string }[] = [
    { id: 'await_client', label: 'Await client', count: tabCounts.await_client, title: 'Invoice out — waiting on customer $' },
    {
      id: 'pay_vendors',
      label: 'Impact paid → pay BGE/JD',
      count: tabCounts.pay_vendors,
      title: 'Customer paid Impact — still mark BGE or JD (JD paper also needs Bradford commission)',
    },
    {
      id: 'settled',
      label: 'Complete',
      count: tabCounts.settled,
      title: 'Client + production (+ commission if JD paper) all marked',
    },
    { id: 'all', label: 'All', count: tabCounts.all, title: 'Everything' },
  ];

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (paymentMenuRef.current && !paymentMenuRef.current.contains(event.target as Node)) {
        setIsPaymentMenuOpen(false);
      }
      if (docMenuRef.current && !docMenuRef.current.contains(event.target as Node)) {
        setIsDocMenuOpen(false);
      }
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }
      // Close action menu when clicking outside
      if (openActionMenuId) {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-action-menu]')) {
          setOpenActionMenuId(null);
        }
      }
    };

    if (isPaymentMenuOpen || isDocMenuOpen || openActionMenuId || isSortMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isPaymentMenuOpen, isDocMenuOpen, openActionMenuId, isSortMenuOpen]);

  // Helper to check if job is new (created in last 24 hours)
  const isNewJob = (job: Job) => {
    if (!job.createdAt) return false;
    const createdDate = new Date(job.createdAt);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return createdDate > yesterday;
  };

  /** Days until payment due (AR) or delivery (floor). null if n/a */
  const getDaysUntilRelevant = (job: Job): number | null => {
    const ops = getOpsStage(job);
    const target =
      ops === 'complete' || isInvoiced(job)
        ? getPaymentDueDate(job)
        : getDeliveryDate(job);
    if (!target) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(target);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Overdue = payment overdue (terms) OR production late (floor only)
  const filterCounts = useMemo(() => {
    return {
      overdue: tabFilteredJobs.filter(
        (j) => isPaymentOverdue(j) || isProductionLate(j)
      ).length,
      'due-soon': tabFilteredJobs.filter((j) => {
        if (isPaymentOverdue(j) || isProductionLate(j) || isClientPaid(j)) return false;
        const days = getDaysUntilRelevant(j);
        return days !== null && days >= 0 && days <= 7;
      }).length,
    };
  }, [tabFilteredJobs]);

  // Search: when typing, always search across ALL jobs (not trapped in Active/Production)
  const searchBaseJobs = useMemo(() => {
    if (searchTerm.trim()) return localJobs;
    return tabFilteredJobs;
  }, [searchTerm, localJobs, tabFilteredJobs]);

  const searchFilteredJobs = searchBaseJobs.filter((job: Job) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      job.title?.toLowerCase().includes(q) ||
      job.number?.toLowerCase().includes(q) ||
      job.customerPONumber?.toLowerCase().includes(q) ||
      job.partnerPONumber?.toLowerCase().includes(q) ||
      job.customer?.name?.toLowerCase().includes(q) ||
      job.vendor?.name?.toLowerCase().includes(q)
    );
  });

  // Apply overdue / due-soon filter (payment terms for AR; delivery for floor)
  const quickFilteredJobs = useMemo(() => {
    return searchFilteredJobs.filter((job) => {
      if (quickFilter === 'all') return true;
      if (quickFilter === 'overdue') {
        return isPaymentOverdue(job) || isProductionLate(job);
      }
      if (quickFilter === 'due-soon') {
        if (isPaymentOverdue(job) || isProductionLate(job) || isClientPaid(job)) return false;
        const days = getDaysUntilRelevant(job);
        return days !== null && days >= 0 && days <= 7;
      }
      return true;
    });
  }, [searchFilteredJobs, quickFilter]);

  // Apply sorting
  const filteredJobs = useMemo(() => {
    const sorted = [...quickFilteredJobs];
    if (sortBy === 'recent') {
      sorted.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA; // Newest first
      });
    } else if (sortBy === 'due') {
      sorted.sort((a, b) => {
        const da = getPaymentDueDate(a) || getDeliveryDate(a);
        const db = getPaymentDueDate(b) || getDeliveryDate(b);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
      });
    } else if (sortBy === 'alpha') {
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortBy === 'customer') {
      sorted.sort((a, b) => (a.customer?.name || '').localeCompare(b.customer?.name || ''));
    }
    return sorted;
  }, [quickFilteredJobs, sortBy]);

  // Sort label helper
  const sortLabels: Record<string, string> = {
    recent: 'Recently Added',
    due: 'Due Soon',
    alpha: 'Alphabetical',
    customer: 'Customer',
  };

  // Handle inline field updates — optimistic local list + API
  const handleInlineUpdate = async (jobId: string, field: string, value: string) => {
    const next = value.trim() || null;
    setLocalJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, [field]: next } : j))
    );
    try {
      if (onUpdateJob) {
        await onUpdateJob(jobId, { [field]: next });
      } else {
        await jobsApi.update(jobId, { [field]: next });
      }
    } catch (e) {
      toast.error(`Failed to save ${field}`);
      await loadLocalJobs();
      throw e;
    }
  };

  // Handle status change
  const handleStatusChange = async (jobId: string, newStatus: string) => {
    await onUpdateStatus(jobId, newStatus);
  };

  // Group jobs by customer
  const jobsByCustomer = useMemo(() => {
    const grouped = new Map<string, { customer: { id: string; name: string }; jobs: Job[] }>();

    filteredJobs.forEach((job) => {
      const customerId = job.customer?.id || 'no-customer';
      const customerName = job.customer?.name || 'No Customer';

      if (!grouped.has(customerId)) {
        grouped.set(customerId, {
          customer: { id: customerId, name: customerName },
          jobs: [],
        });
      }

      grouped.get(customerId)!.jobs.push(job);
    });

    // Sort by customer name
    return Array.from(grouped.values()).sort((a, b) =>
      (a.customer?.name ?? '').localeCompare(b.customer?.name ?? '')
    );
  }, [filteredJobs]);

  // Initialize all customers as collapsed by default
  useEffect(() => {
    const allCustomerIds = new Set(jobsByCustomer.map(group => group.customer.id));
    setCollapsedCustomers(allCustomerIds);
  }, [jobsByCustomer.length]); // Only re-run when number of customers changes

  const toggleCustomerCollapse = (customerId: string) => {
    const newCollapsed = new Set(collapsedCustomers);
    if (newCollapsed.has(customerId)) {
      newCollapsed.delete(customerId);
    } else {
      newCollapsed.add(customerId);
    }
    setCollapsedCustomers(newCollapsed);
  };

  const handleRowClick = (job: Job) => {
    // Open full job popup (not sidebar / not edit form)
    onSelectJob(job);
    setIsDrawerOpen(true);
  };

  const handleToggleSelection = (jobId: string) => {
    const newSelection = new Set(selectedJobIds);
    if (newSelection.has(jobId)) {
      newSelection.delete(jobId);
    } else {
      newSelection.add(jobId);
    }
    setSelectedJobIds(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedJobIds.size === filteredJobs.length && filteredJobs.length > 0) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(filteredJobs.map(job => job.id)));
    }
  };

  const handleClearSelection = () => setSelectedJobIds(new Set());

  const handleSelectUnpaid = () => {
    const unpaid = filteredJobs.filter((j) => !isClientPaid(j) && j.status !== 'CANCELLED');
    setSelectedJobIds(new Set(unpaid.map((j) => j.id)));
    toast.message(`Selected ${unpaid.length} client-unpaid job${unpaid.length === 1 ? '' : 's'}`);
  };

  /** Select jobs where client paid us but Impact production payee still due */
  const handleSelectVendorDue = () => {
    const due = filteredJobs.filter((j) => needsVendorPay(j));
    setSelectedJobIds(new Set(due.map((j) => j.id)));
    toast.message(`Selected ${due.length} — client paid, Impact still owes BGE or JD`);
  };

  const handleSelectActiveOnly = () => {
    const active = filteredJobs.filter((j) => j.status === 'ACTIVE' && !isJobDone(j));
    setSelectedJobIds(new Set(active.map((j) => j.id)));
  };

  const handleSelectByCustomer = (customerId: string) => {
    const ids = filteredJobs
      .filter((j) => (j.customer?.id || 'no-customer') === customerId)
      .map((j) => j.id);
    setSelectedJobIds(new Set(ids));
  };

  const handleBatchDelete = async () => {
    if (selectedJobIds.size === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedJobIds.size} job${selectedJobIds.size > 1 ? 's' : ''}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const response = await fetch('/api/jobs/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobIds: Array.from(selectedJobIds) }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete jobs');
      }

      const result = await response.json();
      alert(`Successfully deleted ${result.deleted} job${result.deleted > 1 ? 's' : ''}`);
      setSelectedJobIds(new Set());
      await handleRefresh();
    } catch (error: any) {
      console.error('Failed to delete jobs:', error);
      alert(error.message || 'Failed to delete jobs. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle batch payment
  const handleBatchPayment = async (paymentType: 'customer' | 'vendor' | 'bradford') => {
    if (selectedJobIds.size === 0) return;

    const paymentLabels = {
      customer: 'Customer Paid',
      vendor: 'Vendor Paid',
      bradford: 'Bradford Paid',
    };

    const confirmed = window.confirm(
      `Mark ${selectedJobIds.size} job${selectedJobIds.size > 1 ? 's' : ''} as "${paymentLabels[paymentType]}"?\n\nThis will set today's date and calculate the default amount for each job.`
    );

    if (!confirmed) return;

    setIsProcessingPayment(true);
    setIsPaymentMenuOpen(false);

    try {
      const response = await fetch('/api/jobs/batch-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobIds: Array.from(selectedJobIds),
          paymentType,
          date: new Date().toISOString().split('T')[0],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update payments');
      }

      const result = await response.json();
      alert(`Successfully marked ${result.updated} job${result.updated > 1 ? 's' : ''} as ${paymentLabels[paymentType]}`);
      setSelectedJobIds(new Set());
      await handleRefresh();
    } catch (error: any) {
      console.error('Failed to update payments:', error);
      alert(error.message || 'Failed to update payments. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Handle single job mark paid - optimistic UI
  const handleMarkPaid = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Optimistic: immediately hide from Completed tab
    setOptimisticallyPaidIds(prev => new Set(prev).add(jobId));

    try {
      await jobsApi.markCustomerPaid(jobId);
      // Also set money-complete status so job lands in Archive cleanly
      await jobsApi.updateStatus(jobId, 'PAID').catch(() => null);
      toast.success('Marked paid');
      handleRefresh(); // Sync actual data in background
    } catch (error) {
      // Rollback on error
      setOptimisticallyPaidIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      console.error('Failed to mark job as paid:', error);
      toast.error('Failed to mark job as paid');
    }
  };

  /** Production complete (workflow) — not the same as customer PAID */
  const handleMarkComplete = async (jobId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await jobsApi.updateWorkflowStatus(jobId, 'COMPLETED');
      // Optimistic local update
      setLocalJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, workflowStatus: 'COMPLETED', workflowStatusOverride: 'COMPLETED' }
            : j
        )
      );
      toast.success('Complete — next: mark invoiced (old #) / collect / pay BGE or JD');
      onRefresh();
    } catch (error) {
      console.error('Failed to mark complete:', error);
      toast.error('Failed to mark complete');
    }
  };

  const openInvoiceModal = (job: Job, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenActionMenuId(null);
    setInvoiceModalJob(job);
    setInvoiceModalNo(job.customerInvoiceNumber || job.invoiceNumber || '');
    setInvoiceModalDate(
      job.invoiceGeneratedAt
        ? new Date(job.invoiceGeneratedAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
  };

  const handleSaveInvoiced = async () => {
    if (!invoiceModalJob) return;
    const invNo = invoiceModalNo.trim();
    if (!invNo) {
      toast.error('Invoice number required');
      return;
    }
    setInvoiceModalSaving(true);
    try {
      await jobsApi.markInvoiced(invoiceModalJob.id, {
        invoiceNumber: invNo,
        invoicedAt: invoiceModalDate || undefined,
      });
      setLocalJobs((prev) =>
        prev.map((j) =>
          j.id === invoiceModalJob.id
            ? {
                ...j,
                customerInvoiceNumber: invNo,
                invoiceNumber: invNo,
                invoiceGeneratedAt: invoiceModalDate
                  ? new Date(invoiceModalDate).toISOString()
                  : new Date().toISOString(),
                workflowStatus: 'INVOICED',
                workflowStatusOverride: 'INVOICED',
                status: isClientPaid(j) ? j.status : 'ACTIVE',
              }
            : j
        )
      );
      toast.success(`Invoiced ${invNo} — unpaid until mark paid`);
      setInvoiceModalJob(null);
      onRefresh();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to mark invoiced');
    } finally {
      setInvoiceModalSaving(false);
    }
  };

  /** Re-open a completed job back onto the Production board */
  const handleReopenJob = async (jobId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await jobsApi.updateWorkflowStatus(jobId, 'IN_PRODUCTION');
      await jobsApi.updateStatus(jobId, 'ACTIVE').catch(() => null);
      setLocalJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: 'ACTIVE',
                workflowStatus: 'IN_PRODUCTION',
                workflowStatusOverride: 'IN_PRODUCTION',
              }
            : j
        )
      );
      toast.success('Back on Production board');
      onRefresh();
    } catch (error) {
      console.error('Failed to reopen job:', error);
      toast.error('Failed to reopen job');
    }
  };

  const handleBatchComplete = async () => {
    if (selectedJobIds.size === 0) return;
    const ids = Array.from(selectedJobIds);
    if (!window.confirm(`Mark ${ids.length} job${ids.length > 1 ? 's' : ''} complete?`)) return;
    try {
      await Promise.all(ids.map((id) => jobsApi.updateWorkflowStatus(id, 'COMPLETED')));
      toast.success(`Marked ${ids.length} complete`);
      setSelectedJobIds(new Set());
      await handleRefresh();
    } catch (error) {
      toast.error('Some jobs failed to complete');
      await handleRefresh();
    }
  };

  // Handle batch document generation
  const handleBatchGenerate = (docType: 'quote' | 'po' | 'invoice') => {
    if (selectedJobIds.size === 0) return;

    const docLabels = {
      quote: 'Quotes',
      po: 'Vendor POs',
      invoice: 'Invoices',
    };

    const confirmed = window.confirm(
      `Generate ${docLabels[docType]} for ${selectedJobIds.size} job${selectedJobIds.size > 1 ? 's' : ''}?\n\nThis will open ${selectedJobIds.size} PDF${selectedJobIds.size > 1 ? 's' : ''} in new tabs.`
    );

    if (!confirmed) return;

    setIsDocMenuOpen(false);

    // Generate documents for each selected job
    const jobIds = Array.from(selectedJobIds);
    jobIds.forEach((jobId, index) => {
      // Stagger the openings slightly to avoid browser blocking
      setTimeout(() => {
        if (docType === 'quote') {
          pdfApi.generateQuote(jobId);
        } else if (docType === 'po') {
          pdfApi.generateVendorPO(jobId);
        } else {
          pdfApi.generateInvoice(jobId);
        }
      }, index * 200);
    });

    // Refresh to update tracking
    setTimeout(() => handleRefresh(), jobIds.length * 200 + 500);
  };

  // Customer filter state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Get unique customers for filter chips
  const customerList = useMemo(() => {
    const customers = new Map<string, { id: string; name: string; count: number }>();
    filteredJobs.forEach(job => {
      const id = job.customer?.id || 'no-customer';
      const name = job.customer?.name || 'No Customer';
      if (!customers.has(id)) {
        customers.set(id, { id, name, count: 0 });
      }
      customers.get(id)!.count++;
    });
    return Array.from(customers.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredJobs]);

  // Filter jobs by selected customer
  const displayJobs = selectedCustomerId
    ? filteredJobs.filter(j => (j.customer?.id || 'no-customer') === selectedCustomerId)
    : filteredJobs;

  return (
    <div className="space-y-4">
      {/* Header — Impact editorial */}
      <div className="flex items-end justify-between gap-4 border-b border-zinc-200/80 pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#C0512A] font-semibold mb-1">Jobs board</p>
          <h1 className="text-2xl font-semibold text-[#2B3A4A] tracking-tight">Jobs</h1>
          <p className="text-sm text-zinc-500 mt-1">
            New → Proof → Production → Complete
            <span className="mx-1.5 text-zinc-300">·</span>
            then client pays → pay BGE or JD
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Customer statement download */}
          <div className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg px-2 py-1 shadow-sm">
            <Building2 className="w-3.5 h-3.5 text-[#C0512A] shrink-0" />
            <select
              value={statementCustomerId}
              onChange={(e) => setStatementCustomerId(e.target.value)}
              className="text-sm text-zinc-700 bg-transparent border-0 focus:ring-0 max-w-[160px] py-1"
              title="Customer statement"
            >
              <option value="">Statement…</option>
              {customers
                .slice()
                .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
                .map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            {statementCustomerId && (
              <>
                <button
                  type="button"
                  onClick={() => pdfApi.generateStatement(statementCustomerId, 'all')}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md bg-[#2B3A4A] text-white hover:bg-[#1f2a36]"
                  title="All jobs — paid & unpaid"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => pdfApi.generateStatement(statementCustomerId, 'unpaid')}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700"
                  title="Unpaid only"
                >
                  Unpaid
                </button>
                <button
                  type="button"
                  onClick={() => pdfApi.generateStatement(statementCustomerId, 'paid')}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                  title="Paid only"
                >
                  Paid
                </button>
              </>
            )}
          </div>
          <Button onClick={onCreateJob} size="sm" className="bg-[#2B3A4A] hover:bg-[#2B3A4A]/90 shadow-sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Job
          </Button>
        </div>
      </div>

      {/* Jobs List Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-visible shadow-sm ring-1 ring-zinc-100">
        {/* Search and Sort */}
        <div className="px-4 py-3 border-b border-zinc-100 bg-[#FAF9F7]/80">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search jobs by title, number, or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#C0512A]/25 focus:border-[#C0512A]/50"
              />
            </div>
            {/* Sort Dropdown */}
            <div className="relative" ref={sortMenuRef}>
              <button
                onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 border border-zinc-200 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
              >
                <ArrowUpDown className="w-4 h-4" />
                {sortLabels[sortBy]}
                <ChevronDown className="w-3 h-3" />
              </button>
              {isSortMenuOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-50">
                  <button
                    onClick={() => { setSortBy('recent'); setIsSortMenuOpen(false); }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm flex items-center gap-2",
                      sortBy === 'recent' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                    )}
                  >
                    <Clock className="w-4 h-4" />
                    Recently Added
                  </button>
                  <button
                    onClick={() => { setSortBy('due'); setIsSortMenuOpen(false); }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm flex items-center gap-2",
                      sortBy === 'due' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                    )}
                  >
                    <AlertCircle className="w-4 h-4" />
                    Due Soon
                  </button>
                  <button
                    onClick={() => { setSortBy('alpha'); setIsSortMenuOpen(false); }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm flex items-center gap-2",
                      sortBy === 'alpha' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                    )}
                  >
                    <FileText className="w-4 h-4" />
                    Alphabetical
                  </button>
                  <button
                    onClick={() => { setSortBy('customer'); setIsSortMenuOpen(false); }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm flex items-center gap-2",
                      sortBy === 'customer' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                    )}
                  >
                    <Building2 className="w-4 h-4" />
                    Customer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Floor sequence + money filters */}
        <div className="px-4 py-2.5 border-b border-zinc-100 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-400 font-semibold w-10 shrink-0">
              Floor
            </span>
            <div className="flex flex-wrap items-center gap-0.5 p-0.5 rounded-lg bg-zinc-100/80">
              {floorTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(t.id);
                    setSelectedJobIds(new Set());
                  }}
                  className={cn(
                    'px-2.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                    activeTab === t.id
                      ? 'bg-white text-[#2B3A4A] shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  )}
                  title={t.title}
                >
                  {t.label}
                  <span className="ml-1 tabular-nums text-xs text-zinc-400">{t.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-400 font-semibold w-10 shrink-0">
              Money
            </span>
            <div className="flex flex-wrap items-center gap-0.5 p-0.5 rounded-lg bg-[#C0512A]/5 border border-[#C0512A]/10">
              {moneyTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(t.id);
                    setSelectedJobIds(new Set());
                  }}
                  className={cn(
                    'px-2.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                    activeTab === t.id
                      ? 'bg-white text-[#2B3A4A] shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  )}
                  title={t.title}
                >
                  {t.label}
                  <span className="ml-1 tabular-nums text-xs text-zinc-400">{t.count}</span>
                </button>
              ))}
            </div>
            <select
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value as typeof quickFilter)}
              className="text-sm border border-zinc-200 rounded-lg px-2.5 py-1.5 bg-white text-zinc-700 focus:ring-1 focus:ring-[#2B3A4A]/20 ml-auto"
            >
              <option value="all">Date filter…</option>
              {filterCounts.overdue > 0 && (
                <option value="overdue">Overdue ({filterCounts.overdue})</option>
              )}
              {filterCounts['due-soon'] > 0 && (
                <option value="due-soon">Due this week ({filterCounts['due-soon']})</option>
              )}
            </select>
            {(quickFilter !== 'all' || searchTerm.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setQuickFilter('all');
                  setSearchTerm('');
                }}
                className="text-xs text-zinc-500 hover:text-[#2B3A4A] hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          {searchTerm.trim() && activeTab !== 'all' && (
            <p className="text-[11px] text-zinc-500">
              Searching all jobs (not just {activeTab})
            </p>
          )}
        </div>

        {/* Batch bar — only when selecting */}
        {selectedJobIds.size > 0 && (
          <div className="px-4 py-2 border-b border-zinc-200 flex flex-wrap items-center gap-2 bg-[#2B3A4A] text-white sticky top-0 z-10">
            <span className="text-sm font-medium tabular-nums">
              {selectedJobIds.size} selected
            </span>
            <button
              type="button"
              onClick={handleBatchComplete}
              className="text-xs font-medium px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25"
            >
              Complete
            </button>
            <button
              type="button"
              onClick={() => handleBatchPayment('customer')}
              disabled={isProcessingPayment}
              className="text-xs font-medium px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 disabled:opacity-50"
            >
              Mark paid
            </button>
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={isDeleting}
              className="text-xs font-medium px-2.5 py-1 rounded-md bg-red-500/90 hover:bg-red-500 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              className="text-xs text-white/70 hover:text-white ml-auto"
            >
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="border-b border-zinc-200 bg-[#2B3A4A]">
              <tr>
                <th className="px-3 py-2.5 w-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedJobIds.size === filteredJobs.length && filteredJobs.length > 0) {
                        setSelectedJobIds(new Set());
                      } else {
                        setSelectedJobIds(new Set(filteredJobs.map((j) => j.id)));
                      }
                    }}
                    className="text-white/70 hover:text-white"
                  >
                    {selectedJobIds.size === filteredJobs.length && filteredJobs.length > 0 ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/70 uppercase tracking-[0.1em]">Job #</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/70 uppercase tracking-[0.1em]">Title</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/70 uppercase tracking-[0.1em]">Customer</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/70 uppercase tracking-[0.1em]">Cust PO</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/70 uppercase tracking-[0.1em]">BGE PO</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/70 uppercase tracking-[0.1em]">Status</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-white/70 uppercase tracking-[0.1em]" title="Delivery (floor) or payment due (invoiced)">
                  Date
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-white/70 uppercase tracking-[0.1em]">Amount</th>
                <th className="px-3 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => {
                const payOverdue = isPaymentOverdue(job);
                const prodLate = isProductionLate(job);
                const isOverdue = payOverdue || prodLate;
                const daysUntil = getDaysUntilRelevant(job);
                const isDueSoon = !isOverdue && daysUntil !== null && daysUntil >= 0 && daysUntil <= 3;
                const done = isJobDone(job);
                const showPayDue = done || isInvoiced(job);
                const displayDate = showPayDue ? getPaymentDueDate(job) : getDeliveryDate(job);
                const dateHint = showPayDue
                  ? payOverdue
                    ? `${getDaysPaymentOverdue(job)}d past pay due · ${paymentTermsLabel(getPaymentTermsDays(job))}`
                    : displayDate
                      ? `Pay due · ${paymentTermsLabel(getPaymentTermsDays(job))}`
                      : 'Not invoiced yet'
                  : prodLate
                    ? `${getDaysProductionLate(job)}d past delivery`
                    : 'Delivery / mail';
                const moneyBadges = (() => {
                  try {
                    return moneyStatusBadges(job);
                  } catch {
                    return [{ text: '—', tone: 'muted' as const }];
                  }
                })();
                const stageLabel = opsStageLabel(job);
                const needPay = (() => {
                  try {
                    return needsVendorPay(job);
                  } catch {
                    return false;
                  }
                })();
                return (
                  <tr
                    key={job.id}
                    onClick={() => {
                      onSelectJob(job);
                      setIsDrawerOpen(true);
                    }}
                    className={cn(
                      "border-b border-zinc-100 hover:bg-zinc-50/80 transition-colors cursor-pointer",
                      isOverdue && "bg-red-50/30",
                      needPay && "bg-orange-50/40",
                      selectedJobIds.has(job.id) && "bg-zinc-50"
                    )}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleToggleSelection(job.id)}
                        className="text-zinc-300 hover:text-zinc-600"
                      >
                        {selectedJobIds.has(job.id) ? (
                          <CheckSquare className="w-4 h-4 text-[#2B3A4A]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-sm font-mono font-semibold text-[#2B3A4A]">{job.number}</span>
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-800 max-w-[220px] truncate font-medium" title={job.title}>
                      {job.title || '—'}
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-500">{job.customer?.name || '—'}</td>
                    <td className="px-3 py-3 max-w-[110px]" onClick={(e) => e.stopPropagation()}>
                      <InlineEditableCell
                        value={job.customerPONumber}
                        onSave={(v) => handleInlineUpdate(job.id, 'customerPONumber', v)}
                        placeholder="Cust PO"
                        emptyText="—"
                        className="text-xs font-mono text-zinc-700"
                      />
                    </td>
                    <td className="px-3 py-3 max-w-[110px]" onClick={(e) => e.stopPropagation()}>
                      <InlineEditableCell
                        value={job.partnerPONumber}
                        onSave={(v) => handleInlineUpdate(job.id, 'partnerPONumber', v)}
                        placeholder="BGE PO"
                        emptyText="—"
                        className="text-xs font-mono text-zinc-700"
                      />
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold',
                            stageLabel === 'New' && 'bg-slate-100 text-slate-700',
                            stageLabel === 'Proofing' && 'bg-blue-100 text-blue-800',
                            stageLabel === 'Production' && 'bg-amber-100 text-amber-800',
                            stageLabel === 'Complete' && 'bg-emerald-100 text-emerald-800'
                          )}
                          title={`Floor: ${stageLabel}`}
                        >
                          {stageLabel}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {moneyBadges.map((b) => (
                            <span
                              key={b.text}
                              title={
                                b.tone === 'action'
                                  ? impactProductionPayee(job) === 'BGE'
                                    ? 'Client paid — Impact still owes BGE'
                                    : 'Client paid — Impact still owes JD'
                                  : b.text
                              }
                              className={cn(
                                'inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
                                b.tone === 'paid' && 'bg-emerald-50 text-emerald-800 border border-emerald-200',
                                b.tone === 'good' && 'bg-emerald-100 text-emerald-900',
                                b.tone === 'action' && 'bg-orange-100 text-[#C0512A] border border-orange-300',
                                b.tone === 'warn' && 'bg-amber-50 text-amber-800 border border-amber-200',
                                b.tone === 'muted' && 'bg-zinc-100 text-zinc-500'
                              )}
                            >
                              {b.text}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {displayDate ? (
                        <span
                          className={cn(
                            "text-sm tabular-nums",
                            isOverdue && "text-red-600 font-medium",
                            isDueSoon && !isOverdue && "text-amber-600",
                            !isOverdue && !isDueSoon && "text-zinc-500"
                          )}
                          title={dateHint}
                        >
                          {displayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          {showPayDue && (
                            <span className="block text-[10px] font-normal text-zinc-400">
                              {payOverdue ? 'pay overdue' : 'pay due'}
                            </span>
                          )}
                          {!showPayDue && prodLate && (
                            <span className="block text-[10px] font-normal text-amber-700">late deliv</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-300" title={dateHint}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-right font-medium text-zinc-800 tabular-nums">
                      {job.sellPrice || (job as any).sellPrice
                        ? `$${parseFloat(String(job.sellPrice ?? (job as any).sellPrice)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        : '—'}
                    </td>
                    {/* One menu — everything else lives in the job popup */}
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex justify-end" data-action-menu>
                        <button
                          type="button"
                          onClick={() => setOpenActionMenuId(openActionMenuId === job.id ? null : job.id)}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                          aria-label="Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openActionMenuId === job.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-zinc-200 py-1 z-50">
                            {!done && (
                              <button
                                type="button"
                                onClick={(e) => { handleMarkComplete(job.id, e); setOpenActionMenuId(null); }}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                              >
                                Mark complete
                              </button>
                            )}
                            {done && (
                              <button
                                type="button"
                                onClick={(e) => { handleReopenJob(job.id, e); setOpenActionMenuId(null); }}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                              >
                                Reopen
                              </button>
                            )}
                            {!isInvoiced(job) && (
                              <button
                                type="button"
                                onClick={(e) => openInvoiceModal(job, e)}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                              >
                                Mark invoiced…
                              </button>
                            )}
                            {isInvoiced(job) && !isClientPaid(job) && (
                              <button
                                type="button"
                                onClick={(e) => openInvoiceModal(job, e)}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                              >
                                Edit invoice #
                              </button>
                            )}
                            {job.status !== 'PAID' && !isClientPaid(job) && (
                              <button
                                type="button"
                                onClick={(e) => { handleMarkPaid(job.id, e); setOpenActionMenuId(null); }}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                              >
                                Mark client paid
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { pdfApi.generateInvoice(job.id); setOpenActionMenuId(null); }}
                              className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                            >
                              Invoice PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => { pdfApi.generateVendorPO(job.id); setOpenActionMenuId(null); }}
                              className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                            >
                              Vendor PO
                            </button>
                            <div className="border-t border-zinc-100 my-1" />
                            <button
                              type="button"
                              onClick={() => { onEditJob(job); setOpenActionMenuId(null); }}
                              className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => { onDeleteJob(job); setOpenActionMenuId(null); }}
                              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {filteredJobs.length === 0 && (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-zinc-300" />
            <h3 className="text-lg font-medium text-zinc-900 mb-1">
              {searchTerm || quickFilter !== 'all' ? 'No jobs found' : 'No jobs yet'}
            </h3>
            <p className="text-sm text-zinc-500 mb-4">
              {searchTerm || quickFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Get started by creating your first job'}
            </p>
            {(searchTerm || quickFilter !== 'all') && (
              <Button
                onClick={() => { setSearchTerm(''); setQuickFilter('all'); }}
                variant="outline"
                size="sm"
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Hidden List View - legacy code below */}
      {false && (
        <>
          {/* Tabs */}
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(tabId) => {
              setActiveTab(tabId as BoardTab);
              setSelectedJobIds(new Set());
              setSelectedCustomerId(null);
            }}
          />

      {/* Search and Table */}
      <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
        {/* Search Bar */}
        <div className="px-4 py-3 border-b border-zinc-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-zinc-200 focus:border-zinc-400 focus:ring-zinc-400"
            />
          </div>
        </div>

        {/* Customer Filter Chips */}
        <div className="px-4 py-2 border-b border-zinc-100 flex items-center gap-2 overflow-x-auto">
          {customerList.map(({ id, name, count }) => (
            <button
              key={id}
              onClick={() => setSelectedCustomerId(selectedCustomerId === id ? null : id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors",
                selectedCustomerId === id
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>{name}</span>
              <span className={cn(
                "text-xs tabular-nums",
                selectedCustomerId === id ? "text-zinc-400" : "text-zinc-400"
              )}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Batch Actions Bar - only show when jobs selected */}
        {selectedJobIds.size > 0 && (
          <div className="px-4 py-2 border-b border-zinc-200 flex items-center gap-3 bg-zinc-50">
            <span className="text-sm text-zinc-600">
              {selectedJobIds.size} selected
            </span>
            <div className="relative" ref={docMenuRef}>
              <Button onClick={() => setIsDocMenuOpen(!isDocMenuOpen)} variant="outline" size="sm" className="border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100">
                <FileText className="w-4 h-4 mr-1" />
                Docs
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
              {isDocMenuOpen && (
                <div className="absolute left-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-50">
                  <button onClick={() => handleBatchGenerate('quote')} className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">Quotes</button>
                  <button onClick={() => handleBatchGenerate('po')} className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">POs</button>
                  <button onClick={() => handleBatchGenerate('invoice')} className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">Invoices</button>
                </div>
              )}
            </div>
            <div className="relative" ref={paymentMenuRef}>
              <Button onClick={() => setIsPaymentMenuOpen(!isPaymentMenuOpen)} disabled={isProcessingPayment} variant="outline" size="sm" className="border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100">
                <DollarSign className="w-4 h-4 mr-1" />
                {isProcessingPayment ? '...' : 'Paid'}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
              {isPaymentMenuOpen && (
                <div className="absolute left-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-50">
                  <button onClick={() => handleBatchPayment('customer')} className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">Customer</button>
                  <button onClick={() => handleBatchPayment('vendor')} className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">Vendor</button>
                  <button onClick={() => handleBatchPayment('bradford')} className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">Bradford</button>
                </div>
              )}
            </div>
            <Button onClick={handleBatchDelete} disabled={isDeleting} variant="destructive" size="sm">
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          </div>
        )}

        {/* Flat Jobs Table */}
        {displayJobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <button
                      onClick={handleSelectAll}
                      className="text-zinc-400 hover:text-zinc-900"
                    >
                      {selectedJobIds.size === displayJobs.length && displayJobs.length > 0 ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Job</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">PO #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500" title="Production delivery — not invoice/payment due">Delivery</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">Spread</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {displayJobs.map((job: Job) => (
                  <tr
                    key={job.id}
                    className={cn(
                      'group border-b border-zinc-100 hover:bg-zinc-50 transition-colors',
                      selectedJob?.id === job.id && 'bg-zinc-50'
                    )}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleSelection(job.id); }}
                        className="text-zinc-400 hover:text-zinc-900"
                      >
                        {selectedJobIds.has(job.id) ? <CheckSquare className="w-4 h-4 text-zinc-900" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    {/* Job */}
                    <td onClick={() => handleRowClick(job)} className="px-4 py-3 cursor-pointer">
                      <div className="text-sm font-medium text-zinc-900 hover:text-zinc-600">{job.number} - {job.title}</div>
                    </td>
                    {/* Customer */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-zinc-600">{job.customer?.name || '—'}</span>
                    </td>
                    {/* Vendor */}
                    <td className="px-4 py-3">
                      {job.vendor?.name ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-700">{job.vendor.name}</span>
                          {job.vendor.isPartner && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                              Partner
                            </span>
                          )}
                          {/* PO Status Indicator */}
                          {(() => {
                            const pos = (job as any).purchaseOrders || [];
                            const hasSentPO = pos.some((po: any) => po.emailedAt);
                            const hasPO = pos.length > 0;
                            if (hasSentPO) {
                              return <span className="w-2 h-2 rounded-full bg-green-500" title="PO Sent" />;
                            } else if (hasPO) {
                              return <span className="w-2 h-2 rounded-full bg-yellow-400" title="PO Pending" />;
                            }
                            return <span className="w-2 h-2 rounded-full bg-gray-300" title="No PO" />;
                          })()}
                        </div>
                      ) : (
                        <span className="text-sm text-zinc-400">—</span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusDropdown status={job.status} onStatusChange={(s) => handleStatusChange(job.id, s)} />
                    </td>
                    {/* PO # */}
                    <td className="px-4 py-3">
                      <InlineEditableCell value={job.customerPONumber} onSave={(v) => handleInlineUpdate(job.id, 'customerPONumber', v)} placeholder="—" className="text-sm text-zinc-600" />
                    </td>
                    {/* Delivery (production) — not invoice/payment due */}
                    <td className="px-4 py-3">
                      <InlineEditableCell value={job.dueDate} onSave={(v) => handleInlineUpdate(job.id, 'dueDate', v)} type="date" className="text-sm text-zinc-600" placeholder="Delivery" />
                    </td>
                    {/* Qty */}
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm tabular-nums text-zinc-600">{job.quantity?.toLocaleString() || '—'}</span>
                    </td>
                    {/* Spread */}
                    <td className="px-4 py-3 text-right">
                      {(() => {
                        const sellPrice = (job as any).sellPrice || 0;
                        const totalCost = (job as any).profit?.totalCost || 0;
                        const spread = sellPrice - totalCost;
                        return <span className={`text-sm font-medium tabular-nums ${spread >= 0 ? 'text-green-600' : 'text-red-600'}`}>${spread.toFixed(0)}</span>;
                      })()}
                    </td>
                    {/* Actions - show on hover */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {activeTab === 'invoiced' && (
                          <Button
                            onClick={(e) => handleMarkPaid(job.id, e)}
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50 hover:border-green-300"
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            Mark Paid
                          </Button>
                        )}
                        {/* Actions Dropdown */}
                        <div className="relative" data-action-menu>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionMenuId(openActionMenuId === job.id ? null : job.id);
                            }}
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                          >
                            Actions
                            <ChevronDown className="w-3 h-3 ml-1" />
                          </Button>
                          {openActionMenuId === job.id && (
                            <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-50">
                              <button
                                onClick={(e) => { e.stopPropagation(); pdfApi.generateQuote(job.id); setOpenActionMenuId(null); }}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 flex items-center gap-2"
                              >
                                <FileText className="w-4 h-4 text-zinc-400" />
                                Download Quote
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); pdfApi.generateVendorPO(job.id); setOpenActionMenuId(null); }}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 flex items-center gap-2"
                              >
                                <FileDown className="w-4 h-4 text-zinc-400" />
                                Download Vendor PO
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); pdfApi.generateInvoice(job.id); setOpenActionMenuId(null); }}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 flex items-center gap-2"
                              >
                                <Receipt className="w-4 h-4 text-zinc-400" />
                                Download Invoice
                              </button>
                              <div className="border-t border-zinc-100 my-1" />
                              {job.status !== 'PAID' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMarkPaid(job.id, e); setOpenActionMenuId(null); }}
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2 text-green-600"
                                >
                                  <DollarSign className="w-4 h-4" />
                                  Mark as Paid
                                </button>
                              )}
                              {onCopyJob && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onCopyJob(job); setOpenActionMenuId(null); }}
                                  className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 flex items-center gap-2"
                                >
                                  <Copy className="w-4 h-4 text-zinc-400" />
                                  Copy Job
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); onEditJob(job); setOpenActionMenuId(null); }}
                                className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 flex items-center gap-2"
                              >
                                <Edit className="w-4 h-4 text-zinc-400" />
                                Edit Job
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onDeleteJob(job); setOpenActionMenuId(null); }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-2 text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete Job
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-zinc-300" />
            <h3 className="text-lg font-medium text-zinc-900 mb-1">
              {searchTerm ? 'No jobs found' : 'No jobs yet'}
            </h3>
            <p className="text-sm text-zinc-500 mb-4">
              {searchTerm
                ? 'Try adjusting your search terms'
                : 'Get started by creating your first job'}
            </p>
            {!searchTerm && (
              <Button onClick={onCreateJob} className="bg-zinc-900 hover:bg-zinc-800">
                <Plus className="w-4 h-4 mr-2" />
                Create Job
              </Button>
            )}
          </div>
        )}
      </div>

        </>
      )}

      {/* Job popup — full detail modal (not sidebar) */}
      <JobDetailModal
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          onSelectJob(null as any);
        }}
        job={selectedJob as any}
        onEdit={() => selectedJob && onEditJob(selectedJob)}
        onDelete={() => selectedJob && onDeleteJob(selectedJob)}
        onGenerateEmail={() => selectedJob && onShowEmailDraft(selectedJob)}
        onDownloadPO={() => selectedJob && pdfApi.generateVendorPO(selectedJob.id)}
        onDownloadInvoice={() => selectedJob && pdfApi.generateInvoice(selectedJob.id)}
        onDownloadQuote={() => selectedJob && pdfApi.generateQuote(selectedJob.id)}
        onRefresh={handleRefresh}
      />

      {/* Mark invoiced — old system # + date; stays unpaid until Mark client paid */}
      {invoiceModalJob && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40"
          onClick={() => !invoiceModalSaving && setInvoiceModalJob(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-zinc-200 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#2B3A4A]">Mark invoiced</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Job {invoiceModalJob.number} — enter old-system invoice # + date. Leaves job{' '}
              <strong>unpaid</strong> until you mark client paid.
            </p>
            <label className="block mt-4">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Invoice number
              </span>
              <input
                autoFocus
                value={invoiceModalNo}
                onChange={(e) => setInvoiceModalNo(e.target.value)}
                placeholder="e.g. 4521 or INV-2024-088"
                className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C0512A]/25"
              />
            </label>
            <label className="block mt-3">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Invoice date
              </span>
              <input
                type="date"
                value={invoiceModalDate}
                onChange={(e) => setInvoiceModalDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C0512A]/25"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={invoiceModalSaving}
                onClick={() => setInvoiceModalJob(null)}
                className="px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={invoiceModalSaving}
                onClick={handleSaveInvoiced}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-[#2B3A4A] hover:bg-[#1f2a36] rounded-lg disabled:opacity-50"
              >
                {invoiceModalSaving ? 'Saving…' : 'Save invoiced'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
