import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

interface JobFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (jobData: any) => void;
  customers: any[];
  vendors: any[];
  initialData?: any;
}

export function JobFormModal({
  isOpen,
  onClose,
  onSubmit,
  customers,
  vendors,
  initialData,
}: JobFormModalProps) {
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    customerId: initialData?.customerId || '',
    vendorId: initialData?.vendorId || '',
    status: initialData?.status || 'DRAFT',
    notes: initialData?.notes || '',
    customerPONumber: initialData?.customerPONumber || '',
    bradfordRefNumber: initialData?.bradfordRefNumber || '',
    dueDate: initialData?.dueDate || '',
  });

  const [specs, setSpecs] = useState({
    productType: initialData?.specs?.productType || 'OTHER',
    paperType: initialData?.specs?.paperType || '',
    colors: initialData?.specs?.colors || '',
    coating: initialData?.specs?.coating || '',
    finishing: initialData?.specs?.finishing || '',
    flatSize: initialData?.specs?.flatSize || '',
    finishedSize: initialData?.specs?.finishedSize || '',
    pageCount: initialData?.specs?.pageCount || '',
    bindingStyle: initialData?.specs?.bindingStyle || '',
    coverType: initialData?.specs?.coverType || 'SELF',
    coverPaperType: initialData?.specs?.coverPaperType || '',
  });

  const [lineItems, setLineItems] = useState(initialData?.lineItems || [
    {
      description: '',
      quantity: 1,
      unitCost: 0,
      markupPercent: 20,
      unitPrice: 0,
    }
  ]);

  if (!isOpen) return null;

  const calculateUnitPrice = (unitCost: number, markupPercent: number) => {
    return unitCost * (1 + markupPercent / 100);
  };

  const handleLineItemChange = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-calculate unitPrice when cost or markup changes
    if (field === 'unitCost' || field === 'markupPercent') {
      const cost = field === 'unitCost' ? parseFloat(value) || 0 : updated[index].unitCost;
      const markup = field === 'markupPercent' ? parseFloat(value) || 0 : updated[index].markupPercent;
      updated[index].unitPrice = calculateUnitPrice(cost, markup);
    }

    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, {
      description: '',
      quantity: 1,
      unitCost: 0,
      markupPercent: 20,
      unitPrice: 0,
    }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      alert('Please enter a job title');
      return;
    }

    if (!formData.customerId) {
      alert('Please select a customer');
      return;
    }

    if (!formData.vendorId) {
      alert('Please select a vendor');
      return;
    }

    // Prepare specs object (only include if at least one field is filled)
    const hasSpecs = specs.productType !== 'OTHER' ||
      specs.paperType || specs.colors || specs.coating ||
      specs.finishing || specs.flatSize || specs.finishedSize;

    const specsData = hasSpecs ? {
      ...specs,
      pageCount: specs.pageCount ? parseInt(specs.pageCount as any) : null,
    } : null;

    onSubmit({
      ...formData,
      specs: specsData,
      lineItems: lineItems.filter(item => item.description.trim()),
    });
    onClose();
  };

  const totalRevenue = lineItems.reduce((sum, item) =>
    sum + (item.quantity * item.unitPrice), 0
  );

  const totalCost = lineItems.reduce((sum, item) =>
    sum + (item.quantity * item.unitCost), 0
  );

  const totalProfit = totalRevenue - totalCost;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              {initialData ? 'Edit Job' : 'Create New Job'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter job title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="QUOTED">Quoted</option>
                  <option value="APPROVED">Approved</option>
                  <option value="PO_ISSUED">PO Issued</option>
                  <option value="IN_PRODUCTION">In Production</option>
                  <option value="SHIPPED">Shipped</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="INVOICED">Invoiced</option>
                  <option value="PAID">Paid</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer *
                </label>
                <select
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select customer...</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor *
                </label>
                <select
                  value={formData.vendorId}
                  onChange={(e) => setFormData({ ...formData, vendorId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select vendor...</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer PO Number
                </label>
                <input
                  type="text"
                  value={formData.customerPONumber}
                  onChange={(e) => setFormData({ ...formData, customerPONumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bradford Ref Number (PO to JD)
                </label>
                <input
                  type="text"
                  value={formData.bradfordRefNumber}
                  onChange={(e) => setFormData({ ...formData, bradfordRefNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Bradford PO to JD Graphic"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Specifications Section */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Specifications</h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Product Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Type
                  </label>
                  <select
                    value={specs.productType}
                    onChange={(e) => setSpecs({ ...specs, productType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="OTHER">Other</option>
                    <option value="BOOK">Book</option>
                    <option value="FLAT">Flat</option>
                    <option value="FOLDED">Folded</option>
                  </select>
                </div>

                {/* Paper Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paper Type
                  </label>
                  <input
                    type="text"
                    value={specs.paperType}
                    onChange={(e) => setSpecs({ ...specs, paperType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 100# Gloss Text"
                  />
                </div>

                {/* Colors */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Colors
                  </label>
                  <input
                    type="text"
                    value={specs.colors}
                    onChange={(e) => setSpecs({ ...specs, colors: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 4/4, 4/1, PMS"
                  />
                </div>

                {/* Coating */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Coating
                  </label>
                  <input
                    type="text"
                    value={specs.coating}
                    onChange={(e) => setSpecs({ ...specs, coating: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., AQ, UV, Matte"
                  />
                </div>

                {/* Finishing */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Finishing
                  </label>
                  <input
                    type="text"
                    value={specs.finishing}
                    onChange={(e) => setSpecs({ ...specs, finishing: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Die Cut, Scoring"
                  />
                </div>

                {/* Flat Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Flat Size
                  </label>
                  <input
                    type="text"
                    value={specs.flatSize}
                    onChange={(e) => setSpecs({ ...specs, flatSize: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 11x17"
                  />
                </div>

                {/* Finished Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Finished Size
                  </label>
                  <input
                    type="text"
                    value={specs.finishedSize}
                    onChange={(e) => setSpecs({ ...specs, finishedSize: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 8.5x11"
                  />
                </div>
              </div>

              {/* Book-Specific Fields */}
              {specs.productType === 'BOOK' && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="text-sm font-semibold text-blue-900 mb-3">Book Specifications</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Page Count */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Page Count
                      </label>
                      <input
                        type="number"
                        value={specs.pageCount}
                        onChange={(e) => setSpecs({ ...specs, pageCount: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., 24"
                      />
                    </div>

                    {/* Binding Style */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Binding Style
                      </label>
                      <input
                        type="text"
                        value={specs.bindingStyle}
                        onChange={(e) => setSpecs({ ...specs, bindingStyle: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Saddle Stitch, Perfect Bound"
                      />
                    </div>

                    {/* Cover Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cover Type
                      </label>
                      <select
                        value={specs.coverType}
                        onChange={(e) => setSpecs({ ...specs, coverType: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="SELF">Self Cover</option>
                        <option value="PLUS">Plus Cover</option>
                      </select>
                    </div>

                    {/* Cover Paper Type (only for Plus Cover) */}
                    {specs.coverType === 'PLUS' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cover Paper Type
                        </label>
                        <input
                          type="text"
                          value={specs.coverPaperType}
                          onChange={(e) => setSpecs({ ...specs, coverPaperType: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="e.g., 100# Gloss Cover"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Add any additional notes..."
              />
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">Line Items</h3>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-6 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Item description"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          min="1"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Cost
                        </label>
                        <input
                          type="number"
                          value={item.unitCost}
                          onChange={(e) => handleLineItemChange(index, 'unitCost', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          step="0.01"
                          min="0"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Markup %
                        </label>
                        <input
                          type="number"
                          value={item.markupPercent}
                          onChange={(e) => handleLineItemChange(index, 'markupPercent', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          step="1"
                          min="0"
                        />
                      </div>

                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Price
                          </label>
                          <input
                            type="number"
                            value={item.unitPrice.toFixed(2)}
                            onChange={(e) => handleLineItemChange(index, 'unitPrice', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50"
                            step="0.01"
                            min="0"
                          />
                        </div>
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-4 bg-gray-900 text-white rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Total Cost:</span>
                    <p className="text-lg font-bold">${totalCost.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Total Revenue:</span>
                    <p className="text-lg font-bold">${totalRevenue.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Total Profit:</span>
                    <p className={`text-lg font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${totalProfit.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {initialData ? 'Update Job' : 'Create Job'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
