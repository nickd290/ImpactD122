import React from 'react';
import { JobFormData, Customer, Vendor } from '../types';

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
}: BasicsTabProps) {
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

      {/* Customer */}
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

      {/* Vendor */}
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
          value={formData.dueDate}
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
