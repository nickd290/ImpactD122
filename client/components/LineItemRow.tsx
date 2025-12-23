import React, { useState, useEffect } from 'react';
import { Check, X, Pencil, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  markupPercent?: number;
}

interface LineItemRowProps {
  item?: LineItem;
  isNew?: boolean;
  isEditing?: boolean;
  isSaving?: boolean;
  onEdit?: () => void;
  onSave: (item: LineItem) => Promise<void>;
  onDelete?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

export function LineItemRow({
  item,
  isNew = false,
  isEditing = false,
  isSaving = false,
  onEdit,
  onSave,
  onDelete,
  onCancel,
  disabled = false,
}: LineItemRowProps) {
  const [editItem, setEditItem] = useState<LineItem>({
    description: '',
    quantity: 0,
    unitCost: 0,
    unitPrice: 0,
    markupPercent: 0,
  });

  useEffect(() => {
    if (item && (isEditing || isNew)) {
      setEditItem({ ...item, markupPercent: item.markupPercent || 0 });
    } else if (isNew && !item) {
      setEditItem({
        description: '',
        quantity: 0,
        unitCost: 0,
        unitPrice: 0,
        markupPercent: 0,
      });
    }
  }, [item, isEditing, isNew]);

  const handleSave = async () => {
    await onSave(editItem);
  };

  const handleCancel = () => {
    if (isNew && onCancel) {
      onCancel();
    } else if (onEdit) {
      // Reset to original values
      setEditItem(item || { description: '', quantity: 0, unitCost: 0, unitPrice: 0, markupPercent: 0 });
      onEdit(); // This will toggle off editing
    }
  };

  const updateField = (field: keyof LineItem, value: string | number) => {
    setEditItem(prev => ({ ...prev, [field]: value }));
  };

  const total = (editItem.unitPrice || 0) * (editItem.quantity || 0);
  const displayTotal = item ? (item.unitPrice || 0) * (item.quantity || 0) : 0;

  // Edit mode row
  if (isNew || isEditing) {
    return (
      <tr className="bg-blue-50">
        <td className="px-4 py-2">
          <input
            type="text"
            value={editItem.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Description"
            className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
            disabled={isSaving}
          />
        </td>
        <td className="px-4 py-2">
          <input
            type="number"
            value={editItem.quantity || ''}
            onChange={(e) => updateField('quantity', parseInt(e.target.value) || 0)}
            placeholder="0"
            className="w-20 px-2 py-1 text-sm text-right border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
            disabled={isSaving}
          />
        </td>
        <td className="px-4 py-2">
          <input
            type="number"
            step="0.01"
            value={editItem.unitCost || ''}
            onChange={(e) => updateField('unitCost', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className="w-24 px-2 py-1 text-sm text-right border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
            disabled={isSaving}
          />
        </td>
        <td className="px-4 py-2">
          <input
            type="number"
            step="0.01"
            value={editItem.unitPrice || ''}
            onChange={(e) => updateField('unitPrice', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className="w-24 px-2 py-1 text-sm text-right border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
            disabled={isSaving}
          />
        </td>
        <td className="px-4 py-2 text-right font-medium text-gray-700">
          {formatCurrency(total)}
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center justify-end gap-1">
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            ) : (
              <>
                <button
                  onClick={handleSave}
                  className="p-1.5 text-green-600 hover:bg-green-100 rounded"
                  title="Save"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancel}
                  className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  // Display mode row
  return (
    <tr className={cn('hover:bg-gray-50', disabled && 'opacity-60')}>
      <td className="px-4 py-3 text-gray-900">{item?.description || '-'}</td>
      <td className="px-4 py-3 text-right text-gray-600">{(item?.quantity ?? 0).toLocaleString()}</td>
      <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item?.unitCost ?? 0)}</td>
      <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item?.unitPrice ?? 0)}</td>
      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(displayTotal)}</td>
      <td className="px-4 py-3">
        {!disabled && (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={onEdit}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default LineItemRow;
