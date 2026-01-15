import React from 'react';
import { Check, Circle, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatusStripProps {
  // QC indicators
  hasArtwork: boolean;
  hasData: boolean;
  dataNA?: boolean;
  // Vendor status
  poSent: boolean;
  vendorConfirmed: boolean;
  // Proof status
  hasProof: boolean;
  proofApproved: boolean;
  proofChangesRequested?: boolean;
  // Shipping
  hasTracking: boolean;
}

interface StepProps {
  label: string;
  status: 'complete' | 'pending' | 'attention' | 'na';
}

function Step({ label, status }: StepProps) {
  return (
    <div className="flex items-center gap-1.5">
      {status === 'complete' && (
        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </div>
      )}
      {status === 'pending' && (
        <Circle className="w-4 h-4 text-slate-300" strokeWidth={2} />
      )}
      {status === 'attention' && (
        <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
          <AlertTriangle className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </div>
      )}
      {status === 'na' && (
        <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center">
          <span className="text-[8px] font-bold text-slate-500">—</span>
        </div>
      )}
      <span className={cn(
        'text-xs font-medium',
        status === 'complete' ? 'text-emerald-700' :
        status === 'attention' ? 'text-amber-700' :
        status === 'na' ? 'text-slate-400' :
        'text-slate-500'
      )}>
        {label}
      </span>
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
}: StatusStripProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
      {/* Files Section */}
      <div className="flex items-center gap-3">
        <Step
          label="Art"
          status={hasArtwork ? 'complete' : 'pending'}
        />
        <Step
          label="Data"
          status={dataNA ? 'na' : hasData ? 'complete' : 'pending'}
        />
      </div>

      <div className="w-px h-4 bg-slate-300" />

      {/* Vendor Section */}
      <div className="flex items-center gap-3">
        <Step
          label="PO Sent"
          status={poSent ? 'complete' : 'pending'}
        />
        <Step
          label="Confirmed"
          status={vendorConfirmed ? 'complete' : 'pending'}
        />
      </div>

      <div className="w-px h-4 bg-slate-300" />

      {/* Proof Section */}
      <div className="flex items-center gap-3">
        <Step
          label="Proof"
          status={
            proofChangesRequested ? 'attention' :
            hasProof ? 'complete' : 'pending'
          }
        />
        <Step
          label="Approved"
          status={proofApproved ? 'complete' : 'pending'}
        />
      </div>

      <div className="w-px h-4 bg-slate-300" />

      {/* Shipping */}
      <Step
        label="Shipped"
        status={hasTracking ? 'complete' : 'pending'}
      />
    </div>
  );
}

export default StatusStrip;
