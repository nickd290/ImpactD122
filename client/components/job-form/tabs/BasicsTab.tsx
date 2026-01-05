import React, { useState, useEffect } from 'react';
import { Plus, Loader2, Check, Mail } from 'lucide-react';
import { JobFormData, Customer, Vendor, JobMetaType, MailFormat, EnvelopeComponentDetail } from '../types';
import { toDateInputValue } from '../../../lib/utils';

interface ParsedCustomer {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface BasicsTabProps {
  formData: JobFormData;
  setFormData: React.Dispatch<React.SetStateAction<JobFormData>>;
  customers: Customer[];
  vendors: Vendor[];
  sellPrice: string;
  setSellPrice: (value: string) => void;
  overrideSellPrice: boolean;
  setOverrideSellPrice: (value: boolean) => void;
  sellPriceError: string;
  parsedCustomer?: ParsedCustomer | null;
  onCustomerCreated?: (newCustomer: Customer) => void;
}

export function BasicsTab({
  formData,
  setFormData,
  customers,
  vendors,
  sellPrice,
  setSellPrice,
  overrideSellPrice,
  setOverrideSellPrice,
  sellPriceError,
  parsedCustomer,
  onCustomerCreated,
}: BasicsTabProps) {
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState(parsedCustomer?.name || '');
  const [newCustomerEmail, setNewCustomerEmail] = useState(parsedCustomer?.email || '');
  const [createSuccess, setCreateSuccess] = useState(false);

  // Auto-show create form if we have a parsed customer that doesn't match
  const shouldShowCreatePrompt = parsedCustomer && !formData.customerId;

  // Sync envelope component list size with count
  useEffect(() => {
    const currentCount = formData.envelopeComponentList?.length || 0;
    if (currentCount !== formData.envelopeComponents) {
      const newList = [...(formData.envelopeComponentList || [])];
      while (newList.length < formData.envelopeComponents) {
        newList.push({ name: '', size: '' });
      }
      setFormData({
        ...formData,
        envelopeComponentList: newList.slice(0, formData.envelopeComponents)
      });
    }
  }, [formData.envelopeComponents]);

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;

    setIsCreatingCustomer(true);
    try {
      const response = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerName.trim(),
          email: newCustomerEmail.trim() || undefined,
          type: 'CUSTOMER',
        }),
      });

      if (!response.ok) throw new Error('Failed to create customer');

      const newCustomer = await response.json();

      // Update form with new customer ID
      setFormData({ ...formData, customerId: newCustomer.id });

      // Notify parent to refresh customers list
      onCustomerCreated?.(newCustomer);

      setCreateSuccess(true);
      setTimeout(() => {
        setShowCreateCustomer(false);
        setCreateSuccess(false);
      }, 1500);
    } catch (error) {
      console.error('Failed to create customer:', error);
      alert('Failed to create customer. Please try again.');
    } finally {
      setIsCreatingCustomer(false);
    }
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Job Title */}
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

      {/* Status */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Status
        </label>
        <select
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="ACTIVE">Active</option>
          <option value="PAID">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Job Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Job Type
        </label>
        <select
          value={formData.jobType || 'single'}
          onChange={(e) => setFormData({ ...formData, jobType: e.target.value as 'single' | 'multipart' })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="single">Single Vendor</option>
          <option value="multipart">Multi-Part Vendors</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">
          {formData.jobType === 'multipart'
            ? 'Blanket PO - vendors assigned per component'
            : 'Standard single-vendor job'}
        </p>
      </div>

      {/* Vendor - only required for single vendor */}
      {formData.jobType !== 'multipart' && (
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
      )}

      {/* Multi-part info */}
      {formData.jobType === 'multipart' && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-sm text-purple-700 font-medium">Multi-Part Job (Blanket PO)</p>
          <p className="text-xs text-purple-600 mt-1">
            Vendors will be assigned to individual components after job creation.
          </p>
        </div>
      )}

      {/* Customer */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">
            Customer *
          </label>
          {!showCreateCustomer && (
            <button
              type="button"
              onClick={() => setShowCreateCustomer(true)}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          )}
        </div>

        {/* Prompt for parsed customer that doesn't exist */}
        {shouldShowCreatePrompt && !showCreateCustomer && (
          <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <p className="text-amber-800">
              <strong>"{parsedCustomer?.name}"</strong> not found in your customers.
            </p>
            <button
              type="button"
              onClick={() => {
                setNewCustomerName(parsedCustomer?.name || '');
                setNewCustomerEmail(parsedCustomer?.email || '');
                setShowCreateCustomer(true);
              }}
              className="mt-1 text-blue-600 hover:text-blue-700 font-medium"
            >
              + Create this customer
            </button>
          </div>
        )}

        {/* Inline Create Customer Form */}
        {showCreateCustomer && (
          <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <p className="text-sm font-medium text-blue-800">Create New Customer</p>
            <input
              type="text"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              placeholder="Customer name *"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <input
              type="email"
              value={newCustomerEmail}
              onChange={(e) => setNewCustomerEmail(e.target.value)}
              placeholder="Email (optional)"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateCustomer}
                disabled={!newCustomerName.trim() || isCreatingCustomer}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {isCreatingCustomer ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : createSuccess ? (
                  <><Check className="w-3 h-3" /> Created!</>
                ) : (
                  'Create & Select'
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateCustomer(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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

      {/* Routing Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Routing
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFormData({ ...formData, routingType: 'BRADFORD_JD' })}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              formData.routingType === 'BRADFORD_JD'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Bradford/JD
          </button>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, routingType: 'THIRD_PARTY_VENDOR' })}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              formData.routingType === 'THIRD_PARTY_VENDOR'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Third-Party
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {formData.routingType === 'BRADFORD_JD'
            ? '50/50 split with Bradford'
            : '35% Bradford / 65% Impact split'}
        </p>
      </div>

      {/* Mailing Type */}
      <div className="col-span-2 border-t border-gray-200 pt-4 mt-2">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-medium text-gray-700">Job Classification</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {/* Is it a mailing job? */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job Category
            </label>
            <select
              value={formData.jobMetaType}
              onChange={(e) => setFormData({ ...formData, jobMetaType: e.target.value as JobMetaType })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="JOB">Standard Print Job</option>
              <option value="MAILING">Mailing Job</option>
            </select>
          </div>

          {/* Mail Format - only show if mailing */}
          {formData.jobMetaType === 'MAILING' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mail Format
              </label>
              <select
                value={formData.mailFormat}
                onChange={(e) => setFormData({ ...formData, mailFormat: e.target.value as MailFormat | '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="">Select format...</option>
                <option value="SELF_MAILER">Self-Mailer</option>
                <option value="POSTCARD">Postcard</option>
                <option value="ENVELOPE">Envelope Package</option>
              </select>
            </div>
          )}
        </div>

        {/* Envelope Components - only show if envelope format */}
        {formData.jobMetaType === 'MAILING' && formData.mailFormat === 'ENVELOPE' && (
          <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-purple-800">
                Envelope Package Components
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-purple-600">Count:</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.envelopeComponents}
                  onChange={(e) => setFormData({ ...formData, envelopeComponents: parseInt(e.target.value) || 2 })}
                  className="w-16 px-2 py-1 text-sm border border-purple-300 rounded focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="space-y-2">
              {(formData.envelopeComponentList || []).map((comp, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded border border-purple-200">
                  <span className="text-xs text-purple-500 w-6 font-medium">{idx + 1}.</span>
                  <input
                    type="text"
                    placeholder={idx === 0 ? '#10 Envelope' : idx === 1 ? 'Letter' : 'Buckslip'}
                    value={comp.name}
                    onChange={(e) => {
                      const updated = [...formData.envelopeComponentList];
                      updated[idx] = { ...updated[idx], name: e.target.value };
                      setFormData({ ...formData, envelopeComponentList: updated });
                    }}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                  />
                  <input
                    type="text"
                    placeholder="Size (e.g., 9.5 x 4.125)"
                    value={comp.size}
                    onChange={(e) => {
                      const updated = [...formData.envelopeComponentList];
                      updated[idx] = { ...updated[idx], size: e.target.value };
                      setFormData({ ...formData, envelopeComponentList: updated });
                    }}
                    className="w-36 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-purple-600">
              Enter each piece in the envelope package with its size
            </p>
          </div>
        )}
      </div>

      {/* Customer PO Number */}
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

      {/* Bradford Ref Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          JD PO / Bradford Payment Ref
        </label>
        <input
          type="text"
          value={formData.bradfordRefNumber}
          onChange={(e) => setFormData({ ...formData, bradfordRefNumber: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="PO number to JD"
        />
      </div>

      {/* Due Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Due Date
        </label>
        <input
          type="date"
          value={toDateInputValue(formData.dueDate)}
          onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Sell Price */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">
            Sell Price *
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={overrideSellPrice}
              onChange={(e) => setOverrideSellPrice(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Override
          </label>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={sellPrice}
            onChange={(e) => {
              setSellPrice(e.target.value);
              if (!overrideSellPrice) setOverrideSellPrice(true);
            }}
            readOnly={!overrideSellPrice}
            className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              sellPriceError ? 'border-red-500 bg-red-50' : 'border-gray-300'
            } ${!overrideSellPrice ? 'bg-gray-50' : ''}`}
            placeholder="0.00"
            required
          />
        </div>
        {sellPriceError && (
          <p className="mt-1 text-sm text-red-600">{sellPriceError}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          {overrideSellPrice ? 'Manually set' : 'Auto-calculated from line items'}
        </p>
      </div>
    </div>
  );
}
