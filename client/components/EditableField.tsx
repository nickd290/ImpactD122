/**
 * EditableField Component
 *
 * A reusable component for inline editing of form fields.
 * Supports text, number, date, select, and textarea input types.
 */

import React from 'react';
import { toDateInputValue } from '../lib/utils';

interface SelectOption {
  label: string;
  value: string;
}

interface EditableFieldProps {
  value: string | number | null | undefined;
  isEditing: boolean;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea';
  options?: SelectOption[];
  placeholder?: string;
  label?: string;
  className?: string;
  inputClassName?: string;
  displayClassName?: string;
  emptyText?: string;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  disabled?: boolean;
  required?: boolean;
}

export function EditableField({
  value,
  isEditing,
  onChange,
  type = 'text',
  options = [],
  placeholder = '',
  label,
  className = '',
  inputClassName = '',
  displayClassName = '',
  emptyText = '-',
  prefix = '',
  suffix = '',
  min,
  max,
  step,
  rows = 3,
  disabled = false,
  required = false,
}: EditableFieldProps) {
  const displayValue = value ?? '';
  const stringValue = String(displayValue);

  // Format display value
  const formatDisplayValue = () => {
    if (value === null || value === undefined || value === '') {
      return emptyText;
    }

    if (type === 'select' && options.length > 0) {
      const option = options.find(o => o.value === stringValue);
      return option?.label || stringValue;
    }

    if (type === 'number' && typeof value === 'number') {
      return `${prefix}${value.toLocaleString()}${suffix}`;
    }

    if (type === 'date' && stringValue) {
      try {
        const date = new Date(stringValue);
        return date.toLocaleDateString();
      } catch {
        return stringValue;
      }
    }

    return `${prefix}${stringValue}${suffix}`;
  };

  // Base input styles
  const baseInputStyles = 'w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors';
  const disabledStyles = disabled ? 'bg-gray-100 cursor-not-allowed' : '';

  if (!isEditing) {
    return (
      <div className={`${className}`}>
        {label && (
          <span className="text-xs text-gray-500 block mb-0.5">{label}</span>
        )}
        <span className={`text-gray-900 ${displayClassName}`}>
          {formatDisplayValue()}
        </span>
      </div>
    );
  }

  // Render input based on type
  const renderInput = () => {
    switch (type) {
      case 'select':
        return (
          <select
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseInputStyles} ${disabledStyles} ${inputClassName}`}
            disabled={disabled}
            required={required}
          >
            {placeholder && (
              <option value="">{placeholder}</option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'textarea':
        return (
          <textarea
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${baseInputStyles} ${disabledStyles} resize-none ${inputClassName}`}
            rows={rows}
            disabled={disabled}
            required={required}
          />
        );

      case 'number':
        return (
          <div className="relative">
            {prefix && (
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                {prefix}
              </span>
            )}
            <input
              type="number"
              value={stringValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className={`${baseInputStyles} ${disabledStyles} ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-6' : ''} ${inputClassName}`}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              required={required}
            />
            {suffix && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                {suffix}
              </span>
            )}
          </div>
        );

      case 'date':
        return (
          <input
            type="date"
            value={toDateInputValue(stringValue)}
            onChange={(e) => onChange(e.target.value)}
            className={`${baseInputStyles} ${disabledStyles} ${inputClassName}`}
            disabled={disabled}
            required={required}
          />
        );

      default:
        return (
          <input
            type="text"
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${baseInputStyles} ${disabledStyles} ${inputClassName}`}
            disabled={disabled}
            required={required}
          />
        );
    }
  };

  return (
    <div className={`${className}`}>
      {label && (
        <label className="text-xs text-gray-500 block mb-0.5">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {renderInput()}
    </div>
  );
}

export default EditableField;
