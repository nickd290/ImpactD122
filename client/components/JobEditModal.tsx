import React, { useState, useEffect } from 'react';
import { FileText, X, Plus, Trash2 } from 'lucide-react';
import { Job, JobStatus, ProductType } from '../types';

interface JobEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (id: string, jobData: UpdateJobData) => void;
  job: Job | null;
  customers: any[];
  vendors: any[];
  isSaving?: boolean;
}

export interface UpdateJobData {
  title: string;
  customerId: string;
  vendorId: string;
  customerPONumber?: string;
  bradfordRefNumber?: string;
  dueDate?: string;
  notes: string;
  status: JobStatus;
  specs: {
    productType: ProductType;
    paperType?: string;
    colors?: string;
    coating?: string;
    finishing?: string;
    flatSize?: string;
    finishedSize?: string;
    pageCount?: number;
    bindingStyle?: string;
    coverType?: 'SELF' | 'PLUS';
    coverPaperType?: string;
  };
  lineItems: Array<{
    description: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    markupPercent: number;
  }>;
}

export default function JobEditModal({
  isOpen,
  onClose,
  onSubmit,
  job,
  customers,
  vendors,
  isSaving = false
}: JobEditModalProps) {
  // Basic Info
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [customerPONumber, setCustomerPONumber] = useState('');
  const [bradfordRefNumber, setBradfordRefNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<JobStatus>(JobStatus.DRAFT);

  // Specifications
  const [productType, setProductType] = useState<ProductType>('FLAT');
  const [paperType, setPaperType] = useState('');
  const [colors, setColors] = useState('');
  const [coating, setCoating] = useState('');
  const [finishing, setFinishing] = useState('');
  const [flatSize, setFlatSize] = useState('');
  const [finishedSize, setFinishedSize] = useState('');

  // Book-Specific
  const [pageCount, setPageCount] = useState<number>(0);
  const [bindingStyle, setBindingStyle] = useState('');
  const [coverType, setCoverType] = useState<'SELF' | 'PLUS' | ''>('');
  const [coverPaperType, setCoverPaperType] = useState('');

  // Line Items
  const [lineItems, setLineItems] = useState<any[]>([]);

  useEffect(() => {
    if (job && isOpen) {
      setTitle(job.title);
      setCustomerId(job.customerId);
      setVendorId(job.vendorId);
      setCustomerPONumber(job.customerPONumber || '');
      setBradfordRefNumber(job.bradfordRefNumber || '');
      setDueDate(job.dueDate ? new Date(job.dueDate).toISOString().split('T')[0] : '');
      setNotes(job.notes);
      setStatus(job.status);

      // Specs
      setProductType(job.specs.productType);
      setPaperType(job.specs.paperType || '');
      setColors(job.specs.colors || '');
      setCoating(job.specs.coating || '');
      setFinishing(job.specs.finishing || '');
      setFlatSize(job.specs.flatSize || '');
      setFinishedSize(job.specs.finishedSize || '');
      setPageCount(job.specs.pageCount || 0);
      setBindingStyle(job.specs.bindingStyle || '');
      setCoverType((job.specs.coverType as 'SELF' | 'PLUS') || '');
      setCoverPaperType(job.specs.coverPaperType || '');

      // Line Items
      setLineItems(job.items || []);
    }
  }, [job, isOpen]);

  if (!isOpen || !job) return null;

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 0, unitCost: 0, unitPrice: 0, markupPercent: 30 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const jobData: UpdateJobData = {
      title,
      customerId,
      vendorId,
      customerPONumber,
      bradfordRefNumber,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      notes,
      status,
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
        coverType: coverType || undefined,
        coverPaperType
      },
      lineItems
    };

    onSubmit(job.id, jobData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-full">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Edit Job</h2>
              <p className="text-sm text-gray-500 mt-0.5">Job #{job.number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isSaving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-8">
            {/* Basic Information */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Job Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    disabled={isSaving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    disabled={isSaving}
                  >
                    <option value="">Select Customer</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    disabled={isSaving}
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer PO Number</label>
                  <input
                    type="text"
                    value={customerPONumber}
                    onChange={(e) => setCustomerPONumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bradford Ref Number</label>
                  <input
                    type="text"
                    value={bradfordRefNumber}
                    onChange={(e) => setBradfordRefNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as JobStatus)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="QUOTED">Quoted</option>
                    <option value="APPROVED">Approved</option>
                    <option value="PO_ISSUED">PO Issued</option>
                    <option value="IN_PRODUCTION">In Production</option>
                    <option value="SHIPPED">Shipped</option>
                    <option value="INVOICED">Invoiced</option>
                    <option value="PAID">Paid</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={2}
                    disabled={isSaving}
                  />
                </div>
              </div>
            </section>

            {/* Specifications */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Specifications</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
                  <select
                    value={productType}
                    onChange={(e) => setProductType(e.target.value as ProductType)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  >
                    <option value="FLAT">Flat</option>
                    <option value="FOLDED">Folded</option>
                    <option value="BOOK">Book</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Colors</label>
                  <input
                    type="text"
                    value={colors}
                    onChange={(e) => setColors(e.target.value)}
                    placeholder="e.g., 4/4, 4/1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paper Type</label>
                  <input
                    type="text"
                    value={paperType}
                    onChange={(e) => setPaperType(e.target.value)}
                    placeholder="e.g., 100# Text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Flat Size</label>
                  <input
                    type="text"
                    value={flatSize}
                    onChange={(e) => setFlatSize(e.target.value)}
                    placeholder="e.g., 8.5 x 11"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Finished Size</label>
                  <input
                    type="text"
                    value={finishedSize}
                    onChange={(e) => setFinishedSize(e.target.value)}
                    placeholder="e.g., 5.5 x 8.5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coating</label>
                  <input
                    type="text"
                    value={coating}
                    onChange={(e) => setCoating(e.target.value)}
                    placeholder="e.g., AQ, UV"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Finishing</label>
                  <input
                    type="text"
                    value={finishing}
                    onChange={(e) => setFinishing(e.target.value)}
                    placeholder="e.g., Die cut, scoring"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isSaving}
                  />
                </div>

                {productType === 'BOOK' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Page Count</label>
                      <input
                        type="number"
                        value={pageCount}
                        onChange={(e) => setPageCount(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isSaving}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Binding Style</label>
                      <input
                        type="text"
                        value={bindingStyle}
                        onChange={(e) => setBindingStyle(e.target.value)}
                        placeholder="e.g., Saddle Stitch"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isSaving}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cover Type</label>
                      <select
                        value={coverType}
                        onChange={(e) => setCoverType(e.target.value as 'SELF' | 'PLUS' | '')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={isSaving}
                      >
                        <option value="">Select</option>
                        <option value="SELF">Self Cover</option>
                        <option value="PLUS">Plus Cover</option>
                      </select>
                    </div>

                    {coverType === 'PLUS' && (
                      <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cover Paper Type</label>
                        <input
                          type="text"
                          value={coverPaperType}
                          onChange={(e) => setCoverPaperType(e.target.value)}
                          placeholder="e.g., 100# Cover"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={isSaving}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* Line Items */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Line Items</h3>
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  disabled={isSaving}
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              <div className="space-y-3">
                {lineItems.map((item, index) => {
                  const isBelowCost = item.unitPrice > 0 && item.unitCost > 0 && item.unitPrice < item.unitCost;
                  return <div key={index} className={`p-4 rounded-lg ${isBelowCost ? 'bg-red-50 border border-red-300' : 'bg-gray-50'}`}>
                    {isBelowCost && (
                      <div className="mb-2 flex items-center gap-2 text-red-700 text-xs font-medium">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-200">
                          ⚠️ Selling below cost!
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={isSaving}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(index, 'quantity', Number(e.target.value))}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={isSaving}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Unit Cost</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitCost}
                          onChange={(e) => handleLineItemChange(index, 'unitCost', Number(e.target.value))}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={isSaving}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Markup %</label>
                        <input
                          type="number"
                          step="1"
                          value={item.markupPercent}
                          onChange={(e) => handleLineItemChange(index, 'markupPercent', Number(e.target.value))}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={isSaving}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Unit Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => handleLineItemChange(index, 'unitPrice', Number(e.target.value))}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          disabled={isSaving}
                        />
                      </div>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(index)}
                          className="w-full px-2 py-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors flex items-center justify-center gap-1 text-sm font-medium"
                          disabled={isSaving}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                })}

                {lineItems.length === 0 && (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <p className="text-gray-500 text-sm">No line items. Click "Add Item" to get started.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
