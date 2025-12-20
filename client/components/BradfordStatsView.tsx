import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { JobDetailModal } from './JobDetailModal';
import { pdfApi, jobsApi } from '../lib/api';
import { BradfordStats, BradfordJob } from '../types/bradford';
import { Search, FileDown, FileSpreadsheet, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Check, X, CheckCircle, ChevronRight, ChevronDown } from 'lucide-react';
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
type MainTab = 'action' | 'completed' | 'paper';

// Helper functions for job status
const isJobCompleted = (job: any, fullJob: any) =>
  fullJob?.customerPaymentDate && fullJob?.bradfordPaymentDate && fullJob?.jdPaymentDate;

const isJobIncoming = (job: any, fullJob: any) =>
  fullJob?.customerPaymentDate && !fullJob?.bradfordPaymentDate;

const isJobOutgoing = (job: any, fullJob: any) =>
  fullJob?.bradfordPaymentDate && !fullJob?.jdPaymentDate;

const jobNeedsAction = (job: any, fullJob: any) =>
  !job.bradfordRef || isJobIncoming(job, fullJob) || isJobOutgoing(job, fullJob);

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
  const [mainTab, setMainTab] = useState<MainTab>('action');
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editingPOValue, setEditingPOValue] = useState<string>('');
  const [savingPO, setSavingPO] = useState(false);
  const [savingPaperType, setSavingPaperType] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // Dashboard calculations - incoming, outgoing, counts
  const dashboard = useMemo(() => {
    if (!stats?.jobs) return {
      incoming: { total: 0, count: 0 },
      outgoing: { total: 0, count: 0 },
      missingRef: 0,
      readyToPay: 0,
      jdDue: 0,
      completed: 0,
      paperUsed: 0,
      paperExpected: 0,
      paperJobs: 0,
      paperByType: {} as Record<string, { used: number; expected: number }>
    };

    const partnerJobs = stats.jobs;
    let incoming = { total: 0, count: 0 };
    let outgoing = { total: 0, count: 0 };
    let missingRef = 0;
    let completed = 0;
    let paperJobs = 0;

    partnerJobs.forEach(job => {
      const fullJob = jobs.find(j => j.id === job.id) || allJobs.find(j => j.id === job.id);

      // Missing Bradford ref
      if (!job.bradfordRef || job.bradfordRef.trim() === '') {
        missingRef++;
      }

      // Completed (all 3 payments)
      if (isJobCompleted(job, fullJob)) {
        completed++;
      }

      // Incoming (customer paid, Bradford not paid)
      if (isJobIncoming(job, fullJob)) {
        incoming.total += job.bradfordShare || 0;
        incoming.count++;
      }

      // Outgoing (Bradford paid, JD not paid)
      if (isJobOutgoing(job, fullJob)) {
        outgoing.total += job.bradfordShare || 0;
        outgoing.count++;
      }

      // Paper usage
      if (job.paperPounds > 0) {
        paperJobs++;
      }
    });

    // Calculate total paper used vs expected from API data
    const paperByType = stats.paperByType || {};
    let paperUsed = 0;
    let paperExpected = 0;
    Object.values(paperByType).forEach(({ used, expected }) => {
      paperUsed += used;
      paperExpected += expected;
    });

    return {
      incoming,
      outgoing,
      missingRef,
      readyToPay: incoming.count,
      jdDue: outgoing.count,
      completed,
      paperUsed,
      paperExpected,
      paperJobs,
      paperByType
    };
  }, [stats?.jobs, stats?.paperByType, jobs, allJobs]);

  // Filter jobs by main tab
  const tabFilteredJobs = useMemo(() => {
    if (!stats?.jobs) return [];

    return stats.jobs.filter(job => {
      const fullJob = jobs.find(j => j.id === job.id) || allJobs.find(j => j.id === job.id);

      if (mainTab === 'completed') {
        return isJobCompleted(job, fullJob);
      }
      if (mainTab === 'paper') {
        // Paper tab shows all Bradford jobs (they all use Bradford paper)
        return true;
      }
      // Action tab: not completed (show all jobs that need attention)
      return !isJobCompleted(job, fullJob);
    });
  }, [stats?.jobs, mainTab, jobs, allJobs]);

  // Compute filtered stats based on current tab
  const filteredStats = useMemo(() => {
    if (!stats) return null;

    // Recalculate from filtered jobs
    const filteredJobs = tabFilteredJobs;
    const totalJobs = filteredJobs.length;
    const activeJobs = filteredJobs.filter(j => j.status === 'ACTIVE').length;
    const paidJobs = filteredJobs.filter(j => j.status === 'PAID').length;
    const totalRevenue = filteredJobs.reduce((sum, j) => sum + j.sellPrice, 0);
    const totalCost = filteredJobs.reduce((sum, j) => sum + j.totalCost, 0);
    const totalProfit = filteredJobs.reduce((sum, j) => sum + j.spread, 0);
    const totalBradfordShare = filteredJobs.reduce((sum, j) => sum + j.bradfordShare, 0);
    const totalImpactShare = filteredJobs.reduce((sum, j) => sum + j.impactShare, 0);
    const totalPaperMarkup = filteredJobs.reduce((sum, j) => sum + j.paperMarkup, 0);
    const totalPaperPounds = filteredJobs.reduce((sum, j) => sum + j.paperPounds, 0);
    const totalPaperSheets = filteredJobs.reduce((sum, j) => sum + j.quantity, 0);
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
      unpaidRevenue: stats.unpaidRevenue || 0,
      unpaidBradfordShare: stats.unpaidBradfordShare || 0,
    };
  }, [stats, tabFilteredJobs]);

  // Helper to get job status for paper tracking
  const getJobPaperStatus = (job: BradfordJob, fullJob: any) => {
    if (job.status === 'PAID') return 'Paid';
    if (fullJob?.vendorStatus === 'SHIPPED') return 'Shipped';
    if (fullJob?.vendorStatus === 'PRINTING_COMPLETE') return 'Printed';
    return 'Active';
  };

  // Helper to check if paper is "used" (job complete)
  const isPaperUsed = (job: BradfordJob, fullJob: any) => {
    return job.status === 'PAID' ||
           fullJob?.vendorStatus === 'PRINTING_COMPLETE' ||
           fullJob?.vendorStatus === 'SHIPPED' ||
           (fullJob?.deliveryDate && new Date(fullJob.deliveryDate) < new Date());
  };

  // Group jobs by paper type for the Paper Inventory tab
  const paperGroups = useMemo(() => {
    if (!stats?.jobs) return [];

    const groups: Record<string, {
      paperType: string;
      used: number;
      expected: number;
      nextDue: Date | null;
      jobs: Array<BradfordJob & { isUsed: boolean; paperStatus: string; deliveryDate?: string }>;
    }> = {};

    stats.jobs.filter(j => j.paperPounds > 0).forEach(job => {
      const key = job.paperTypeKey || 'Unknown';
      const fullJob = jobs.find(j => j.id === job.id) || allJobs.find(j => j.id === job.id);
      const isUsed = isPaperUsed(job, fullJob);

      if (!groups[key]) {
        groups[key] = { paperType: key, used: 0, expected: 0, nextDue: null, jobs: [] };
      }

      if (isUsed) {
        groups[key].used += job.paperPounds;
      } else {
        groups[key].expected += job.paperPounds;
        // Track earliest due date for expected jobs
        if (fullJob?.deliveryDate) {
          const dueDate = new Date(fullJob.deliveryDate);
          if (!groups[key].nextDue || dueDate < groups[key].nextDue) {
            groups[key].nextDue = dueDate;
          }
        }
      }

      groups[key].jobs.push({
        ...job,
        isUsed,
        paperStatus: getJobPaperStatus(job, fullJob),
        deliveryDate: fullJob?.deliveryDate
      });
    });

    // Sort jobs within each group: active jobs first (sorted by due date), then used jobs
    Object.values(groups).forEach(g => {
      g.jobs.sort((a, b) => {
        if (a.isUsed && !b.isUsed) return 1;
        if (!a.isUsed && b.isUsed) return -1;
        if (!a.deliveryDate) return 1;
        if (!b.deliveryDate) return -1;
        return new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime();
      });
    });

    // Sort groups by total paper (highest first)
    return Object.values(groups).sort((a, b) =>
      (b.used + b.expected) - (a.used + a.expected)
    );
  }, [stats?.jobs, jobs, allJobs]);

  // Toggle expand/collapse for paper groups
  const toggleGroup = (paperType: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(paperType)) {
        next.delete(paperType);
      } else {
        next.add(paperType);
      }
      return next;
    });
  };

  // Filter and sort jobs
  const filteredAndSortedJobs = useMemo(() => {
    let filtered = tabFilteredJobs;

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
  }, [tabFilteredJobs, searchQuery, sortField, sortDirection]);

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

  // Update paper type for a job
  const updatePaperType = async (jobId: string, paperType: string) => {
    setSavingPaperType(jobId);
    try {
      const response = await fetch(`/api/bradford/jobs/${jobId}/paper-type`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperType }),
      });

      if (response.ok) {
        // Update local stats
        if (stats) {
          const updatedJobs = stats.jobs.map(job =>
            job.id === jobId ? { ...job, bradfordPaperType: paperType, paperTypeKey: `20" ${paperType}` } : job
          );
          setStats({ ...stats, jobs: updatedJobs });
        }
        toast.success('Paper type updated');
      } else {
        toast.error('Failed to update paper type');
      }
    } catch (error) {
      console.error('Error updating paper type:', error);
      toast.error('Failed to update paper type');
    } finally {
      setSavingPaperType(null);
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
        <div className="text-zinc-500">Loading Bradford statistics...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-medium text-zinc-900">Bradford Partner Dashboard</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Action items, payments, and paper tracking</p>
      </div>

      {/* Mini Dashboard - 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Incoming - Money owed to Bradford + Net */}
        {(() => {
          const net = dashboard.incoming.total - dashboard.outgoing.total;
          const isPositive = net >= 0;
          return (
            <div className="bg-white rounded-lg border border-zinc-200 p-4">
              <p className="text-xs font-medium text-zinc-500">Incoming</p>
              <p className="text-2xl font-medium text-green-600 mt-2 tabular-nums">{formatCurrency(dashboard.incoming.total)}</p>
              <p className="text-xs text-zinc-500 mt-1">{dashboard.incoming.count} jobs • Net: <span className={isPositive ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{formatCurrency(net)}</span></p>
            </div>
          );
        })()}

        {/* Outgoing - Money Bradford owes JD */}
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium text-zinc-500">Outgoing to JD</p>
          <p className="text-2xl font-medium text-orange-600 mt-2 tabular-nums">{formatCurrency(dashboard.outgoing.total)}</p>
          <p className="text-xs text-zinc-500 mt-1">{dashboard.outgoing.count} jobs due</p>
        </div>

        {/* Paper Usage - Used vs Expected */}
        <div
          className="bg-white rounded-lg border border-zinc-200 p-4 cursor-pointer hover:bg-zinc-50 transition-colors"
          onClick={() => setMainTab('paper')}
        >
          <p className="text-xs font-medium text-zinc-500">Paper Inventory</p>
          <div className="flex items-baseline gap-3 mt-2">
            <div>
              <p className="text-lg font-medium text-green-600 tabular-nums">{formatNumber(dashboard.paperUsed, 0)}</p>
              <p className="text-xs text-zinc-500">Used (lbs)</p>
            </div>
            <div className="text-zinc-300">/</div>
            <div>
              <p className="text-lg font-medium text-zinc-700 tabular-nums">{formatNumber(dashboard.paperExpected, 0)}</p>
              <p className="text-xs text-zinc-500">Expected (lbs)</p>
            </div>
          </div>
          <p className="text-xs text-zinc-400 mt-1">{dashboard.paperJobs} jobs → Click for details</p>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMainTab('action')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mainTab === 'action'
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          Needs Action ({stats.jobs.length - dashboard.completed})
        </button>
        <button
          onClick={() => setMainTab('completed')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mainTab === 'completed'
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          Completed ({dashboard.completed})
        </button>
        <button
          onClick={() => setMainTab('paper')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            mainTab === 'paper'
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          Paper Inventory ({Object.keys(dashboard.paperByType).length} types)
        </button>
      </div>

      {/* Search and Export Bar */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by Job #, Title, Ref, or Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 placeholder:text-zinc-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportToPDF}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
            >
              <FileDown className="w-4 h-4 mr-1.5" />
              PDF
            </button>
            <button
              onClick={exportToExcel}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1.5" />
              Excel
            </button>
          </div>
        </div>
        <p className="text-xs text-zinc-400 mt-2">
          Showing {filteredAndSortedJobs.length} of {stats.jobs.length} jobs
        </p>
      </div>

      {/* Content based on tab */}
      {mainTab === 'paper' ? (
        // Paper Inventory Tab - Grouped by Paper Type
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          {/* Summary bar */}
          <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
            <span className="text-sm text-zinc-600">
              <span className="font-medium text-zinc-900">{paperGroups.length}</span> paper types
              {' • '}
              <span className="font-medium text-zinc-900 tabular-nums">{formatNumber(dashboard.paperUsed + dashboard.paperExpected, 0)}</span> lbs total
            </span>
            <span className="text-xs text-zinc-500">
              Used: <span className="text-green-600 font-medium tabular-nums">{formatNumber(dashboard.paperUsed, 0)}</span>
              {' • '}
              Expected: <span className="text-zinc-900 font-medium tabular-nums">{formatNumber(dashboard.paperExpected, 0)}</span>
            </span>
          </div>

          <table className="min-w-full">
            <thead className="border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 w-8"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Paper Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">Used</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">Expected</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Next Due</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500">Total</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-zinc-500">Jobs</th>
              </tr>
            </thead>
            <tbody>
              {paperGroups.map(group => {
                const isExpanded = expandedGroups.has(group.paperType);
                const total = group.used + group.expected;
                return (
                  <React.Fragment key={group.paperType}>
                    {/* Group header row */}
                    <tr
                      className="bg-zinc-50 border-b border-zinc-200 cursor-pointer hover:bg-zinc-100 transition-colors"
                      onClick={() => toggleGroup(group.paperType)}
                    >
                      <td className="px-4 py-3 text-zinc-500">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-zinc-900">{group.paperType}</td>
                      <td className="px-4 py-3 text-sm text-green-600 text-right tabular-nums font-medium">
                        {formatNumber(group.used, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 text-right tabular-nums">
                        {formatNumber(group.expected, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {group.nextDue ? (
                          <span className={`font-medium ${
                            group.nextDue <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                              ? 'text-amber-600'
                              : 'text-zinc-600'
                          }`}>
                            {group.nextDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-900 text-right tabular-nums font-medium">
                        {formatNumber(total, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-500 text-center tabular-nums">
                        {group.jobs.length}
                      </td>
                    </tr>

                    {/* Expanded job rows */}
                    {isExpanded && group.jobs.map(job => (
                      <tr
                        key={job.id}
                        className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer transition-colors"
                        onClick={() => handleRowClick(job)}
                      >
                        <td className="px-4 py-2"></td>
                        <td className="pl-8 pr-4 py-2" colSpan={6}>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-4">
                              <span className="font-medium text-zinc-900 w-16">{job.jobNo}</span>
                              <span className="text-zinc-500 w-20 truncate">{job.bradfordRef || '—'}</span>
                              <span className="text-zinc-600 w-24 truncate">{job.customerName}</span>
                              <span className="text-zinc-500 w-20">{job.sizeName}</span>
                              <span className="text-zinc-500 tabular-nums w-16 text-right">{formatNumber(job.quantity)}</span>
                              <span className="font-medium text-zinc-900 tabular-nums w-16 text-right">{formatNumber(job.paperPounds, 0)} lbs</span>
                              {/* Paper type selector for jobs needing selection */}
                              {job.paperTypeOptions && !job.paperTypeKey ? (
                                <select
                                  value={job.bradfordPaperType || ''}
                                  onChange={(e) => { e.stopPropagation(); updatePaperType(job.id, e.target.value); }}
                                  onClick={(e) => e.stopPropagation()}
                                  disabled={savingPaperType === job.id}
                                  className="px-2 py-1 border border-amber-300 rounded bg-amber-50 text-xs"
                                >
                                  <option value="">Select...</option>
                                  {job.paperTypeOptions.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                job.isUsed
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-zinc-100 text-zinc-600'
                              }`}>
                                {job.paperStatus}
                              </span>
                              <span className="text-xs text-zinc-400 w-16 text-right">
                                {job.isUsed
                                  ? '(done)'
                                  : job.deliveryDate
                                    ? new Date(job.deliveryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    : '—'
                                }
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {paperGroups.length === 0 && (
            <div className="p-8 text-center text-zinc-500">
              No paper usage data available
            </div>
          )}
        </div>
      ) : (
        // Jobs Table for Action/Completed tabs - 7 Columns
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <table className="min-w-full">
            <thead className="border-b border-zinc-200">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-zinc-500 cursor-pointer hover:bg-zinc-50"
                  onClick={() => handleSort('jobNo')}
                >
                  <div className="flex items-center">
                    Job # {getSortIcon('jobNo')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-zinc-500 cursor-pointer hover:bg-zinc-50"
                  onClick={() => handleSort('sizeName')}
                >
                  <div className="flex items-center">
                    Size {getSortIcon('sizeName')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-zinc-500 cursor-pointer hover:bg-zinc-50"
                  onClick={() => handleSort('quantity')}
                >
                  <div className="flex items-center justify-end">
                    Qty {getSortIcon('quantity')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-zinc-500 cursor-pointer hover:bg-zinc-50"
                  onClick={() => handleSort('paperPounds')}
                >
                  <div className="flex items-center justify-end">
                    Paper {getSortIcon('paperPounds')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-zinc-900 cursor-pointer hover:bg-zinc-50"
                  onClick={() => handleSort('bradfordRef')}
                >
                  <div className="flex items-center">
                    Bradford PO {getSortIcon('bradfordRef')}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                  Customer
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium text-zinc-900 cursor-pointer hover:bg-zinc-50"
                  onClick={() => handleSort('bradfordShare')}
                >
                  <div className="flex items-center justify-end">
                    Amount {getSortIcon('bradfordShare')}
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-zinc-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-zinc-500">
                    {searchQuery ? 'No jobs match your search' : mainTab === 'completed' ? 'No completed jobs yet' : 'No action items'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedJobs.map((job) => {
                  const isMissingPO = !job.bradfordRef || job.bradfordRef.trim() === '';
                  const fullJob = getFullJobData(job.id);
                  const customerPaid = fullJob?.customerPaymentDate;
                  const bradfordPaid = fullJob?.bradfordPaymentPaid;
                  const jdPaid = fullJob?.jdPaymentPaid;

                  return (
                    <tr
                      key={job.id}
                      onClick={() => handleRowClick(job)}
                      className={`group cursor-pointer transition-colors ${
                        isMissingPO
                          ? 'bg-amber-50 hover:bg-amber-100 border-l-4 border-l-amber-400'
                          : 'border-b border-zinc-100 hover:bg-zinc-50'
                      }`}
                    >
                      {/* Job # */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-zinc-900">
                        {job.jobNo}
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-zinc-600">
                        {job.sizeName || '-'}
                      </td>

                      {/* Qty */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-zinc-600 text-right tabular-nums">
                        {formatNumber(job.quantity)}
                      </td>

                      {/* Paper */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-zinc-600 text-right tabular-nums">
                        {job.paperPounds > 0 ? `${formatNumber(job.paperPounds, 0)} lbs` : '-'}
                      </td>

                      {/* Bradford PO - Inline Edit */}
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {editingJobId === job.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingPOValue}
                              onChange={(e) => setEditingPOValue(e.target.value)}
                              className="w-24 px-2 py-1 text-sm border border-zinc-300 rounded focus:outline-none focus:ring-2 focus:ring-zinc-900"
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
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEditingPO}
                              className="p-1 text-red-600 hover:bg-red-100 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {job.bradfordRef ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-zinc-100 text-zinc-900">
                                {job.bradfordRef}
                              </span>
                            ) : (
                              <button
                                onClick={(e) => startEditingPO(e, job)}
                                className="px-2 py-0.5 text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 rounded border border-amber-300"
                              >
                                + Add PO
                              </button>
                            )}
                            {job.bradfordRef && (
                              <button
                                onClick={(e) => startEditingPO(e, job)}
                                className="p-0.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded opacity-0 group-hover:opacity-100"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-zinc-600">
                        {job.customerName}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-zinc-900 text-right tabular-nums">
                        {formatCurrency(job.bradfordShare)}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          if (customerPaid && bradfordPaid && jdPaid) {
                            return (
                              <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Done
                              </span>
                            );
                          }
                          if (bradfordPaid && !jdPaid) {
                            return (
                              <button
                                onClick={(e) => handleMarkJDPaid(e, job.id)}
                                className="px-2 py-1 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded"
                              >
                                JD Paid
                              </button>
                            );
                          }
                          if (customerPaid && !bradfordPaid) {
                            return (
                              <button
                                onClick={(e) => handleMarkBradfordPaid(e, job.id)}
                                className="px-2 py-1 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded"
                              >
                                Pay
                              </button>
                            );
                          }
                          return <span className="text-xs text-zinc-400">Awaiting</span>;
                        })()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

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
