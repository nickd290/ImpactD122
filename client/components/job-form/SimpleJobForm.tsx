import React, { useState, useRef } from 'react';
import { Upload, FileText, Trash2, Loader2, Plus, Check, Image, FileSpreadsheet, Link2 } from 'lucide-react';

export type RoutingType = 'BRADFORD_JD' | 'THIRD_PARTY_VENDOR';

export interface SimpleJobFormData {
  title: string;
  customerId: string;
  vendorId: string;
  routingType: RoutingType;
  customerPONumber: string;
  description: string;
  sellPrice: string;
  quantity: string;
  dueDate: string;
  artworkUrl: string;
  artworkToFollow: boolean;
}

export interface Customer {
  id: string;
  name: string;
}

export interface Vendor {
  id: string;
  name: string;
}

interface SimpleJobFormProps {
  formData: SimpleJobFormData;
  setFormData: React.Dispatch<React.SetStateAction<SimpleJobFormData>>;
  customers: Customer[];
  vendors: Vendor[];
  pendingPOFile: File | null;
  setPendingPOFile: (file: File | null) => void;
  uploadedPOFile: any | null;
  onDeletePOFile: () => void;
  isUploading: boolean;
  uploadError: string;
  onCustomerCreated?: (newCustomer: Customer) => void;
  // PDF extraction props
  onPDFExtract?: (file: File) => void;
  isExtracting?: boolean;
  extractionError?: string;
  extractedCustomerName?: string;
  // Artwork file props
  pendingArtworkFiles: File[];
  setPendingArtworkFiles: (files: File[]) => void;
  onDeleteArtworkFile: (index: number) => void;
  // Data file props
  pendingDataFiles: File[];
  setPendingDataFiles: (files: File[]) => void;
  onDeleteDataFile: (index: number) => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export function SimpleJobForm({
  formData,
  setFormData,
  customers,
  vendors,
  pendingPOFile,
  setPendingPOFile,
  uploadedPOFile,
  onDeletePOFile,
  isUploading,
  uploadError,
  onCustomerCreated,
  onPDFExtract,
  isExtracting,
  extractionError,
  extractedCustomerName,
  pendingArtworkFiles,
  setPendingArtworkFiles,
  onDeleteArtworkFile,
  pendingDataFiles,
  setPendingDataFiles,
  onDeleteDataFile,
}: SimpleJobFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const artworkInputRef = useRef<HTMLInputElement>(null);
  const dataInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingArtwork, setIsDraggingArtwork] = useState(false);
  const [isDraggingData, setIsDraggingData] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [createSuccess, setCreateSuccess] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        // If extraction handler provided, extract + auto-fill
        if (onPDFExtract) {
          onPDFExtract(file);
        } else {
          setPendingPOFile(file);
        }
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      // If extraction handler provided, extract + auto-fill
      if (onPDFExtract) {
        onPDFExtract(file);
      } else {
        setPendingPOFile(file);
      }
    }
  };

  // Artwork file handlers
  const handleArtworkDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingArtwork(false);
    if (e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter(file =>
        /\.(pdf|png|jpg|jpeg|tif|tiff|ai|eps|psd)$/i.test(file.name)
      );
      if (newFiles.length > 0) {
        setPendingArtworkFiles([...pendingArtworkFiles, ...newFiles]);
      }
    }
  };

  const handleArtworkSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setPendingArtworkFiles([...pendingArtworkFiles, ...Array.from(files)]);
    }
    if (artworkInputRef.current) {
      artworkInputRef.current.value = '';
    }
  };

  // Data file handlers
  const handleDataDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingData(false);
    if (e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter(file =>
        /\.(csv|xlsx|xls|txt)$/i.test(file.name)
      );
      if (newFiles.length > 0) {
        setPendingDataFiles([...pendingDataFiles, ...newFiles]);
      }
    }
  };

  const handleDataSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setPendingDataFiles([...pendingDataFiles, ...Array.from(files)]);
    }
    if (dataInputRef.current) {
      dataInputRef.current.value = '';
    }
  };

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
      setFormData({ ...formData, customerId: newCustomer.id });
      onCustomerCreated?.(newCustomer);

      setCreateSuccess(true);
      setTimeout(() => {
        setShowCreateCustomer(false);
        setCreateSuccess(false);
        setNewCustomerName('');
        setNewCustomerEmail('');
      }, 1500);
    } catch (error) {
      console.error('Failed to create customer:', error);
      alert('Failed to create customer. Please try again.');
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Row 1: Title */}
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

      {/* Row 2: Customer + Vendor */}
      <div className="grid grid-cols-2 gap-4">
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
      </div>

      {/* Row 3: Routing Toggle */}
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

      {/* Row 4: Customer PO# + Quantity + Sell Price */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Customer PO Number
          </label>
          <input
            type="text"
            value={formData.customerPONumber}
            onChange={(e) => setFormData({ ...formData, customerPONumber: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Customer's PO #"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Quantity *
          </label>
          <input
            type="number"
            min="1"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g. 5000"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sell Price *
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.sellPrice}
              onChange={(e) => setFormData({ ...formData, sellPrice: e.target.value })}
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
              required
            />
          </div>
        </div>
      </div>

      {/* Row 5: Due Date */}
      <div className="w-1/2">
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

      {/* Row 6: Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={3}
          placeholder="Job description..."
        />
      </div>

      {/* Row 7: Artwork URL/Link */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700">
            Artwork Link
          </h3>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.artworkToFollow}
              onChange={(e) => setFormData({ ...formData, artworkToFollow: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600"
            />
            Artwork to Follow
          </label>
        </div>
        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="url"
            value={formData.artworkUrl}
            onChange={(e) => setFormData({ ...formData, artworkUrl: e.target.value })}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="https://sharefile.com/... or Dropbox link"
          />
        </div>
        {formData.artworkToFollow && !formData.artworkUrl && (
          <p className="mt-2 text-xs text-amber-600">
            Artwork marked as "to follow" - will be sent separately
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Paste a link to artwork files (Sharefile, Dropbox, Google Drive, etc.)
        </p>
      </div>

      {/* Row 8: Customer PO File Upload */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Customer PO (PDF)
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          {onPDFExtract
            ? 'Drop a PO to auto-fill job details, or upload to attach to this job.'
            : 'Upload the customer\'s PO to attach to this job. This will be sent to the vendor when you email the PO.'}
        </p>

        {/* Show uploaded file or pending file */}
        {uploadedPOFile ? (
          <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">{uploadedPOFile.fileName}</p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(uploadedPOFile.size)} • Uploaded
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onDeletePOFile}
              className="p-1 text-red-500 hover:bg-red-50 rounded"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : pendingPOFile ? (
          <div className="flex items-center justify-between bg-amber-50 p-3 rounded-lg border border-amber-200">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">{pendingPOFile.name}</p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(pendingPOFile.size)} • Ready to upload
                </p>
              </div>
            </div>
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
            ) : (
              <button
                type="button"
                onClick={() => setPendingPOFile(null)}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : isExtracting ? (
          <div className="border-2 border-dashed border-blue-400 bg-blue-50 rounded-lg p-6 text-center">
            <Loader2 className="w-8 h-8 text-blue-500 mx-auto mb-2 animate-spin" />
            <p className="text-sm font-medium text-blue-700">
              Extracting PO data...
            </p>
            <p className="text-xs text-blue-500 mt-1">
              Reading customer info, dates, and pricing
            </p>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">
              Drag & drop PDF here, or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-600 hover:underline"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {onPDFExtract ? 'Drop PO to auto-fill fields' : 'PDF only'}
            </p>
          </div>
        )}

        {uploadError && (
          <p className="mt-2 text-sm text-red-600">{uploadError}</p>
        )}

        {extractionError && (
          <p className="mt-2 text-sm text-red-600">{extractionError}</p>
        )}

        {/* Show extracted customer name hint if no match found */}
        {extractedCustomerName && !formData.customerId && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <span className="font-medium">Customer from PO:</span> "{extractedCustomerName}"
            </p>
            <p className="text-xs text-amber-600 mt-1">
              No exact match found. Select a customer above or{' '}
              <button
                type="button"
                onClick={() => setShowCreateCustomer(true)}
                className="text-amber-700 underline hover:text-amber-900"
              >
                create new customer
              </button>
            </p>
          </div>
        )}
      </div>

      {/* Row 8: Artwork Files Upload */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Artwork Files
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Upload design files (PDF, PNG, JPG, TIFF, AI, EPS, PSD)
        </p>

        {/* Show pending artwork files */}
        {pendingArtworkFiles.length > 0 && (
          <div className="space-y-2 mb-3">
            {pendingArtworkFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between bg-purple-50 p-3 rounded-lg border border-purple-200">
                <div className="flex items-center gap-3">
                  <Image className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)} • Ready to upload
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteArtworkFile(index)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Artwork drag-drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDraggingArtwork
              ? 'border-purple-500 bg-purple-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingArtwork(true); }}
          onDragLeave={() => setIsDraggingArtwork(false)}
          onDrop={handleArtworkDrop}
        >
          <input
            ref={artworkInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.ai,.eps,.psd"
            multiple
            onChange={handleArtworkSelect}
            className="hidden"
          />
          <Image className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            Drag & drop artwork files, or{' '}
            <button
              type="button"
              onClick={() => artworkInputRef.current?.click()}
              className="text-purple-600 hover:underline"
            >
              browse
            </button>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            PDF, PNG, JPG, TIFF, AI, EPS, PSD
          </p>
        </div>
      </div>

      {/* Row 9: Data Files Upload */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Data Files
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Upload mail lists or data files (CSV, Excel, TXT)
        </p>

        {/* Show pending data files */}
        {pendingDataFiles.length > 0 && (
          <div className="space-y-2 mb-3">
            {pendingDataFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.size)} • Ready to upload
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteDataFile(index)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Data file drag-drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDraggingData
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingData(true); }}
          onDragLeave={() => setIsDraggingData(false)}
          onDrop={handleDataDrop}
        >
          <input
            ref={dataInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            multiple
            onChange={handleDataSelect}
            className="hidden"
          />
          <FileSpreadsheet className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            Drag & drop data files, or{' '}
            <button
              type="button"
              onClick={() => dataInputRef.current?.click()}
              className="text-emerald-600 hover:underline"
            >
              browse
            </button>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            CSV, Excel, TXT
          </p>
        </div>
      </div>
    </div>
  );
}

// Default form data for initialization
export const defaultSimpleJobFormData: SimpleJobFormData = {
  title: '',
  customerId: '',
  vendorId: '',
  routingType: 'THIRD_PARTY_VENDOR',
  customerPONumber: '',
  description: '',
  sellPrice: '',
  quantity: '',
  dueDate: '',
  artworkUrl: '',
  artworkToFollow: false,
};
