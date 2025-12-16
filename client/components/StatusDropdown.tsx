import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface StatusOption {
  value: string;
  label: string;
  color: string;
  bgColor: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'ACTIVE', label: 'Active', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  { value: 'PAID', label: 'Completed', color: 'text-green-700', bgColor: 'bg-green-100' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'text-red-700', bgColor: 'bg-red-100' },
];

interface StatusDropdownProps {
  status: string;
  onStatusChange: (newStatus: string) => Promise<void>;
  disabled?: boolean;
}

export function StatusDropdown({ status, onStatusChange, disabled }: StatusDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

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
      console.error('Failed to update status:', error);
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
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
          currentStatus.bgColor,
          currentStatus.color,
          !disabled && !isLoading && 'hover:opacity-80 cursor-pointer'
        )}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <>
            {currentStatus.label}
            <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2',
                option.value === status && 'bg-gray-50'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', option.bgColor.replace('bg-', 'bg-').replace('100', '500'))} />
              <span className={option.color}>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default StatusDropdown;
