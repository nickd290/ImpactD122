import React from 'react';
import { AlertCircle, CheckCircle2, Clock, FileImage, Database, Package, FileText, Truck } from 'lucide-react';
import { cn } from '../lib/utils';

interface WhatsMissingProps {
  job: {
    artReceived?: boolean;
    dataReceived?: boolean;
    hasPO?: boolean;
    poSent?: boolean;
    proofStatus?: string;
    trackingOverride?: string;
    missing?: string[];
    // QC flags from server
    qcArtwork?: string;
    qcDataFiles?: string;
    artOverride?: boolean;
    dataOverride?: string;
  };
  compact?: boolean; // Show compact badges vs detailed list
  showReady?: boolean; // Show "Ready" when nothing missing
}

interface MissingItem {
  key: string;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  status: 'missing' | 'received' | 'pending' | 'na';
}

export function getWhatsMissing(job: WhatsMissingProps['job']): MissingItem[] {
  const items: MissingItem[] = [];

  // Art status
  const artReceived = job.artReceived || job.qcArtwork === 'RECEIVED' || job.artOverride;
  const artNA = job.qcArtwork === 'NA';
  if (!artNA) {
    items.push({
      key: 'art',
      label: 'Artwork',
      shortLabel: 'Art',
      icon: FileImage,
      status: artReceived ? 'received' : 'missing',
    });
  }

  // Data status
  const dataReceived = job.dataReceived ||
    (job.qcDataFiles && job.qcDataFiles !== 'PENDING' && job.qcDataFiles !== 'NA') ||
    job.dataOverride;
  const dataNA = job.qcDataFiles === 'NA';
  if (!dataNA) {
    items.push({
      key: 'data',
      label: 'Data Files',
      shortLabel: 'Data',
      icon: Database,
      status: dataReceived ? 'received' : 'missing',
    });
  }

  // PO status
  if (job.hasPO !== undefined) {
    items.push({
      key: 'po',
      label: 'Purchase Order',
      shortLabel: 'PO',
      icon: FileText,
      status: job.hasPO ? (job.poSent ? 'received' : 'pending') : 'missing',
    });
  }

  // Proof status
  if (job.proofStatus) {
    const proofReceived = job.proofStatus === 'APPROVED' || job.proofStatus === 'RECEIVED';
    items.push({
      key: 'proof',
      label: 'Proof',
      shortLabel: 'Proof',
      icon: FileImage,
      status: proofReceived ? 'received' : 'pending',
    });
  }

  // Tracking
  if (job.trackingOverride) {
    items.push({
      key: 'tracking',
      label: 'Tracking',
      shortLabel: 'Track',
      icon: Truck,
      status: 'received',
    });
  }

  return items;
}

export function WhatsMissing({ job, compact = true, showReady = true }: WhatsMissingProps) {
  // If job.missing array is provided, use it directly (from production meeting API)
  if (job.missing && job.missing.length > 0) {
    return (
      <div className={cn('flex flex-wrap gap-1', !compact && 'flex-col gap-2')}>
        {job.missing.map((item, i) => (
          <span
            key={i}
            className={cn(
              'inline-flex items-center gap-1 font-medium rounded',
              compact ? 'px-2 py-0.5 text-xs bg-amber-100 text-amber-800' : 'px-3 py-1 text-sm bg-amber-50 text-amber-700'
            )}
          >
            <Clock className="w-3 h-3" />
            {item}
          </span>
        ))}
      </div>
    );
  }

  // Calculate missing items from job flags
  const items = getWhatsMissing(job);
  const missingItems = items.filter(i => i.status === 'missing');
  const pendingItems = items.filter(i => i.status === 'pending');

  // All received - show "Ready" badge
  if (missingItems.length === 0 && pendingItems.length === 0) {
    if (!showReady) return null;
    return (
      <span className={cn(
        'inline-flex items-center gap-1 font-medium rounded',
        compact ? 'px-2 py-0.5 text-xs bg-green-100 text-green-700' : 'px-3 py-1 text-sm bg-green-50 text-green-700'
      )}>
        <CheckCircle2 className="w-3 h-3" />
        Ready
      </span>
    );
  }

  if (compact) {
    // Compact: Show missing as amber badges, pending as gray
    return (
      <div className="flex flex-wrap gap-1">
        {missingItems.map(item => (
          <span
            key={item.key}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded"
          >
            <item.icon className="w-3 h-3" />
            {item.shortLabel}
          </span>
        ))}
        {pendingItems.map(item => (
          <span
            key={item.key}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded"
            title={`${item.label} pending`}
          >
            <Clock className="w-3 h-3" />
            {item.shortLabel}
          </span>
        ))}
      </div>
    );
  }

  // Detailed: Show full list with icons
  return (
    <div className="space-y-1">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className={cn(
              'flex items-center gap-2 px-2 py-1 rounded text-sm',
              item.status === 'received' && 'bg-green-50 text-green-700',
              item.status === 'missing' && 'bg-amber-50 text-amber-700',
              item.status === 'pending' && 'bg-gray-50 text-gray-600'
            )}
          >
            {item.status === 'received' ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : item.status === 'pending' ? (
              <Clock className="w-4 h-4 text-gray-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600" />
            )}
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Simple missing count badge for compact displays
export function MissingCount({ job }: { job: WhatsMissingProps['job'] }) {
  const missingCount = job.missing?.length || getWhatsMissing(job).filter(i => i.status === 'missing').length;

  if (missingCount === 0) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 text-green-700 rounded-full text-xs font-bold">
        ✓
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center w-6 h-6 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
      {missingCount}
    </span>
  );
}
