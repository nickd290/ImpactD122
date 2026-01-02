import React from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { WORKFLOW_STAGES, getNextWorkflowStatuses, getStageIndex, STATUS_CONFIG } from './WorkflowStatusBadge';

interface WorkflowStatusCardProps {
  currentStatus: string;
  onStatusChange: (newStatus: string) => void;
  isUpdating?: boolean;
  className?: string;
}

export function WorkflowStatusCard({
  currentStatus,
  onStatusChange,
  isUpdating = false,
  className,
}: WorkflowStatusCardProps) {
  const currentStage = WORKFLOW_STAGES.find(s => s.status === currentStatus);
  const stageIndex = getStageIndex(currentStatus);
  const totalStages = WORKFLOW_STAGES.length;
  const nextStages = getNextWorkflowStatuses(currentStatus);
  const config = STATUS_CONFIG[currentStatus] || { label: currentStatus, bgColor: 'bg-gray-100', textColor: 'text-gray-700', emoji: '📋' };

  // Determine the primary next action
  const primaryNext = nextStages[0];

  // Progress percentage
  const progressPercent = Math.round((stageIndex / (totalStages - 1)) * 100);

  // Get stage color classes for the card background
  const getCardColor = () => {
    if (currentStatus === 'PAID') return 'bg-green-50 border-green-200';
    if (currentStatus === 'SHIPPED') return 'bg-purple-50 border-purple-200';
    if (currentStatus === 'IN_PRODUCTION') return 'bg-blue-50 border-blue-200';
    if (currentStatus === 'READY_TO_SHIP') return 'bg-indigo-50 border-indigo-200';
    if (currentStatus.includes('AWAITING') || currentStatus.includes('PENDING')) return 'bg-yellow-50 border-yellow-200';
    return 'bg-blue-50 border-blue-200';
  };

  // Get text color for the status
  const getTextColor = () => {
    if (currentStatus === 'PAID') return 'text-green-800';
    if (currentStatus === 'SHIPPED') return 'text-purple-800';
    if (currentStatus === 'IN_PRODUCTION') return 'text-blue-800';
    if (currentStatus === 'READY_TO_SHIP') return 'text-indigo-800';
    if (currentStatus.includes('AWAITING') || currentStatus.includes('PENDING')) return 'text-yellow-800';
    return 'text-blue-800';
  };

  return (
    <div className={cn('rounded-lg border p-3', getCardColor(), className)}>
      {/* Top row: status label + progress dots */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Workflow Status
        </span>
        {/* Progress indicator */}
        <div className="flex items-center gap-0.5">
          {WORKFLOW_STAGES.slice(0, 5).map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                idx <= Math.min(stageIndex, 4) ? 'bg-blue-500' : 'bg-gray-300'
              )}
            />
          ))}
          {stageIndex > 4 && (
            <>
              <span className="text-[10px] text-gray-400 mx-0.5">...</span>
              {WORKFLOW_STAGES.slice(-3).map((_, idx) => (
                <div
                  key={idx + 7}
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    stageIndex >= WORKFLOW_STAGES.length - 3 + idx ? 'bg-blue-500' : 'bg-gray-300'
                  )}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Current status display */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{config.emoji}</span>
        <span className={cn('text-lg font-bold', getTextColor())}>
          {currentStage?.label || currentStatus}
        </span>
      </div>

      {/* Next action button */}
      {primaryNext && currentStatus !== 'PAID' ? (
        <button
          onClick={() => onStatusChange(primaryNext.status)}
          disabled={isUpdating}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
            'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700',
            isUpdating && 'opacity-50 cursor-wait'
          )}
        >
          <ArrowRight className="w-4 h-4" />
          {primaryNext.label}
          {isUpdating && '...'}
        </button>
      ) : currentStatus === 'PAID' ? (
        <div className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-green-700 bg-green-100 rounded-md">
          <CheckCircle2 className="w-4 h-4" />
          Complete
        </div>
      ) : null}
    </div>
  );
}
