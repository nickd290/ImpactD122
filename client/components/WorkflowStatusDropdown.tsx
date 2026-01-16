import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface WorkflowStatusOption {
  value: string;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
}

const WORKFLOW_STATUS_OPTIONS: WorkflowStatusOption[] = [
  { value: 'NEW_JOB', label: 'New Job', shortLabel: 'New', color: 'text-slate-700', bgColor: 'bg-slate-100' },
  { value: 'AWAITING_PROOF_FROM_VENDOR', label: 'Awaiting Proof', shortLabel: 'Await Proof', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  { value: 'PROOF_RECEIVED', label: 'Proof Received', shortLabel: 'Proof In', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  { value: 'PROOF_SENT_TO_CUSTOMER', label: 'Sent to Customer', shortLabel: 'Sent', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  { value: 'AWAITING_CUSTOMER_RESPONSE', label: 'Awaiting Response', shortLabel: 'Waiting', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  { value: 'APPROVED_PENDING_VENDOR', label: 'Approved', shortLabel: 'Approved', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  { value: 'IN_PRODUCTION', label: 'In Production', shortLabel: 'Production', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  { value: 'COMPLETED', label: 'Completed', shortLabel: 'Completed', color: 'text-green-700', bgColor: 'bg-green-100' },
  { value: 'INVOICED', label: 'Invoiced', shortLabel: 'Invoiced', color: 'text-green-700', bgColor: 'bg-green-100' },
  { value: 'PAID', label: 'Paid', shortLabel: 'Paid', color: 'text-green-800', bgColor: 'bg-green-200' },
];

interface WorkflowStatusDropdownProps {
  status: string;
  onStatusChange: (newStatus: string) => Promise<void>;
  disabled?: boolean;
  compact?: boolean; // Use short labels
  size?: 'sm' | 'md';
}

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

  const currentStatus = WORKFLOW_STATUS_OPTIONS.find((s) => s.value === status) || WORKFLOW_STATUS_OPTIONS[0];

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
        <div className="absolute z-50 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 max-h-64 overflow-y-auto">
          {WORKFLOW_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2',
                option.value === status && 'bg-gray-50'
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
