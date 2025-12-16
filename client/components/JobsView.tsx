import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Search, Sparkles, Upload, FileText, Edit, Trash2, FileSpreadsheet, CheckSquare, Square, ChevronDown, ChevronRight, MoreVertical, DollarSign, Printer, Receipt } from 'lucide-react';
import { Button, Tabs } from './ui';
import { Input } from './ui';
import { Badge } from './ui';
import { StatusBadge } from './ui/StatusBadge';
import { JobDetailModal } from './JobDetailModal';
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
  onUpdateStatus,
  onUpdateJob,
  onRefresh,
  onShowSpecParser,
  onShowPOUploader,
  onShowEmailDraft,
  onShowExcelImporter,
}: JobsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'paid'>('active');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [collapsedCustomers, setCollapsedCustomers] = useState<Set<string>>(new Set());
  const [isPaymentMenuOpen, setIsPaymentMenuOpen] = useState(false);
  const [isDocMenuOpen, setIsDocMenuOpen] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const paymentMenuRef = useRef<HTMLDivElement>(null);
  const docMenuRef = useRef<HTMLDivElement>(null);

  // Filter jobs by active tab
  const tabFilteredJobs = useMemo(() => {
    switch (activeTab) {
      case 'active':
        return jobs.filter((job) => job.status === 'ACTIVE');
      case 'completed':
        return jobs.filter((job) => job.status === 'PAID');
      case 'paid':
        return jobs.filter((job) => job.hasPaidInvoice === true);
      default:
        return jobs;
    }
  }, [jobs, activeTab]);

  // Get counts for tabs
  const tabCounts = useMemo(() => ({
    active: jobs.filter((job) => job.status === 'ACTIVE').length,
    completed: jobs.filter((job) => job.status === 'PAID').length,
    paid: jobs.filter((job) => job.hasPaidInvoice === true).length,
  }), [jobs]);

  // Define tabs
  const tabs = [
    { id: 'active', label: 'Active Jobs', count: tabCounts.active },
    { id: 'completed', label: 'Completed Jobs', count: tabCounts.completed },
    { id: 'paid', label: 'Paid Jobs', count: tabCounts.paid },
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
    };

    if (isPaymentMenuOpen || isDocMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isPaymentMenuOpen, isDocMenuOpen]);

  // Apply search filter on top of tab filter
  const filteredJobs = tabFilteredJobs.filter((job: Job) =>
    job.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.customerPONumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.vendor?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      await onRefresh();
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
      await onRefresh();
    } catch (error: any) {
      console.error('Failed to update payments:', error);
      alert(error.message || 'Failed to update payments. Please try again.');
    } finally {
      setIsProcessingPayment(false);
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
    setTimeout(() => onRefresh(), jobIds.length * 200 + 500);
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
      {/* Header - Compact */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Manage your print jobs and track their progress
          </p>
        </div>
        <Button onClick={onCreateJob} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          New Job
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tabId) => {
          setActiveTab(tabId as 'active' | 'completed' | 'paid');
          setSelectedJobIds(new Set());
          setSelectedCustomerId(null);
        }}
      />

      {/* Search and Table Card */}
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {/* Search Bar */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="text"
              placeholder="Search jobs by title, number, customer, or vendor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Customer Filter Chips */}
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 overflow-x-auto">
          {customerList.map(({ id, name, count }) => (
            <button
              key={id}
              onClick={() => setSelectedCustomerId(selectedCustomerId === id ? null : id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                selectedCustomerId === id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>{name}</span>
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded-full",
                selectedCustomerId === id ? "bg-white/20" : "bg-muted"
              )}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Batch Actions Bar - only show when jobs selected */}
        {selectedJobIds.size > 0 && (
          <div className="px-4 py-2 border-b border-border flex items-center gap-3 bg-muted/30">
            <span className="text-sm text-muted-foreground">
              {selectedJobIds.size} selected
            </span>
            <div className="relative" ref={docMenuRef}>
              <Button onClick={() => setIsDocMenuOpen(!isDocMenuOpen)} variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-1" />
                Docs
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
              {isDocMenuOpen && (
                <div className="absolute left-0 mt-1 w-40 bg-card rounded-lg shadow-lg border border-border py-1 z-50">
                  <button onClick={() => handleBatchGenerate('quote')} className="w-full px-3 py-2 text-left text-sm hover:bg-accent">Quotes</button>
                  <button onClick={() => handleBatchGenerate('po')} className="w-full px-3 py-2 text-left text-sm hover:bg-accent">POs</button>
                  <button onClick={() => handleBatchGenerate('invoice')} className="w-full px-3 py-2 text-left text-sm hover:bg-accent">Invoices</button>
                </div>
              )}
            </div>
            <div className="relative" ref={paymentMenuRef}>
              <Button onClick={() => setIsPaymentMenuOpen(!isPaymentMenuOpen)} disabled={isProcessingPayment} variant="outline" size="sm">
                <DollarSign className="w-4 h-4 mr-1" />
                {isProcessingPayment ? '...' : 'Paid'}
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
              {isPaymentMenuOpen && (
                <div className="absolute left-0 mt-1 w-40 bg-card rounded-lg shadow-lg border border-border py-1 z-50">
                  <button onClick={() => handleBatchPayment('customer')} className="w-full px-3 py-2 text-left text-sm hover:bg-accent">Customer</button>
                  <button onClick={() => handleBatchPayment('vendor')} className="w-full px-3 py-2 text-left text-sm hover:bg-accent">Vendor</button>
                  <button onClick={() => handleBatchPayment('bradford')} className="w-full px-3 py-2 text-left text-sm hover:bg-accent">Bradford</button>
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
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <button
                      onClick={handleSelectAll}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {selectedJobIds.size === displayJobs.length && displayJobs.length > 0 ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Job</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Customer</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">PO #</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Due</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Spread</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayJobs.map((job: Job) => (
                  <tr
                    key={job.id}
                    className={cn(
                      'group hover:bg-accent/50 transition-colors',
                      selectedJob?.id === job.id && 'bg-accent'
                    )}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleSelection(job.id); }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {selectedJobIds.has(job.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    {/* Job */}
                    <td onClick={() => handleRowClick(job)} className="px-3 py-2.5 cursor-pointer">
                      <div className="text-sm font-medium text-foreground hover:text-primary">{job.number} - {job.title}</div>
                      {job.vendor?.name && <div className="text-xs text-muted-foreground">{job.vendor.name}</div>}
                    </td>
                    {/* Customer */}
                    <td className="px-3 py-2.5">
                      <span className="text-sm text-muted-foreground">{job.customer?.name || '—'}</span>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2.5">
                      <StatusDropdown status={job.status} onStatusChange={(s) => handleStatusChange(job.id, s)} />
                    </td>
                    {/* PO # */}
                    <td className="px-3 py-2.5">
                      <InlineEditableCell value={job.customerPONumber} onSave={(v) => handleInlineUpdate(job.id, 'customerPONumber', v)} placeholder="—" className="text-sm" />
                    </td>
                    {/* Due */}
                    <td className="px-3 py-2.5">
                      <InlineEditableCell value={job.dueDate} onSave={(v) => handleInlineUpdate(job.id, 'dueDate', v)} type="date" className="text-sm" />
                    </td>
                    {/* Qty */}
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-sm">{job.quantity?.toLocaleString() || '—'}</span>
                    </td>
                    {/* Spread */}
                    <td className="px-3 py-2.5 text-right">
                      {(() => {
                        const sellPrice = (job as any).sellPrice || 0;
                        const totalCost = (job as any).profit?.totalCost || 0;
                        const spread = sellPrice - totalCost;
                        return <span className={`text-sm font-medium ${spread >= 0 ? 'text-green-600' : 'text-red-600'}`}>${spread.toFixed(0)}</span>;
                      })()}
                    </td>
                    {/* Actions - show on hover */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button onClick={(e) => { e.stopPropagation(); onEditJob(job); }} variant="ghost" size="icon" className="h-7 w-7"><Edit className="w-3.5 h-3.5" /></Button>
                        <Button onClick={(e) => { e.stopPropagation(); onDeleteJob(job); }} variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {searchTerm ? 'No jobs found' : 'No jobs yet'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm
                ? 'Try adjusting your search terms'
                : 'Get started by creating your first job'}
            </p>
            {!searchTerm && (
              <Button onClick={onCreateJob}>
                <Plus className="w-4 h-4 mr-2" />
                Create Job
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <JobDetailModal
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            onSelectJob(null as any);
          }}
          job={selectedJob}
          onEdit={() => onEditJob(selectedJob)}
          onGenerateEmail={() => onShowEmailDraft(selectedJob)}
          onDownloadPO={() => pdfApi.generateVendorPO(selectedJob.id)}
          onDownloadInvoice={() => pdfApi.generateInvoice(selectedJob.id)}
          onDownloadQuote={() => pdfApi.generateQuote(selectedJob.id)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
