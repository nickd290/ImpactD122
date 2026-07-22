import React from 'react';
import { AlertCircle, Upload, Send, User, FileX, Clock, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  isPaymentOverdue,
  getDaysPaymentOverdue,
  isProductionLate,
  getDaysProductionLate,
  paymentTermsLabel,
  getPaymentTermsDays,
} from '../../lib/jobPipeline';

interface BlockingIssue {
  type: 'no_vendor' | 'no_artwork' | 'awaiting_proof' | 'awaiting_approval' | 'no_data' | 'overdue' | 'production_late';
  message: string;
  priority: number;
  action?: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
  };
  skipAction?: {
    label: string;
    onClick: () => void;
  };
}

interface BlockingIssueCardProps {
  job: {
    vendor?: { id: string; name: string } | null;
    customer?: { id: string; name: string; paymentTermsDays?: number | null } | null;
    artOverride?: boolean;
    qcArtwork?: string;
    qcDataFiles?: string;
    workflowStatus?: string;
    workflowStatusOverride?: string;
    status?: string;
    dueDate?: string;
    deliveryDate?: string;
    mailDate?: string;
    invoiceGeneratedAt?: string | null;
    customerInvoiceNumber?: string | null;
    customerPaymentDate?: string | null;
    paymentTermsDays?: number | null;
    paymentDueDate?: string | null;
  };
  hasArtwork: boolean;
  hasProof: boolean;
  onUploadArtwork?: () => void;
  onRequestArtwork?: () => void;
  onAssignVendor?: () => void;
  onSkipArtwork?: () => void;
  className?: string;
}

export function BlockingIssueCard({
  job,
  hasArtwork,
  hasProof,
  onUploadArtwork,
  onRequestArtwork,
  onAssignVendor,
  onSkipArtwork,
  className,
}: BlockingIssueCardProps) {
  // Calculate blocking issues
  const issues: BlockingIssue[] = [];

  // Priority 1: No vendor
  if (!job.vendor) {
    issues.push({
      type: 'no_vendor',
      message: 'No vendor assigned',
      priority: 1,
      action: onAssignVendor ? {
        label: 'Assign Vendor',
        icon: <User className="w-4 h-4" />,
        onClick: onAssignVendor,
      } : undefined,
    });
  }

  // Priority 2: Missing artwork
  if (!hasArtwork && !job.artOverride) {
    issues.push({
      type: 'no_artwork',
      message: 'Artwork not received',
      priority: 2,
      action: onUploadArtwork ? {
        label: 'Upload',
        icon: <Upload className="w-4 h-4" />,
        onClick: onUploadArtwork,
      } : undefined,
      skipAction: onSkipArtwork ? {
        label: 'Mark as N/A',
        onClick: onSkipArtwork,
      } : undefined,
    });
  }

  // Priority 3: Awaiting vendor proof
  if (job.workflowStatus === 'AWAITING_PROOF_FROM_VENDOR' && !hasProof) {
    issues.push({
      type: 'awaiting_proof',
      message: 'Waiting for proof from vendor',
      priority: 3,
    });
  }

  // Priority 4: Awaiting customer approval
  if (job.workflowStatus === 'AWAITING_CUSTOMER_RESPONSE') {
    issues.push({
      type: 'awaiting_approval',
      message: 'Waiting for customer approval',
      priority: 4,
    });
  }

  // Payment overdue = invoice date + customer terms (NOT delivery / mislabeled invoice date)
  if (isPaymentOverdue(job)) {
    const days = getDaysPaymentOverdue(job) || 0;
    const terms = paymentTermsLabel(getPaymentTermsDays(job));
    issues.push({
      type: 'overdue',
      message: `${days}d past payment due (${terms})`,
      priority: 0,
    });
  } else if (isProductionLate(job)) {
    // Floor only — delivery/mail late, not AR
    const days = getDaysProductionLate(job) || 0;
    issues.push({
      type: 'production_late',
      message: `${days}d past delivery date`,
      priority: 1,
    });
  }

  // Sort by priority
  issues.sort((a, b) => a.priority - b.priority);

  // No blockers, don't render
  if (issues.length === 0) return null;

  const primaryIssue = issues[0];
  const hasMultipleIssues = issues.length > 1;

  const typeStyles: Record<BlockingIssue['type'], { bg: string; border: string; text: string; icon: React.ReactNode }> = {
    overdue: {
      bg: 'bg-status-danger-bg',
      border: 'border-status-danger-border',
      text: 'text-status-danger',
      icon: <Clock className="w-5 h-5" />,
    },
    production_late: {
      bg: 'bg-status-warning-bg',
      border: 'border-status-warning-border',
      text: 'text-status-warning',
      icon: <Clock className="w-5 h-5" />,
    },
    no_vendor: {
      bg: 'bg-status-warning-bg',
      border: 'border-status-warning-border',
      text: 'text-status-warning',
      icon: <User className="w-5 h-5" />,
    },
    no_artwork: {
      bg: 'bg-status-warning-bg',
      border: 'border-status-warning-border',
      text: 'text-status-warning',
      icon: <FileX className="w-5 h-5" />,
    },
    no_data: {
      bg: 'bg-status-warning-bg',
      border: 'border-status-warning-border',
      text: 'text-status-warning',
      icon: <FileX className="w-5 h-5" />,
    },
    awaiting_proof: {
      bg: 'bg-status-info-bg',
      border: 'border-status-info-border',
      text: 'text-status-info',
      icon: <Clock className="w-5 h-5" />,
    },
    awaiting_approval: {
      bg: 'bg-status-info-bg',
      border: 'border-status-info-border',
      text: 'text-status-info',
      icon: <Clock className="w-5 h-5" />,
    },
  };

  const style = typeStyles[primaryIssue.type];

  return (
    <div className={cn(
      'rounded-lg border-2 p-4',
      style.bg,
      style.border,
      className
    )}>
      {/* Primary Issue */}
      <div className="flex items-center gap-3">
        <div className={cn('flex-shrink-0', style.text)}>
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold', style.text)}>
            {primaryIssue.type === 'overdue'
              ? 'PAYMENT OVERDUE'
              : primaryIssue.type === 'production_late'
                ? 'LATE DELIVERY'
                : 'BLOCKING'}
          </p>
          <p className="text-sm text-foreground font-medium">
            {primaryIssue.message}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {primaryIssue.skipAction && (
            <button
              onClick={primaryIssue.skipAction.onClick}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-background/50 hover:bg-background rounded-md transition-colors"
            >
              {primaryIssue.skipAction.label}
            </button>
          )}
          {primaryIssue.action && (
            <button
              onClick={primaryIssue.action.onClick}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              {primaryIssue.action.icon}
              {primaryIssue.action.label}
            </button>
          )}
        </div>
      </div>

      {/* Additional Issues */}
      {hasMultipleIssues && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Also needs attention:</p>
          <div className="flex flex-wrap gap-2">
            {issues.slice(1).map((issue, idx) => (
              <span
                key={idx}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md',
                  typeStyles[issue.type].bg,
                  typeStyles[issue.type].text
                )}
              >
                {issue.message}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
