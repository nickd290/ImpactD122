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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-impact-red mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading financials...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Financials</h2>
        <p className="text-gray-600 mt-1">All jobs with payment tracking</p>
      </div>

      {/* Filter Tabs + Statement Download */}
      <div className="mb-4 flex justify-between items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Jobs ({jobs.length})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'active'
                ? 'bg-yellow-600 text-white'
                : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
            }`}
          >
            Unpaid ({jobs.filter(j => !j.customerPaymentDate).length})
          </button>
          <button
            onClick={() => setFilter('paid')}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === 'paid'
                ? 'bg-green-600 text-white'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            Paid ({jobs.filter(j => !!j.customerPaymentDate).length})
          </button>
        </div>

        {/* Customer Statement Download */}
        <div className="flex items-center gap-2">
          <select
            value={statementCustomerId}
            onChange={(e) => setStatementCustomerId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                All
              </button>
              <button
                onClick={() => pdfApi.generateStatement(statementCustomerId, 'unpaid')}
                className="px-3 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700"
              >
                Unpaid Only
              </button>
            </>
          )}
        </div>
      </div>

      {/* Batch Actions */}
      {selectedJobIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">
              {selectedJobIds.size} job{selectedJobIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setSelectedJobIds(new Set())}
              className="text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Clear selection
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleBatchUpdateStatus('PAID')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Mark as Paid
            </button>
          </div>
        </div>
      )}

      {/* Total Summary */}
      <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-sm text-green-600 font-medium">Total Sell ({filteredJobs.length} jobs)</p>
        <p className="text-2xl font-bold text-green-700">{formatCurrency(totals.sellPrice)}</p>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-12">
                <input
                  type="checkbox"
                  checked={selectedJobIds.size === filteredJobs.length && filteredJobs.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Job</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Customer PO #</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Customer</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Sell</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Spread</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Split</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Customer Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredJobs.map((job) => {
              const fin = getJobFinancials(job);

              return (
                <tr
                  key={job.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedJobIds.has(job.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleJobSelection(job.id);
                      }}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                  </td>
                  <td
                    onClick={() => handleRowClick(job)}
                    className="px-4 py-3 cursor-pointer"
                  >
                    <p className="text-sm font-medium text-gray-900">{job.number}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[150px]">{job.title}</p>
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-gray-600 cursor-pointer">
                    {job.customerPONumber || '-'}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-gray-900 cursor-pointer">
                    {job.customer?.name || '-'}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-right font-semibold text-green-600 cursor-pointer">
                    {formatCurrency(fin.sellPrice)}
                  </td>
                  <td onClick={() => handleRowClick(job)} className={`px-4 py-3 text-sm text-right font-bold cursor-pointer ${fin.spread >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(fin.spread)}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-right cursor-pointer relative group">
                    <span className="font-semibold text-blue-600">{formatCurrency(fin.impactTotal)}</span>
                    <div className="hidden group-hover:block absolute bg-gray-900 text-white text-xs p-2 rounded -top-12 right-0 whitespace-nowrap z-10 shadow-lg">
                      <div className="text-orange-300">Bradford: {formatCurrency(fin.bradfordTotal)}</div>
                      <div className="text-blue-300">Impact: {formatCurrency(fin.impactTotal)}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    {job.customerPaymentDate ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium inline-flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Customer Paid
                      </span>
                    ) : (
                      <button
                        onClick={(e) => handleMarkCustomerPaid(job.id, e)}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium hover:bg-green-100 hover:text-green-700 transition-colors"
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
          <tfoot className="bg-gray-900 text-white">
            <tr>
              <td className="px-4 py-3"></td>
              <td colSpan={3} className="px-4 py-3 text-sm font-bold">TOTALS ({filteredJobs.length} jobs)</td>
              <td className="px-4 py-3 text-sm text-right font-bold">{formatCurrency(totals.sellPrice)}</td>
              <td className="px-4 py-3 text-sm text-right font-bold text-blue-400">{formatCurrency(totals.spread)}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">
                <span className="text-orange-400">{formatCurrency(totals.bradfordTotal)}</span>
                <span className="text-gray-500 mx-1">/</span>
                <span className="text-blue-400">{formatCurrency(totals.impactTotal)}</span>
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
