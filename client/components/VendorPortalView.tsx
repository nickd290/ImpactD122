import React, { useState, useEffect, useCallback } from 'react';
import { toast, Toaster } from 'sonner';
import {
  Download,
  FileText,
  Image,
  Database,
  CheckCircle,
  Clock,
  Truck,
  Package,
  Upload,
  AlertTriangle,
  Loader2,
  X,
  ChevronDown,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001');

interface PortalData {
  jobNumber: string;
  jobTitle: string;
  customer: string;
  vendor: string;
  poNumber: string;
  quantity: number;
  sizeName: string;
  dueDate: string;
  mailDate: string;
  specialInstructions: string;
  specs: {
    paperType?: string;
    colors?: string;
    coating?: string;
    finishing?: string;
    folds?: string;
    perforations?: string;
  };
  files: {
    artwork: Array<{ id: string; name: string; size: number; uploadedAt: string }>;
    dataFiles: Array<{ id: string; name: string; size: number; uploadedAt: string }>;
    proofs: Array<{ id: string; name: string; size: number; uploadedAt: string; isVendorProof?: boolean }>;
    other: Array<{ id: string; name: string; size: number; uploadedAt: string }>;
  };
  hasVendorPO: boolean;
  portal: {
    confirmedAt: string | null;
    confirmedByName: string | null;
    confirmedByEmail: string | null;
    vendorStatus: string;
    statusUpdatedAt: string | null;
    trackingNumber: string | null;
    trackingCarrier: string | null;
  };
  expiresAt: string;
}

const STATUS_OPTIONS = [
  { value: 'PO_RECEIVED', label: 'PO Received', icon: CheckCircle, color: 'text-blue-600' },
  { value: 'IN_PRODUCTION', label: 'In Production', icon: Package, color: 'text-yellow-600' },
  { value: 'PRINTING_COMPLETE', label: 'Printing Complete', icon: CheckCircle, color: 'text-purple-600' },
  { value: 'SHIPPED', label: 'Shipped', icon: Truck, color: 'text-green-600' },
];

export function VendorPortalView({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  // Confirm form state
  const [confirmName, setConfirmName] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // Status update state
  const [selectedStatus, setSelectedStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingCarrier, setTrackingCarrier] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Load portal data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/portal/${token}`);

      if (response.status === 410) {
        setExpired(true);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to load portal data');
      }

      const portalData = await response.json();
      setData(portalData);
      setSelectedStatus(portalData.portal.vendorStatus);
      setTrackingNumber(portalData.portal.trackingNumber || '');
      setTrackingCarrier(portalData.portal.trackingCarrier || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Confirm PO
  const handleConfirmPO = async () => {
    if (!confirmName || !confirmEmail) {
      toast.error('Please enter your name and email');
      return;
    }

    try {
      setIsConfirming(true);
      const response = await fetch(`${API_URL}/api/portal/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: confirmName, email: confirmEmail }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to confirm');
      }

      toast.success('PO confirmed successfully!');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsConfirming(false);
    }
  };

  // Update status
  const handleUpdateStatus = async () => {
    if (selectedStatus === 'SHIPPED' && !trackingNumber) {
      toast.error('Please enter a tracking number');
      return;
    }

    try {
      setIsUpdatingStatus(true);
      const response = await fetch(`${API_URL}/api/portal/${token}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: selectedStatus,
          trackingNumber: selectedStatus === 'SHIPPED' ? trackingNumber : undefined,
          trackingCarrier: selectedStatus === 'SHIPPED' ? trackingCarrier : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update status');
      }

      toast.success('Status updated!');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // File upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      setUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) {
      toast.error('Please select files to upload');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      uploadFiles.forEach((file) => formData.append('files', file));

      const response = await fetch(`${API_URL}/api/portal/${token}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to upload');
      }

      toast.success('Files uploaded successfully!');
      setUploadFiles([]);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Download handlers
  const downloadFile = (fileId: string) => {
    window.open(`${API_URL}/api/portal/${token}/files/${fileId}`, '_blank');
  };

  const downloadAll = () => {
    window.open(`${API_URL}/api/portal/${token}/download-all`, '_blank');
  };

  const downloadPO = () => {
    window.open(`${API_URL}/api/portal/${token}/po`, '_blank');
  };

  // Format helpers
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'TBD';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (kind: string) => {
    switch (kind) {
      case 'artwork':
        return <Image className="h-5 w-5 text-purple-500" />;
      case 'dataFiles':
        return <Database className="h-5 w-5 text-green-500" />;
      case 'proofs':
        return <FileText className="h-5 w-5 text-blue-500" />;
      default:
        return <FileText className="h-5 w-5 text-gray-500" />;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-green-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading portal...</p>
        </div>
      </div>
    );
  }

  // Expired state
  if (expired) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Portal Link Expired</h1>
          <p className="text-gray-600 mb-4">
            This portal link has expired. Please contact Impact Direct Printing for a new link.
          </p>
          <a
            href="mailto:brandon@impactdirectprinting.com"
            className="text-green-600 hover:text-green-700 font-medium"
          >
            brandon@impactdirectprinting.com
          </a>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Portal</h1>
          <p className="text-gray-600 mb-4">{error || 'Unable to load portal data'}</p>
          <button
            onClick={loadData}
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const isConfirmed = !!data.portal.confirmedAt;
  const totalFiles =
    data.files.artwork.length +
    data.files.dataFiles.length +
    data.files.proofs.length +
    data.files.other.length;

  return (
    <div className="min-h-screen bg-gray-100">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <header className="bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold">IMPACT DIRECT PRINTING</h1>
          <p className="text-gray-400 mt-1">Job Portal</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Job Info Card */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">Job Number</p>
              <p className="text-2xl font-bold text-gray-900">#{data.jobNumber}</p>
              {data.jobTitle && (
                <p className="text-gray-600 mt-1">{data.jobTitle}</p>
              )}
            </div>
            {data.poNumber && (
              <div className="text-right">
                <p className="text-sm text-gray-500">PO #{data.poNumber}</p>
              </div>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* Customer & Vendor */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Customer</p>
                <p className="font-medium">{data.customer}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Vendor</p>
                <p className="font-medium">{data.vendor}</p>
              </div>
            </div>

            {/* Job Specs */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 pb-2 border-b border-green-500">
                Job Specifications
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {data.quantity && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Quantity</span>
                    <span className="font-medium">{data.quantity.toLocaleString()}</span>
                  </div>
                )}
                {data.sizeName && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Size</span>
                    <span className="font-medium">{data.sizeName}</span>
                  </div>
                )}
                {data.specs.paperType && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Paper</span>
                    <span className="font-medium">{data.specs.paperType}</span>
                  </div>
                )}
                {data.specs.colors && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Colors</span>
                    <span className="font-medium">{data.specs.colors}</span>
                  </div>
                )}
                {data.specs.coating && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Coating</span>
                    <span className="font-medium">{data.specs.coating}</span>
                  </div>
                )}
                {data.specs.finishing && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Finishing</span>
                    <span className="font-medium">{data.specs.finishing}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Due Date</span>
                  <span className="font-medium">{formatDate(data.dueDate)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Mail Date</span>
                  <span className="font-medium">{formatDate(data.mailDate)}</span>
                </div>
              </div>
            </div>

            {/* Special Instructions */}
            {data.specialInstructions && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800">Special Instructions</p>
                    <p className="text-amber-700 mt-1">{data.specialInstructions}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Files Section */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Files ({totalFiles})</h2>
            {totalFiles > 0 && (
              <button
                onClick={downloadAll}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                Download All (ZIP)
              </button>
            )}
          </div>

          <div className="p-6 space-y-4">
            {/* PO PDF Download */}
            {data.hasVendorPO && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-red-500" />
                  <span className="font-medium">Purchase Order PDF</span>
                </div>
                <button
                  onClick={downloadPO}
                  className="text-green-600 hover:text-green-700 font-medium text-sm"
                >
                  Download
                </button>
              </div>
            )}

            {/* File Categories */}
            {['artwork', 'dataFiles', 'proofs', 'other'].map((category) => {
              const files = data.files[category as keyof typeof data.files];
              if (files.length === 0) return null;

              const labels: Record<string, string> = {
                artwork: 'Artwork',
                dataFiles: 'Data Files',
                proofs: 'Proofs',
                other: 'Other Files',
              };

              return (
                <div key={category}>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">{labels[category]}</h3>
                  <div className="space-y-2">
                    {files.map((file: any) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {getFileIcon(category)}
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{file.name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                          </div>
                          {file.isVendorProof && (
                            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded">
                              Vendor Proof
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => downloadFile(file.id)}
                          className="text-green-600 hover:text-green-700 font-medium text-sm flex-shrink-0"
                        >
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {totalFiles === 0 && (
              <p className="text-center text-gray-500 py-4">No files available yet</p>
            )}
          </div>
        </div>

        {/* Confirm PO Section */}
        {!isConfirmed && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-green-50 px-6 py-4 border-b border-green-100">
              <h2 className="text-lg font-semibold text-green-900">Confirm PO Received</h2>
              <p className="text-sm text-green-700 mt-1">
                Please confirm that you have received this purchase order
              </p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Email</label>
                  <input
                    type="email"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="john@vendor.com"
                  />
                </div>
              </div>
              <button
                onClick={handleConfirmPO}
                disabled={isConfirming}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isConfirming ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle className="h-5 w-5" />
                )}
                Confirm PO Received
              </button>
            </div>
          </div>
        )}

        {/* Status Update Section - Only show if confirmed */}
        {isConfirmed && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-blue-900">Update Job Status</h2>
                <p className="text-sm text-blue-700 mt-1">
                  Confirmed by {data.portal.confirmedByName} on {formatDate(data.portal.confirmedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {STATUS_OPTIONS.find((s) => s.value === data.portal.vendorStatus)?.icon && (
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      data.portal.vendorStatus === 'SHIPPED'
                        ? 'bg-green-100 text-green-800'
                        : data.portal.vendorStatus === 'PRINTING_COMPLETE'
                        ? 'bg-purple-100 text-purple-800'
                        : data.portal.vendorStatus === 'IN_PRODUCTION'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {STATUS_OPTIONS.find((s) => s.value === data.portal.vendorStatus)?.label}
                  </span>
                )}
              </div>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Current Status</label>
                <div className="relative">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {selectedStatus === 'SHIPPED' && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tracking Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="1Z999AA10123456784"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Carrier</label>
                    <input
                      type="text"
                      value={trackingCarrier}
                      onChange={(e) => setTrackingCarrier(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="UPS, FedEx, USPS..."
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleUpdateStatus}
                disabled={isUpdatingStatus || selectedStatus === data.portal.vendorStatus}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isUpdatingStatus ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Clock className="h-5 w-5" />
                )}
                Update Status
              </button>
            </div>
          </div>
        )}

        {/* Proof Upload Section - Only show if confirmed */}
        {isConfirmed && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-purple-50 px-6 py-4 border-b border-purple-100">
              <h2 className="text-lg font-semibold text-purple-900">Upload Proofs</h2>
              <p className="text-sm text-purple-700 mt-1">
                Upload proofs for Impact Direct to review
              </p>
            </div>
            <div className="p-6">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-300 hover:border-purple-400'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-2">Drag and drop files here, or</p>
                <label className="cursor-pointer">
                  <span className="text-purple-600 hover:text-purple-700 font-medium">
                    browse to select
                  </span>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                  />
                </label>
                <p className="text-xs text-gray-400 mt-2">PDF, JPG, PNG (max 50MB each)</p>
              </div>

              {uploadFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {uploadFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-purple-500" />
                        <div>
                          <p className="font-medium text-sm">{file.name}</p>
                          <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setUploadFiles(uploadFiles.filter((_, i) => i !== index))}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                  >
                    {isUploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                    Upload {uploadFiles.length} File{uploadFiles.length > 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center py-8 text-gray-500 text-sm">
          <p>Impact Direct Printing</p>
          <p className="mt-1">
            Questions?{' '}
            <a href="mailto:brandon@impactdirectprinting.com" className="text-green-600 hover:text-green-700">
              brandon@impactdirectprinting.com
            </a>
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Portal expires: {formatDate(data.expiresAt)}
          </p>
        </footer>
      </main>
    </div>
  );
}

export default VendorPortalView;
