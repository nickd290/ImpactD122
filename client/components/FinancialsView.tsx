import React, { useState, useEffect, useMemo } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { jobsApi, pdfApi } from '../lib/api';
import { JobDetailModal } from './JobDetailModal';
import {
  isClientPaid,
  isBgePaid,
  isJdPaid,
  needsVendorPay,
  impactProductionPayee,
  isImpactProductionPaid,
  moneyStatusBadges,
} from '../lib/jobPipeline';
import { cn } from '../lib/utils';

function MoneyBadge({
  text,
  tone,
}: {
  text: string;
  tone: 'muted' | 'warn' | 'good' | 'action' | 'paid';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border',
        tone === 'paid' && 'bg-emerald-50 text-emerald-800 border-emerald-200',
        tone === 'good' && 'bg-emerald-100 text-emerald-900 border-emerald-300',
        tone === 'action' && 'bg-orange-100 text-[#C0512A] border-orange-300',
        tone === 'warn' && 'bg-amber-50 text-amber-800 border-amber-200',
        tone === 'muted' && 'bg-zinc-100 text-zinc-500 border-zinc-200'
      )}
    >
      {text}
    </span>
  );
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

/** Money AR filters — not floor COMPLETED */
type MoneyFilter =
  | 'all'
  | 'await_client'   // customer not paid
  | 'pay_vendor'     // customer paid → still owe BGE or JD
  | 'pay_bge'        // customer paid → Impact owes BGE
  | 'pay_jd'         // customer paid → Impact owes JD
  | 'settled';       // client + production paid

interface FinancialsViewProps {
  onRefresh?: () => void;
}

