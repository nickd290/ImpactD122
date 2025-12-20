import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { jobsApi, pdfApi } from '../lib/api';
import { JobDetailModal } from './JobDetailModal';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

interface FinancialsViewProps {
  onRefresh?: () => void;
}

export function FinancialsView({ onRefresh }: FinancialsViewProps) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'invoiced' | 'paid'>('all');
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [statementCustomerId, setStatementCustomerId] = useState<string>('');
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const response = await jobsApi.getAll();
      // API returns { jobs: [...], counts: {...} }
      setJobs(response.jobs || []);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (jobId: string, status: string) => {
    try {
      await jobsApi.updateStatus(jobId, status);
      await loadJobs();
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update job status. Please try again.');
    }
  };

  const handleRowClick = (job: any) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  const toggleJobSelection = (jobId: string) => {
    const newSelection = new Set(selectedJobIds);
    if (newSelection.has(jobId)) {
      newSelection.delete(jobId);
    } else {
      newSelection.add(jobId);
    }
    setSelectedJobIds(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedJobIds.size === filteredJobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(filteredJobs.map(j => j.id)));
    }
  };

  const handleBatchUpdateStatus = async (status: string) => {
    try {
      await Promise.all(
        Array.from(selectedJobIds).map(jobId =>
          jobsApi.updateStatus(jobId, status)
        )
      );
      setSelectedJobIds(new Set());
      await loadJobs();
    } catch (error) {
      console.error('Failed to update job statuses:', error);
      alert('Failed to update job statuses. Please try again.');
    }
  };

  // Step 1: Mark Customer → Impact as paid
  const handleMarkCustomerPaid = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await jobsApi.markCustomerPaid(jobId);
      await loadJobs();
      // Trigger global refresh so Bradford Stats gets updated
      onRefresh?.();
    } catch (error) {
      console.error('Failed to mark customer paid:', error);
      alert('Failed to mark customer as paid. Please try again.');
    }
  };

  // Use the profit model from the backend, with CPM fallback when not available
  const getJobFinancials = (job: any) => {
    const profit = job.profit || {};

    // If we have valid profit data from the backend, use it
    if (profit.totalCost && profit.totalCost > 0) {
      return {
        sellPrice: profit.sellPrice || Number(job.sellPrice) || 0,
        totalCost: profit.totalCost || 0,
        spread: profit.spread || 0,
        paperMarkup: profit.paperMarkup || 0,
        bradfordTotal: profit.bradfordTotal || 0,
        impactTotal: profit.impactTotal || 0,
      };
    }

    // Fallback: Calculate from CPM data (same logic as JobDetailModal Pricing tab)
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
    // Require BOTH paperCPM AND printCPM for CPM calculation
    const hasCPMData = paperCPM > 0 && printCPM > 0;

    if (hasCPMData && qty > 0) {
      // Use CPM-based calculation
      const paperCost = paperCPM * (qty / 1000);
      const paperMarkup = paperCost * 0.18;
      const mfgCost = printCPM * (qty / 1000);
      const totalCost = paperCost + paperMarkup + mfgCost;
      const spread = sellPrice - totalCost;
      const spreadShare = spread / 2;

      return {
        sellPrice,
        totalCost,
        spread,
        paperMarkup,
        bradfordTotal: spreadShare + paperMarkup, // Bradford gets their half plus paper markup (they handle paper)
        impactTotal: spreadShare, // Impact gets just their half
      };
    }

    // Ultimate fallback: use whatever data we have
    return {
      sellPrice,
      totalCost: profit.totalCost || 0,
      spread: profit.spread || 0,
      paperMarkup: profit.paperMarkup || 0,
      bradfordTotal: profit.bradfordTotal || 0,
      impactTotal: profit.impactTotal || 0,
    };
  };

  const filteredJobs = jobs.filter(job => {
    // Customer filter
    if (filterCustomerId && job.customer?.id !== filterCustomerId) return false;
    // Payment status filter
    if (filter === 'active') return !job.customerPaymentDate; // Not paid by customer
    if (filter === 'paid') return !!job.customerPaymentDate; // Paid by customer
    return true;
  });

  // Extract unique customers for statement dropdown
  const uniqueCustomers = React.useMemo(() => {
    const customerMap = new Map<string, { id: string; name: string }>();
    jobs.forEach(job => {
      if (job.customer?.id && job.customer?.name) {
        customerMap.set(job.customer.id, { id: job.customer.id, name: job.customer.name });
      }
    });
    return Array.from(customerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [jobs]);

  // Calculate totals using new model
  const totals = filteredJobs.reduce((acc, job) => {
    const fin = getJobFinancials(job);
    return {
      sellPrice: acc.sellPrice + fin.sellPrice,
      totalCost: acc.totalCost + fin.totalCost,
      spread: acc.spread + fin.spread,
      bradfordTotal: acc.bradfordTotal + fin.bradfordTotal,
      impactTotal: acc.impactTotal + fin.impactTotal,
    };
  }, { sellPrice: 0, totalCost: 0, spread: 0, bradfordTotal: 0, impactTotal: 0 });

  // Calculate cash position: money received vs paid vs owed
  const cashPosition = React.useMemo(() => {
    return filteredJobs.reduce((acc, job) => {
      const fin = getJobFinancials(job);
      const customerPaid = job.customerPaymentDate
        ? (Number(job.customerPaymentAmount) || Number(job.sellPrice) || 0)
        : 0;
      const bradfordPaid = job.bradfordPaymentDate
        ? (Number(job.bradfordPaymentAmount) || 0)
        : 0;
      const vendorPaid = job.vendorPaymentDate
        ? (Number(job.vendorPaymentAmount) || 0)
        : 0;
      // Owed to Bradford: customer paid us, but we haven't paid Bradford yet
      const owedBradford = (job.customerPaymentDate && !job.bradfordPaymentDate)
        ? fin.bradfordTotal
        : 0;

      return {
        received: acc.received + customerPaid,
        paidBradford: acc.paidBradford + bradfordPaid,
        paidVendors: acc.paidVendors + vendorPaid,
        owedBradford: acc.owedBradford + owedBradford,
        jobsReceived: acc.jobsReceived + (job.customerPaymentDate ? 1 : 0),
        jobsPaidBradford: acc.jobsPaidBradford + (job.bradfordPaymentDate ? 1 : 0),
        jobsPaidVendors: acc.jobsPaidVendors + (job.vendorPaymentDate ? 1 : 0),
        jobsOwedBradford: acc.jobsOwedBradford + ((job.customerPaymentDate && !job.bradfordPaymentDate) ? 1 : 0),
      };
    }, { received: 0, paidBradford: 0, paidVendors: 0, owedBradford: 0, jobsReceived: 0, jobsPaidBradford: 0, jobsPaidVendors: 0, jobsOwedBradford: 0 });
  }, [filteredJobs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 mx-auto"></div>
          <p className="mt-4 text-zinc-500 text-sm">Loading financials...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-medium text-zinc-900">Financials</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Payment tracking and cash flow</p>
      </div>

      {/* Cash Position Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Received from Customers */}
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium text-zinc-500">Received from Customers</p>
          <p className="text-2xl font-medium text-green-600 mt-2 tabular-nums">{formatCurrency(cashPosition.received)}</p>
          <p className="text-xs text-zinc-400 mt-1">{cashPosition.jobsReceived} jobs paid</p>
        </div>

        {/* Owed to Bradford */}
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium text-zinc-500">Owed to Bradford</p>
          <p className="text-2xl font-medium text-red-600 mt-2 tabular-nums">{formatCurrency(cashPosition.owedBradford)}</p>
          <p className="text-xs text-zinc-400 mt-1">{cashPosition.jobsOwedBradford} jobs pending</p>
        </div>

        {/* Paid to Bradford */}
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium text-zinc-500">Paid to Bradford</p>
          <p className="text-2xl font-medium text-amber-600 mt-2 tabular-nums">{formatCurrency(cashPosition.paidBradford)}</p>
          <p className="text-xs text-zinc-400 mt-1">{cashPosition.jobsPaidBradford} jobs paid</p>
        </div>

        {/* Paid to Vendors */}
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium text-zinc-500">Paid to Vendors</p>
          <p className="text-2xl font-medium text-zinc-600 mt-2 tabular-nums">{formatCurrency(cashPosition.paidVendors)}</p>
          <p className="text-xs text-zinc-400 mt-1">{cashPosition.jobsPaidVendors} jobs paid</p>
        </div>
      </div>

      {/* Net Cash Position - Full Width */}
      {(() => {
        const totalPaid = cashPosition.paidBradford + cashPosition.paidVendors;
        const netPosition = cashPosition.received - totalPaid - cashPosition.owedBradford;
        const isPositive = netPosition >= 0;
        return (
          <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-medium text-zinc-500">Net Cash Position</p>
                <p className={`text-3xl font-medium mt-1 tabular-nums ${
                  isPositive ? 'text-zinc-900' : 'text-red-600'
                }`}>
                  {formatCurrency(netPosition)}
                </p>
              </div>
              <div className="text-right text-sm text-zinc-500">
                <p>Received: <span className="tabular-nums">{formatCurrency(cashPosition.received)}</span></p>
                <p>− Paid: <span className="tabular-nums">{formatCurrency(totalPaid)}</span></p>
                <p>− Owed: <span className="tabular-nums">{formatCurrency(cashPosition.owedBradford)}</span></p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Filter Tabs + Statement Download */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
            }`}
          >
            All Jobs <span className="text-xs tabular-nums ml-1">{jobs.length}</span>
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === 'active'
                ? 'bg-amber-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
            }`}
          >
            Unpaid <span className="text-xs tabular-nums ml-1">{jobs.filter(j => !j.customerPaymentDate).length}</span>
          </button>
          <button
            onClick={() => setFilter('paid')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === 'paid'
                ? 'bg-green-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
            }`}
          >
            Paid <span className="text-xs tabular-nums ml-1">{jobs.filter(j => !!j.customerPaymentDate).length}</span>
          </button>

          {/* Customer Filter */}
          <select
            value={filterCustomerId}
            onChange={(e) => setFilterCustomerId(e.target.value)}
            className="ml-4 px-3 py-1.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400"
          >
            <option value="">All Customers</option>
            {uniqueCustomers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {filterCustomerId && (
            <button
              onClick={() => setFilterCustomerId('')}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Customer Statement Download */}
        <div className="flex items-center gap-2">
          <select
            value={statementCustomerId}
            onChange={(e) => setStatementCustomerId(e.target.value)}
            className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400"
          >
            <option value="">Download Statement...</option>
            {uniqueCustomers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {statementCustomerId && (
            <>
              <button
                onClick={() => pdfApi.generateStatement(statementCustomerId, 'all')}
                className="px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800"
              >
                All
              </button>
              <button
                onClick={() => pdfApi.generateStatement(statementCustomerId, 'unpaid')}
                className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
              >
                Unpaid
              </button>
            </>
          )}
        </div>
      </div>

      {/* Batch Actions */}
      {selectedJobIds.size > 0 && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-700">
              {selectedJobIds.size} job{selectedJobIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setSelectedJobIds(new Set())}
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              Clear
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleBatchUpdateStatus('PAID')}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Mark as Paid
            </button>
          </div>
        </div>
      )}

      {/* Total Summary */}
      <div className="mb-4 p-4 bg-white border border-zinc-200 rounded-lg">
        <p className="text-xs font-medium text-zinc-500">Total Sell ({filteredJobs.length} jobs)</p>
        <p className="text-2xl font-medium text-zinc-900 tabular-nums mt-1">{formatCurrency(totals.sellPrice)}</p>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
        <table className="min-w-full">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="px-4 py-3 text-left w-12">
                <input
                  type="checkbox"
                  checked={selectedJobIds.size === filteredJobs.length && filteredJobs.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-zinc-900 rounded border-zinc-300 focus:ring-zinc-400"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Job</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Customer PO #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Customer</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">Sell</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">Spread</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">Split</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-zinc-500">Customer Paid</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.map((job) => {
              const fin = getJobFinancials(job);

              return (
                <tr
                  key={job.id}
                  className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedJobIds.has(job.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleJobSelection(job.id);
                      }}
                      className="w-4 h-4 text-zinc-900 rounded border-zinc-300 focus:ring-zinc-400"
                    />
                  </td>
                  <td
                    onClick={() => handleRowClick(job)}
                    className="px-4 py-3 cursor-pointer"
                  >
                    <p className="text-sm font-medium text-zinc-900">{job.number}</p>
                    <p className="text-xs text-zinc-400 truncate max-w-[150px]">{job.title}</p>
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-zinc-600 cursor-pointer">
                    {job.customerPONumber || '-'}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-zinc-600 cursor-pointer">
                    {job.customer?.name || '-'}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-right font-medium text-green-600 cursor-pointer tabular-nums">
                    {formatCurrency(fin.sellPrice)}
                  </td>
                  <td onClick={() => handleRowClick(job)} className={`px-4 py-3 text-sm text-right font-medium cursor-pointer tabular-nums ${fin.spread >= 0 ? 'text-zinc-900' : 'text-red-600'}`}>
                    {formatCurrency(fin.spread)}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-right cursor-pointer relative group tabular-nums">
                    <span className="font-medium text-zinc-600">{formatCurrency(fin.impactTotal)}</span>
                    <div className="hidden group-hover:block absolute bg-zinc-900 text-white text-xs p-2 rounded -top-12 right-0 whitespace-nowrap z-10 shadow-lg">
                      <div className="text-amber-300 tabular-nums">Bradford: {formatCurrency(fin.bradfordTotal)}</div>
                      <div className="text-zinc-300 tabular-nums">Impact: {formatCurrency(fin.impactTotal)}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    {job.customerPaymentDate ? (
                      <span className="px-2 py-1 bg-green-50 text-green-600 rounded-full text-xs font-medium inline-flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Paid
                      </span>
                    ) : (
                      <button
                        onClick={(e) => handleMarkCustomerPaid(job.id, e)}
                        className="px-3 py-1 bg-zinc-100 text-zinc-600 rounded-full text-xs font-medium hover:bg-green-50 hover:text-green-600 transition-colors"
                        title="Mark Customer Paid"
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-zinc-900 text-white">
            <tr>
              <td className="px-4 py-3"></td>
              <td colSpan={3} className="px-4 py-3 text-sm font-medium">Totals ({filteredJobs.length} jobs)</td>
              <td className="px-4 py-3 text-sm text-right font-medium tabular-nums">{formatCurrency(totals.sellPrice)}</td>
              <td className="px-4 py-3 text-sm text-right font-medium tabular-nums">{formatCurrency(totals.spread)}</td>
              <td className="px-4 py-3 text-sm text-right font-medium tabular-nums">
                <span className="text-amber-400">{formatCurrency(totals.bradfordTotal)}</span>
                <span className="text-zinc-500 mx-1">/</span>
                <span className="text-zinc-300">{formatCurrency(totals.impactTotal)}</span>
              </td>
              <td className="px-4 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <JobDetailModal
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setSelectedJob(null);
          }}
          job={selectedJob}
          onDownloadPO={() => pdfApi.generateVendorPO(selectedJob.id)}
          onDownloadInvoice={() => pdfApi.generateInvoice(selectedJob.id)}
          onDownloadQuote={() => pdfApi.generateQuote(selectedJob.id)}
          onRefresh={loadJobs}
        />
      )}
    </div>
  );
}
