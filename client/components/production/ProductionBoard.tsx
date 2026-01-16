import React, { useState } from 'react';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { useProductionBoard, ProductionJob } from '../../hooks/useProductionBoard';
import { ProductionFilters } from './ProductionFilters';
import { VendorRow } from './VendorRow';
import { SendEmailModal } from '../SendEmailModal';
import { JobDrawer } from '../JobDrawer';
import { PDFPreviewModal } from '../PDFPreviewModal';

interface ProductionBoardProps {
  onRefresh?: () => void;
}

type EmailModalState = {
  type: 'po' | 'invoice';
  job: ProductionJob;
} | null;

export function ProductionBoard({ onRefresh }: ProductionBoardProps) {
  const {
    vendorGroups,
    stats,
    filterOptions,
    loading,
    error,
    filters,
    updateFilters,
    refresh,
  } = useProductionBoard();

  // Job drawer state (slide-out panel)
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [emailModal, setEmailModal] = useState<EmailModalState>(null);

  // PDF Preview state
  const [previewFile, setPreviewFile] = useState<{ id: string; name: string } | null>(null);

  // Handle refresh
  const handleRefresh = () => {
    refresh();
    onRefresh?.();
  };

  // Handle job click - opens JobDrawer slide-out
  const handleJobClick = (job: ProductionJob) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  // Handle drawer close
  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setSelectedJob(null);
  };

  // Handle Send PO
  const handleSendPO = (job: ProductionJob) => {
    if (job.purchaseOrders.length > 0) {
      setEmailModal({ type: 'po', job });
    }
  };

  // Handle Send Invoice
  const handleSendInvoice = (job: ProductionJob) => {
    setEmailModal({ type: 'invoice', job });
  };

  // Handle Send Proof - opens job drawer since proof needs file selection
  const handleSendProof = (job: ProductionJob) => {
    setSelectedJob(job);
    setIsDrawerOpen(true);
  };

  // Handle email modal close
  const handleEmailModalClose = () => {
    setEmailModal(null);
  };

  // Handle email sent success
  const handleEmailSuccess = () => {
    setEmailModal(null);
    handleRefresh();
  };

  // Handle file preview
  const handleViewFile = (fileId: string, fileName: string) => {
    setPreviewFile({ id: fileId, name: fileName });
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-red-600">{error}</p>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Filters & Stats Header */}
      <ProductionFilters
        filters={filters}
        stats={stats}
        filterOptions={filterOptions}
        onFilterChange={updateFilters}
      />

      {/* Refresh Button */}
      <div className="px-6 py-2 bg-white border-b border-slate-200 flex items-center justify-end">
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && vendorGroups.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
        ) : vendorGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <p className="text-lg font-medium">No jobs found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="bg-white">
            {vendorGroups.map(group => (
              <VendorRow
                key={group.vendorId || 'unassigned'}
                group={group}
                onJobClick={handleJobClick}
                onSendPO={handleSendPO}
                onSendInvoice={handleSendInvoice}
                onSendProof={handleSendProof}
                onViewFile={handleViewFile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Email Modals */}
      {emailModal?.type === 'po' && emailModal.job.purchaseOrders[0] && (
        <SendEmailModal
          type="po"
          jobId={emailModal.job.id}
          poId={emailModal.job.purchaseOrders[0].id}
          poNumber={emailModal.job.purchaseOrders[0].poNumber}
          defaultEmail={emailModal.job.vendor?.email || ''}
          recipientName={emailModal.job.vendor?.name || ''}
          vendorInfo={{
            email: emailModal.job.vendor?.email,
            name: emailModal.job.vendor?.name,
            contacts: emailModal.job.vendor?.contacts || [],
          }}
          onClose={handleEmailModalClose}
          onSuccess={handleEmailSuccess}
        />
      )}

      {emailModal?.type === 'invoice' && (
        <SendEmailModal
          type="invoice"
          jobId={emailModal.job.id}
          defaultEmail={emailModal.job.customer?.email || ''}
          recipientName={emailModal.job.customer?.name || ''}
          onClose={handleEmailModalClose}
          onSuccess={handleEmailSuccess}
        />
      )}

      {/* Job Detail Drawer (slide-out panel) */}
      {selectedJob && (
        <JobDrawer
          job={selectedJob}
          isOpen={isDrawerOpen}
          onClose={handleDrawerClose}
          onRefresh={handleRefresh}
        />
      )}

      {/* PDF Preview Modal */}
      {previewFile && (
        <PDFPreviewModal
          fileId={previewFile.id}
          fileName={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

export default ProductionBoard;
