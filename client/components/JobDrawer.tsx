/**
 * JobDrawer — legacy name kept for imports.
 * Renders the full-screen job POPUP (JobDetailModal), not a sidebar.
 */

import React from 'react';
import { JobDetailModal } from './JobDetailModal';
import { pdfApi } from '../lib/api';

interface JobDrawerProps {
  job: any | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onRefresh?: () => void;
}

export function JobDrawer({ job, isOpen, onClose, onEdit, onRefresh }: JobDrawerProps) {
  if (!isOpen) return null;

  const normalized = job
    ? {
        ...job,
        number: job.number || job.jobNo,
        jobNo: job.jobNo || job.number,
      }
    : null;

  return (
    <JobDetailModal
      job={normalized}
      isOpen={isOpen}
      onClose={onClose}
      onEdit={onEdit}
      onRefresh={onRefresh}
      onDownloadPO={() => normalized?.id && pdfApi.generateVendorPO(normalized.id)}
      onDownloadInvoice={() => normalized?.id && pdfApi.generateInvoice(normalized.id)}
      onDownloadQuote={() => normalized?.id && pdfApi.generateQuote(normalized.id)}
    />
  );
}

export default JobDrawer;
