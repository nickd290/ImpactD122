import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Check, X, FileText, Package, Download, Send } from 'lucide-react';
import { pdfApi } from '../lib/api';
import { SendEmailModal } from './SendEmailModal';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  originCompanyId?: string;
  targetCompanyId?: string;
  description?: string;
  buyCost?: number;
  paperCost?: number;
  paperMarkup?: number;
  mfgCost?: number;
  vendorRef?: string;
  status: string;
  targetVendor?: { name: string; email?: string };
  vendor?: { id: string; name: string; email?: string };
  // Email tracking
  emailedAt?: string;
  emailedTo?: string;
}

interface POManagerProps {
  purchaseOrders: PurchaseOrder[];
  jobId: string;
  onAddPO: (po: Partial<PurchaseOrder>) => Promise<void>;
  onUpdatePO: (poId: string, data: Partial<PurchaseOrder>) => Promise<void>;
  onDeletePO: (poId: string) => Promise<void>;
  onRefresh?: () => void;
  vendors?: any[];
}

export function POManager({
  purchaseOrders,
  jobId,
  onAddPO,
  onUpdatePO,
  onDeletePO,
  onRefresh,
  vendors = [],
}: POManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [emailingPO, setEmailingPO] = useState<PurchaseOrder | null>(null);

  const [newPO, setNewPO] = useState({
    poType: 'impact-vendor' as 'impact-vendor' | 'bradford-jd',
    vendorId: '',
    description: '',
    buyCost: '',
    paperCost: '',
    paperMarkup: '',
    mfgCost: '',
    vendorRef: '',
  });

  const [editPO, setEditPO] = useState<any>({});

  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleAdd = async () => {
    if (!newPO.buyCost) {
      alert('Please enter a buy cost');
      return;
    }

    setIsSaving(true);
    try {
      await onAddPO({
        poType: newPO.poType,
        vendorId: newPO.vendorId || undefined,
        description: newPO.description || undefined,
        buyCost: parseFloat(newPO.buyCost) || 0,
        paperCost: newPO.paperCost ? parseFloat(newPO.paperCost) : undefined,
        paperMarkup: newPO.paperMarkup ? parseFloat(newPO.paperMarkup) : undefined,
        mfgCost: newPO.mfgCost ? parseFloat(newPO.mfgCost) : undefined,
        vendorRef: newPO.vendorRef || undefined,
      } as any);
      setNewPO({ poType: 'impact-vendor', vendorId: '', description: '', buyCost: '', paperCost: '', paperMarkup: '', mfgCost: '', vendorRef: '' });
      setIsAdding(false);
    } catch (error) {
      console.error('Failed to add PO:', error);
      alert('Failed to add purchase order');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (po: PurchaseOrder) => {
    setEditingId(po.id);
    setEditPO({
      description: po.description || '',
      buyCost: po.buyCost?.toString() || '',
      paperCost: po.paperCost?.toString() || '',
      paperMarkup: po.paperMarkup?.toString() || '',
      mfgCost: po.mfgCost?.toString() || '',
      vendorRef: po.vendorRef || '',
    });
  };

  const handleSaveEdit = async (poId: string) => {
    setIsSaving(true);
    try {
      await onUpdatePO(poId, {
        description: editPO.description || undefined,
        buyCost: editPO.buyCost ? parseFloat(editPO.buyCost) : undefined,
        paperCost: editPO.paperCost ? parseFloat(editPO.paperCost) : undefined,
        paperMarkup: editPO.paperMarkup ? parseFloat(editPO.paperMarkup) : undefined,
        mfgCost: editPO.mfgCost ? parseFloat(editPO.mfgCost) : undefined,
        vendorRef: editPO.vendorRef || undefined,
      });
      setEditingId(null);
    } catch (error) {
      console.error('Failed to update PO:', error);
      alert('Failed to update purchase order');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (poId: string) => {
    if (!confirm('Are you sure you want to delete this purchase order?')) return;

    try {
      await onDeletePO(poId);
    } catch (error) {
      console.error('Failed to delete PO:', error);
      alert('Failed to delete purchase order');
    }
  };

  // Only sum Impact-origin POs for the total (Bradford internal POs don't count as our cost)
  const impactPOs = purchaseOrders.filter(po => po.originCompanyId === 'impact-direct');
  const totalBuyCost = impactPOs.reduce((sum, po) => sum + (po.buyCost || 0), 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 to-purple-600 px-4 py-3 flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Package className="w-5 h-5" />
          Purchase Orders
        </h3>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add PO
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Add PO Form */}
        {isAdding && (
          <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* PO Type Selector */}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">PO Type *</label>
                <select
                  value={newPO.poType}
                  onChange={(e) => setNewPO({ ...newPO, poType: e.target.value as 'impact-vendor' | 'bradford-jd' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="impact-vendor">Impact → Vendor (counts as our cost)</option>
                  <option value="bradford-jd">Bradford → JD Graphic (Bradford's internal)</option>
                </select>
              </div>

              {/* Vendor Selector - only for Impact → Vendor POs */}
              {newPO.poType === 'impact-vendor' && vendors.length > 0 && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Target Vendor</label>
                  <select
                    value={newPO.vendorId}
                    onChange={(e) => setNewPO({ ...newPO, vendorId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="">Select Vendor (optional)...</option>
                    {vendors.map((v: any) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={newPO.description}
                  onChange={(e) => setNewPO({ ...newPO, description: e.target.value })}
                  placeholder="e.g., Covers, Bodies, Diecutting"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Buy Cost *</label>
                <input
                  type="number"
                  step="0.01"
                  value={newPO.buyCost}
                  onChange={(e) => setNewPO({ ...newPO, buyCost: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Vendor Ref #</label>
                <input
                  type="text"
                  value={newPO.vendorRef}
                  onChange={(e) => setNewPO({ ...newPO, vendorRef: e.target.value })}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>

            {/* Optional breakdown fields */}
            <div className="border-t border-purple-200 pt-3 mt-3">
              <div className="text-xs text-purple-600 font-medium mb-2">Optional: Cost Breakdown (for Bradford jobs)</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Paper Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPO.paperCost}
                    onChange={(e) => setNewPO({ ...newPO, paperCost: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Paper Markup (18%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPO.paperMarkup}
                    onChange={(e) => setNewPO({ ...newPO, paperMarkup: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Mfg Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPO.mfgCost}
                    onChange={(e) => setNewPO({ ...newPO, mfgCost: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewPO({ poType: 'impact-vendor', vendorId: '', description: '', buyCost: '', paperCost: '', paperMarkup: '', mfgCost: '', vendorRef: '' });
                }}
                disabled={isSaving}
                className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={isSaving}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isSaving ? 'Adding...' : 'Add PO'}
              </button>
            </div>
          </div>
        )}

        {/* PO List */}
        {purchaseOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No purchase orders yet</p>
            <p className="text-xs text-gray-400 mt-1">Add a PO to track costs</p>
          </div>
        ) : (
          <div className="space-y-3">
            {purchaseOrders.map((po) => (
              <div
                key={po.id}
                className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors"
              >
                {editingId === po.id ? (
                  // Edit Mode
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                        <input
                          type="text"
                          value={editPO.description}
                          onChange={(e) => setEditPO({ ...editPO, description: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Buy Cost</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editPO.buyCost}
                          onChange={(e) => setEditPO({ ...editPO, buyCost: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Vendor Ref</label>
                        <input
                          type="text"
                          value={editPO.vendorRef}
                          onChange={(e) => setEditPO({ ...editPO, vendorRef: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Paper Cost</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editPO.paperCost}
                          onChange={(e) => setEditPO({ ...editPO, paperCost: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Paper Markup</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editPO.paperMarkup}
                          onChange={(e) => setEditPO({ ...editPO, paperMarkup: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Mfg Cost</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editPO.mfgCost}
                          onChange={(e) => setEditPO({ ...editPO, mfgCost: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(po.id)}
                        disabled={isSaving}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                      >
                        <Check className="w-4 h-4" />
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm font-medium text-purple-700">{po.poNumber}</span>
                        {/* PO Type Badge */}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          po.originCompanyId === 'impact-direct'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {po.originCompanyId === 'impact-direct' ? 'Impact Cost' : 'Bradford Internal'}
                        </span>
                        {po.description && (
                          <span className="text-gray-600 text-sm">• {po.description}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(po.buyCost)}
                        </span>
                        {po.vendor?.name && (
                          <span className="text-gray-500">→ {po.vendor.name}</span>
                        )}
                        {po.vendorRef && (
                          <span className="text-gray-500">Ref: {po.vendorRef}</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          po.status === 'PAID' ? 'bg-green-100 text-green-700' :
                          po.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {po.status}
                        </span>
                      </div>
                      {(po.paperCost || po.mfgCost) && (
                        <div className="mt-2 text-xs text-gray-500 flex gap-3">
                          {po.paperCost && <span>Paper: {formatCurrency(po.paperCost)}</span>}
                          {po.paperMarkup && <span>Markup: {formatCurrency(po.paperMarkup)}</span>}
                          {po.mfgCost && <span>Mfg: {formatCurrency(po.mfgCost)}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => pdfApi.generatePO(po.id)}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEmailingPO(po)}
                        className={`p-1.5 rounded transition-colors ${
                          po.emailedAt
                            ? 'text-green-500 hover:text-green-600 hover:bg-green-50'
                            : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                        title={po.emailedAt ? `Sent ${new Date(po.emailedAt).toLocaleDateString()}` : 'Email PO to vendor'}
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(po)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(po.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Total */}
        {purchaseOrders.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
            <span className="text-sm text-gray-600">Total Impact Cost ({impactPOs.length} PO{impactPOs.length !== 1 ? 's' : ''})</span>
            <span className="text-lg font-bold text-gray-900">{formatCurrency(totalBuyCost)}</span>
          </div>
        )}
      </div>

      {/* Email PO Modal */}
      {emailingPO && (
        <SendEmailModal
          type="po"
          poId={emailingPO.id}
          poNumber={emailingPO.poNumber}
          defaultEmail={emailingPO.vendor?.email || emailingPO.targetVendor?.email || ''}
          recipientName={emailingPO.vendor?.name || emailingPO.targetVendor?.name || ''}
          onClose={() => setEmailingPO(null)}
          onSuccess={() => {
            setEmailingPO(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}
