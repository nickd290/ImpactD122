import React from 'react';
import { Check, Circle, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatusStripProps {
  // QC indicators (combined into Files)
  hasArtwork: boolean;
  hasData: boolean;
  dataNA?: boolean;
  // Vendor status (combined into Vendor PO)
  poSent: boolean;
  vendorConfirmed: boolean;
  // Proof status
  hasProof: boolean;
  proofApproved: boolean;
  proofChangesRequested?: boolean;
  // Shipping (now "Complete")
  hasTracking: boolean;
  // Job status
  isComplete?: boolean;
}

interface StepProps {
  label: string;
  status: 'complete' | 'pending' | 'attention' | 'partial';
  isLast?: boolean;
}

function Step({ label, status, isLast }: StepProps) {
  return (
    <div className="flex items-center">
      <div className="flex items-center gap-2">
        {status === 'complete' && (
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
          </div>
        )}
        {status === 'partial' && (
          <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
          </div>
        )}
        {status === 'pending' && (
          <div className="w-6 h-6 rounded-full border-2 border-slate-300 flex items-center justify-center">
            <Circle className="w-3 h-3 text-slate-300" strokeWidth={2} />
          </div>
        )}
        {status === 'attention' && (
          <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
            <AlertTriangle className="w-3.5 h-3.5 text-white" strokeWidth={3} />
          </div>
        )}
        <span className={cn(
          'text-sm font-medium',
          status === 'complete' ? 'text-emerald-700' :
          status === 'partial' ? 'text-amber-700' :
          status === 'attention' ? 'text-amber-700' :
          'text-slate-400'
        )}>
          {label}
        </span>
      </div>
      {!isLast && (
        <div className={cn(
          'w-8 h-0.5 mx-2',
          status === 'complete' ? 'bg-emerald-300' : 'bg-slate-200'
        )} />
      )}
    </div>
  );
}

export function StatusStrip({
  hasArtwork,
  hasData,
  dataNA = false,
  poSent,
  vendorConfirmed,
  hasProof,
  proofApproved,
  proofChangesRequested = false,
  hasTracking,
  isComplete = false,
}: StatusStripProps) {
  // Calculate combined statuses
  const filesComplete = hasArtwork && (hasData || dataNA);
  const filesPartial = hasArtwork || hasData;
  const vendorPOComplete = poSent && vendorConfirmed;
  const vendorPOPartial = poSent;
  const proofComplete = hasProof && !proofChangesRequested;
  const jobComplete = isComplete || hasTracking;

  // Determine step statuses
  const filesStatus = filesComplete ? 'complete' : filesPartial ? 'partial' : 'pending';
  const vendorPOStatus = vendorPOComplete ? 'complete' : vendorPOPartial ? 'partial' : 'pending';
  const proofStatus = proofChangesRequested ? 'attention' : proofComplete ? 'complete' : 'pending';
  const approvedStatus = proofApproved ? 'complete' : 'pending';
  const completeStatus = jobComplete ? 'complete' : 'pending';

  return (
    <div className="flex items-center px-4 py-4 bg-slate-50 border border-slate-200 rounded-lg">
      <Step label="Files" status={filesStatus} />
      <Step label="Vendor PO" status={vendorPOStatus} />
      <Step label="Proof" status={proofStatus} />
      <Step label="Approved" status={approvedStatus} />
      <Step label="Complete" status={completeStatus} isLast />
    </div>
  );
}

export default StatusStrip;
