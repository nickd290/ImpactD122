import React, { useState } from 'react';
import { X, DollarSign, Calendar } from 'lucide-react';
import { StatusBadge } from './ui/StatusBadge';
import { JobDrawer } from './JobDrawer';
import { pdfApi, jobsApi } from '../lib/api';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

interface EntityJobsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entity: any;
  jobs: any[];
  type: 'CUSTOMER' | 'VENDOR';
  onJobClick?: (job: any) => void;
  onRefresh?: () => void;
}

export function EntityJobsDrawer({
  isOpen,
  onClose,
  entity,
  jobs,
  type,
  onJobClick,
  onRefresh,
}: EntityJobsDrawerProps) {
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [isJobDrawerOpen, setIsJobDrawerOpen] = useState(false);

  if (!isOpen || !entity) {
    return null;
  }

  console.log('EntityJobsDrawer rendering:', { isOpen, entity, jobsCount: jobs.length });

  const entityLabel = type === 'CUSTOMER' ? 'Customer' : 'Vendor';
  const revenueLabel = type === 'CUSTOMER' ? 'Total Revenue' : 'Total Cost';

  const handleJobClick = (job: any) => {
    setSelectedJob(job);
    setIsJobDrawerOpen(true);
  };

  const handleUpdateBradfordRef = async (jobId: string, refNumber: string) => {
    try {
      const updatedJob = await jobsApi.updateBradfordRef(jobId, refNumber);
      setSelectedJob(updatedJob);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Failed to update Bradford reference:', error);
      alert('Failed to update Bradford reference. Please try again.');
    }
  };

  // Calculate totals
  const totalAmount = jobs?.reduce((sum, job) => {
    if (!job || !job.lineItems) return sum;
    const jobTotal = job.lineItems.reduce((lineSum: number, item: any) => {
      if (!item) return lineSum;
      if (type === 'CUSTOMER') {
        return lineSum + ((item.quantity || 0) * (item.unitPrice || 0));
      } else {
        return lineSum + ((item.quantity || 0) * (item.unitCost || 0));
      }
    }, 0);
    return sum + jobTotal;
  }, 0) || 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black transition-opacity duration-300 z-40 ${
          isOpen ? 'bg-opacity-50' : 'bg-opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 overflow-y-auto ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{entity.name}</h2>
            <p className="text-sm text-gray-600 mt-1">{entityLabel} Job History</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Entity Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Contact Person:</span>
                <p className="font-medium text-gray-900">{entity.contactPerson || '-'}</p>
              </div>
              <div>
                <span className="text-gray-600">Email:</span>
                <p className="font-medium text-gray-900">{entity.email || '-'}</p>
              </div>
              <div>
                <span className="text-gray-600">Phone:</span>
                <p className="font-medium text-gray-900">{entity.phone || '-'}</p>
              </div>
              {entity.isPartner && (
                <div>
                  <span className="px-2 py-1 bg-impact-orange text-white rounded text-xs font-medium">
                    Partner
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">{revenueLabel}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalAmount)}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">Total Jobs</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {jobs.length}
              </p>
            </div>
          </div>

          {/* Jobs List */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Job History</h3>
            {!jobs || jobs.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
                <p>No jobs found for this {entityLabel.toLowerCase()}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => {
                  if (!job) return null;

                  const jobAmount = job.lineItems?.reduce((sum: number, item: any) => {
                    if (!item) return sum;
                    if (type === 'CUSTOMER') {
                      return sum + ((item.quantity || 0) * (item.unitPrice || 0));
                    } else {
                      return sum + ((item.quantity || 0) * (item.unitCost || 0));
                    }
                  }, 0) || 0;

                  return (
                    <div
                      key={job.id}
                      onClick={() => handleJobClick(job)}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900">{job.title}</h4>
                          <p className="text-sm text-gray-600">{job.number}</p>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="text-gray-600">
                          {type === 'CUSTOMER' ? (
                            <>Vendor: <span className="font-medium text-gray-900">{job.vendor?.name || '-'}</span></>
                          ) : (
                            <>Customer: <span className="font-medium text-gray-900">{job.customer?.name || '-'}</span></>
                          )}
                        </div>
                        <div className="font-semibold text-gray-900">
                          {formatCurrency(jobAmount)}
                        </div>
                      </div>
                      {job.dateCreated && (
                        <div className="text-xs text-gray-500 mt-2">
                          Created: {new Date(job.dateCreated).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Job Details Drawer (nested on top) */}
      {selectedJob && (
        <JobDrawer
          isOpen={isJobDrawerOpen}
          onClose={() => {
            setIsJobDrawerOpen(false);
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
    </>
  );
}
