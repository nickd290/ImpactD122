import React, { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { jobsApi, pdfApi } from '../lib/api';
import { JobDrawer } from './JobDrawer';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

export function FinancialsView() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'invoiced' | 'paid'>('all');
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const jobsData = await jobsApi.getAll();
      setJobs(jobsData);
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

  const handleUpdateBradfordRef = async (jobId: string, refNumber: string) => {
    try {
      const updatedJob = await jobsApi.updateBradfordRef(jobId, refNumber);
      setSelectedJob(updatedJob);
      await loadJobs();
    } catch (error) {
      console.error('Failed to update Bradford reference:', error);
      alert('Failed to update Bradford reference. Please try again.');
    }
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

  const calculateCost = (job: any) => {
    return job.lineItems?.reduce((sum: number, item: any) =>
      sum + (item.quantity * item.unitCost), 0) || 0;
  };

  const calculateRevenue = (job: any) => {
    return job.lineItems?.reduce((sum: number, item: any) =>
      sum + (item.quantity * item.unitPrice), 0) || 0;
  };

  const calculateProfit = (job: any) => {
    return calculateRevenue(job) - calculateCost(job);
  };

  const filteredJobs = jobs.filter(job => {
    if (filter === 'unpaid') return ['APPROVED', 'PO_ISSUED', 'IN_PRODUCTION', 'SHIPPED'].includes(job.status);
    if (filter === 'invoiced') return job.status === 'INVOICED';
    if (filter === 'paid') return job.status === 'PAID';
    return true;
  });

  // Calculate totals
  const totals = filteredJobs.reduce((acc, job) => ({
    revenue: acc.revenue + calculateRevenue(job),
    cost: acc.cost + calculateCost(job),
    profit: acc.profit + calculateProfit(job),
  }), { revenue: 0, cost: 0, profit: 0 });

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

      {/* Filter Tabs */}
      <div className="mb-4 flex gap-2">
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
          onClick={() => setFilter('unpaid')}
          className={`px-4 py-2 rounded-lg font-medium ${
            filter === 'unpaid'
              ? 'bg-red-600 text-white'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          Unpaid ({jobs.filter(j => ['APPROVED', 'PO_ISSUED', 'IN_PRODUCTION', 'SHIPPED'].includes(j.status)).length})
        </button>
        <button
          onClick={() => setFilter('invoiced')}
          className={`px-4 py-2 rounded-lg font-medium ${
            filter === 'invoiced'
              ? 'bg-orange-600 text-white'
              : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
          }`}
        >
          Invoiced ({jobs.filter(j => j.status === 'INVOICED').length})
        </button>
        <button
          onClick={() => setFilter('paid')}
          className={`px-4 py-2 rounded-lg font-medium ${
            filter === 'paid'
              ? 'bg-green-600 text-white'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
        >
          Paid ({jobs.filter(j => j.status === 'PAID').length})
        </button>
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
              onClick={() => handleBatchUpdateStatus('INVOICED')}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700"
            >
              Mark as Invoiced
            </button>
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

      {/* Totals Row */}
      <div className="bg-gray-900 text-white rounded-lg p-4 mb-4 grid grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">Total Revenue</p>
          <p className="text-xl font-bold">{formatCurrency(totals.revenue)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Total Cost</p>
          <p className="text-xl font-bold">{formatCurrency(totals.cost)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Total Profit</p>
          <p className="text-xl font-bold text-green-400">{formatCurrency(totals.profit)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Jobs Shown</p>
          <p className="text-xl font-bold">{filteredJobs.length}</p>
        </div>
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Job #</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vendor</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Cost</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Revenue</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Profit</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Payment</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredJobs.map((job) => {
              const cost = calculateCost(job);
              const revenue = calculateRevenue(job);
              const profit = calculateProfit(job);
              const isPartner = job.vendor?.isPartner;

              return (
                <tr
                  key={job.id}
                  className={`hover:bg-gray-50 transition-colors ${isPartner ? 'bg-orange-50' : ''}`}
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
                    className="px-4 py-3 text-sm font-medium text-gray-900 cursor-pointer"
                  >
                    {job.number}
                    {isPartner && (
                      <span className="ml-2 px-1.5 py-0.5 bg-impact-orange text-white rounded text-xs">
                        PARTNER
                      </span>
                    )}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-gray-900 cursor-pointer">{job.customer?.name || '-'}</td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-gray-900 cursor-pointer">{job.vendor?.name || '-'}</td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-right font-semibold text-gray-900 cursor-pointer">{formatCurrency(cost)}</td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm text-right font-semibold text-gray-900 cursor-pointer">{formatCurrency(revenue)}</td>
                  <td onClick={() => handleRowClick(job)} className={`px-4 py-3 text-sm text-right font-bold cursor-pointer ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(profit)}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 text-sm cursor-pointer">
                    {job.status === 'PAID' ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                        Paid
                      </span>
                    ) : job.status === 'INVOICED' ? (
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
                        Invoiced
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                        Unpaid
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2">
                      {job.status !== 'INVOICED' && job.status !== 'PAID' && (
                        <button
                          onClick={() => handleUpdateStatus(job.id, 'INVOICED')}
                          className="px-2 py-1 bg-orange-600 text-white rounded text-xs font-medium hover:bg-orange-700"
                          title="Mark as Invoiced"
                        >
                          Invoice
                        </button>
                      )}
                      {job.status !== 'PAID' && (
                        <button
                          onClick={() => handleUpdateStatus(job.id, 'PAID')}
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 flex items-center gap-1"
                          title="Mark as Paid"
                        >
                          <Check className="w-3 h-3" />
                          Paid
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-900 text-white">
            <tr>
              <td className="px-4 py-3"></td>
              <td colSpan={3} className="px-4 py-3 text-sm font-bold">TOTALS</td>
              <td className="px-4 py-3 text-sm text-right font-bold">{formatCurrency(totals.cost)}</td>
              <td className="px-4 py-3 text-sm text-right font-bold">{formatCurrency(totals.revenue)}</td>
              <td className="px-4 py-3 text-sm text-right font-bold text-green-400">{formatCurrency(totals.profit)}</td>
              <td colSpan={2} className="px-4 py-3 text-sm text-right font-bold">{filteredJobs.length} jobs</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Job Drawer */}
      {selectedJob && (
        <JobDrawer
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setSelectedJob(null);
          }}
          job={selectedJob}
          onGenerateEmail={() => {}}
          onDownloadPO={() => pdfApi.generateVendorPO(selectedJob.id)}
          onDownloadInvoice={() => pdfApi.generateInvoice(selectedJob.id)}
          onDownloadQuote={() => pdfApi.generateQuote(selectedJob.id)}
          onUpdateBradfordRef={handleUpdateBradfordRef}
        />
      )}
    </div>
  );
}
