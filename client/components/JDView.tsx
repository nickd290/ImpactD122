import React, { useState, useMemo } from 'react';
import { FileText, Check, Circle, ArrowUpDown, Search, Download, Send } from 'lucide-react';
import { toast } from 'sonner';
import { JDJobDetailSidebar } from './JDJobDetailSidebar';
import { jobsApi } from '../lib/api';

interface Job {
  id: string;
  jobNo?: string;
  title?: string;
  sellPrice?: number;
  customer?: { name: string };
  bradfordRefNumber?: string;
  partnerPONumber?: string;
  jdInvoiceNumber?: string;
  jdInvoiceGeneratedAt?: string;
  jdInvoiceEmailedAt?: string;
  jdInvoiceEmailedTo?: string;
  jdPaymentPaid?: boolean;
  jdPaymentDate?: string;
  jdPaymentAmount?: number;
  profit?: {
    sellPrice?: number;
    totalCost?: number;
    impactTotal?: number;
    bradfordTotal?: number;
    bradfordOwesJD?: number;
    impactOwesJD?: number;
    spread?: number;
    paperMarkup?: number;
    marginPercent?: number;
  };
  purchaseOrders?: Array<{
    id: string;
    poNumber?: string;
    description?: string;
    buyCost?: number;
    originCompanyId?: string;
    targetCompanyId?: string;
    vendor?: { name: string };
  }>;
}

interface JDViewProps {
  jobs: Job[];
  onRefresh?: () => void;
}

type SortField = 'jobNo' | 'customer' | 'bradfordPO' | 'sellPrice' | 'bradfordOwesJD' | 'impactOwesJD' | 'impactKeeps' | 'jdInvoice' | 'paid';
type SortDirection = 'asc' | 'desc';

