import React, { useState, useEffect } from 'react';
import { FileText, X, AlertCircle, Plus, Trash2, UserPlus } from 'lucide-react';
import { entitiesApi } from '../lib/api';

interface ParsedJobReviewModalProps {
  parsedData: any;
  customers: any[];
  vendors: any[];
  onCancel: () => void;
  onCreate: (jobData: any) => void;
  onSaveDraft: (jobData: any) => void;
}

export function ParsedJobReviewModal({
  parsedData,
  customers,
  vendors,
  onCancel,
  onCreate,
  onSaveDraft
}: ParsedJobReviewModalProps) {
  // Basic Info
  const [title, setTitle] = useState(parsedData.title || 'New Print Job');
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [customerPONumber, setCustomerPONumber] = useState(parsedData.customerPONumber || '');
  const [bradfordRefNumber, setBradfordRefNumber] = useState(parsedData.bradfordRefNumber || '');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState(parsedData.notes || '');

  // New Customer Form
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerContact, setNewCustomerContact] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [unmatchedCustomerName, setUnmatchedCustomerName] = useState('');

  // New Vendor Form
  const [showNewVendorForm, setShowNewVendorForm] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorContact, setNewVendorContact] = useState('');
  const [creatingVendor, setCreatingVendor] = useState(false);

  // Specifications
  const [productType, setProductType] = useState(parsedData.specs?.productType || 'FLAT');
  const [paperType, setPaperType] = useState(parsedData.specs?.paperType || '');
  const [colors, setColors] = useState(parsedData.specs?.colors || '');
  const [coating, setCoating] = useState(parsedData.specs?.coating || '');
  const [finishing, setFinishing] = useState(parsedData.specs?.finishing || '');
  const [flatSize, setFlatSize] = useState(parsedData.specs?.flatSize || '');
  const [finishedSize, setFinishedSize] = useState(parsedData.specs?.finishedSize || '');

  // Book-Specific
  const [pageCount, setPageCount] = useState(parsedData.specs?.pageCount || 0);
  const [bindingStyle, setBindingStyle] = useState(parsedData.specs?.bindingStyle || '');
  const [coverType, setCoverType] = useState(parsedData.specs?.coverType || '');
  const [coverPaperType, setCoverPaperType] = useState(parsedData.specs?.coverPaperType || '');

  // Line Items
  const [lineItems, setLineItems] = useState(
    parsedData.lineItems && parsedData.lineItems.length > 0
      ? parsedData.lineItems
      : [{ description: '', quantity: 0, unitCost: 0, unitPrice: 0, markupPercent: 30 }]
  );

  // Check for unmatched customer on mount
  useEffect(() => {
    if (parsedData.customerName) {
      const matchingCustomer = customers.find(c =>
        c.name.toLowerCase().includes(parsedData.customerName.toLowerCase()) ||
        parsedData.customerName.toLowerCase().includes(c.name.toLowerCase())
      );

      if (matchingCustomer) {
        setCustomerId(matchingCustomer.id);
      } else {
        setUnmatchedCustomerName(parsedData.customerName);
        setNewCustomerName(parsedData.customerName);
      }
    }
  }, []);

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 0, unitCost: 0, unitPrice: 0, markupPercent: 30 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_: any, i: number) => i !== index));
  };

  const handleLineItemChange = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const handleCreateNewCustomer = async () => {
    if (!newCustomerName.trim()) {
      alert('Customer name is required');
      return;
    }

    try {
      setCreatingCustomer(true);
      const newCustomer = await entitiesApi.create({
        type: 'CUSTOMER',
        name: newCustomerName,
        email: newCustomerEmail || '',
        phone: newCustomerPhone || '',
        address: '',
        contactPerson: newCustomerContact || '',
      });

      // Add to customers list and select it
      customers.push(newCustomer);
      setCustomerId(newCustomer.id);
      setShowNewCustomerForm(false);
      setUnmatchedCustomerName('');
    } catch (error) {
      console.error('Failed to create customer:', error);
      alert('Failed to create customer. Please try again.');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handleCreateNewVendor = async () => {
    if (!newVendorName.trim()) {
      alert('Vendor name is required');
      return;
    }

    try {
      setCreatingVendor(true);
      const newVendor = await entitiesApi.create({
        type: 'VENDOR',
        name: newVendorName,
        email: newVendorEmail || '',
        phone: newVendorPhone || '',
        address: '',
        contactPerson: newVendorContact || '',
      });

      // Add to vendors list and select it
      vendors.push(newVendor);
      setVendorId(newVendor.id);
      setShowNewVendorForm(false);
      // Clear form
      setNewVendorName('');
      setNewVendorEmail('');
      setNewVendorPhone('');
      setNewVendorContact('');
    } catch (error) {
      console.error('Failed to create vendor:', error);
      alert('Failed to create vendor. Please try again.');
    } finally {
      setCreatingVendor(false);
    }
  };

  const handleCreate = () => {
    const jobData = {
      title,
      customerId,
      vendorId,
      customerPONumber,
      bradfordRefNumber,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      notes,
      specs: {
        productType,
        paperType,
        colors,
        coating,
        finishing,
        flatSize,
        finishedSize,
        pageCount: pageCount || undefined,
        bindingStyle,
        coverType,
        coverPaperType
      },
      lineItems,
      status: 'DRAFT'
    };
    onCreate(jobData);
  };

  const handleSaveDraft = () => {
    const jobData = {
      title,
      customerId,
      vendorId,
      customerPONumber,
      bradfordRefNumber,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      notes,
      specs: {
        productType,
        paperType,
        colors,
        coating,
        finishing,
        flatSize,
        finishedSize,
        pageCount: pageCount || undefined,
        bindingStyle,
        coverType,
        coverPaperType
      },
      lineItems,
      status: 'DRAFT'
    };
    onSaveDraft(jobData);
  };

  const hasWarnings = !customerId || !vendorId || lineItems.some((item: any) => !item.description || item.quantity <= 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-white flex-shrink-0">
          <div className="flex items-center space-x-2">
            <FileText className="w-6 h-6 text-orange-600" />
            <h3 className="text-xl font-bold">Review AI-Parsed Job</h3>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Warnings */}
          {hasWarnings && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">Please review these fields:</p>
                <ul className="list-disc list-inside space-y-1">
                  {!customerId && <li>Customer is required</li>}
                  {!vendorId && <li>Vendor is required</li>}
                  {lineItems.some((item: any) => !item.description) && <li>Line item descriptions are required</li>}
                  {lineItems.some((item: any) => item.quantity <= 0) && <li>Line item quantities must be greater than 0</li>}
                </ul>
              </div>
            </div>
          )}

          {/* Unmatched Customer Warning */}
          {unmatchedCustomerName && !showNewCustomerForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 mb-2">
                    Customer "{unmatchedCustomerName}" not found in database
                  </p>
                  <p className="text-sm text-blue-800 mb-3">
                    Would you like to add this customer or select an existing one?
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowNewCustomerForm(true)}
                      className="flex items-center space-x-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Add New Customer</span>
                    </button>
                    <button
                      onClick={() => setUnmatchedCustomerName('')}
                      className="px-4 py-2 border border-blue-300 rounded-lg hover:bg-blue-100 text-sm text-blue-900"
                    >
                      Select Existing
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* New Customer Form */}
          {showNewCustomerForm && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-green-900">Add New Customer</h4>
                <button
                  onClick={() => setShowNewCustomerForm(false)}
                  className="text-green-600 hover:text-green-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={newCustomerContact}
                    onChange={(e) => setNewCustomerContact(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="email@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <button
                onClick={handleCreateNewCustomer}
                disabled={creatingCustomer || !newCustomerName.trim()}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingCustomer ? 'Creating...' : 'Create Customer'}
              </button>
            </div>
          )}

          {/* New Vendor Form */}
          {showNewVendorForm && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-purple-900">Add New Vendor</h4>
                <button
                  onClick={() => setShowNewVendorForm(false)}
                  className="text-purple-600 hover:text-purple-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={newVendorContact}
                    onChange={(e) => setNewVendorContact(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newVendorEmail}
                    onChange={(e) => setNewVendorEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="email@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newVendorPhone}
                    onChange={(e) => setNewVendorPhone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <button
                onClick={handleCreateNewVendor}
                disabled={creatingVendor || !newVendorName.trim()}
                className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingVendor ? 'Creating...' : 'Create Vendor'}
              </button>
            </div>
          )}

          {/* Basic Info */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-gray-900">Basic Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                      !customerId ? 'border-red-300 bg-red-50' : ''
                    }`}
                  >
                    <option value="">Select Customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowNewCustomerForm(true)}
                    className="flex items-center justify-center w-10 h-10 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200"
                    title="Add new customer"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                      !vendorId ? 'border-red-300 bg-red-50' : ''
                    }`}
                  >
                    <option value="">Select Vendor...</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowNewVendorForm(true)}
                    className="flex items-center justify-center w-10 h-10 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200"
                    title="Add new vendor"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer PO Number</label>
                <input
                  type="text"
                  value={customerPONumber}
                  onChange={(e) => setCustomerPONumber(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bradford Ref Number</label>
                <input
                  type="text"
                  value={bradfordRefNumber}
                  onChange={(e) => setBradfordRefNumber(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Additional notes or instructions..."
              />
            </div>
          </div>

          {/* Specifications */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-gray-900">Specifications</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="FLAT">Flat</option>
                  <option value="FOLDED">Folded</option>
                  <option value="BOOK">Book</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paper Type</label>
                <input
                  type="text"
                  value={paperType}
                  onChange={(e) => setPaperType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., 100# Gloss Text"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colors</label>
                <input
                  type="text"
                  value={colors}
                  onChange={(e) => setColors(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., 4/4, 4/1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Coating</label>
                <input
                  type="text"
                  value={coating}
                  onChange={(e) => setCoating(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., AQ, UV, Matte"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Finishing</label>
                <input
                  type="text"
                  value={finishing}
                  onChange={(e) => setFinishing(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., Die Cut, Scoring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Flat Size</label>
                <input
                  type="text"
                  value={flatSize}
                  onChange={(e) => setFlatSize(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., 11x17"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Finished Size</label>
                <input
                  type="text"
                  value={finishedSize}
                  onChange={(e) => setFinishedSize(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., 8.5x11"
                />
              </div>
            </div>
          </div>

          {/* Book-Specific (only show if productType is BOOK) */}
          {productType === 'BOOK' && (
            <div>
              <h4 className="text-lg font-semibold mb-4 text-gray-900">Book-Specific Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Page Count</label>
                  <input
                    type="number"
                    value={pageCount}
                    onChange={(e) => setPageCount(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Binding Style</label>
                  <input
                    type="text"
                    value={bindingStyle}
                    onChange={(e) => setBindingStyle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g., Saddle Stitch, Perfect Bound"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cover Type</label>
                  <select
                    value={coverType}
                    onChange={(e) => setCoverType(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select...</option>
                    <option value="SELF">Self Cover</option>
                    <option value="PLUS">Plus Cover</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cover Paper Type</label>
                  <input
                    type="text"
                    value={coverPaperType}
                    onChange={(e) => setCoverPaperType(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g., 100# Gloss Cover"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-900">Line Items</h4>
              <button
                onClick={handleAddLineItem}
                className="flex items-center space-x-1 text-sm text-orange-600 hover:text-orange-700"
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">Item #{index + 1}</span>
                    {lineItems.length > 1 && (
                      <button
                        onClick={() => handleRemoveLineItem(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                          !item.description ? 'border-red-300 bg-red-50' : ''
                        }`}
                        placeholder="Item description"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleLineItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                          item.quantity <= 0 ? 'border-red-300 bg-red-50' : ''
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => handleLineItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitCost}
                        onChange={(e) => handleLineItemChange(index, 'unitCost', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Markup %</label>
                      <input
                        type="number"
                        step="0.1"
                        value={item.markupPercent}
                        onChange={(e) => handleLineItemChange(index, 'markupPercent', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-6 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-white"
          >
            Cancel
          </button>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSaveDraft}
              className="px-6 py-2 border border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50"
            >
              Save as Draft
            </button>
            <button
              onClick={handleCreate}
              disabled={hasWarnings}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Job
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
