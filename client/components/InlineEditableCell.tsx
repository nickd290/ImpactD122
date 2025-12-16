import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface InlineEditableCellProps {
  value: string | number | null | undefined;
  onSave: (value: string) => Promise<void>;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  className?: string;
  emptyText?: string;
  prefix?: string;
  suffix?: string;
  formatDisplay?: (value: string | number | null | undefined) => string;
}

export function InlineEditableCell({
  value,
  onSave,
  type = 'text',
  placeholder = '',
  className = '',
  emptyText = '-',
  prefix = '',
  suffix = '',
  formatDisplay,
}: InlineEditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    let initialValue = '';
    if (type === 'date' && value) {
      // Format date for input
      const date = new Date(value.toString());
      initialValue = date.toISOString().split('T')[0];
    } else {
      initialValue = value?.toString() ?? '';
    }
    setEditValue(initialValue);
    setIsEditing(true);
  };

  const handleCancel = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsEditing(false);
    setEditValue('');
  };

  const handleSave = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Format display value
  const getDisplayValue = () => {
    if (formatDisplay) {
      return formatDisplay(value);
    }
    if (value === null || value === undefined || value === '') {
      return emptyText;
    }
    if (type === 'date') {
      try {
        const date = new Date(value.toString());
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } catch {
        return value.toString();
      }
    }
    if (type === 'number' && typeof value === 'number') {
      return `${prefix}${value.toLocaleString()}${suffix}`;
    }
    return `${prefix}${value}${suffix}`;
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full min-w-[80px] px-2 py-1 text-sm border border-blue-400 rounded focus:ring-2 focus:ring-blue-500 outline-none"
          disabled={isSaving}
        />
        {isSaving ? (
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        ) : (
          <>
            <button
              onClick={handleSave}
              className="p-1 text-green-600 hover:bg-green-50 rounded"
              title="Save"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1 text-gray-500 hover:bg-gray-100 rounded"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <span
      onClick={handleStartEdit}
      className={cn(
        'cursor-pointer hover:bg-blue-50 hover:text-blue-600 px-1 py-0.5 rounded transition-colors',
        className
      )}
      title="Click to edit"
    >
      {getDisplayValue()}
    </span>
  );
}

export default InlineEditableCell;
