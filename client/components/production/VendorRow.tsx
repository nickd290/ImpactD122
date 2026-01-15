import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Building2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { VendorGroup, ProductionJob } from '../../hooks/useProductionBoard';
import { ProductionJobCard } from './ProductionJobCard';

interface VendorRowProps {
  group: VendorGroup;
  onJobClick: (job: ProductionJob) => void;
  onSendPO: (job: ProductionJob) => void;
  onSendInvoice: (job: ProductionJob) => void;
  onSendProof: (job: ProductionJob) => void;
  onViewFile: (fileId: string, fileName: string) => void;
  defaultExpanded?: boolean;
}

export function VendorRow({
  group,
  onJobClick,
  onSendPO,
  onSendInvoice,
  onSendProof,
  onViewFile,
  defaultExpanded = true,
}: VendorRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const isUnassigned = !group.vendorId;

  return (
    <div className="border-b border-slate-200 last:border-b-0">
      {/* Vendor Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          'bg-slate-50 hover:bg-slate-100 transition-colors',
          isUnassigned && 'bg-amber-50 hover:bg-amber-100'
        )}
      >
        {/* Expand/Collapse Icon */}
        <div className="text-slate-400">
          {expanded ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </div>

        {/* Vendor Icon */}
        <Building2 className={cn(
          'w-5 h-5',
          isUnassigned ? 'text-amber-500' : 'text-slate-500'
        )} />

        {/* Vendor Name */}
        <span className={cn(
          'font-semibold text-sm',
          isUnassigned ? 'text-amber-700' : 'text-slate-900'
        )}>
          {group.vendorName}
        </span>

        {/* Job Count Badge */}
        <span className="px-2 py-0.5 text-xs font-medium bg-slate-200 text-slate-700 rounded-full">
          {group.totalJobs} job{group.totalJobs !== 1 ? 's' : ''}
        </span>

        {/* Needs Action Badge */}
        {group.needsAction > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
            <AlertCircle className="w-3 h-3" />
            {group.needsAction} need action
          </span>
        )}

        {/* Vendor Email (if available) */}
        {group.vendorEmail && (
          <span className="text-xs text-slate-500 ml-auto hidden sm:block">
            {group.vendorEmail}
          </span>
        )}
      </button>

      {/* Cards Container - Horizontal Scroll */}
      {expanded && (
        <div className="bg-white p-4">
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
            {group.jobs.map(job => (
              <ProductionJobCard
                key={job.id}
                job={job}
                onClick={() => onJobClick(job)}
                onSendPO={() => onSendPO(job)}
                onSendInvoice={() => onSendInvoice(job)}
                onSendProof={() => onSendProof(job)}
                onViewFile={onViewFile}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorRow;
