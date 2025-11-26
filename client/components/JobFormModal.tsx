import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { getBradfordSizes, getBradfordPricing, isBradfordSize, BRADFORD_SIZE_PRICING } from '../utils/bradfordPricing';

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
    paperLbs: initialData?.specs?.paperLbs || '',
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

  const [bradfordFinancials, setBradfordFinancials] = useState({
    impactCustomerTotal: initialData?.financials?.impactCustomerTotal || 0,
    jdServicesTotal: initialData?.financials?.jdServicesTotal || 0,
    bradfordPaperCost: initialData?.financials?.bradfordPaperCost || 0,
    paperMarkupAmount: initialData?.financials?.paperMarkupAmount || 0,
  });

  // CPM (Cost Per Thousand) values for Bradford pricing
  const [bradfordCPM, setBradfordCPM] = useState({
    customerCPM: 0,
    jdServicesCPM: 0,
    bradfordPaperCostCPM: 0,
    paperMarkupCPM: 0,
    printCPM: 0, // Added Print CPM
  });

  // Track if using custom size (not Bradford size)
  const [useCustomSize, setUseCustomSize] = useState(false);
  const [customSizeValue, setCustomSizeValue] = useState('');

  // Calculate total quantity from all line items
  const totalQuantity = lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  // Auto-calculate Bradford financials from CPM values
  const calculateFromCPM = (cpm: number) => {
    return (cpm * totalQuantity) / 1000;
  };

  // Get selected Bradford vendor
  const selectedVendor = vendors.find(v => v.id === formData.vendorId);
  const isBradfordVendor = selectedVendor?.isPartner === true;

  // Auto-calculate Print CPM and Paper Lbs when Bradford vendor + Bradford size is selected
  useEffect(() => {
    if (isBradfordVendor && specs.finishedSize && !useCustomSize) {
      const pricing = getBradfordPricing(specs.finishedSize);
      if (pricing) {
        // Use current quantity or default to 1000 for CPM calculations
        const qty = totalQuantity > 0 ? totalQuantity : 1000;
        const calcFromCPM = (cpm: number) => (cpm * qty) / 1000;

        setBradfordCPM(prev => ({
          ...prev,
          printCPM: pricing.printCPM,
          jdServicesCPM: pricing.printCPM, // JD Services CPM = Print CPM
          bradfordPaperCostCPM: pricing.costCPMPaper,
          paperMarkupCPM: pricing.sellCPMPaper - pricing.costCPMPaper,
        }));
        // Update ALL financial totals when size is selected
        setBradfordFinancials(prev => ({
          ...prev,
          jdServicesTotal: calcFromCPM(pricing.printCPM),
          bradfordPaperCost: calcFromCPM(pricing.costCPMPaper),
          paperMarkupAmount: calcFromCPM(pricing.sellCPMPaper - pricing.costCPMPaper),
        }));

        // Auto-calculate paper lbs based on paperLbsPerM and quantity
        const calculatedPaperLbs = (pricing.paperLbsPerM * qty) / 1000;
        setSpecs(prev => ({
          ...prev,
          paperLbs: calculatedPaperLbs.toFixed(2),
        }));
      }
    }
  }, [formData.vendorId, specs.finishedSize, useCustomSize, isBradfordVendor, totalQuantity]);

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

    // Validate line items
    const validLineItems = lineItems.filter(item => item.description.trim());
    if (validLineItems.length === 0) {
      alert('Please add at least one line item with a description');
      return;
    }

    // Check if any line item has negative pricing
    const hasInvalidPricing = validLineItems.some(item => item.unitPrice < 0 || item.unitCost < 0);
    if (hasInvalidPricing) {
      alert('Pricing cannot be negative (Price >= $0, Cost >= $0)');
      return;
    }

    // Prepare specs object (only include if at least one field is filled)
    const hasSpecs = specs.productType !== 'OTHER' ||
      specs.paperType || specs.colors || specs.coating ||
      specs.finishing || specs.flatSize || specs.finishedSize || specs.paperLbs;

    const specsData = hasSpecs ? {
      ...specs,
      pageCount: specs.pageCount ? parseInt(specs.pageCount as any) : null,
      paperLbs: specs.paperLbs ? parseFloat(specs.paperLbs as any) : null,
    } : null;

    // Prepare Bradford financials (optional - only include if at least one field has value)
    const hasFinancials = bradfordFinancials.impactCustomerTotal > 0 ||
      bradfordFinancials.jdServicesTotal > 0 ||
      bradfordFinancials.bradfordPaperCost > 0 ||
      bradfordFinancials.paperMarkupAmount > 0;

    const financialsData = hasFinancials ? bradfordFinancials : null;

    onSubmit({
      ...formData,
      specs: specsData,
      lineItems: validLineItems,
      financials: financialsData,
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

                {/* Finished Size - Dropdown with Bradford sizes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Finished Size
                  </label>
                  {useCustomSize ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customSizeValue}
                        onChange={(e) => {
                          setCustomSizeValue(e.target.value);
                          setSpecs({ ...specs, finishedSize: e.target.value });
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., 8.5 x 11"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUseCustomSize(false);
                          setCustomSizeValue('');
                          setSpecs({ ...specs, finishedSize: '' });
                        }}
                        className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg"
                      >
                        Use Dropdown
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={specs.finishedSize}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === 'CUSTOM') {
                            setUseCustomSize(true);
                            setSpecs({ ...specs, finishedSize: '' });
                          } else {
                            setSpecs({ ...specs, finishedSize: value });
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select Size</option>
                        {getBradfordSizes().map(size => (
                          <option key={size} value={size}>
                            {size} {isBradfordVendor ? '(Bradford)' : ''}
                          </option>
                        ))}
                        <option value="CUSTOM">Custom Size...</option>
                      </select>
                    </div>
                  )}
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
                {lineItems.map((item, index) => {
                  const isBelowCost = item.unitPrice > 0 && item.unitCost > 0 && item.unitPrice < item.unitCost;
                  return <div key={index} className={`border rounded-lg p-4 ${isBelowCost ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
                    {isBelowCost && (
                      <div className="mb-2 flex items-center gap-2 text-red-700 text-xs font-medium">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-200">
                          ⚠️ Selling below cost!
                        </span>
                      </div>
                    )}
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
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
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
                })}
              </div>

              {/* Bradford Partner Financials (Optional) - CPM Based */}
              <div className="mt-6 border border-gray-300 rounded-lg p-4 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Bradford Partner Financials (Optional)
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  Only fill out these fields if this is a Bradford partner job. Leave blank for standard jobs.
                </p>
                <p className="text-xs text-blue-600 mb-4">
                  Enter CPM (Cost Per Thousand) values. Totals will auto-calculate based on quantity: <strong>{totalQuantity.toLocaleString()}</strong>
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer CPM
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={bradfordCPM.customerCPM}
                      onChange={(e) => {
                        const cpm = parseFloat(e.target.value) || 0;
                        setBradfordCPM({ ...bradfordCPM, customerCPM: cpm });
                        setBradfordFinancials({
                          ...bradfordFinancials,
                          impactCustomerTotal: calculateFromCPM(cpm)
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Total: <strong>${calculateFromCPM(bradfordCPM.customerCPM).toFixed(2)}</strong>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      JD Services CPM
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={bradfordCPM.jdServicesCPM}
                      onChange={(e) => {
                        const cpm = parseFloat(e.target.value) || 0;
                        setBradfordCPM({ ...bradfordCPM, jdServicesCPM: cpm });
                        setBradfordFinancials({
                          ...bradfordFinancials,
                          jdServicesTotal: calculateFromCPM(cpm)
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Total: <strong>${calculateFromCPM(bradfordCPM.jdServicesCPM).toFixed(2)}</strong>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bradford Paper Cost CPM
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={bradfordCPM.bradfordPaperCostCPM}
                      onChange={(e) => {
                        const cpm = parseFloat(e.target.value) || 0;
                        setBradfordCPM({ ...bradfordCPM, bradfordPaperCostCPM: cpm });
                        setBradfordFinancials({
                          ...bradfordFinancials,
                          bradfordPaperCost: calculateFromCPM(cpm)
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Total: <strong>${calculateFromCPM(bradfordCPM.bradfordPaperCostCPM).toFixed(2)}</strong>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paper Markup CPM
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={bradfordCPM.paperMarkupCPM}
                      onChange={(e) => {
                        const cpm = parseFloat(e.target.value) || 0;
                        setBradfordCPM({ ...bradfordCPM, paperMarkupCPM: cpm });
                        setBradfordFinancials({
                          ...bradfordFinancials,
                          paperMarkupAmount: calculateFromCPM(cpm)
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Total: <strong>${calculateFromCPM(bradfordCPM.paperMarkupCPM).toFixed(2)}</strong>
                    </p>
                  </div>
                </div>

                {/* Print CPM - Auto-calculated for Bradford sizes */}
                {isBradfordVendor && bradfordCPM.printCPM > 0 && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-semibold text-blue-900 mb-1">
                          Print CPM (Auto-calculated)
                        </label>
                        <p className="text-xs text-blue-700">
                          Based on selected size: <strong>{specs.finishedSize}</strong>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-blue-900">
                          ${bradfordCPM.printCPM.toFixed(2)}
                        </p>
                        <p className="text-xs text-blue-700">
                          Total: <strong>${calculateFromCPM(bradfordCPM.printCPM).toFixed(2)}</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Paper Usage (lbs) - For Bradford jobs */}
                {isBradfordVendor && (
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <label className="block text-sm font-semibold text-orange-900 mb-1">
                          Paper Usage (lbs)
                        </label>
                        <p className="text-xs text-orange-700 mb-2">
                          {specs.finishedSize && !useCustomSize ? (
                            <>Auto-calculated from size. Override if needed.</>
                          ) : (
                            <>Enter paper weight in pounds</>
                          )}
                        </p>
                        <input
                          type="number"
                          step="0.01"
                          value={specs.paperLbs}
                          onChange={(e) => setSpecs({ ...specs, paperLbs: e.target.value })}
                          className="w-32 px-3 py-2 border border-orange-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="0.00"
                        />
                      </div>
                      {specs.paperLbs && (
                        <div className="text-right ml-4">
                          <p className="text-2xl font-bold text-orange-900">
                            {parseFloat(specs.paperLbs as any).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lbs
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
