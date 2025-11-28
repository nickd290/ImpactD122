import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Minus,
  AlertTriangle,
  Edit2,
  Trash2,
  RefreshCw,
  History,
  X,
  Check,
  Layers,
  Scale,
} from 'lucide-react';

interface PaperInventory {
  id: string;
  rollType: string;
  rollWidth: number;
  paperPoint: number;
  paperType: string;
  quantity: number;
  weightPerRoll: number | null;
  reorderPoint: number | null;
  companyId: string;
  isLowStock?: boolean;
  totalWeight?: number | null;
  PaperTransaction?: PaperTransaction[];
}

interface PaperTransaction {
  id: string;
  type: string;
  quantity: number;
  jobId: string | null;
  notes: string | null;
  createdAt: string;
}

interface InventorySummary {
  totalItems: number;
  totalRolls: number;
  totalWeight: number;
  lowStockCount: number;
  lowStockItems: any[];
}

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('en-US').format(num);
};

const formatWeight = (weight: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(weight);
};

export function PaperInventoryView() {
  const [inventory, setInventory] = useState<PaperInventory[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PaperInventory | null>(null);
  const [transactions, setTransactions] = useState<PaperTransaction[]>([]);

  useEffect(() => {
    loadInventory();
    loadSummary();
  }, []);

  const loadInventory = async () => {
    try {
      const response = await fetch('/api/paper-inventory');
      if (response.ok) {
        const data = await response.json();
        setInventory(data);
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const response = await fetch('/api/paper-inventory/summary');
      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      }
    } catch (error) {
      console.error('Failed to load summary:', error);
    }
  };

  const loadTransactionHistory = async (itemId: string) => {
    try {
      const response = await fetch(`/api/paper-inventory/${itemId}/transactions`);
      if (response.ok) {
        const data = await response.json();
        setTransactions(data);
      }
    } catch (error) {
      console.error('Failed to load transaction history:', error);
    }
  };

  const handleAddInventory = async (data: any) => {
    try {
      const response = await fetch('/api/paper-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setIsAddModalOpen(false);
        loadInventory();
        loadSummary();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to add inventory');
      }
    } catch (error) {
      console.error('Failed to add inventory:', error);
      alert('Failed to add inventory');
    }
  };

  const handleAdjustInventory = async (type: string, quantity: number, notes: string) => {
    if (!selectedItem) return;

    try {
      const response = await fetch(`/api/paper-inventory/${selectedItem.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, quantity, notes }),
      });

      if (response.ok) {
        setIsAdjustModalOpen(false);
        setSelectedItem(null);
        loadInventory();
        loadSummary();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to adjust inventory');
      }
    } catch (error) {
      console.error('Failed to adjust inventory:', error);
      alert('Failed to adjust inventory');
    }
  };

  const handleApplyJobUsage = async (jobId: string, quantity: number, notes: string) => {
    if (!selectedItem) return;

    try {
      const response = await fetch('/api/paper-inventory/apply-job-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          inventoryId: selectedItem.id,
          rollsUsed: quantity,
          notes,
        }),
      });

      if (response.ok) {
        setIsAdjustModalOpen(false);
        setSelectedItem(null);
        loadInventory();
        loadSummary();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to apply job usage');
      }
    } catch (error) {
      console.error('Failed to apply job usage:', error);
      alert('Failed to apply job usage');
    }
  };

  const handleDeleteInventory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this inventory item?')) return;

    try {
      const response = await fetch(`/api/paper-inventory/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadInventory();
        loadSummary();
      } else {
        alert('Failed to delete inventory item');
      }
    } catch (error) {
      console.error('Failed to delete inventory:', error);
      alert('Failed to delete inventory');
    }
  };

  const openHistoryModal = async (item: PaperInventory) => {
    setSelectedItem(item);
    await loadTransactionHistory(item.id);
    setIsHistoryModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Paper Inventory</h2>
          <p className="text-gray-600 mt-1">Track paper stock for Bradford and JD</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              loadInventory();
              loadSummary();
            }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Paper
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-4 h-4 text-blue-600" />
              <p className="text-xs text-gray-500 font-medium">Paper Types</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{summary.totalItems}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-green-600" />
              <p className="text-xs text-gray-500 font-medium">Total Rolls</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatNumber(summary.totalRolls)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="w-4 h-4 text-purple-600" />
              <p className="text-xs text-gray-500 font-medium">Total Weight</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatWeight(summary.totalWeight)} lbs</p>
          </div>
          <div className={`rounded-lg border p-4 ${summary.lowStockCount > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={`w-4 h-4 ${summary.lowStockCount > 0 ? 'text-red-600' : 'text-green-600'}`} />
              <p className={`text-xs font-medium ${summary.lowStockCount > 0 ? 'text-red-600' : 'text-green-600'}`}>Low Stock Alerts</p>
            </div>
            <p className={`text-2xl font-bold ${summary.lowStockCount > 0 ? 'text-red-700' : 'text-green-700'}`}>
              {summary.lowStockCount}
            </p>
          </div>
        </div>
      )}

      {/* Low Stock Alerts */}
      {summary && summary.lowStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="font-semibold text-red-900">Low Stock Items - Reorder Needed</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary.lowStockItems.map((item: any) => (
              <div key={item.id} className="bg-white rounded-lg p-3 border border-red-200">
                <p className="font-medium text-gray-900">{item.paperType}</p>
                <p className="text-sm text-gray-600">{item.rollType} - {item.rollWidth}"</p>
                <div className="mt-2 flex justify-between items-center">
                  <span className="text-red-600 font-bold">{item.quantity} rolls</span>
                  <span className="text-xs text-gray-500">Min: {item.reorderPoint}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Paper Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Roll Info</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Quantity</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Weight/Roll</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Weight</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Reorder Point</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {inventory.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium">No paper inventory</p>
                  <p className="text-sm">Add your first paper type to get started</p>
                </td>
              </tr>
            ) : (
              inventory.map((item) => (
                <tr key={item.id} className={`hover:bg-gray-50 ${item.isLowStock ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{item.paperType}</p>
                    <p className="text-xs text-gray-500">{item.paperPoint}pt</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900">{item.rollType}</p>
                    <p className="text-xs text-gray-500">{item.rollWidth}" wide</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-lg font-bold ${item.isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatNumber(item.quantity)}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">rolls</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">
                    {item.weightPerRoll ? `${formatWeight(Number(item.weightPerRoll))} lbs` : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                    {item.totalWeight ? `${formatWeight(item.totalWeight)} lbs` : '-'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-600">
                    {item.reorderPoint || '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.isLowStock ? (
                      <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                        Low Stock
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        In Stock
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          setIsAdjustModalOpen(true);
                        }}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="Add Stock"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          setIsAdjustModalOpen(true);
                        }}
                        className="p-1.5 text-orange-600 hover:bg-orange-50 rounded transition-colors"
                        title="Use Stock"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openHistoryModal(item)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="View History"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteInventory(item.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Inventory Modal */}
      {isAddModalOpen && (
        <AddInventoryModal
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={handleAddInventory}
        />
      )}

      {/* Adjust Inventory Modal */}
      {isAdjustModalOpen && selectedItem && (
        <AdjustInventoryModal
          item={selectedItem}
          onClose={() => {
            setIsAdjustModalOpen(false);
            setSelectedItem(null);
          }}
          onSubmit={handleAdjustInventory}
          onApplyJobUsage={handleApplyJobUsage}
        />
      )}

      {/* Transaction History Modal */}
      {isHistoryModalOpen && selectedItem && (
        <TransactionHistoryModal
          item={selectedItem}
          transactions={transactions}
          onClose={() => {
            setIsHistoryModalOpen(false);
            setSelectedItem(null);
            setTransactions([]);
          }}
        />
      )}
    </div>
  );
}