export function JDView({ jobs, onRefresh }: JDViewProps) {
  const [sortField, setSortField] = useState<SortField>('jobNo');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterPaid, setFilterPaid] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleRowClick = (job: Job) => {
    setSelectedJob(job);
    setIsSidebarOpen(true);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    setSelectedJob(null);
  };

  const handleInvoiceSent = () => {
    if (onRefresh) {
      onRefresh();
    }
  };

  const handleDownloadPDF = async (e: React.MouseEvent, job: Job) => {
    e.stopPropagation();
    const success = await jobsApi.downloadJDInvoicePDF(job.id);
    if (!success) {
      toast.error('JD Invoice PDF not available', {
        description: 'Please generate the invoice first',
      });
    }
  };

  const handleSendInvoice = async (e: React.MouseEvent, job: Job) => {
    e.stopPropagation();
    try {
      await jobsApi.sendJDInvoice(job.id);
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Failed to send invoice:', error);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedJobs = useMemo(() => {
    let filtered = [...jobs];

    // Filter by paid status
    if (filterPaid === 'paid') {
      filtered = filtered.filter(j => j.jdPaymentPaid);
    } else if (filterPaid === 'unpaid') {
      filtered = filtered.filter(j => !j.jdPaymentPaid);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(j =>
        j.jobNo?.toLowerCase().includes(query) ||
        j.customer?.name?.toLowerCase().includes(query) ||
        j.bradfordRefNumber?.toLowerCase().includes(query) ||
        j.partnerPONumber?.toLowerCase().includes(query) ||
        j.jdInvoiceNumber?.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortField) {
        case 'jobNo':
          aVal = a.jobNo || '';
          bVal = b.jobNo || '';
          break;
        case 'customer':
          aVal = a.customer?.name || '';
          bVal = b.customer?.name || '';
          break;
        case 'bradfordPO':
          aVal = a.bradfordRefNumber || a.partnerPONumber || '';
          bVal = b.bradfordRefNumber || b.partnerPONumber || '';
          break;
        case 'sellPrice':
          aVal = a.sellPrice || 0;
          bVal = b.sellPrice || 0;
          break;
        case 'bradfordOwesJD':
          aVal = a.profit?.bradfordOwesJD || 0;
          bVal = b.profit?.bradfordOwesJD || 0;
          break;
        case 'impactOwesJD':
          aVal = a.profit?.impactOwesJD || 0;
          bVal = b.profit?.impactOwesJD || 0;
          break;
        case 'impactKeeps':
          aVal = a.profit?.impactTotal || 0;
          bVal = b.profit?.impactTotal || 0;
          break;
        case 'jdInvoice':
          aVal = a.jdInvoiceNumber || '';
          bVal = b.jdInvoiceNumber || '';
          break;
        case 'paid':
          aVal = a.jdPaymentPaid ? 1 : 0;
          bVal = b.jdPaymentPaid ? 1 : 0;
          break;
        default:
          aVal = '';
          bVal = '';
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [jobs, sortField, sortDirection, filterPaid, searchQuery]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredAndSortedJobs.reduce(
      (acc, job) => ({
        sellPrice: acc.sellPrice + (job.sellPrice || 0),
        bradfordOwesJD: acc.bradfordOwesJD + (job.profit?.bradfordOwesJD || 0),
        impactOwesJD: acc.impactOwesJD + (job.profit?.impactOwesJD || 0),
        impactKeeps: acc.impactKeeps + (job.profit?.impactTotal || 0),
        paidCount: acc.paidCount + (job.jdPaymentPaid ? 1 : 0),
      }),
      { sellPrice: 0, bradfordOwesJD: 0, impactOwesJD: 0, impactKeeps: 0, paidCount: 0 }
    );
  }, [filteredAndSortedJobs]);

  const formatCurrency = (value: number | undefined) => {
    if (!value && value !== 0) return '-';
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:bg-zinc-100 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-zinc-900' : 'text-zinc-300'}`} />
      </div>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">JD Invoices</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Track Bradford PO references and JD invoice numbers
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search jobs, PO numbers, invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterPaid('all')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filterPaid === 'all'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            All ({jobs.length})
          </button>
          <button
            onClick={() => setFilterPaid('unpaid')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filterPaid === 'unpaid'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Unpaid ({jobs.filter(j => !j.jdPaymentPaid).length})
          </button>
          <button
            onClick={() => setFilterPaid('paid')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filterPaid === 'paid'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Paid ({jobs.filter(j => j.jdPaymentPaid).length})
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-4">
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase">Total Billed</p>
          <p className="text-2xl font-semibold text-zinc-900 mt-1">{formatCurrency(totals.sellPrice)}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase">Bradford Owes JD</p>
          <p className="text-2xl font-semibold text-orange-600 mt-1">{formatCurrency(totals.bradfordOwesJD)}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase">Impact Owes JD</p>
          <p className="text-2xl font-semibold text-blue-600 mt-1">{formatCurrency(totals.impactOwesJD)}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase">Impact Keeps</p>
          <p className="text-2xl font-semibold text-green-600 mt-1">{formatCurrency(totals.impactKeeps)}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase">Jobs Shown</p>
          <p className="text-2xl font-semibold text-zinc-900 mt-1">{filteredAndSortedJobs.length}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase">Paid / Unpaid</p>
          <p className="text-2xl font-semibold text-zinc-900 mt-1">
            <span className="text-green-600">{totals.paidCount}</span>
            <span className="text-zinc-400"> / </span>
            <span className="text-amber-600">{filteredAndSortedJobs.length - totals.paidCount}</span>
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              <SortHeader field="jobNo">Job #</SortHeader>
              <SortHeader field="customer">Customer</SortHeader>
              <SortHeader field="bradfordPO">Bradford PO #</SortHeader>
              <SortHeader field="sellPrice">Total Billed</SortHeader>
              <SortHeader field="bradfordOwesJD">Bradford Owes JD</SortHeader>
              <SortHeader field="impactOwesJD">Impact Owes JD</SortHeader>
              <SortHeader field="impactKeeps">Impact Keeps</SortHeader>
              <SortHeader field="jdInvoice">JD Invoice #</SortHeader>
              <SortHeader field="paid">Paid</SortHeader>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filteredAndSortedJobs.map((job) => (
              <tr
                key={job.id}
                className="hover:bg-zinc-50 transition-colors cursor-pointer"
                onClick={() => handleRowClick(job)}
              >
                <td className="px-4 py-3 text-sm font-medium text-zinc-900">
                  {job.jobNo || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600">
                  {job.customer?.name || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 font-mono">
                  {job.bradfordRefNumber || job.partnerPONumber || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-900 font-medium">
                  {formatCurrency(job.sellPrice)}
                </td>
                <td className="px-4 py-3 text-sm text-orange-600 font-medium">
                  {formatCurrency(job.profit?.bradfordOwesJD)}
                </td>
                <td className="px-4 py-3 text-sm text-blue-600 font-medium">
                  {formatCurrency(job.profit?.impactOwesJD)}
                </td>
                <td className="px-4 py-3 text-sm text-green-600 font-medium">
                  {formatCurrency(job.profit?.impactTotal)}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 font-mono">
                  {job.jdInvoiceNumber || '-'}
                </td>
                <td className="px-4 py-3">
                  {job.jdPaymentPaid ? (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <Check className="w-4 h-4" />
                      <span className="text-xs">Paid</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-zinc-400">
                      <Circle className="w-4 h-4" />
                      <span className="text-xs">Pending</span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleDownloadPDF(e, job)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-colors"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleSendInvoice(e, job)}
                      className={`p-1.5 rounded transition-colors ${
                        job.jdInvoiceEmailedAt
                          ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                          : 'text-blue-500 hover:text-blue-700 hover:bg-blue-50'
                      }`}
                      title={job.jdInvoiceEmailedAt ? 'Resend Invoice' : 'Send Invoice'}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredAndSortedJobs.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-zinc-500">
                  No jobs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Job Detail Sidebar */}
      <JDJobDetailSidebar
        job={selectedJob}
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
        onInvoiceSent={handleInvoiceSent}
      />
    </div>
  );
}

export default JDView;
