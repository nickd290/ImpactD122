import React, { useState } from 'react';
import { User, Building2, ChevronDown, ChevronRight, Link, Send, Calendar, Package } from 'lucide-react';

interface JobSpecs {
  productType?: string;
  colors?: string;
  flatSize?: string;
  finishedSize?: string;
  paperType?: string;
  paperLbs?: number;
  coating?: string;
  finishing?: string;
  bindingStyle?: string;
  quantity?: number;
  pageCount?: number;
}

interface Entity {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface JobOverviewTabProps {
  job: {
    status: string;
    customerPONumber?: string;
    dueDate?: string;
    sellPrice?: number;
    quantity?: number;
    specs?: JobSpecs;
    customer?: Entity;
    vendor?: Entity;
    paperSource?: string;
    sizeName?: string;
    bradfordPaperLbs?: number | null;
    bradfordRefNumber?: string;
    createdAt?: string;
  };
  isEditMode: boolean;
  editedJob: any;
  onUpdateField: (field: string, value: any) => void;
  onUpdateSpec: (field: string, value: any) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Only show fields that have values (or all when editing)
function SpecField({ label, value, isEditing, onChange, type = 'text' }: {
  label: string;
  value: any;
  isEditing: boolean;
  onChange: (val: string) => void;
  type?: 'text' | 'number';
}) {
  // Hide empty fields when not editing
  if (!isEditing && !value) return null;

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      {isEditing ? (
        <input
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 px-2 py-0.5 text-sm text-right border rounded focus:ring-1 focus:ring-blue-500"
        />
      ) : (
        <span className="text-sm text-gray-900 font-medium">{value}</span>
      )}
    </div>
  );
}

export function JobOverviewTab({
  job,
  isEditMode,
  editedJob,
  onUpdateField,
  onUpdateSpec,
}: JobOverviewTabProps) {
  const [showAllSpecs, setShowAllSpecs] = useState(false);

  const getValue = (field: string) => {
    if (isEditMode && editedJob && field in editedJob) {
      return editedJob[field];
    }
    return (job as any)[field];
  };

  const getSpecValue = (field: string) => {
    if (isEditMode && editedJob?.specs && field in editedJob.specs) {
      return editedJob.specs[field];
    }
    return job.specs?.[field as keyof JobSpecs];
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-amber-100 text-amber-800',
    PAID: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-red-100 text-red-800',
  };

  const paperSourceLabels: Record<string, string> = {
    BRADFORD: 'Bradford Supplies Paper',
    VENDOR: 'Vendor Supplies Paper',
    CUSTOMER: 'Customer Supplies Paper',
  };

  // Count how many specs have values
  const specFields = ['productType', 'flatSize', 'finishedSize', 'colors', 'pageCount', 'paperType', 'coating', 'finishing', 'bindingStyle'];
  const filledSpecCount = specFields.filter(f => getSpecValue(f)).length;

  return (
    <div className="p-4 space-y-4">
      {/* Key Metrics Row */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Status</div>
          {isEditMode ? (
            <select
              value={getValue('status')}
              onChange={(e) => onUpdateField('status', e.target.value)}
              className="w-full text-sm font-medium border rounded px-2 py-1"
            >
              <option value="ACTIVE">Active</option>
              <option value="PAID">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          ) : (
            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[job.status] || 'bg-gray-100'}`}>
              {job.status}
            </span>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Customer PO</div>
          {isEditMode ? (
            <input
              type="text"
              value={getValue('customerPONumber') ?? ''}
              onChange={(e) => onUpdateField('customerPONumber', e.target.value)}
              className="w-full text-sm font-medium border rounded px-2 py-1"
            />
          ) : (
            <div className="text-sm font-medium text-gray-900">{job.customerPONumber || '—'}</div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Due Date</div>
          {isEditMode ? (
            <input
              type="date"
              value={getValue('dueDate') ?? ''}
              onChange={(e) => onUpdateField('dueDate', e.target.value)}
              className="w-full text-sm font-medium border rounded px-2 py-1"
            />
          ) : (
            <div className="text-sm font-medium text-gray-900">
              {job.dueDate ? formatDate(job.dueDate) : '—'}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Sell Price</div>
          {isEditMode ? (
            <input
              type="number"
              value={getValue('sellPrice') ?? ''}
              onChange={(e) => onUpdateField('sellPrice', parseFloat(e.target.value) || 0)}
              className="w-full text-sm font-medium border rounded px-2 py-1"
            />
          ) : (
            <div className="text-sm font-semibold text-gray-900">
              {job.sellPrice ? formatCurrency(job.sellPrice) : '—'}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Quantity</div>
          {isEditMode ? (
            <input
              type="number"
              value={getValue('quantity') ?? ''}
              onChange={(e) => onUpdateField('quantity', parseInt(e.target.value) || 0)}
              className="w-full text-sm font-medium border rounded px-2 py-1"
            />
          ) : (
            <div className="text-sm font-medium text-gray-900">
              {job.quantity?.toLocaleString() || '—'}
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Specs */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <button
            onClick={() => setShowAllSpecs(!showAllSpecs)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-900">Specifications</span>
              {!isEditMode && filledSpecCount > 0 && (
                <span className="text-xs text-gray-400">({filledSpecCount} fields)</span>
              )}
            </div>
            {showAllSpecs || isEditMode ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>

          <div className={`px-4 py-2 ${!showAllSpecs && !isEditMode ? 'max-h-32 overflow-hidden' : ''}`}>
            <SpecField label="Product Type" value={getSpecValue('productType')} isEditing={isEditMode} onChange={(v) => onUpdateSpec('productType', v)} />
            {job.sizeName && <SpecField label="Standard Size" value={job.sizeName} isEditing={false} onChange={() => {}} />}
            <SpecField label="Flat Size" value={getSpecValue('flatSize')} isEditing={isEditMode} onChange={(v) => onUpdateSpec('flatSize', v)} />
            <SpecField label="Finished Size" value={getSpecValue('finishedSize')} isEditing={isEditMode} onChange={(v) => onUpdateSpec('finishedSize', v)} />
            <SpecField label="Colors" value={getSpecValue('colors')} isEditing={isEditMode} onChange={(v) => onUpdateSpec('colors', v)} />
            <SpecField label="Pages" value={getSpecValue('pageCount')} isEditing={isEditMode} onChange={(v) => onUpdateSpec('pageCount', parseInt(v) || 0)} type="number" />
            <SpecField label="Paper Type" value={getSpecValue('paperType')} isEditing={isEditMode} onChange={(v) => onUpdateSpec('paperType', v)} />
            <SpecField label="Bradford Paper (lbs)" value={job.bradfordPaperLbs} isEditing={isEditMode} onChange={(v) => onUpdateField('bradfordPaperLbs', parseFloat(v) || null)} type="number" />
            <SpecField label="Coating" value={getSpecValue('coating')} isEditing={isEditMode} onChange={(v) => onUpdateSpec('coating', v)} />
            <SpecField label="Finishing" value={getSpecValue('finishing')} isEditing={isEditMode} onChange={(v) => onUpdateSpec('finishing', v)} />
            <SpecField label="Binding" value={getSpecValue('bindingStyle')} isEditing={isEditMode} onChange={(v) => onUpdateSpec('bindingStyle', v)} />
          </div>

          {!isEditMode && filledSpecCount > 3 && !showAllSpecs && (
            <button
              onClick={() => setShowAllSpecs(true)}
              className="w-full py-2 text-xs text-blue-600 hover:text-blue-800 border-t border-gray-100"
            >
              Show all specs
            </button>
          )}
        </div>

        {/* Right: Customer & Vendor */}
        <div className="space-y-4">
          {/* Customer */}
          {job.customer && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase">Customer</span>
              </div>
              <div className="text-sm font-medium text-gray-900">{job.customer.name}</div>
              {job.customer.email && (
                <div className="text-xs text-gray-500 mt-1">{job.customer.email}</div>
              )}
              {job.customer.phone && (
                <div className="text-xs text-gray-500">{job.customer.phone}</div>
              )}
            </div>
          )}

          {/* Vendor */}
          {job.vendor && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase">Vendor</span>
              </div>
              <div className="text-sm font-medium text-gray-900">{job.vendor.name}</div>
              {job.vendor.email && (
                <div className="text-xs text-gray-500 mt-1">{job.vendor.email}</div>
              )}
              {job.vendor.phone && (
                <div className="text-xs text-gray-500">{job.vendor.phone}</div>
              )}
            </div>
          )}

          {/* Paper Source */}
          {job.paperSource && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {paperSourceLabels[job.paperSource] || job.paperSource}
                </span>
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500">Created</span>
              </div>
              <span className="text-sm text-gray-700">
                {job.createdAt ? formatDate(job.createdAt) : '—'}
              </span>
            </div>
            {job.bradfordRefNumber && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                <span className="text-xs text-gray-500">Bradford Ref</span>
                <span className="text-sm text-gray-700 font-mono">{job.bradfordRefNumber}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
