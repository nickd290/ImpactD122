import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { SIMPLE_STATUS_OPTIONS, simpleStatusForWorkflow } from '../lib/jobPipeline';

interface WorkflowStatusDropdownProps {
  status: string;
  onStatusChange: (newStatus: string) => Promise<void>;
  disabled?: boolean;
  compact?: boolean; // Use short labels
  size?: 'sm' | 'md';
}

/** Only 4 floor stages: New → Proofing → Production → Complete */
export function WorkflowStatusDropdown({
  status,
  onStatusChange,
  disabled,
  compact = false,
  size = 'md'
}: WorkflowStatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentStatus = simpleStatusForWorkflow(status);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = async (newStatus: string) => {
    if (newStatus === status) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      await onStatusChange(newStatus);
    } catch (error) {
      console.error('Failed to update workflow status:', error);
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => !disabled && !isLoading && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center gap-1 rounded-md font-medium transition-colors',
          currentStatus.bgColor,
          currentStatus.color,
          size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
          !disabled && !isLoading && 'hover:opacity-80 cursor-pointer'
        )}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <>
            {compact ? currentStatus.shortLabel : currentStatus.label}
            <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
          <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
            Floor stage
          </p>
          {SIMPLE_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2',
                option.ops === currentStatus.ops && 'bg-gray-50'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full flex-shrink-0', option.bgColor.replace('100', '500'))} />
              <span className={cn('truncate', option.color)}>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default WorkflowStatusDropdown;
