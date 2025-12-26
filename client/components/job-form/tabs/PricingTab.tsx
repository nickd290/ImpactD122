import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { JobFormData, LineItem } from '../types';

interface PricingTabProps {
  formData: JobFormData;
  setFormData: React.Dispatch<React.SetStateAction<JobFormData>>;
  lineItems: LineItem[];
  setLineItems: React.Dispatch<React.SetStateAction<LineItem[]>>;
  paperInventory: any[];
  isBradfordVendor: boolean;
  bradfordCut: number;
  setBradfordCut: (value: number) => void;
  useBradford35Percent: boolean;
  setUseBradford35Percent: (value: boolean) => void;
}

export function PricingTab({
  formData,
  setFormData,
  lineItems,
  setLineItems,
  paperInventory,
  isBradfordVendor,
  bradfordCut,
  setBradfordCut,
  useBradford35Percent,
  setUseBradford35Percent,
}: PricingTabProps) {

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { description: '', quantity: 1, unitCost: 0, markupPercent: 20, unitPrice: 0 }
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-calculate unit price from cost and markup
    if (field === 'unitCost' || field === 'markupPercent') {
      const cost = field === 'unitCost' ? value : updated[index].unitCost;
      const markup = field === 'markupPercent' ? value : updated[index].markupPercent;
      updated[index].unitPrice = cost * (1 + markup / 100);
    }

    setLineItems(updated);
  };

  const totalRevenue = lineItems.reduce((sum, item) =>
    sum + (item.quantity * item.unitPrice), 0
  );
  const totalCost = lineItems.reduce((sum, item) =>
    sum + (item.quantity * item.unitCost), 0
  );
  const effectiveBradfordCut = isBradfordVendor ? 0 : bradfordCut;
  const totalProfit = totalRevenue - totalCost - effectiveBradfordCut;

  return (
    <div className="space-y-6">
      {/* Paper Source Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Paper Source</h3>
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="space-y-3">
            {/* Bradford Supplies Paper */}
            <label className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border-2 transition-colors ${
              !formData.jdSuppliesPaper ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}>
              <input
                type="radio"
                name="paperSource"
                checked={!formData.jdSuppliesPaper}
                onChange={() => setFormData({ ...formData, jdSuppliesPaper: false, paperInventoryId: '' })}
                className="mt-1 h-4 w-4 text-orange-600 border-gray-300 focus:ring-orange-500"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900">Bradford Supplies Paper</div>
                <p className="text-sm text-gray-500">Bradford will provide paper from inventory</p>
                {!formData.jdSuppliesPaper && paperInventory.length > 0 && (
                  <select
                    value={formData.paperInventoryId}
                    onChange={(e) => setFormData({ ...formData, paperInventoryId: e.target.value })}
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Link to inventory (optional)</option>
                    {paperInventory.map((paper: any) => (
                      <option key={paper.id} value={paper.id}>
                        {paper.rollType} - {paper.paperType} ({paper.quantity} rolls)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>

            {/* Vendor Supplies Paper */}
            <label className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border-2 transition-colors ${
              formData.jdSuppliesPaper ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}>
              <input
                type="radio"
                name="paperSource"
                checked={formData.jdSuppliesPaper}
                onChange={() => setFormData({ ...formData, jdSuppliesPaper: true, paperInventoryId: '' })}
                className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900">Vendor Supplies Paper</div>
                <p className="text-sm text-gray-500">JD/Vendor will source their own paper</p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Line Items</h3>
          <button
            type="button"
            onClick={addLineItem}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>

        <div className="space-y-3">
          {lineItems.map((item, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-start bg-gray-50 p-3 rounded-lg">
              {/* Description */}
              <div className="col-span-3">
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  placeholder="Item description"
                />
              </div>

              {/* Quantity */}
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Qty</label>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => updateLineItem(index, 'quantity', Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                  min="1"
                />
              </div>

              {/* Unit Cost */}
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Cost/ea</label>
                <input
                  type="number"
                  step="0.01"
                  value={item.unitCost}
                  onChange={(e) => updateLineItem(index, 'unitCost', Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
              </div>

              {/* Markup */}
              <div className="col-span-1">
                <label className="block text-xs text-gray-500 mb-1">%</label>
                <input
                  type="number"
                  value={item.markupPercent}
                  onChange={(e) => updateLineItem(index, 'markupPercent', Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
              </div>

              {/* Unit Price */}
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Price/ea</label>
                <input
                  type="number"
                  step="0.01"
                  value={item.unitPrice.toFixed(2)}
                  readOnly
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-gray-100"
                />
              </div>

              {/* Line Total */}
              <div className="col-span-1">
                <label className="block text-xs text-gray-500 mb-1">Total</label>
                <div className="px-2 py-1.5 text-sm font-medium text-gray-900">
                  ${(item.quantity * item.unitPrice).toFixed(2)}
                </div>
              </div>

              {/* Delete */}
              <div className="col-span-1 flex items-end pb-1">
                {lineItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bradford's Cut (for non-Bradford vendors) */}
      {!isBradfordVendor && (
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Bradford's Cut</label>
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={useBradford35Percent}
                onChange={(e) => {
                  setUseBradford35Percent(e.target.checked);
                  if (e.target.checked) {
                    setBradfordCut(totalProfit * 0.35);
                  }
                }}
                className="w-3.5 h-3.5 rounded border-gray-300 text-amber-600"
              />
              Auto 35% of profit
            </label>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
            <input
              type="number"
              step="0.01"
              value={bradfordCut}
              onChange={(e) => setBradfordCut(Number(e.target.value))}
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg"
              placeholder="0.00"
            />
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="border-t pt-4">
        <div className="bg-gray-900 rounded-lg p-4 text-white">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-400 uppercase">Revenue</p>
              <p className="text-xl font-bold">${totalRevenue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Cost</p>
              <p className="text-xl font-bold">${totalCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Profit</p>
              <p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${totalProfit.toFixed(2)}
              </p>
              {!isBradfordVendor && bradfordCut > 0 && (
                <p className="text-xs text-amber-400 mt-1">
                  (after ${bradfordCut.toFixed(2)} Bradford cut)
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
