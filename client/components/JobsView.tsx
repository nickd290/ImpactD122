import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Search, Sparkles, Upload, FileText, Edit, Trash2, FileSpreadsheet, CheckSquare, Square, ChevronDown, ChevronRight, MoreVertical, DollarSign, Printer, Receipt } from 'lucide-react';
import { Button } from './ui';
import { Input } from './ui';
import { Badge } from './ui';
import { StatusBadge } from './ui/StatusBadge';
import { JobDetailModal } from './JobDetailModal';
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
  lineItems?: any[];
  // Document tracking fields
  quoteGeneratedAt?: string;
  quoteGeneratedCount?: number;
  poGeneratedAt?: string;
  poGeneratedCount?: number;
  invoiceGeneratedAt?: string;
  invoiceGeneratedCount?: number;
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [collapsedCustomers, setCollapsedCustomers] = useState<Set<string>>(new Set());
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isPaymentMenuOpen, setIsPaymentMenuOpen] = useState(false);
  const [isDocMenuOpen, setIsDocMenuOpen] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const paymentMenuRef = useRef<HTMLDivElement>(null);
  const docMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setIsActionsOpen(false);
      }
      if (paymentMenuRef.current && !paymentMenuRef.current.contains(event.target as Node)) {
        setIsPaymentMenuOpen(false);
      }
      if (docMenuRef.current && !docMenuRef.current.contains(event.target as Node)) {
        setIsDocMenuOpen(false);
      }
    };

    if (isActionsOpen || isPaymentMenuOpen || isDocMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isActionsOpen, isPaymentMenuOpen, isDocMenuOpen]);

  const filteredJobs = jobs.filter((job: Job) =>
    job.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.customerPONumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.vendor?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Jobs</h1>
          <p className="text-muted-foreground mt-1">
            Manage your print jobs and track their progress
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Actions Dropdown */}
          <div className="relative" ref={actionsRef}>
            <Button
              onClick={() => setIsActionsOpen(!isActionsOpen)}
              variant="outline"
            >
              <MoreVertical className="w-4 h-4 mr-2" />
              Actions
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>

            {isActionsOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <button
                  onClick={() => {
                    onCreateJob();
                    setIsActionsOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 transition-colors"
                >
                  <Plus className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">Full Job Form</span>
                </button>

                <button
                  onClick={() => {
                    onShowSpecParser();
                    setIsActionsOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium">Parse Specs</span>
                </button>

                <button
                  onClick={() => {
                    onShowPOUploader();
                    setIsActionsOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 transition-colors"
                >
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium">Upload PO</span>
                </button>

                {onShowExcelImporter && (
                  <button
                    onClick={() => {
                      onShowExcelImporter();
                      setIsActionsOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">Import Excel</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Primary New Job Button */}
          <Button onClick={onCreateJob} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            New Job
          </Button>
        </div>
      </div>

      {/* Search and Table Card */}
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                type="text"
                placeholder="Search jobs by title, number, customer, or vendor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {selectedJobIds.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {selectedJobIds.size} selected
                </span>

                {/* Generate Documents Dropdown */}
                <div className="relative" ref={docMenuRef}>
                  <Button
                    onClick={() => setIsDocMenuOpen(!isDocMenuOpen)}
                    variant="outline"
                    size="sm"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Generate Docs
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>

                  {isDocMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                      <button
                        onClick={() => handleBatchGenerate('quote')}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-purple-50 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-medium">All Quotes ({selectedJobIds.size})</span>
                      </button>
                      <button
                        onClick={() => handleBatchGenerate('po')}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-blue-50 transition-colors"
                      >
                        <Printer className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium">All POs ({selectedJobIds.size})</span>
                      </button>
                      <button
                        onClick={() => handleBatchGenerate('invoice')}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-green-50 transition-colors"
                      >
                        <Receipt className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium">All Invoices ({selectedJobIds.size})</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Mark as Paid Dropdown */}
                <div className="relative" ref={paymentMenuRef}>
                  <Button
                    onClick={() => setIsPaymentMenuOpen(!isPaymentMenuOpen)}
                    disabled={isProcessingPayment}
                    variant="outline"
                    size="sm"
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    {isProcessingPayment ? 'Processing...' : 'Mark Paid'}
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>

                  {isPaymentMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                      <button
                        onClick={() => handleBatchPayment('customer')}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-blue-50 transition-colors"
                      >
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        <span className="text-sm font-medium">Customer Paid</span>
                      </button>
                      <button
                        onClick={() => handleBatchPayment('vendor')}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-purple-50 transition-colors"
                      >
                        <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                        <span className="text-sm font-medium">Vendor Paid</span>
                      </button>
                      <button
                        onClick={() => handleBatchPayment('bradford')}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-orange-50 transition-colors"
                      >
                        <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                        <span className="text-sm font-medium">Bradford Paid</span>
                      </button>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleBatchDelete}
                  disabled={isDeleting}
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isDeleting ? 'Deleting...' : `Delete ${selectedJobIds.size}`}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Grouped Table by Customer */}
        {filteredJobs.length > 0 ? (
          <div className="overflow-x-auto">
            {jobsByCustomer.map(({ customer, jobs: customerJobs }) => (
              <div key={customer.id} className="border-b border-border last:border-b-0">
                {/* Customer Header - Collapsible */}
                <button
                  onClick={() => toggleCustomerCollapse(customer.id)}
                  className="w-full px-6 py-4 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {collapsedCustomers.has(customer.id) ? (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                    <h3 className="text-sm font-semibold text-foreground">
                      {customer.name || 'Unknown Customer'}
                    </h3>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {customerJobs.length} {customerJobs.length === 1 ? 'job' : 'jobs'}
                    </span>
                  </div>
                </button>

                {/* Customer Jobs Table */}
                {!collapsedCustomers.has(customer.id) && (
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted/20">
                      <tr>
                        <th className="px-4 py-3 w-12">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const allSelected = customerJobs.every(job => selectedJobIds.has(job.id));
                              const newSelection = new Set(selectedJobIds);
                              if (allSelected) {
                                customerJobs.forEach(job => newSelection.delete(job.id));
                              } else {
                                customerJobs.forEach(job => newSelection.add(job.id));
                              }
                              setSelectedJobIds(newSelection);
                            }}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Select all in this customer"
                          >
                            {customerJobs.every(job => selectedJobIds.has(job.id)) ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </button>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Job
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Customer PO
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Vendor
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Size
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Due Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Spread
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border">
                      {customerJobs.map((job: Job) => (
                        <tr
                          key={job.id}
                          className={cn(
                            'hover:bg-accent/50 transition-colors',
                            selectedJob?.id === job.id && 'bg-accent'
                          )}
                        >
                          <td className="px-4 py-4 w-12">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelection(job.id);
                              }}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title={selectedJobIds.has(job.id) ? "Deselect" : "Select"}
                            >
                              {selectedJobIds.has(job.id) ? (
                                <CheckSquare className="w-5 h-5 text-blue-600" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                          </td>
                          <td
                            onClick={() => handleRowClick(job)}
                            className="px-6 py-4 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-foreground">
                                  {job.number} - {job.title}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td
                            onClick={() => handleRowClick(job)}
                            className="px-6 py-4 whitespace-nowrap cursor-pointer"
                          >
                            <span className="text-sm text-foreground">
                              {job.customerPONumber || '-'}
                            </span>
                          </td>
                          <td
                            onClick={() => handleRowClick(job)}
                            className="px-6 py-4 whitespace-nowrap cursor-pointer"
                          >
                            <span
                              className="text-sm text-foreground"
                              title={job.vendor?.name || ''}
                            >
                              {job.vendor?.name
                                ? job.vendor.name.length > 15
                                  ? `${job.vendor.name.substring(0, 15)}...`
                                  : job.vendor.name
                                : '-'}
                            </span>
                          </td>
                          <td
                            onClick={() => handleRowClick(job)}
                            className="px-6 py-4 whitespace-nowrap cursor-pointer"
                          >
                            <span className="text-sm text-foreground">
                              {job.sizeName || '-'}
                            </span>
                          </td>
                          <td
                            onClick={() => handleRowClick(job)}
                            className="px-6 py-4 whitespace-nowrap cursor-pointer"
                          >
                            <span className="text-sm text-foreground">
                              {job.quantity
                                ? job.quantity.toLocaleString()
                                : job.lineItems && job.lineItems.length > 0
                                  ? job.lineItems.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0).toLocaleString()
                                  : '-'}
                            </span>
                          </td>
                          <td
                            onClick={() => handleRowClick(job)}
                            className="px-6 py-4 whitespace-nowrap cursor-pointer"
                          >
                            <span className="text-sm text-foreground">
                              {job.dueDate
                                ? new Date(job.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : '-'}
                            </span>
                          </td>
                          <td
                            onClick={() => handleRowClick(job)}
                            className="px-6 py-4 whitespace-nowrap cursor-pointer"
                          >
                            <StatusBadge status={job.status} />
                          </td>
                          <td
                            onClick={() => handleRowClick(job)}
                            className="px-6 py-4 whitespace-nowrap text-right cursor-pointer"
                          >
                            {(() => {
                              // Calculate spread using CPM formula (same as Pricing tab)
                              const impactToBradfordPO = job.purchaseOrders?.find(
                                (po: any) => po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford'
                              );
                              const bradfordToJDPO = job.purchaseOrders?.find(
                                (po: any) => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
                              );
                              const paperCPM = impactToBradfordPO?.paperCPM || 0;
                              const printCPM = bradfordToJDPO?.printCPM || 0;
                              // Require BOTH paperCPM AND printCPM to use CPM calculation
                              const hasCPMData = paperCPM > 0 && printCPM > 0;

                              if (hasCPMData && job.quantity) {
                                const qty = job.quantity;
                                const paperCost = paperCPM * (qty / 1000);
                                const paperMarkup = paperCost * 0.18;
                                const mfgCost = printCPM * (qty / 1000);
                                const totalCost = paperCost + paperMarkup + mfgCost;
                                const sellPrice = job.sellPrice || 0;
                                const spread = sellPrice - totalCost;
                                return (
                                  <span className={`text-sm font-medium ${spread >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    ${spread.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                );
                              }
                              // Fallback: calculate from PO buyCosts (same as JobDetailModal)
                              const poTotal = job.purchaseOrders
                                ?.filter((po: any) => po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford')
                                .reduce((sum: number, po: any) => sum + (Number(po.buyCost) || 0), 0) || 0;
                              const totalCost = Number(job.profit?.totalCost) || poTotal || 0;
                              const fallbackSellPrice = job.sellPrice || 0;
                              const spread = fallbackSellPrice - totalCost;
                              return (
                                <span className={`text-sm ${spread >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  ${Number(spread).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditJob(job);
                                }}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Edit Job"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteJob(job);
                                }}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Delete Job"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
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
