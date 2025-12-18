import React from 'react';
import { cn } from '../../lib/utils';
import { Check, Circle, FileText, Send, Truck, DollarSign, ClipboardList, Factory } from 'lucide-react';

// Workflow stages in order
export const WORKFLOW_STAGES = [
  { id: 'DRAFT', label: 'Draft', shortLabel: 'Draft', icon: FileText },
  { id: 'QUOTE_SENT', label: 'Quote Sent', shortLabel: 'Quote', icon: Send },
  { id: 'PO_ISSUED', label: 'PO Issued', shortLabel: 'PO', icon: ClipboardList },
  { id: 'IN_PRODUCTION', label: 'In Production', shortLabel: 'Production', icon: Factory },
  { id: 'SHIPPED', label: 'Shipped', shortLabel: 'Shipped', icon: Truck },
  { id: 'INVOICED', label: 'Invoiced', shortLabel: 'Invoice', icon: FileText },
  { id: 'PAID', label: 'Paid', shortLabel: 'Paid', icon: DollarSign },
] as const;

export type WorkflowStageId = typeof WORKFLOW_STAGES[number]['id'];

interface WorkflowProgressProps {
  currentStage: WorkflowStageId;
  onStageClick?: (stage: WorkflowStageId) => void;
  compact?: boolean;
  className?: string;
}

export function WorkflowProgress({
  currentStage,
  onStageClick,
  compact = false,
  className,
}: WorkflowProgressProps) {
  const currentIndex = WORKFLOW_STAGES.findIndex(s => s.id === currentStage);

  return (
    <div className={cn('flex items-center', compact ? 'gap-1' : 'gap-2', className)}>
      {WORKFLOW_STAGES.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isPending = index > currentIndex;
        const Icon = stage.icon;

        return (
          <React.Fragment key={stage.id}>
            {/* Stage Indicator */}
            <button
              onClick={() => onStageClick?.(stage.id)}
              disabled={!onStageClick}
              className={cn(
                'flex items-center gap-1.5 transition-all',
                onStageClick && 'cursor-pointer hover:scale-105',
                !onStageClick && 'cursor-default'
              )}
              title={stage.label}
            >
              {/* Circle/Check Icon */}
              <div
                className={cn(
                  'flex items-center justify-center rounded-full transition-colors',
                  compact ? 'w-5 h-5' : 'w-7 h-7',
                  isCompleted && 'bg-green-500 text-white',
                  isCurrent && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
                  isPending && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <Check className={cn(compact ? 'w-3 h-3' : 'w-4 h-4')} />
                ) : (
                  <Icon className={cn(compact ? 'w-3 h-3' : 'w-4 h-4')} />
                )}
              </div>

              {/* Label (only in non-compact mode) */}
              {!compact && (
                <span
                  className={cn(
                    'text-xs font-medium whitespace-nowrap',
                    isCompleted && 'text-green-600',
                    isCurrent && 'text-primary',
                    isPending && 'text-muted-foreground'
                  )}
                >
                  {stage.shortLabel}
                </span>
              )}
            </button>

            {/* Connector Line */}
            {index < WORKFLOW_STAGES.length - 1 && (
              <div
                className={cn(
                  'flex-shrink-0 transition-colors',
                  compact ? 'w-3 h-0.5' : 'w-6 h-0.5',
                  index < currentIndex ? 'bg-green-500' : 'bg-border'
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Compact inline version for table rows
interface WorkflowProgressInlineProps {
  currentStage: WorkflowStageId;
  className?: string;
}

export function WorkflowProgressInline({
  currentStage,
  className,
}: WorkflowProgressInlineProps) {
  const currentIndex = WORKFLOW_STAGES.findIndex(s => s.id === currentStage);
  const stage = WORKFLOW_STAGES[currentIndex] || WORKFLOW_STAGES[0];

  // Color based on progress
  const getStageColor = () => {
    if (currentStage === 'PAID') return 'bg-green-100 text-green-700 border-green-200';
    if (currentStage === 'INVOICED') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (currentStage === 'SHIPPED') return 'bg-purple-100 text-purple-700 border-purple-200';
    if (currentStage === 'IN_PRODUCTION') return 'bg-orange-100 text-orange-700 border-orange-200';
    if (currentStage === 'PO_ISSUED') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (currentStage === 'QUOTE_SENT') return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    return 'bg-gray-100 text-gray-600 border-gray-200'; // DRAFT
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        getStageColor(),
        className
      )}
      title={`Stage ${currentIndex + 1} of ${WORKFLOW_STAGES.length}: ${stage.label}`}
    >
      <stage.icon className="w-3 h-3" />
      <span>{stage.shortLabel}</span>
      <span className="text-[10px] opacity-70">({currentIndex + 1}/{WORKFLOW_STAGES.length})</span>
    </div>
  );
}
