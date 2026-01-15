import React from 'react';
import {
  Clock,
  Check,
  XCircle,
  AlertCircle,
  Package,
  Gift,
  Truck,
  FileText,
  Mail,
  Send,
  CheckCircle2,
  Eye,
  FileDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ProductionJob, getDaysUntilDue, getUrgencyLevel } from '../../hooks/useProductionBoard';

interface ProductionJobCardProps {
  job: ProductionJob;
  onClick: () => void;
  onSendPO?: () => void;
  onSendInvoice?: () => void;
  onSendProof?: () => void;
  onViewFile?: (fileId: string, fileName: string) => void;
}

export function ProductionJobCard({
  job,
  onClick,
  onSendPO,
  onSendInvoice,
  onSendProof,
  onViewFile,
}: ProductionJobCardProps) {
  const daysUntilDue = getDaysUntilDue(job.deliveryDate);
  const urgency = getUrgencyLevel(daysUntilDue);

  const urgencyStyles = {
    overdue: 'border-l-red-600',
    critical: 'border-l-red-400',
    soon: 'border-l-amber-400',
    ok: 'border-l-emerald-400',
  };

  const urgencyBadge = {
    overdue: 'bg-red-600 text-white',
    critical: 'bg-red-500 text-white',
    soon: 'bg-amber-500 text-white',
    ok: 'bg-slate-200 text-slate-700',
  };

  // Determine QC status (backend uses lowercase: 'sent', 'missing', 'na')
  const missingArt = job.qc.artwork === 'missing';
  const missingData = job.qc.data === 'missing';
  const isBlocked = missingArt || missingData;

  // Proof status
  const latestProof = job.proofs[0];
  const hasPendingProof = latestProof?.status === 'PENDING';
  const proofApproved = latestProof?.status === 'APPROVED';

  // Portal/vendor status
  const vendorConfirmed = job.qc.vendorConfirmed;
  const vendorStatus = job.portal?.vendorStatus;

  // PO status
  const hasPO = job.purchaseOrders.length > 0;
  const poSent = hasPO && !!job.purchaseOrders[0]?.emailedAt;

  // Format due badge text
  const getDueBadgeText = () => {
    if (daysUntilDue === null) return 'No date';
    if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d late`;
    if (daysUntilDue === 0) return 'Today';
    if (daysUntilDue === 1) return 'Tomorrow';
    return `${daysUntilDue}d`;
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg border border-slate-200 shadow-sm cursor-pointer',
        'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
        'border-l-4 min-w-[280px] max-w-[320px] flex-shrink-0',
        urgencyStyles[urgency],
        isBlocked && 'ring-2 ring-red-200'
      )}
    >
      {/* Header: Job#, Customer, Due Badge */}
      <div className="p-3 pb-2 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-xs text-slate-500 mb-0.5">{job.jobNo}</div>
            <div className="text-sm font-bold text-slate-900 truncate">
              {job.customerName || 'No Customer'}
            </div>
          </div>
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold tabular-nums shrink-0',
            urgencyBadge[urgency]
          )}>
            <Clock className="w-3 h-3" />
            {getDueBadgeText()}
          </div>
        </div>
        {job.title && (
          <div className="text-xs text-slate-600 truncate" title={job.title}>
            {job.title}
          </div>
        )}
      </div>

      {/* Specs Section */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Size:</span>
          <span className="font-medium text-slate-700">{job.sizeName || '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Qty:</span>
          <span className="font-medium text-slate-700">{job.quantity?.toLocaleString() || '—'}</span>
        </div>
        {job.specs?.paperType && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Paper:</span>
            <span className="font-medium text-slate-700 truncate max-w-[180px]">
              {job.specs.paperType}
            </span>
          </div>
        )}
        {job.specs?.colors && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Colors:</span>
            <span className="font-medium text-slate-700">{job.specs.colors}</span>
          </div>
        )}
        {job.specs?.finishing && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Finishing:</span>
            <span className="font-medium text-slate-700 truncate max-w-[180px]">
              {job.specs.finishing}
            </span>
          </div>
        )}
      </div>

      {/* Shipping Section */}
      {(job.vendorShipToName || job.vendorShipToCity) && (
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs">
            <Package className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-700">
              {[job.vendorShipToName, job.vendorShipToCity, job.vendorShipToState]
                .filter(Boolean)
                .join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Samples Section */}
      {job.hasSamples && (
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs">
            <Gift className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-purple-700 font-medium">Samples Required</span>
          </div>
        </div>
      )}

      {/* QC Status Row */}
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="flex items-center gap-3 text-[11px]">
          {/* Artwork */}
          <span className={cn(
            'flex items-center gap-1 font-medium',
            missingArt ? 'text-red-600' : 'text-emerald-600'
          )}>
            {missingArt ? <XCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            Art{job.qc.artworkCount > 0 && `(${job.qc.artworkCount})`}
          </span>

          {/* Data */}
          <span className={cn(
            'flex items-center gap-1 font-medium',
            missingData ? 'text-red-600' : job.qc.data === 'na' ? 'text-slate-400' : 'text-emerald-600'
          )}>
            {missingData ? <XCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            Data
          </span>

          {/* Proof */}
          <span className={cn(
            'flex items-center gap-1 font-medium',
            hasPendingProof ? 'text-amber-600' : proofApproved ? 'text-emerald-600' : 'text-slate-400'
          )}>
            {proofApproved ? <Check className="w-3.5 h-3.5" /> : hasPendingProof ? <AlertCircle className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            Proof{latestProof && ` v${latestProof.version}`}
          </span>

          {/* Vendor Status */}
          {vendorStatus && (
            <span className="text-blue-600 font-medium ml-auto">
              {vendorStatus.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>

      {/* Tracking Section */}
      {job.portal?.trackingNumber && (
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs">
            <Truck className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-mono text-blue-700">
              {job.portal.trackingCarrier}: {job.portal.trackingNumber}
            </span>
          </div>
        </div>
      )}

      {/* File View Buttons */}
      {(job.files?.artwork?.length > 0 || job.files?.data?.length > 0 || job.files?.proofs?.length > 0 || job.files?.po?.length > 0) && (
        <div className="px-2 py-1.5 border-b border-slate-100 flex items-center gap-1.5 flex-wrap">
          {job.files.artwork.length > 0 && onViewFile && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewFile(job.files.artwork[0].id, job.files.artwork[0].name); }}
              className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-colors"
            >
              <Eye className="w-3 h-3" />
              Art
            </button>
          )}
          {job.files.data.length > 0 && onViewFile && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewFile(job.files.data[0].id, job.files.data[0].name); }}
              className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium bg-cyan-50 text-cyan-700 rounded hover:bg-cyan-100 transition-colors"
            >
              <Eye className="w-3 h-3" />
              Data
            </button>
          )}
          {job.files.proofs.length > 0 && onViewFile && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewFile(job.files.proofs[0].id, job.files.proofs[0].name); }}
              className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium bg-amber-50 text-amber-700 rounded hover:bg-amber-100 transition-colors"
            >
              <Eye className="w-3 h-3" />
              Proof
            </button>
          )}
          {job.files.po.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); window.open(`/api/files/${job.files.po[0].id}/download`, '_blank'); }}
              className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors"
            >
              <FileDown className="w-3 h-3" />
              PO
            </button>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="p-2 flex items-center gap-2 flex-wrap">
        {hasPO && !poSent && onSendPO && (
          <button
            onClick={(e) => { e.stopPropagation(); onSendPO(); }}
            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            <Send className="w-3 h-3" />
            Send PO
          </button>
        )}

        {poSent && (
          <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded">
            <CheckCircle2 className="w-3 h-3" />
            PO Sent
          </span>
        )}

        {onSendInvoice && (
          <button
            onClick={(e) => { e.stopPropagation(); onSendInvoice(); }}
            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
          >
            <Mail className="w-3 h-3" />
            Invoice
          </button>
        )}

        {onSendProof && !proofApproved && (
          <button
            onClick={(e) => { e.stopPropagation(); onSendProof(); }}
            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
          >
            <FileText className="w-3 h-3" />
            Proof
          </button>
        )}

        {/* Blocked indicator */}
        {isBlocked && (
          <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold bg-red-100 text-red-700 rounded ml-auto">
            <XCircle className="w-3 h-3" />
            BLOCKED
          </span>
        )}
      </div>
    </div>
  );
}

export default ProductionJobCard;
