import React, { useState, useEffect } from 'react';
import { DollarSign, Building2, TrendingUp, Calendar, Filter, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface Job {
  id: string;
  jobNo: string;
  title: string;
  status: string;
  sellPrice: number;
  jdSuppliesPaper: boolean;
  customer?: { id: string; name: string };
  vendor?: { id: string; name: string };
  purchaseOrders?: { id: string; amount: number; type: string }[];
  createdAt: string;
}

interface ProfitBreakdown {
  sellPrice: number;
  totalCost: number;
  spread: number;
  paperMarkup: number;
  impactShare: number;
  bradfordShare: number;
}

export function AccountingDashboardView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'all' | 'month' | 'quarter' | 'year'>('all');
  const [paperFilter, setPaperFilter] = useState<'all' | 'bradford' | 'vendor'>('all');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/jobs?limit=1000');
      const data = await response.json();
      // Only include jobs with a sell price (completed/invoiced jobs)
      setJobs((data.jobs || []).filter((j: Job) => j.sellPrice && j.sellPrice > 0));
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate profit breakdown for a job using CPM-based calculations
  const calculateProfitBreakdown = (job: Job): ProfitBreakdown => {
    // Use profit object if available (consistent with FinancialsView)
    if (job.profit) {
      return {
        sellPrice: job.profit.sellPrice || job.sellPrice || 0,
        totalCost: job.profit.totalCost || 0,
        spread: job.profit.spread || 0,
        paperMarkup: job.profit.paperMarkup || 0,
        impactShare: job.profit.impactTotal || 0,
        bradfordShare: job.profit.bradfordTotal || 0,
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
    const sellPrice = job.sellPrice || 0;
    // Require BOTH paperCPM AND printCPM for CPM calculation
    const hasCPMData = paperCPM > 0 && printCPM > 0;

    let totalCost: number;
    let paperMarkup: number;

    if (hasCPMData && qty > 0) {
      // Use CPM-based calculation
      const paperCost = paperCPM * (qty / 1000);
      paperMarkup = paperCost * 0.18;
      const mfgCost = printCPM * (qty / 1000);
      totalCost = paperCost + paperMarkup + mfgCost;
    } else {
      // Ultimate fallback: sum PO buyCosts - only Impact→Bradford POs (not Bradford→JD reference POs)
      const impactPOs = (job.purchaseOrders || [])
        .filter((po: any) => po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford');
      totalCost = impactPOs.reduce((sum: number, po: any) => sum + (Number(po.buyCost) || 0), 0);
      // Use stored paperMarkup from PO, not dynamic 18% calculation
      paperMarkup = impactPOs.reduce((sum: number, po: any) => sum + (Number(po.paperMarkup) || 0), 0);
    }

    const spread = sellPrice - totalCost;
    const spreadShare = spread / 2;

    return {
      sellPrice,
      totalCost,
      spread,
      paperMarkup,
      impactShare: spreadShare, // Impact gets just their half
      bradfordShare: spreadShare + paperMarkup, // Bradford gets their half plus paper markup (they handle paper)
    };
  };

  // Apply filters
  const filteredJobs = jobs.filter(job => {
    // Date filter
    if (dateFilter !== 'all') {
      const jobDate = new Date(job.createdAt);
      const now = new Date();

      if (dateFilter === 'month') {
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        if (jobDate < monthAgo) return false;
      } else if (dateFilter === 'quarter') {
        const quarterAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        if (jobDate < quarterAgo) return false;
      } else if (dateFilter === 'year') {
        const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        if (jobDate < yearAgo) return false;
      }
    }

    // Paper filter
    if (paperFilter === 'bradford' && job.jdSuppliesPaper) return false;
    if (paperFilter === 'vendor' && !job.jdSuppliesPaper) return false;

    return true;
  });

  // Calculate totals
  const totals = filteredJobs.reduce(
    (acc, job) => {
      const breakdown = calculateProfitBreakdown(job);
      return {
        totalRevenue: acc.totalRevenue + breakdown.sellPrice,
        totalCost: acc.totalCost + breakdown.totalCost,
        totalSpread: acc.totalSpread + breakdown.spread,
        totalPaperMarkup: acc.totalPaperMarkup + breakdown.paperMarkup,
        impactTotal: acc.impactTotal + breakdown.impactShare,
        bradfordTotal: acc.bradfordTotal + breakdown.bradfordShare,
      };
    },
    { totalRevenue: 0, totalCost: 0, totalSpread: 0, totalPaperMarkup: 0, impactTotal: 0, bradfordTotal: 0 }
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const exportToCSV = () => {
    const headers = ['Job No', 'Title', 'Customer', 'Sell Price', 'Total Cost', 'Spread', 'Paper Markup', 'Impact Share', 'Bradford Share', 'Paper Source'];
    const rows = filteredJobs.map(job => {
      const breakdown = calculateProfitBreakdown(job);
      return [
        job.jobNo,
        job.title || '',
        job.customer?.name || '',
        breakdown.sellPrice.toFixed(2),
        breakdown.totalCost.toFixed(2),
        breakdown.spread.toFixed(2),
        breakdown.paperMarkup.toFixed(2),
        breakdown.impactShare.toFixed(2),
        breakdown.bradfordShare.toFixed(2),
        job.jdSuppliesPaper ? 'Vendor' : 'Bradford',
      ];
    });

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounting-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading accounting data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounting Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Impact & Bradford profit split analysis
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="all">All Time</option>
            <option value="month">Last Month</option>
            <option value="quarter">Last Quarter</option>
            <option value="year">Last Year</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={paperFilter}
            onChange={(e) => setPaperFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="all">All Paper Sources</option>
            <option value="bradford">Bradford Paper Only</option>
            <option value="vendor">Vendor Paper Only</option>
          </select>
        </div>

        <div className="ml-auto text-sm text-gray-500">
          {filteredJobs.length} jobs
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-500">Total Revenue</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totals.totalRevenue)}</p>
        </div>

        {/* Total Spread */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium text-gray-500">Total Spread</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totals.totalSpread)}</p>
          <p className="text-xs text-gray-400 mt-1">
            + {formatCurrency(totals.totalPaperMarkup)} paper markup
          </p>
        </div>

        {/* Impact Share */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">Impact Direct</span>
          </div>
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(totals.impactTotal)}</p>
          <p className="text-xs text-blue-500 mt-1">
            50% spread
          </p>
        </div>

        {/* Bradford Share */}
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg border border-orange-200">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-orange-600" />
            <span className="text-sm font-medium text-orange-700">Bradford</span>
          </div>
          <p className="text-2xl font-bold text-orange-700">{formatCurrency(totals.bradfordTotal)}</p>
          <p className="text-xs text-orange-500 mt-1">
            50% spread + paper markup
          </p>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Job Breakdown</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Job
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sell Price
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cost
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Spread
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-blue-600 uppercase tracking-wider">
                  Impact
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-orange-600 uppercase tracking-wider">
                  Bradford
                </th>
                <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Paper
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredJobs.map((job) => {
                const breakdown = calculateProfitBreakdown(job);
                const isExpanded = expandedJob === job.id;

                return (
                  <React.Fragment key={job.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{job.jobNo}</div>
                        <div className="text-sm text-gray-500">{job.title}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {job.customer?.name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900 font-medium">
                        {formatCurrency(breakdown.sellPrice)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        {formatCurrency(breakdown.totalCost)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-medium">
                        <span className={breakdown.spread >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(breakdown.spread)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-blue-600">
                        {formatCurrency(breakdown.impactShare)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-orange-600">
                        {formatCurrency(breakdown.bradfordShare)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          job.jdSuppliesPaper
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {job.jdSuppliesPaper ? 'Vendor' : 'Bradford'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Sell Price:</span>
                              <span className="ml-2 font-medium">{formatCurrency(breakdown.sellPrice)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Total Cost:</span>
                              <span className="ml-2 font-medium">{formatCurrency(breakdown.totalCost)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Spread (50/50):</span>
                              <span className="ml-2 font-medium text-green-600">{formatCurrency(breakdown.spread)}</span>
                            </div>
                            {breakdown.paperMarkup > 0 && (
                              <div>
                                <span className="text-gray-500">Paper Markup (18%):</span>
                                <span className="ml-2 font-medium text-blue-600">{formatCurrency(breakdown.paperMarkup)}</span>
                              </div>
                            )}
                            <div className="bg-blue-50 p-2 rounded">
                              <span className="text-blue-700">Impact Share:</span>
                              <span className="ml-2 font-bold text-blue-700">{formatCurrency(breakdown.impactShare)}</span>
                              <div className="text-xs text-blue-500 mt-1">
                                {formatCurrency(breakdown.spread / 2)} (50% spread)
                              </div>
                            </div>
                            <div className="bg-orange-50 p-2 rounded">
                              <span className="text-orange-700">Bradford Share:</span>
                              <span className="ml-2 font-bold text-orange-700">{formatCurrency(breakdown.bradfordShare)}</span>
                              <div className="text-xs text-orange-500 mt-1">
                                {formatCurrency(breakdown.spread / 2)} (50% spread)
                                {breakdown.paperMarkup > 0 && ` + ${formatCurrency(breakdown.paperMarkup)} (paper)`}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-100 border-t-2 border-gray-300">
              <tr>
                <td className="px-6 py-4 font-bold text-gray-900" colSpan={2}>
                  TOTALS
                </td>
                <td className="px-6 py-4 text-right font-bold text-gray-900">
                  {formatCurrency(totals.totalRevenue)}
                </td>
                <td className="px-6 py-4 text-right font-bold text-gray-600">
                  {formatCurrency(totals.totalCost)}
                </td>
                <td className="px-6 py-4 text-right font-bold text-green-600">
                  {formatCurrency(totals.totalSpread)}
                </td>
                <td className="px-6 py-4 text-right font-bold text-blue-600">
                  {formatCurrency(totals.impactTotal)}
                </td>
                <td className="px-6 py-4 text-right font-bold text-orange-600">
                  {formatCurrency(totals.bradfordTotal)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Profit Split Explanation */}
      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Profit Split Model</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-900 mb-1">Base Split (50/50)</h4>
            <p>The spread (Sell Price - Total Cost) is split evenly between Impact Direct and Bradford.</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-1">Paper Markup (18%)</h4>
            <p>When Bradford supplies paper, they receive an additional 18% markup on the paper cost. This markup goes entirely to Bradford.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
