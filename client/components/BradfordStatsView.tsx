import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from './ui/StatusBadge';
import { JobDetailModal } from './JobDetailModal';
import { pdfApi, jobsApi } from '../lib/api';
import { BradfordStats, BradfordJob } from '../types/bradford';
import { AlertTriangle, Search, FileDown, FileSpreadsheet, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Check, X, Mail, CheckCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface BradfordStatsViewProps {
  jobs: any[];
  allJobs: any[];
  customers: any[];
  vendors: any[];
  onUpdateStatus: (jobId: string, status: string) => void;
  onRefresh: () => void;
  onShowEmailDraft: (job: any) => void;
}

type SortField = 'jobNo' | 'title' | 'bradfordRef' | 'status' | 'sizeName' | 'quantity' | 'paperPounds' | 'sellPrice' | 'totalCost' | 'spread' | 'paperCost' | 'paperMarkup' | 'bradfordShare' | 'marginPercent';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | 'paid' | 'unpaid' | 'readyToPay';

export function BradfordStatsView({
  jobs,
  allJobs,
  customers,
  vendors,
  onUpdateStatus,
  onRefresh,
  onShowEmailDraft
}: BradfordStatsViewProps) {
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [stats, setStats] = useState<BradfordStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('jobNo');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editingPOValue, setEditingPOValue] = useState<string>('');
  const [savingPO, setSavingPO] = useState(false);

  // Fetch Bradford stats from API
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/bradford/stats');
        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch Bradford stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [jobs]);

  // Count jobs ready to pay Bradford (customer paid, Bradford not paid)
  const readyToPayCount = useMemo(() => {
    if (!stats?.jobs) return 0;
    return stats.jobs.filter(job => {
      const fullJob = jobs.find(j => j.id === job.id) || allJobs.find(j => j.id === job.id);
      return fullJob?.customerPaymentDate && !fullJob?.bradfordPaymentPaid;
    }).length;
  }, [stats?.jobs, jobs, allJobs]);

  // Filter jobs by status
  const statusFilteredJobs = useMemo(() => {
    if (!stats?.jobs) return [];

    if (statusFilter === 'all') return stats.jobs;
    if (statusFilter === 'paid') return stats.jobs.filter(job => job.status === 'PAID');
    if (statusFilter === 'readyToPay') {
      // Jobs where customer paid but Bradford not yet paid
      return stats.jobs.filter(job => {
        const fullJob = jobs.find(j => j.id === job.id) || allJobs.find(j => j.id === job.id);
        return fullJob?.customerPaymentDate && !fullJob?.bradfordPaymentPaid;
      });
    }
    return stats.jobs.filter(job => job.status !== 'PAID'); // unpaid
  }, [stats?.jobs, statusFilter, jobs, allJobs]);

  // Compute filtered stats based on status filter
  const filteredStats = useMemo(() => {
    if (!stats) return null;

    // If showing all, use the original stats
    if (statusFilter === 'all') {
      return {
        totalJobs: stats.totalJobs,
        activeJobs: stats.activeJobs,
        paidJobs: stats.paidJobs,
        totalRevenue: stats.totalRevenue,
        totalCost: stats.totalCost,
        totalProfit: stats.totalProfit,
        totalBradfordShare: stats.totalBradfordShare,
        totalImpactShare: stats.totalImpactShare,
        totalPaperMarkup: stats.totalPaperMarkup,
        totalPaperPounds: stats.totalPaperPounds,
        totalPaperSheets: stats.totalPaperSheets,
        averageJobValue: stats.averageJobValue,
        // Show unpaid amounts in subtext
        unpaidRevenue: stats.unpaidRevenue,
        unpaidBradfordShare: stats.unpaidBradfordShare,
      };
    }

    // Recalculate from filtered jobs
    const jobs = statusFilteredJobs;
    const totalJobs = jobs.length;
    const activeJobs = jobs.filter(j => j.status === 'ACTIVE').length;
    const paidJobs = jobs.filter(j => j.status === 'PAID').length;
    const totalRevenue = jobs.reduce((sum, j) => sum + j.sellPrice, 0);
    const totalCost = jobs.reduce((sum, j) => sum + j.totalCost, 0);
    const totalProfit = jobs.reduce((sum, j) => sum + j.spread, 0);
    const totalBradfordShare = jobs.reduce((sum, j) => sum + j.bradfordShare, 0);
    const totalImpactShare = jobs.reduce((sum, j) => sum + j.impactShare, 0);
    const totalPaperMarkup = jobs.reduce((sum, j) => sum + j.paperMarkup, 0);
    const totalPaperPounds = jobs.reduce((sum, j) => sum + j.paperPounds, 0);
    const totalPaperSheets = jobs.reduce((sum, j) => sum + j.quantity, 0);
    const averageJobValue = totalJobs > 0 ? totalRevenue / totalJobs : 0;

    return {
      totalJobs,
      activeJobs,
      paidJobs,
      totalRevenue,
      totalCost,
      totalProfit,
      totalBradfordShare,
      totalImpactShare,
      totalPaperMarkup,
      totalPaperPounds,
      totalPaperSheets,
      averageJobValue,
      unpaidRevenue: 0, // Not applicable when filtered
      unpaidBradfordShare: 0,
    };
  }, [stats, statusFilter, statusFilteredJobs]);

  // Filter and sort jobs
  const filteredAndSortedJobs = useMemo(() => {
    let filtered = statusFilteredJobs;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(job =>
        job.jobNo.toLowerCase().includes(query) ||
        job.title.toLowerCase().includes(query) ||
        job.bradfordRef.toLowerCase().includes(query) ||
        job.customerName.toLowerCase().includes(query)
      );
    }

    // Sort - jobs missing Bradford PO always come first, then apply regular sort
    return [...filtered].sort((a, b) => {
      // First: sort missing Bradford POs to top
      const aMissing = !a.bradfordRef || a.bradfordRef.trim() === '';
      const bMissing = !b.bradfordRef || b.bradfordRef.trim() === '';
      if (aMissing && !bMissing) return -1;
      if (!aMissing && bMissing) return 1;

      // Then apply regular sort
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle string comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [statusFilteredJobs, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1" />
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const handleRowClick = (job: BradfordJob) => {
    // Find the full job object from the jobs array
    const fullJob = jobs.find(j => j.id === job.id) || allJobs.find(j => j.id === job.id);
    if (fullJob) {
      setSelectedJob(fullJob);
      setIsDrawerOpen(true);
    }
  };

  // Start editing Bradford PO
  const startEditingPO = (e: React.MouseEvent, job: BradfordJob) => {
    e.stopPropagation(); // Prevent row click
    setEditingJobId(job.id);
    setEditingPOValue(job.bradfordRef || '');
  };

  // Cancel editing
  const cancelEditingPO = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingJobId(null);
    setEditingPOValue('');
  };

  // Save Bradford PO
  const saveBradfordPO = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    setSavingPO(true);
    try {
      const response = await fetch(`/api/bradford/jobs/${jobId}/po`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poNumber: editingPOValue.trim() }),
      });

      if (response.ok) {
        // Update local stats
        if (stats) {
          const updatedJobs = stats.jobs.map(job =>
            job.id === jobId ? { ...job, bradfordRef: editingPOValue.trim() } : job
          );
          setStats({ ...stats, jobs: updatedJobs });
        }
        setEditingJobId(null);
        setEditingPOValue('');
      } else {
        console.error('Failed to update Bradford PO');
      }
    } catch (error) {
      console.error('Error updating Bradford PO:', error);
    } finally {
      setSavingPO(false);
    }
  };

  // Payment workflow handlers
  const handleMarkBradfordPaid = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    try {
      const result = await jobsApi.markBradfordPaid(jobId);
      if (result.jdInvoiceSent) {
        toast.success('Bradford Payment Recorded', {
          description: (
            <div className="mt-1 text-sm">
              <p className="font-medium text-green-700">JD Invoice Email Sent!</p>
              <p className="text-gray-600 mt-1">
                <strong>To:</strong> steve.gustafson@bgeltd.com<br/>
                <strong>CC:</strong> nick@jdgraphic.com
              </p>
            </div>
          ),
          duration: 5000,
        });
      } else {
        toast.success('Bradford Payment Recorded', {
          description: 'Payment marked as complete.',
          duration: 3000,
        });
      }
      onRefresh();
    } catch (error) {
      console.error('Failed to mark Bradford paid:', error);
      toast.error('Failed to mark Bradford paid', {
        description: 'Please try again.',
      });
    }
  };

  const handleMarkJDPaid = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    try {
      await jobsApi.markJDPaid(jobId);
      onRefresh();
    } catch (error) {
      console.error('Failed to mark JD paid:', error);
      alert('Failed to mark JD paid. Please try again.');
    }
  };

  const handleResendJDInvoice = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    try {
      const result = await jobsApi.sendJDInvoice(jobId);
      if (result.success) {
        toast.success('JD Invoice Sent', {
          description: `Email sent to ${result.emailedTo}`,
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Failed to send JD invoice:', error);
      toast.error('Failed to send JD invoice', {
        description: 'Please try again.',
      });
    }
  };

  const handleDownloadJDInvoice = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    jobsApi.downloadJDInvoicePDF(jobId);
  };

  // Helper to get full job data (includes payment fields)
  const getFullJobData = (jobId: string) => {
    return jobs.find(j => j.id === jobId) || allJobs.find(j => j.id === jobId);
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatNumber = (value: number, decimals = 0) => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  // Export to PDF
  const exportToPDF = () => {
    if (!stats) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text('Bradford Statistics Report', pageWidth / 2, 20, { align: 'center' });

    // Date
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, pageWidth / 2, 28, { align: 'center' });

    // Summary section
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text('Summary', 14, 42);

    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const summaryData = [
      ['Total Jobs', stats.totalJobs.toString()],
      ['Total Revenue', formatCurrency(stats.totalRevenue)],
      ['Bradford Profit', formatCurrency(stats.totalBradfordShare)],
      ['Paper Used', `${formatNumber(stats.totalPaperPounds, 0)} lbs`],
      ['Paper Markup', formatCurrency(stats.totalPaperMarkup)],
      ['Avg Job Value', formatCurrency(stats.averageJobValue)],
    ];

    autoTable(doc, {
      startY: 46,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'plain',
      styles: { fontSize: 10 },
      headStyles: { fillColor: [245, 130, 32], textColor: 255 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' }
      },
      margin: { left: 14, right: 14 },
    });

    // Jobs table
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.text('Jobs Detail', 14, finalY);

    const jobsData = filteredAndSortedJobs.map(job => [
      job.jobNo,
      job.bradfordRef || '-',
      job.status,
      job.sizeName || '-',
      formatNumber(job.quantity),
      formatNumber(job.paperPounds, 1),
      formatCurrency(job.sellPrice),
      formatCurrency(job.totalCost),
      formatCurrency(job.spread),
      formatCurrency(job.paperMarkup),
      formatCurrency(job.bradfordShare),
      `${formatNumber(job.marginPercent, 1)}%`,
    ]);

    autoTable(doc, {
      startY: finalY + 4,
      head: [['Job #', 'Bradford PO', 'Status', 'Size', 'Qty', 'Paper', 'Sell', 'Cost', 'Spread', 'Markup', 'Bradford $', 'Margin']],
      body: jobsData,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [245, 130, 32], textColor: 255, fontSize: 7 },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right' },
        10: { halign: 'right' },
        11: { halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    doc.save('bradford-stats-report.pdf');
  };

  // Export to Excel
  const exportToExcel = () => {
    if (!stats) return;

    // Summary sheet data
    const summaryData = [
      ['Bradford Statistics Report'],
      [`Generated: ${new Date().toLocaleDateString()}`],
      [],
      ['Metric', 'Value'],
      ['Total Jobs', stats.totalJobs],
      ['Total Revenue', formatCurrency(stats.totalRevenue)],
      ['Total Cost', formatCurrency(stats.totalCost)],
      ['Bradford Profit', formatCurrency(stats.totalBradfordShare)],
      ['Impact Profit', formatCurrency(stats.totalImpactShare)],
      ['Paper Markup', formatCurrency(stats.totalPaperMarkup)],
      ['Paper Used (lbs)', formatNumber(stats.totalPaperPounds, 1)],
      ['Avg Job Value', formatCurrency(stats.averageJobValue)],
      [],
      ['Paid Revenue', formatCurrency(stats.paidRevenue)],
      ['Unpaid Revenue', formatCurrency(stats.unpaidRevenue)],
      ['Paid Bradford Share', formatCurrency(stats.paidBradfordShare)],
      ['Unpaid Bradford Share', formatCurrency(stats.unpaidBradfordShare)],
    ];

    // Jobs sheet data
    const jobsHeader = [
      'Job #', 'Bradford PO', 'Status', 'Customer', 'Size',
      'Quantity', 'Paper (lbs)', 'Sell Price', 'Total Cost', 'Spread',
      'Paper Cost', 'Paper Markup', 'Bradford Share', 'Impact Share', 'Margin %'
    ];

    const jobsData = filteredAndSortedJobs.map(job => [
      job.jobNo,
      job.bradfordRef,
      job.status,
      job.customerName,
      job.sizeName,
      formatNumber(job.quantity),
      formatNumber(job.paperPounds, 1),
      formatCurrency(job.sellPrice),
      formatCurrency(job.totalCost),
      formatCurrency(job.spread),
      formatCurrency(job.paperCost),
      formatCurrency(job.paperMarkup),
      formatCurrency(job.bradfordShare),
      formatCurrency(job.impactShare),
      `${formatNumber(job.marginPercent, 1)}%`,
    ]);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // Jobs sheet
    const jobsWs = XLSX.utils.aoa_to_sheet([jobsHeader, ...jobsData]);
    XLSX.utils.book_append_sheet(wb, jobsWs, 'Jobs');

    // Download
    XLSX.writeFile(wb, 'bradford-stats-report.xlsx');
  };

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading Bradford statistics...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Bradford Stats</h2>
          <p className="text-gray-600 mt-1">
            High-level metrics and job details for Bradford Commercial Printing
          </p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'all'
              ? 'bg-orange-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Jobs ({stats?.totalJobs || 0})
        </button>
        <button
          onClick={() => setStatusFilter('readyToPay')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'readyToPay'
              ? 'bg-orange-600 text-white'
              : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
          }`}
        >
          Ready to Pay ({readyToPayCount})
        </button>
        <button
          onClick={() => setStatusFilter('paid')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'paid'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Paid ({stats?.paidJobs || 0})
        </button>
        <button
          onClick={() => setStatusFilter('unpaid')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'unpaid'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Unpaid ({(stats?.totalJobs || 0) - (stats?.paidJobs || 0)})
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Total Jobs</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{filteredStats?.totalJobs || 0}</p>
          <p className="text-xs text-gray-500 mt-1">
            {filteredStats?.activeJobs || 0} active / {filteredStats?.paidJobs || 0} paid
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Total Revenue</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(filteredStats?.totalRevenue || 0)}</p>
          {statusFilter === 'all' && filteredStats?.unpaidRevenue ? (
            <p className="text-xs text-gray-500 mt-1">
              Unpaid: {formatCurrency(filteredStats.unpaidRevenue)}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              {statusFilter === 'paid' ? 'Paid only' : statusFilter === 'unpaid' ? 'Unpaid only' : ''}
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Bradford Profit</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{formatCurrency(filteredStats?.totalBradfordShare || 0)}</p>
          {statusFilter === 'all' && filteredStats?.unpaidBradfordShare ? (
            <p className="text-xs text-gray-500 mt-1">
              Unpaid: {formatCurrency(filteredStats.unpaidBradfordShare)}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              50% spread + markup
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Paper Used</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(filteredStats?.totalPaperPounds || 0, 0)} lbs</p>
          <p className="text-xs text-gray-500 mt-1">
            {formatNumber(filteredStats?.totalPaperSheets || 0)} sheets
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Paper Markup</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{formatCurrency(filteredStats?.totalPaperMarkup || 0)}</p>
          <p className="text-xs text-gray-500 mt-1">
            18% markup earned
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Avg Job Value</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(filteredStats?.averageJobValue || 0)}</p>
          <p className="text-xs text-gray-500 mt-1">
            Per job average
          </p>
        </div>
      </div>

      {/* Warnings */}
      {(stats.jobsWithNegativeMargin > 0 || stats.jobsMissingRefNumber > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <span className="font-medium text-yellow-900">Warnings:</span>
            {stats.jobsWithNegativeMargin > 0 && (
              <span className="text-sm text-yellow-800">
                {stats.jobsWithNegativeMargin} jobs with negative margin
              </span>
            )}
            {stats.jobsWithNegativeMargin > 0 && stats.jobsMissingRefNumber > 0 && (
              <span className="text-yellow-400">|</span>
            )}
            {stats.jobsMissingRefNumber > 0 && (
              <span className="text-sm text-yellow-800">
                {stats.jobsMissingRefNumber} jobs missing Bradford ref
              </span>
            )}
          </div>
        </div>
      )}

      {/* Search and Export Bar */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Job #, Title, Ref, or Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportToPDF}
              className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Export PDF
            </button>
            <button
              onClick={exportToExcel}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export Excel
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Showing {filteredAndSortedJobs.length} of {stats.jobs.length} jobs
        </p>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('jobNo')}
                >
                  <div className="flex items-center">
                    Job # {getSortIcon('jobNo')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-orange-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('bradfordRef')}
                >
                  <div className="flex items-center">
                    Bradford PO {getSortIcon('bradfordRef')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center">
                    Status {getSortIcon('status')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center">
                    Payment Flow
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('sizeName')}
                >
                  <div className="flex items-center">
                    Size {getSortIcon('sizeName')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('quantity')}
                >
                  <div className="flex items-center justify-end">
                    Qty {getSortIcon('quantity')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('paperPounds')}
                >
                  <div className="flex items-center justify-end">
                    Paper (lbs) {getSortIcon('paperPounds')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('sellPrice')}
                >
                  <div className="flex items-center justify-end">
                    Sell {getSortIcon('sellPrice')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('totalCost')}
                >
                  <div className="flex items-center justify-end">
                    Cost {getSortIcon('totalCost')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('spread')}
                >
                  <div className="flex items-center justify-end">
                    Spread {getSortIcon('spread')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('paperMarkup')}
                >
                  <div className="flex items-center justify-end">
                    Paper Markup {getSortIcon('paperMarkup')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-orange-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('bradfordShare')}
                >
                  <div className="flex items-center justify-end">
                    Bradford $ {getSortIcon('bradfordShare')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('marginPercent')}
                >
                  <div className="flex items-center justify-end">
                    Margin {getSortIcon('marginPercent')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedJobs.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-gray-500">
                    {searchQuery ? 'No jobs match your search' : 'No Bradford jobs found'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedJobs.map((job) => {
                  const isMissingPO = !job.bradfordRef || job.bradfordRef.trim() === '';
                  return (
                    <tr
                      key={job.id}
                      onClick={() => handleRowClick(job)}
                      className={`group cursor-pointer transition-colors ${
                        isMissingPO
                          ? 'bg-amber-50 hover:bg-amber-100 border-l-4 border-l-amber-400'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {job.jobNo}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {editingJobId === job.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editingPOValue}
                            onChange={(e) => setEditingPOValue(e.target.value)}
                            className="w-24 px-2 py-1 text-sm border border-orange-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="PO #"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveBradfordPO(e as any, job.id);
                              if (e.key === 'Escape') { setEditingJobId(null); setEditingPOValue(''); }
                            }}
                          />
                          <button
                            onClick={(e) => saveBradfordPO(e, job.id)}
                            disabled={savingPO}
                            className="p-1 text-green-600 hover:bg-green-100 rounded"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEditingPO}
                            className="p-1 text-red-600 hover:bg-red-100 rounded"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {job.bradfordRef ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded text-sm font-bold bg-orange-100 text-orange-800">
                              {job.bradfordRef}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Missing</span>
                          )}
                          <button
                            onClick={(e) => startEditingPO(e, job)}
                            className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Edit PO #"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const fullJob = getFullJobData(job.id);
                        const customerPaid = fullJob?.customerPaymentDate;
                        const bradfordPaid = fullJob?.bradfordPaymentPaid;
                        const jdPaid = fullJob?.jdPaymentPaid;
                        const jdInvoiceSent = fullJob?.jdInvoiceEmailedAt;

                        return (
                          <div className="flex flex-col gap-1">
                            {/* Badge 1: Customer → Impact */}
                            {customerPaid ? (
                              <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 w-fit">
                                <Check className="w-3 h-3" />
                                Customer Paid
                              </span>
                            ) : (
                              <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded w-fit">
                                ○ Awaiting Customer
                              </span>
                            )}

                            {/* Badge 2: Impact → Bradford */}
                            {bradfordPaid ? (
                              <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 w-fit">
                                <Check className="w-3 h-3" />
                                Bradford Paid
                              </span>
                            ) : customerPaid ? (
                              <button
                                onClick={(e) => handleMarkBradfordPaid(e, job.id)}
                                className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded hover:bg-orange-600 transition-colors w-fit"
                              >
                                Pay Bradford
                              </button>
                            ) : (
                              <span className="bg-gray-100 text-gray-400 text-xs px-2 py-0.5 rounded w-fit">
                                ○ Pending
                              </span>
                            )}

                            {/* Badge 3: Bradford → JD */}
                            <div className="flex items-center gap-1">
                              {jdPaid ? (
                                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 w-fit">
                                  <Check className="w-3 h-3" />
                                  JD Paid
                                </span>
                              ) : bradfordPaid ? (
                                <button
                                  onClick={(e) => handleMarkJDPaid(e, job.id)}
                                  className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded hover:bg-blue-600 transition-colors w-fit"
                                >
                                  Mark JD Paid
                                </button>
                              ) : (
                                <span className="bg-gray-100 text-gray-400 text-xs px-2 py-0.5 rounded w-fit">
                                  ○ Pending
                                </span>
                              )}
                              {/* JD Invoice actions */}
                              {bradfordPaid && (
                                <>
                                  {/* Download PDF button */}
                                  <button
                                    onClick={(e) => handleDownloadJDInvoice(e, job.id)}
                                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                    title="Download JD Invoice PDF"
                                  >
                                    <FileDown className="w-3.5 h-3.5" />
                                  </button>
                                  {/* Resend JD Invoice button */}
                                  {jdInvoiceSent && !jdPaid && (
                                    <button
                                      onClick={(e) => handleResendJDInvoice(e, job.id)}
                                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                      title="Resend JD Invoice"
                                    >
                                      <Mail className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {job.sizeName || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatNumber(job.quantity)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatNumber(job.paperPounds, 1)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-green-600 text-right">
                      {formatCurrency(job.sellPrice)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-red-600 text-right">
                      {formatCurrency(job.totalCost)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                      <span className={`font-medium ${job.spread < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(job.spread)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-purple-600 text-right">
                      {formatCurrency(job.paperMarkup)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-orange-600 text-right">
                      {formatCurrency(job.bradfordShare)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                      <span className={`font-medium ${job.marginPercent < 0 ? 'text-red-600' : job.marginPercent < 15 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {formatNumber(job.marginPercent, 1)}%
                      </span>
                    </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