export function FinancialsView({ onRefresh }: FinancialsViewProps) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState<MoneyFilter>('pay_vendor');
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [statementCustomerId, setStatementCustomerId] = useState<string>('');
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await jobsApi.getAll();
      // API returns { jobs: [...], counts: {...} }
      setJobs(response.jobs || []);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const softReload = async () => {
    await loadJobs(true);
    onRefresh?.();
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
    setPayingId(jobId);
    try {
      await jobsApi.markCustomerPaid(jobId);
      toast.success('Customer paid — next: pay BGE or JD');
      await softReload();
    } catch (error) {
      console.error('Failed to mark customer paid:', error);
      toast.error('Failed to mark customer paid');
    } finally {
      setPayingId(null);
    }
  };

  const handleMarkProductionPaid = async (
    job: any,
    e: React.MouseEvent,
    who: 'bradford' | 'jd'
  ) => {
    e.stopPropagation();
    setPayingId(`${job.id}-${who}`);
    try {
      if (who === 'bradford') {
        await jobsApi.markBradfordPaid(job.id, { sendInvoice: false });
        toast.success('Marked BGE paid');
      } else {
        await jobsApi.markJDPaid(job.id);
        toast.success('Marked JD paid');
      }
      await softReload();
    } catch (error) {
      console.error('Failed to mark production paid:', error);
      toast.error('Failed to mark paid');
    } finally {
      setPayingId(null);
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

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status !== 'CANCELLED'),
    [jobs]
  );

  const moneyCounts = useMemo(() => {
    let await_client = 0;
    let pay_vendor = 0;
    let pay_bge = 0;
    let pay_jd = 0;
    let settled = 0;
    for (const j of activeJobs) {
      if (!isClientPaid(j)) {
        await_client++;
        continue;
      }
      if (needsVendorPay(j)) {
        pay_vendor++;
        const payee = impactProductionPayee(j);
        if (payee === 'BGE') pay_bge++;
        else pay_jd++;
      } else if (isImpactProductionPaid(j)) {
        settled++;
      }
    }
    return {
      all: activeJobs.length,
      await_client,
      pay_vendor,
      pay_bge,
      pay_jd,
      settled,
    };
  }, [activeJobs]);

  const filteredJobs = useMemo(() => {
    return activeJobs.filter((job) => {
      if (filterCustomerId && job.customer?.id !== filterCustomerId) return false;
      switch (filter) {
        case 'await_client':
          return !isClientPaid(job);
        case 'pay_vendor':
          // Customer paid us — Impact still owes BGE or JD
          return needsVendorPay(job);
        case 'pay_bge':
          return needsVendorPay(job) && impactProductionPayee(job) === 'BGE';
        case 'pay_jd':
          return needsVendorPay(job) && impactProductionPayee(job) === 'JD';
        case 'settled':
          return isClientPaid(job) && isImpactProductionPaid(job);
        case 'all':
        default:
          return true;
      }
    });
  }, [activeJobs, filter, filterCustomerId]);

  // Extract unique customers for statement dropdown
  const uniqueCustomers = useMemo(() => {
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

  // Cash position — paper-aware: Impact owes BGE or JD after client pays
  const cashPosition = useMemo(() => {
    return filteredJobs.reduce((acc, job) => {
      const fin = getJobFinancials(job);
      const clientPaidAmt = isClientPaid(job)
        ? (Number(job.customerPaymentAmount) || Number(job.sellPrice) || 0)
        : 0;
      const bgePaidAmt = isBgePaid(job)
        ? (Number(job.bradfordPaymentAmount) || fin.bradfordTotal || 0)
        : 0;
      const jdPaidAmt = isJdPaid(job)
        ? (Number(job.jdPaymentAmount) || fin.totalCost || 0)
        : 0;

      let owedBge = 0;
      let owedJd = 0;
      if (needsVendorPay(job)) {
        const payee = impactProductionPayee(job);
        if (payee === 'BGE') owedBge = fin.bradfordTotal || fin.totalCost || 0;
        else owedJd = fin.totalCost || 0;
      }

      return {
        received: acc.received + clientPaidAmt,
        paidBradford: acc.paidBradford + bgePaidAmt,
        paidJd: acc.paidJd + jdPaidAmt,
        owedBradford: acc.owedBradford + owedBge,
        owedJd: acc.owedJd + owedJd,
        jobsReceived: acc.jobsReceived + (isClientPaid(job) ? 1 : 0),
        jobsPaidBradford: acc.jobsPaidBradford + (isBgePaid(job) ? 1 : 0),
        jobsPaidJd: acc.jobsPaidJd + (isJdPaid(job) ? 1 : 0),
        jobsOwedBradford: acc.jobsOwedBradford + (owedBge > 0 ? 1 : 0),
        jobsOwedJd: acc.jobsOwedJd + (owedJd > 0 ? 1 : 0),
      };
    }, {
      received: 0,
      paidBradford: 0,
      paidJd: 0,
      owedBradford: 0,
      owedJd: 0,
      jobsReceived: 0,
      jobsPaidBradford: 0,
      jobsPaidJd: 0,
      jobsOwedBradford: 0,
      jobsOwedJd: 0,
    });
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
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium text-zinc-500">Received from Customers</p>
          <p className="text-2xl font-medium text-green-600 mt-2 tabular-nums">{formatCurrency(cashPosition.received)}</p>
          <p className="text-xs text-zinc-400 mt-1">{cashPosition.jobsReceived} jobs</p>
        </div>
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium text-zinc-500">Owe BGE (client paid)</p>
          <p className="text-2xl font-medium text-red-600 mt-2 tabular-nums">{formatCurrency(cashPosition.owedBradford)}</p>
          <p className="text-xs text-zinc-400 mt-1">{cashPosition.jobsOwedBradford} jobs · Bradford paper</p>
        </div>
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium text-zinc-500">Owe JD (client paid)</p>
          <p className="text-2xl font-medium text-[#C0512A] mt-2 tabular-nums">{formatCurrency(cashPosition.owedJd)}</p>
          <p className="text-xs text-zinc-400 mt-1">{cashPosition.jobsOwedJd} jobs · JD paper</p>
        </div>
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium text-zinc-500">Paid production</p>
          <p className="text-2xl font-medium text-zinc-700 mt-2 tabular-nums">
            {formatCurrency(cashPosition.paidBradford + cashPosition.paidJd)}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            BGE {cashPosition.jobsPaidBradford} · JD {cashPosition.jobsPaidJd}
          </p>
        </div>
      </div>

      {/* Net Cash Position */}
      {(() => {
        const totalPaid = cashPosition.paidBradford + cashPosition.paidJd;
        const totalOwed = cashPosition.owedBradford + cashPosition.owedJd;
        const netPosition = cashPosition.received - totalPaid - totalOwed;
        const isPositive = netPosition >= 0;
        return (
          <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-medium text-zinc-500">Net Cash Position (filtered)</p>
                <p className={`text-3xl font-medium mt-1 tabular-nums ${
                  isPositive ? 'text-zinc-900' : 'text-red-600'
                }`}>
                  {formatCurrency(netPosition)}
                </p>
              </div>
              <div className="text-right text-sm text-zinc-500">
                <p>Received: <span className="tabular-nums">{formatCurrency(cashPosition.received)}</span></p>
                <p>− Paid BGE/JD: <span className="tabular-nums">{formatCurrency(totalPaid)}</span></p>
                <p>− Still owe: <span className="tabular-nums">{formatCurrency(totalOwed)}</span></p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Money filters: client paid → pay BGE/JD */}
      <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          {(
            [
              { id: 'pay_vendor' as const, label: 'Client paid → pay BGE/JD', count: moneyCounts.pay_vendor, active: 'bg-[#C0512A] text-white' },
              { id: 'pay_bge' as const, label: 'Pay BGE', count: moneyCounts.pay_bge, active: 'bg-amber-600 text-white' },
              { id: 'pay_jd' as const, label: 'Pay JD', count: moneyCounts.pay_jd, active: 'bg-[#2B3A4A] text-white' },
              { id: 'await_client' as const, label: 'Await client', count: moneyCounts.await_client, active: 'bg-amber-500 text-white' },
              { id: 'settled' as const, label: 'Settled', count: moneyCounts.settled, active: 'bg-emerald-600 text-white' },
              { id: 'all' as const, label: 'All', count: moneyCounts.all, active: 'bg-zinc-900 text-white' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                filter === t.id
                  ? t.active
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
              )}
            >
              {t.label}{' '}
              <span className="text-xs tabular-nums ml-1 opacity-80">{t.count}</span>
            </button>
          ))}

          <select
            value={filterCustomerId}
            onChange={(e) => setFilterCustomerId(e.target.value)}
            className="ml-2 px-3 py-1.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400"
          >
            <option value="">All Customers</option>
            {uniqueCustomers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {filterCustomerId && (
            <button
              type="button"
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
                All (paid + unpaid)
              </button>
              <button
                onClick={() => pdfApi.generateStatement(statementCustomerId, 'unpaid')}
                className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
              >
                Unpaid
              </button>
              <button
                onClick={() => pdfApi.generateStatement(statementCustomerId, 'paid')}
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
              >
                Paid
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
      <div className="bg-white rounded-lg border border-zinc-200 overflow-visible">
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
              <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">Job</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">Customer</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">Cust PO</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">BGE PO</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">Inv #</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-zinc-500">Sell</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-zinc-500">Spread</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">Paper</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500">Money</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-sm text-zinc-400">
                  No jobs in this filter.
                </td>
              </tr>
            )}
            {filteredJobs.map((job) => {
              const fin = getJobFinancials(job);
              const clientPaid = isClientPaid(job);
              const needPay = needsVendorPay(job);
              const payee = impactProductionPayee(job);
              const badges = moneyStatusBadges(job);
              const paper = (job.paperSource || 'BRADFORD').toUpperCase();
              const paperLabel =
                paper === 'VENDOR' || paper === 'CUSTOMER' ? 'JD paper' : 'BGE paper';
              const invNo =
                job.customerInvoiceNumber || job.invoiceNumber || null;
              const bgePo =
                job.partnerPONumber ||
                job.bradfordRefNumber ||
                null;

              return (
                <tr
                  key={job.id}
                  className={cn(
                    'border-b border-zinc-100 hover:bg-zinc-50 transition-colors',
                    needPay && 'bg-orange-50/50'
                  )}
                >
                  <td className="px-3 py-3 text-sm">
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
                    className="px-3 py-3 cursor-pointer"
                  >
                    <p className="text-sm font-mono font-semibold text-zinc-900">{job.number || job.jobNo}</p>
                    <p className="text-xs text-zinc-400 truncate max-w-[140px]" title={job.title}>{job.title}</p>
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-3 py-3 text-sm text-zinc-700 cursor-pointer max-w-[140px] truncate" title={job.customer?.name || ''}>
                    {job.customer?.name || '—'}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-3 py-3 text-sm font-mono text-zinc-700 cursor-pointer tabular-nums">
                    {job.customerPONumber || '—'}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-3 py-3 text-sm font-mono text-zinc-700 cursor-pointer tabular-nums">
                    {bgePo || '—'}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-3 py-3 text-sm font-mono text-zinc-600 cursor-pointer tabular-nums">
                    {invNo || '—'}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-3 py-3 text-sm text-right font-medium text-green-600 cursor-pointer tabular-nums">
                    {formatCurrency(fin.sellPrice)}
                  </td>
                  <td onClick={() => handleRowClick(job)} className={`px-3 py-3 text-sm text-right font-medium cursor-pointer tabular-nums ${fin.spread >= 0 ? 'text-zinc-900' : 'text-red-600'}`}>
                    {formatCurrency(fin.spread)}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-3 py-3 text-xs text-zinc-500 cursor-pointer whitespace-nowrap">
                    {paperLabel}
                  </td>
                  <td onClick={() => handleRowClick(job)} className="px-4 py-3 cursor-pointer">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {badges.map((b) => (
                        <MoneyBadge key={b.text} text={b.text} tone={b.tone} />
                      ))}
                    </div>
                    {clientPaid && job.customerPaymentDate && (
                      <div className="text-[10px] text-zinc-400 mt-1">
                        Client {new Date(job.customerPaymentDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                      </div>
                    )}
                    {needPay && (
                      <div className="text-[10px] font-semibold text-[#C0512A] mt-0.5">
                        Client paid — still owe {payee === 'BGE' ? 'BGE' : 'JD'}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {!clientPaid ? (
                        <button
                          type="button"
                          disabled={payingId === job.id}
                          onClick={(e) => handleMarkCustomerPaid(job.id, e)}
                          className="px-2.5 py-1 bg-zinc-100 text-zinc-700 rounded-full text-xs font-medium hover:bg-green-50 hover:text-green-700 transition-colors disabled:opacity-50"
                          title="Customer paid Impact"
                        >
                          Mark client paid
                        </button>
                      ) : needPay ? (
                        payee === 'BGE' ? (
                          <button
                            type="button"
                            disabled={payingId === `${job.id}-bradford`}
                            onClick={(e) => handleMarkProductionPaid(job, e, 'bradford')}
                            className="px-2.5 py-1 bg-orange-500 text-white rounded-full text-xs font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
                            title="Impact paid Bradford / BGE"
                          >
                            Mark BGE paid
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={payingId === `${job.id}-jd`}
                            onClick={(e) => handleMarkProductionPaid(job, e, 'jd')}
                            className="px-2.5 py-1 bg-[#2B3A4A] text-white rounded-full text-xs font-bold hover:bg-[#1f2a36] transition-colors disabled:opacity-50"
                            title="Impact paid JD Graphic"
                          >
                            Mark JD paid
                          </button>
                        )
                      ) : (
                        <span className="px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium inline-flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Settled
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-zinc-900 text-white">
            <tr>
              <td className="px-3 py-3"></td>
              <td colSpan={5} className="px-3 py-3 text-sm font-medium">Totals ({filteredJobs.length} jobs)</td>
              <td className="px-3 py-3 text-sm text-right font-medium tabular-nums">{formatCurrency(totals.sellPrice)}</td>
              <td className="px-3 py-3 text-sm text-right font-medium tabular-nums">{formatCurrency(totals.spread)}</td>
              <td colSpan={3} className="px-3 py-3 text-xs text-zinc-400">
                BGE share {formatCurrency(totals.bradfordTotal)} · Impact {formatCurrency(totals.impactTotal)}
              </td>
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
          onRefresh={() => softReload()}
        />
      )}
    </div>
  );
}
