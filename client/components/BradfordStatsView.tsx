import React, { useState, useEffect } from 'react';
import { StatusBadge } from './ui/StatusBadge';
import { StatCard } from './ui/StatCard';
import { JobDrawer } from './JobDrawer';
import { pdfApi, jobsApi } from '../lib/api';
import { BradfordStats } from '../types/bradford';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface BradfordStatsViewProps {
  jobs: any[];
  allJobs: any[];
  customers: any[];
  vendors: any[];
  onUpdateStatus: (jobId: string, status: string) => void;
  onRefresh: () => void;
  onShowEmailDraft: (job: any) => void;
}

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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    financials: false,
    paper: false,
    productTypes: false,
    warnings: false,
  });

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
  }, [jobs]); // Re-fetch when jobs change

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleRowClick = (job: any) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  const handleUpdateBradfordRef = async (jobId: string, refNumber: string) => {
    try {
      const updatedJob = await jobsApi.updateBradfordRef(jobId, refNumber);
      setSelectedJob(updatedJob);
      await onRefresh();
    } catch (error) {
      console.error('Failed to update Bradford reference:', error);
      alert('Failed to update Bradford reference. Please try again.');
    }
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Bradford Partner Stats</h2>
          <p className="text-gray-600 mt-1">
            Analytics and job tracking for Bradford Commercial Printing (JD Graphic)
          </p>
        </div>
      </div>

      {/* High-Level Summary Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
        <table className="min-w-full divide-y divide-gray-200">
          <tbody className="bg-white divide-y divide-gray-200">
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Total Jobs</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">{stats.totalJobs}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {stats.activeJobs} active, {stats.completedJobs} completed, {stats.inProductionJobs} in production
              </td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Total Revenue</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-bold">
                ${stats.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                Avg: ${stats.averageJobValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per job
              </td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Impact Profit</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-bold">
                ${stats.totalImpactProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">50% of spread</td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Bradford Profit</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600 font-bold">
                ${stats.totalBradfordProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Paper markup + 50% spread</td>
            </tr>
            <tr className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Paper Usage</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                {stats.totalPaperSheets.toLocaleString()} sheets
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {stats.totalPaperPounds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} lbs total
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Expandable Financials Section */}
      <div className="bg-white rounded-lg shadow mb-4">
        <button
          onClick={() => toggleSection('financials')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center">
            {expandedSections.financials ? (
              <ChevronDown className="w-5 h-5 text-gray-500 mr-2" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-500 mr-2" />
            )}
            <h3 className="text-lg font-semibold text-gray-900">Financial Details</h3>
          </div>
          <span className="text-sm text-gray-500">
            ${stats.totalSpread.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total spread
          </span>
        </button>
        {expandedSections.financials && (
          <div className="px-6 pb-4 border-t border-gray-200">
            <table className="min-w-full mt-4">
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-3 text-sm text-gray-700">Total JD Graphic Costs</td>
                  <td className="py-3 text-sm font-semibold text-purple-600">
                    ${stats.totalJDCosts.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 text-sm text-gray-500">
                    Avg: ${stats.averageJDCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 text-sm text-gray-700">Average Spread</td>
                  <td className="py-3 text-sm font-semibold text-indigo-600">
                    ${stats.averageSpread.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 text-sm text-gray-500">Per job</td>
                </tr>
                <tr>
                  <td className="py-3 text-sm text-gray-700">Total Line Items</td>
                  <td className="py-3 text-sm font-semibold text-gray-900">{stats.totalLineItems}</td>
                  <td className="py-3 text-sm text-gray-500">Across all jobs</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expandable Paper Usage Section */}
      <div className="bg-white rounded-lg shadow mb-4">
        <button
          onClick={() => toggleSection('paper')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center">
            {expandedSections.paper ? (
              <ChevronDown className="w-5 h-5 text-gray-500 mr-2" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-500 mr-2" />
            )}
            <h3 className="text-lg font-semibold text-gray-900">Paper Usage by Size</h3>
          </div>
          <span className="text-sm text-gray-500">{Object.keys(stats.paperUsageBySize).length} sizes</span>
        </button>
        {expandedSections.paper && (
          <div className="px-6 pb-4 border-t border-gray-200">
            <table className="min-w-full mt-4">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Sheets</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">Weight (lbs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(stats.paperUsageBySize).map(([size, usage]) => (
                  <tr key={size}>
                    <td className="py-3 text-sm font-medium text-gray-900">{size}</td>
                    <td className="py-3 text-sm text-gray-900 text-right">
                      {usage.sheets.toLocaleString()}
                    </td>
                    <td className="py-3 text-sm text-gray-900 text-right">
                      {usage.pounds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expandable Product Types Section */}
      <div className="bg-white rounded-lg shadow mb-4">
        <button
          onClick={() => toggleSection('productTypes')}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center">
            {expandedSections.productTypes ? (
              <ChevronDown className="w-5 h-5 text-gray-500 mr-2" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-500 mr-2" />
            )}
            <h3 className="text-lg font-semibold text-gray-900">Jobs by Product Type</h3>
          </div>
          <span className="text-sm text-gray-500">{Object.keys(stats.jobsByProductType).length} types</span>
        </button>
        {expandedSections.productTypes && (
          <div className="px-6 pb-4 border-t border-gray-200">
            <table className="min-w-full mt-4">
              <tbody className="divide-y divide-gray-100">
                {Object.entries(stats.jobsByProductType).map(([type, count]) => (
                  <tr key={type}>
                    <td className="py-3 text-sm text-gray-700">{type}</td>
                    <td className="py-3 text-sm font-semibold text-gray-900 text-right">{count} jobs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Warnings Section */}
      {(stats.jobsWithNegativeSpread > 0 || stats.jobsMissingRefNumber > 0 || stats.jobsWhereBradfordProfitExceedsImpact > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <div className="flex items-center mb-4">
            <AlertTriangle className="w-6 h-6 text-yellow-600 mr-2" />
            <h3 className="text-lg font-semibold text-yellow-900">Warnings</h3>
          </div>
          <div className="space-y-3">
            {stats.jobsWithNegativeSpread > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-yellow-200">
                <span className="text-sm text-yellow-900">Jobs with negative spread</span>
                <span className="text-sm font-bold text-yellow-900">{stats.jobsWithNegativeSpread}</span>
              </div>
            )}
            {stats.jobsMissingRefNumber > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-yellow-200">
                <span className="text-sm text-yellow-900">Jobs missing Bradford ref number</span>
                <span className="text-sm font-bold text-yellow-900">{stats.jobsMissingRefNumber}</span>
              </div>
            )}
            {stats.jobsWhereBradfordProfitExceedsImpact > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-yellow-200">
                <span className="text-sm text-yellow-900">Jobs where Bradford profit exceeds Impact profit</span>
                <span className="text-sm font-bold text-yellow-900">{stats.jobsWhereBradfordProfitExceedsImpact}</span>
              </div>
            )}
          </div>

          {/* Problematic Jobs List */}
          {stats.problematicJobs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-yellow-200">
              <h4 className="text-sm font-semibold text-yellow-900 mb-2">Issues Found:</h4>
              <div className="space-y-1">
                {stats.problematicJobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="text-xs text-yellow-800">
                    <span className="font-semibold">{job.number}</span> - {job.title}: {job.issue}
                  </div>
                ))}
                {stats.problematicJobs.length > 5 && (
                  <p className="text-xs text-yellow-700 italic">
                    ...and {stats.problematicJobs.length - 5} more issues
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bradford Jobs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Bradford Jobs</h3>
        </div>

        {jobs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No Bradford partner jobs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bradford Ref
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {jobs.map((job: any) => {
                  const jobRevenue = job.lineItems?.reduce((sum: number, item: any) =>
                    sum + (item.quantity * item.unitPrice), 0) || 0;

                  return (
                    <tr
                      key={job.id}
                      onClick={() => handleRowClick(job)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {job.number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{job.title}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {job.bradfordRefNumber ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                            {job.bradfordRefNumber}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">Not assigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        ${jobRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
          onGenerateEmail={() => onShowEmailDraft(selectedJob)}
          onDownloadPO={() => pdfApi.generateVendorPO(selectedJob.id)}
          onDownloadInvoice={() => pdfApi.generateInvoice(selectedJob.id)}
          onDownloadQuote={() => pdfApi.generateQuote(selectedJob.id)}
          onUpdateBradfordRef={handleUpdateBradfordRef}
        />
      )}
    </div>
  );
}