// Add Inventory Modal Component
function AddInventoryModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    rollType: 'Bradford',
    rollWidth: '',
    paperPoint: '',
    paperType: '',
    quantity: '',
    weightPerRoll: '',
    reorderPoint: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.paperType || !formData.rollType) {
      alert('Paper type and roll type are required');
      return;
    }
    onSubmit(formData);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Add Paper Inventory</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source *
                </label>
                <select
                  value={formData.rollType}
                  onChange={(e) => setFormData({ ...formData, rollType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="Bradford">Bradford</option>
                  <option value="JD">JD Graphics</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Roll Width (inches)
                </label>
                <input
                  type="number"
                  value={formData.rollWidth}
                  onChange={(e) => setFormData({ ...formData, rollWidth: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., 35"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Paper Type *
                </label>
                <input
                  type="text"
                  value={formData.paperType}
                  onChange={(e) => setFormData({ ...formData, paperType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., 70# Gloss Text"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Paper Point (pt)
                </label>
                <input
                  type="number"
                  value={formData.paperPoint}
                  onChange={(e) => setFormData({ ...formData, paperPoint: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., 70"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Quantity
                </label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Number of rolls"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight per Roll (lbs)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.weightPerRoll}
                  onChange={(e) => setFormData({ ...formData, weightPerRoll: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., 1500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reorder Point (alerts when below)
              </label>
              <input
                type="number"
                value={formData.reorderPoint}
                onChange={(e) => setFormData({ ...formData, reorderPoint: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., 5"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Paper
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

interface Job {
  id: string;
  jobNo: string;
  title: string;
  customer?: { name: string };
}

// Adjust Inventory Modal Component
function AdjustInventoryModal({
  item,
  onClose,
  onSubmit,
  onApplyJobUsage,
}: {
  item: PaperInventory;
  onClose: () => void;
  onSubmit: (type: string, quantity: number, notes: string) => void;
  onApplyJobUsage: (jobId: string, quantity: number, notes: string) => void;
}) {
  const [type, setType] = useState('ADD');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Load jobs when JOB_USAGE is selected
  useEffect(() => {
    if (type === 'JOB_USAGE' && jobs.length === 0) {
      setLoadingJobs(true);
      fetch('/api/jobs')
        .then(res => res.json())
        .then(data => {
          setJobs(data);
          setLoadingJobs(false);
        })
        .catch(err => {
          console.error('Failed to load jobs:', err);
          setLoadingJobs(false);
        });
    }
  }, [type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || parseInt(quantity) <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    if (type === 'JOB_USAGE') {
      if (!selectedJobId) {
        alert('Please select a job');
        return;
      }
      onApplyJobUsage(selectedJobId, parseInt(quantity), notes);
    } else {
      onSubmit(type, parseInt(quantity), notes);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Adjust Inventory</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="font-semibold text-gray-900">{item.paperType}</p>
              <p className="text-sm text-gray-600">{item.rollType} - {item.rollWidth}" wide</p>
              <p className="text-lg font-bold text-blue-600 mt-2">
                Current: {formatNumber(item.quantity)} rolls
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Adjustment Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setType('ADD')}
                  className={`px-3 py-3 rounded-lg border-2 flex flex-col items-center justify-center gap-1 ${
                    type === 'ADD'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-xs">Add Stock</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('USE')}
                  className={`px-3 py-3 rounded-lg border-2 flex flex-col items-center justify-center gap-1 ${
                    type === 'USE'
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  <Minus className="w-4 h-4" />
                  <span className="text-xs">Deduct</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('JOB_USAGE')}
                  className={`px-3 py-3 rounded-lg border-2 flex flex-col items-center justify-center gap-1 ${
                    type === 'JOB_USAGE'
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span className="text-xs">Job Usage</span>
                </button>
              </div>
            </div>

            {type === 'JOB_USAGE' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Job *
                </label>
                {loadingJobs ? (
                  <div className="text-sm text-gray-500">Loading jobs...</div>
                ) : (
                  <select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    <option value="">-- Select a job --</option>
                    {jobs.map(job => (
                      <option key={job.id} value={job.id}>
                        {job.jobNo} - {job.title} {job.customer?.name ? `(${job.customer.name})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity (rolls)
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-bold text-center"
                placeholder="0"
                min="1"
                required
              />
              {(type === 'USE' || type === 'JOB_USAGE') && parseInt(quantity) > item.quantity && (
                <p className="text-red-600 text-sm mt-1">
                  Cannot deduct more than available ({item.quantity} rolls)
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                rows={2}
                placeholder={type === 'JOB_USAGE' ? 'Additional notes about this job usage' : 'e.g., Received shipment, waste adjustment'}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={(type === 'USE' || type === 'JOB_USAGE') && parseInt(quantity) > item.quantity}
                className={`px-4 py-2 text-white rounded-lg ${
                  type === 'ADD'
                    ? 'bg-green-600 hover:bg-green-700'
                    : type === 'JOB_USAGE'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                } disabled:opacity-50`}
              >
                {type === 'ADD' ? 'Add Stock' : type === 'JOB_USAGE' ? 'Apply to Job' : 'Deduct Stock'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// Transaction History Modal Component
function TransactionHistoryModal({
  item,
  transactions,
  onClose,
}: {
  item: PaperInventory;
  transactions: PaperTransaction[];
  onClose: () => void;
}) {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'ADD':
      case 'RECEIVE':
      case 'RETURN':
      case 'INITIAL':
        return 'text-green-600 bg-green-100';
      case 'USE':
      case 'JOB_USAGE':
      case 'WASTE':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'ADD': return 'Added';
      case 'RECEIVE': return 'Received';
      case 'RETURN': return 'Returned';
      case 'USE': return 'Used';
      case 'JOB_USAGE': return 'Job Usage';
      case 'WASTE': return 'Waste';
      case 'INITIAL': return 'Initial';
      case 'ADJUSTMENT': return 'Adjusted';
      default: return type;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Transaction History</h3>
              <p className="text-sm text-gray-600">{item.paperType} - {item.rollType}</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No transaction history</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div key={tx.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
                    <div className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(tx.type)}`}>
                      {getTypeLabel(tx.type)}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {['ADD', 'RECEIVE', 'RETURN', 'INITIAL'].includes(tx.type) ? '+' : '-'}
                        {tx.quantity} rolls
                      </p>
                      {tx.notes && <p className="text-sm text-gray-600">{tx.notes}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
