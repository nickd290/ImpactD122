import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Search, Sparkles, Upload, FileText, Edit, Trash2, FileSpreadsheet, CheckSquare, Square, ChevronDown, ChevronRight, MoreVertical, DollarSign, Printer, Receipt, Building2, Copy, FileDown, Mail, ArrowUpDown, Clock, AlertCircle, Filter } from 'lucide-react';
import { Button, Tabs } from './ui';
import { Input } from './ui';
import { Badge } from './ui';
import { StatusBadge } from './ui/StatusBadge';
import { JobDrawer } from './JobDrawer';
import { InlineEditableCell } from './InlineEditableCell';
import { StatusDropdown } from './StatusDropdown';
import { cn } from '../lib/utils';
import { pdfApi, jobsApi } from '../lib/api';

interface Job {
  id: string;
  title: string;
  number: string;
  status: string;
  isDuplicate?: boolean;
  customerPONumber?: string;
  customer?: { id: string; name: string };
  vendor?: { name: string };
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
  // Invoice/payment tracking
  hasPaidInvoice?: boolean;
  invoices?: { id: string; amount: number | null; paidAt: string | null }[];
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
}: JobsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'archive'>('all');
  // Unified workflow view (no toggle needed)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Local jobs state - fetch our own data instead of relying on props
  const [localJobs, setLocalJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Sorting state
  const [sortBy, setSortBy] = useState<'recent' | 'due' | 'alpha' | 'customer'>('recent');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Quick filters
  const [quickFilter, setQuickFilter] = useState<'all' | 'overdue' | 'due-soon' | 'no-vendor'>('all');
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

  // Filter jobs by active tab
  // All = show all jobs (default, matches sidebar count)
  // Active = currently in progress (not completed/shipped/paid)
  // Archive = completed, shipped, paid, or cancelled
  const tabFilteredJobs = useMemo(() => {
    switch (activeTab) {
      case 'all':
        // Show all jobs - matches sidebar badge count
        return localJobs;
      case 'active':
        // Active jobs that are not in terminal workflow states
        return localJobs.filter((job) => {
          if (job.status !== 'ACTIVE') return false;
          // Exclude jobs that are effectively done (COMPLETED, INVOICED, PAID workflow states)
          const effectiveStatus = (job as any).workflowStatusOverride || (job as any).workflowStatus || 'NEW_JOB';
          return !['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'].includes(effectiveStatus);
        });
      case 'archive':
        // Jobs that are done: PAID status OR terminal workflow states
        return localJobs.filter((job) => {
          if (job.status === 'PAID' || job.status === 'CANCELLED') return true;
          const effectiveStatus = (job as any).workflowStatusOverride || (job as any).workflowStatus || 'NEW_JOB';
          return ['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'].includes(effectiveStatus);
        });
      default:
        return localJobs;
    }
  }, [localJobs, activeTab, optimisticallyPaidIds]);

  // Get counts for tabs
  const tabCounts = useMemo(() => {
    const allCount = localJobs.length;

    const activeCount = localJobs.filter((job) => {
      if (job.status !== 'ACTIVE') return false;
      const effectiveStatus = (job as any).workflowStatusOverride || (job as any).workflowStatus || 'NEW_JOB';
      return !['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'].includes(effectiveStatus);
    }).length;

    const archiveCount = localJobs.filter((job) => {
      if (job.status === 'PAID' || job.status === 'CANCELLED') return true;
      const effectiveStatus = (job as any).workflowStatusOverride || (job as any).workflowStatus || 'NEW_JOB';
      return ['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED'].includes(effectiveStatus);
    }).length;

    return { all: allCount, active: activeCount, archive: archiveCount };
  }, [localJobs, optimisticallyPaidIds]);

  // Define tabs - All (default), Active, Archive
  const tabs = [
    { id: 'all', label: 'All', count: tabCounts.all },
    { id: 'active', label: 'Active', count: tabCounts.active },
    { id: 'archive', label: 'Archive', count: tabCounts.archive },
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

  // Helper to calculate days until due
  const getDaysUntilDue = (job: Job): number | null => {
    if (!job.dueDate) return null;
    const now = new Date();
    const due = new Date(job.dueDate);
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Quick filter counts
  const filterCounts = useMemo(() => {
    const now = new Date();
    return {
      all: tabFilteredJobs.length,
      overdue: tabFilteredJobs.filter(j => {
        if (!j.dueDate) return false;
        return new Date(j.dueDate) < now;
      }).length,
      'due-soon': tabFilteredJobs.filter(j => {
        if (!j.dueDate) return false;
        const due = new Date(j.dueDate);
        const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return days >= 0 && days <= 7;
      }).length,
      'no-vendor': tabFilteredJobs.filter(j => !j.vendor?.name).length,
    };
  }, [tabFilteredJobs]);

  // Apply search filter on top of tab filter
  const searchFilteredJobs = tabFilteredJobs.filter((job: Job) =>
    job.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.customerPONumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.vendor?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Apply quick filter
  const quickFilteredJobs = useMemo(() => {
    const now = new Date();
    return searchFilteredJobs.filter(job => {
      if (quickFilter === 'all') return true;
      if (quickFilter === 'overdue') {
        if (!job.dueDate) return false;
        return new Date(job.dueDate) < now;
      }
      if (quickFilter === 'due-soon') {
        if (!job.dueDate) return false;
        const due = new Date(job.dueDate);
        const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return days >= 0 && days <= 7;
      }
      if (quickFilter === 'no-vendor') {
        return !job.vendor?.name;
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
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1; // No due date goes to end
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(); // Soonest first
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

  // Handle inline field updates
  const handleInlineUpdate = async (jobId: string, field: string, value: string) => {
    if (onUpdateJob) {
      await onUpdateJob(jobId, { [field]: value || null });
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
    // Open edit modal directly when clicking a job row
    onEditJob(job);
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
    if (selectedJobIds.size === filteredJobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(filteredJobs.map(job => job.id)));
    }
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
      handleRefresh(); // Sync actual data in background
    } catch (error) {
      // Rollback on error
      setOptimisticallyPaidIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      console.error('Failed to mark job as paid:', error);
      alert('Failed to mark job as paid. Please try again.');
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium text-zinc-900">Jobs</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {tabCounts.all} total, {tabCounts.active} active, {tabCounts.archive} archived
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={onCreateJob} size="sm" className="bg-zinc-900 hover:bg-zinc-800">
            <Plus className="w-4 h-4 mr-1.5" />
            New Job
          </Button>
        </div>
      </div>

      {/* Jobs List Table */}
      <div className="bg-white rounded-lg border border-zinc-200 overflow-visible">
        {/* Search and Sort */}
        <div className="px-4 py-3 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search jobs by title, number, or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-lg text-sm focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400"
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

        {/* Quick Filters */}
        <div className="px-4 py-2 border-b border-zinc-100 flex items-center gap-2 overflow-x-auto">
          <Filter className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <button
            onClick={() => setQuickFilter('all')}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors",
              quickFilter === 'all'
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            All ({filterCounts.all})
          </button>
          {filterCounts.overdue > 0 && (
            <button
              onClick={() => setQuickFilter('overdue')}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors flex items-center gap-1.5",
                quickFilter === 'overdue'
                  ? "bg-red-600 text-white"
                  : "bg-red-100 text-red-700 hover:bg-red-200"
              )}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Overdue ({filterCounts.overdue})
            </button>
          )}
          {filterCounts['due-soon'] > 0 && (
            <button
              onClick={() => setQuickFilter('due-soon')}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors flex items-center gap-1.5",
                quickFilter === 'due-soon'
                  ? "bg-amber-600 text-white"
                  : "bg-amber-100 text-amber-700 hover:bg-amber-200"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              Due This Week ({filterCounts['due-soon']})
            </button>
          )}
          {filterCounts['no-vendor'] > 0 && (
            <button
              onClick={() => setQuickFilter('no-vendor')}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors",
                quickFilter === 'no-vendor'
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              )}
            >
              No Vendor ({filterCounts['no-vendor']})
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="border-b border-zinc-200 bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Job #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Due Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => {
                const daysUntil = getDaysUntilDue(job);
                const isOverdue = daysUntil !== null && daysUntil < 0;
                const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 3;
                return (
                  <tr
                    key={job.id}
                    onClick={() => {
                      onSelectJob(job);
                      setIsDrawerOpen(true);
                    }}
                    className={cn(
                      "border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer transition-colors",
                      isOverdue && "bg-red-50/50 hover:bg-red-50"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-900">{job.number}</span>
                        {isNewJob(job) && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded">
                            NEW
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 max-w-[200px] truncate">{job.title}</td>
                    <td className="px-4 py-3 text-sm text-zinc-600">{job.customer?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3">
                      {job.dueDate ? (
                        <span className={cn(
                          "text-sm",
                          isOverdue && "text-red-600 font-medium",
                          isDueSoon && !isOverdue && "text-amber-600 font-medium",
                          !isOverdue && !isDueSoon && "text-zinc-600"
                        )}>
                          {new Date(job.dueDate).toLocaleDateString()}
                          {isOverdue && " (Overdue)"}
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-green-600 tabular-nums">
                      {(job as any).sellPrice
                        ? `$${parseFloat((job as any).sellPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '-'}
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
              setActiveTab(tabId as 'all' | 'active' | 'archive');
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Due</th>
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
                    {/* Due */}
                    <td className="px-4 py-3">
                      <InlineEditableCell value={job.dueDate} onSave={(v) => handleInlineUpdate(job.id, 'dueDate', v)} type="date" className="text-sm text-zinc-600" />
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
                        {activeTab === 'completed' && (
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

      {/* Job Drawer - Slide-out panel for job details */}
      <JobDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          onSelectJob(null as any);
        }}
        job={selectedJob}
        onEdit={() => selectedJob && onEditJob(selectedJob)}
        onRefresh={handleRefresh}
      />
    </div>
  );
}
