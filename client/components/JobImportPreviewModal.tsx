import React, { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, Plus } from 'lucide-react';

interface JobImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (jobs: any[], entityMappings: any) => void;
  parsedJobs: any[];
  existingCustomers: any[];
  existingVendors: any[];
}

export function JobImportPreviewModal({
  isOpen,
  onClose,
  onImport,
  parsedJobs,
  existingCustomers,
  existingVendors,
}: JobImportPreviewModalProps) {
  const [entityMappings, setEntityMappings] = useState<any>({});
  const [currentStep, setCurrentStep] = useState<'review' | 'mapping'>('review');

  useEffect(() => {
    if (isOpen && parsedJobs.length > 0) {
      // Initialize mappings
      const mappings: any = {
        customers: {},
        vendors: {},
      };

      // Extract unique customer and vendor names
      const uniqueCustomers = new Set<string>();
      const uniqueVendors = new Set<string>();

      parsedJobs.forEach((job) => {
        if (job.customerName) uniqueCustomers.add(job.customerName);
        if (job.vendorName) uniqueVendors.add(job.vendorName);
      });

      // Try to auto-match by name (case-insensitive)
      uniqueCustomers.forEach((name) => {
        const match = existingCustomers.find(
          (c) => c.name?.toLowerCase() === name.toLowerCase()
        );
        mappings.customers[name] = match ? { action: 'match', entityId: match.id } : { action: 'create' };
      });

      uniqueVendors.forEach((name) => {
        const match = existingVendors.find(
          (v) => v.name?.toLowerCase() === name.toLowerCase()
        );
        mappings.vendors[name] = match ? { action: 'match', entityId: match.id } : { action: 'create' };
      });

      setEntityMappings(mappings);
    }
  }, [isOpen, parsedJobs, existingCustomers, existingVendors]);

  if (!isOpen) return null;

  const uniqueCustomerNames = Object.keys(entityMappings.customers || {});
  const uniqueVendorNames = Object.keys(entityMappings.vendors || {});

  const newCustomersCount = uniqueCustomerNames.filter(
    (name) => entityMappings.customers[name]?.action === 'create'
  ).length;

  const newVendorsCount = uniqueVendorNames.filter(
    (name) => entityMappings.vendors[name]?.action === 'create'
  ).length;

  const handleCustomerMappingChange = (name: string, value: string) => {
    const updated = { ...entityMappings };
    if (value === 'create') {
      updated.customers[name] = { action: 'create' };
    } else {
      updated.customers[name] = { action: 'match', entityId: value };
    }
    setEntityMappings(updated);
  };

  const handleVendorMappingChange = (name: string, value: string) => {
    const updated = { ...entityMappings };
    if (value === 'create') {
      updated.vendors[name] = { action: 'create' };
    } else {
      updated.vendors[name] = { action: 'match', entityId: value };
    }
    setEntityMappings(updated);
  };

  const handleImport = () => {
    onImport(parsedJobs, entityMappings);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {currentStep === 'review' ? 'Review Import' : 'Map Entities'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {currentStep === 'review'
                  ? `${parsedJobs.length} jobs ready to import`
                  : 'Match entities to existing records or create new ones'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {currentStep === 'review' ? (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-600 font-medium">Jobs to Import</p>
                    <p className="text-2xl font-bold text-blue-900">{parsedJobs.length}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-600 font-medium">New Customers</p>
                    <p className="text-2xl font-bold text-green-900">{newCustomersCount}</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <p className="text-sm text-orange-600 font-medium">New Vendors</p>
                    <p className="text-2xl font-bold text-orange-900">{newVendorsCount}</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <p className="text-sm text-purple-600 font-medium">Total Line Items</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {parsedJobs.reduce((sum, job) => sum + job.lineItems.length, 0)}
                    </p>
                  </div>
                </div>

                {/* Jobs Table */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Row
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Job Title
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Vendor
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Line Items
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {parsedJobs.map((job, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600">{job.rowNumber}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {job.title}
                            {job.originalData?.jobNo && (
                              <div className="text-xs text-gray-500 mt-0.5">
                                Original: {job.originalData.jobNo}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {job.customerName || <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {job.vendorName || <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{job.status}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{job.lineItems.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                {/* Entity Mappings */}
                <div className="space-y-6">
                  {/* Customer Mappings */}
                  {uniqueCustomerNames.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Customer Mappings</h3>
                      <div className="space-y-3">
                        {uniqueCustomerNames.map((name) => (
                          <div key={name} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{name}</p>
                              <p className="text-xs text-gray-500">From Excel file</p>
                            </div>
                            <div className="flex-1">
                              <select
                                value={
                                  entityMappings.customers[name]?.action === 'create'
                                    ? 'create'
                                    : entityMappings.customers[name]?.entityId || 'create'
                                }
                                onChange={(e) => handleCustomerMappingChange(name, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              >
                                <option value="create">
                                  <Plus className="w-3 h-3 inline mr-1" />
                                  Create New Customer
                                </option>
                                {existingCustomers.map((customer) => (
                                  <option key={customer.id} value={customer.id}>
                                    Match to: {customer.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vendor Mappings */}
                  {uniqueVendorNames.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Vendor Mappings</h3>
                      <div className="space-y-3">
                        {uniqueVendorNames.map((name) => (
                          <div key={name} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{name}</p>
                              <p className="text-xs text-gray-500">From Excel file</p>
                            </div>
                            <div className="flex-1">
                              <select
                                value={
                                  entityMappings.vendors[name]?.action === 'create'
                                    ? 'create'
                                    : entityMappings.vendors[name]?.entityId || 'create'
                                }
                                onChange={(e) => handleVendorMappingChange(name, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              >
                                <option value="create">
                                  <Plus className="w-3 h-3 inline mr-1" />
                                  Create New Vendor
                                </option>
                                {existingVendors.map((vendor) => (
                                  <option key={vendor.id} value={vendor.id}>
                                    Match to: {vendor.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer Actions */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>

            <div className="flex items-center gap-3">
              {currentStep === 'review' ? (
                <button
                  onClick={() => setCurrentStep('mapping')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  Next: Review Mappings
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setCurrentStep('review')}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleImport}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Import {parsedJobs.length} Jobs
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
