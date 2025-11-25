import React, { useState } from 'react';
import { StatusBadge } from './ui/StatusBadge';
import { StatCard } from './ui/StatCard';
import { JobDrawer } from './JobDrawer';
import { pdfApi, jobsApi } from '../lib/api';

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

  const stats = {
    totalBradfordJobs: jobs.length,
    activeBradfordJobs: jobs.filter((j: any) => !['PAID', 'CANCELLED'].includes(j.status)).length,
    completedBradfordJobs: jobs.filter((j: any) => j.status === 'PAID').length,
    inProduction: jobs.filter((j: any) => j.status === 'IN_PRODUCTION').length,
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

  // Calculate total revenue from Bradford jobs
  const totalRevenue = jobs.reduce((sum: number, job: any) => {
    const jobTotal = job.lineItems?.reduce((lineSum: number, item: any) =>
      lineSum + (item.quantity * item.unitPrice), 0) || 0;
    return sum + jobTotal;
  }, 0);

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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard title="Total Bradford Jobs" value={stats.totalBradfordJobs} color="orange" />
        <StatCard title="Active Jobs" value={stats.activeBradfordJobs} color="blue" />
        <StatCard title="Completed Jobs" value={stats.completedBradfordJobs} color="green" />
        <StatCard title="In Production" value={stats.inProduction} color="yellow" />
      </div>

      {/* Revenue Card */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h3 className="text-lg font-semibold mb-2">Total Revenue</h3>
        <p className="text-3xl font-bold text-impact-red">
          ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="text-sm text-gray-500 mt-1">From all Bradford partner jobs</p>
      </div>

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
