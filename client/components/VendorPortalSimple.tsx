/**
 * VendorPortalSimple - Simplified vendor portal focused on actions
 *
 * Priority order:
 * 1. Confirm PO (if not confirmed)
 * 2. Download Files
 * 3. Update Status
 * 4. Upload Proof
 * 5. Details (collapsed)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { toast, Toaster } from 'sonner';
import {
  Download, Upload, CheckCircle, Clock, Truck, Package,
  Loader2, ChevronDown, ChevronRight, FileText, Image, Database
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

interface SimplePortalData {
  jobNumber: string;
  jobTitle: string;
  vendor: string;
  quantity: number;
  sizeName: string;
  dueDate: string;
  poNumber: string;
  files: {
    artwork: Array<{ id: string; name: string; size: number }>;
    dataFiles: Array<{ id: string; name: string; size: number }>;
    proofs: Array<{ id: string; name: string; size: number }>;
    other: Array<{ id: string; name: string; size: number }>;
  };
  portal: {
    confirmedAt: string | null;
    confirmedByName: string | null;
    confirmedByEmail: string | null;
    vendorStatus: string | null;
    trackingNumber: string | null;
    trackingCarrier: string | null;
  };
  specs?: {
    productType?: string;
    paperType?: string;
    colors?: string;
    coating?: string;
    finishing?: string;
  };
}

const STATUSES = [
  { value: 'PO_RECEIVED', label: 'PO Received', icon: CheckCircle },
  { value: 'IN_PRODUCTION', label: 'In Production', icon: Clock },
  { value: 'PRINTING_COMPLETE', label: 'Complete', icon: Package },
  { value: 'SHIPPED', label: 'Shipped', icon: Truck },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VendorPortalSimple({ token }: { token: string }) {
  const [data, setData] = useState<SimplePortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  // Confirm PO state
  const [confirmName, setConfirmName] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Status update state
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingCarrier, setTrackingCarrier] = useState('');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Collapsed sections
  const [specsExpanded, setSpecsExpanded] = useState(false);

  // Fetch portal data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/portal/${token}`);
      if (res.status === 410) {
        setExpired(true);
        return;
      }
      if (!res.ok) throw new Error('Failed to load portal');
      const json = await res.json();
      setData(json);
      if (json.portal?.trackingNumber) {
        setTrackingNumber(json.portal.trackingNumber);
      }
      if (json.portal?.trackingCarrier) {
        setTrackingCarrier(json.portal.trackingCarrier);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Confirm PO
  const handleConfirmPO = async () => {
    if (!confirmName.trim() || !confirmEmail.trim()) {
      toast.error('Please enter your name and email');
      return;
    }
    setConfirming(true);
    try {
      const res = await fetch(`${API_URL}/api/portal/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: confirmName, email: confirmEmail }),
      });
      if (!res.ok) throw new Error('Failed to confirm PO');
      toast.success('PO Confirmed!');
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConfirming(false);
    }
  };

  // Update status
  const handleStatusUpdate = async (status: string) => {
    setUpdatingStatus(true);
    try {
      const body: any = { status };
      if (status === 'SHIPPED' && trackingNumber) {
        body.trackingNumber = trackingNumber;
        body.trackingCarrier = trackingCarrier;
      }
      const res = await fetch(`${API_URL}/api/portal/${token}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update status');
      toast.success(`Status updated to ${status.replace(/_/g, ' ')}`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Upload proof
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append('files', file);
    }

    try {
      const res = await fetch(`${API_URL}/api/portal/${token}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      toast.success('Proof uploaded successfully!');
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  // Download file
  const handleDownload = (fileId: string, fileName: string) => {
    window.open(`${API_URL}/api/portal/${token}/files/${fileId}`, '_blank');
  };

  // Download all
  const handleDownloadAll = () => {
    window.open(`${API_URL}/api/portal/${token}/download-all`, '_blank');
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  // Expired
  if (expired) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Portal Expired</h1>
          <p className="text-slate-600">This portal link has expired. Please contact Impact Direct for a new link.</p>
        </div>
      </div>
    );
  }

  // Error
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">Error</h1>
          <p className="text-slate-600">{error || 'Failed to load portal data'}</p>
        </div>
      </div>
    );
  }

  const isConfirmed = !!data.portal.confirmedAt;
  const currentStatus = data.portal.vendorStatus || 'PO_RECEIVED';
  const totalFiles = data.files.artwork.length + data.files.dataFiles.length;

  return (
    <div className="min-h-screen bg-slate-100">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-xl font-bold">IMPACT DIRECT PRINTING</h1>
          <p className="text-slate-400 text-sm">Vendor Portal</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Job Summary Card */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-sm text-slate-500 font-mono">Job #{data.jobNumber}</p>
              <h2 className="text-xl font-bold text-slate-900">{data.jobTitle || 'Untitled Job'}</h2>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Due</p>
              <p className="text-lg font-bold text-slate-900">{formatDate(data.dueDate)}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            {data.sizeName && <span className="font-medium">{data.sizeName}</span>}
            {data.quantity > 0 && <span>• {data.quantity.toLocaleString()} qty</span>}
          </div>
        </div>

        {/* CONFIRM PO - Only if not confirmed */}
        {!isConfirmed && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
            <h3 className="text-lg font-bold text-amber-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Confirm PO Receipt
            </h3>
            <p className="text-sm text-amber-800 mb-4">
              Please confirm that you have received PO #{data.poNumber}
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input
                type="text"
                placeholder="Your Name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                className="w-full px-4 py-3 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              <input
                type="email"
                placeholder="Your Email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                className="w-full px-4 py-3 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
            <button
              onClick={handleConfirmPO}
              disabled={confirming}
              className="w-full py-3 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {confirming ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Confirm Receipt'}
            </button>
          </div>
        )}

        {/* Confirmed badge */}
        {isConfirmed && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-800">PO Confirmed</p>
              <p className="text-sm text-emerald-600">
                by {data.portal.confirmedByName} on {formatDate(data.portal.confirmedAt)}
              </p>
            </div>
          </div>
        )}

        {/* DOWNLOAD FILES */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Download className="w-5 h-5" />
              Download Files
            </h3>
            {totalFiles > 0 && (
              <button
                onClick={handleDownloadAll}
                className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors"
              >
                Download All
              </button>
            )}
          </div>

          {totalFiles === 0 ? (
            <p className="text-slate-500 text-center py-8">No files uploaded yet</p>
          ) : (
            <div className="space-y-4">
              {/* Artwork */}
              {data.files.artwork.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-1">
                    <Image className="w-4 h-4" /> Artwork ({data.files.artwork.length})
                  </p>
                  <div className="space-y-2">
                    {data.files.artwork.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => handleDownload(file.id, file.name)}
                        className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-left"
                      >
                        <span className="font-medium text-slate-700 truncate">{file.name}</span>
                        <span className="text-sm text-slate-500 ml-2">{formatBytes(file.size)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Files */}
              {data.files.dataFiles.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-2 flex items-center gap-1">
                    <Database className="w-4 h-4" /> Data Files ({data.files.dataFiles.length})
                  </p>
                  <div className="space-y-2">
                    {data.files.dataFiles.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => handleDownload(file.id, file.name)}
                        className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-left"
                      >
                        <span className="font-medium text-slate-700 truncate">{file.name}</span>
                        <span className="text-sm text-slate-500 ml-2">{formatBytes(file.size)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* UPDATE STATUS */}
        {isConfirmed && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Update Status
            </h3>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {STATUSES.map((status) => {
                const Icon = status.icon;
                const isActive = currentStatus === status.value;
                const statusIndex = STATUSES.findIndex((s) => s.value === status.value);
                const currentIndex = STATUSES.findIndex((s) => s.value === currentStatus);
                const isPast = statusIndex < currentIndex;

                return (
                  <button
                    key={status.value}
                    onClick={() => handleStatusUpdate(status.value)}
                    disabled={updatingStatus || isPast}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-50'
                        : isPast
                        ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isActive ? 'bg-emerald-500 text-white' : isPast ? 'bg-slate-300 text-white' : 'bg-slate-200'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={`font-medium ${isActive ? 'text-emerald-900' : 'text-slate-700'}`}>
                      {status.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Tracking info for shipped status */}
            {currentStatus === 'SHIPPED' && (
              <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm font-medium text-slate-700 mb-2">Tracking Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Tracking Number"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Carrier (UPS, FedEx, etc)"
                    value={trackingCarrier}
                    onChange={(e) => setTrackingCarrier(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <button
                  onClick={() => handleStatusUpdate('SHIPPED')}
                  disabled={updatingStatus}
                  className="mt-3 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800"
                >
                  Save Tracking
                </button>
              </div>
            )}
          </div>
        )}

        {/* UPLOAD PROOF */}
        {isConfirmed && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Proof
            </h3>

            <label className="block cursor-pointer">
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.tiff"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
              <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                uploading ? 'border-slate-300 bg-slate-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
              }`}>
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
                    <p className="text-slate-600">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                      <Upload className="w-6 h-6 text-slate-600" />
                    </div>
                    <p className="font-medium text-slate-700">Drop files here or click to upload</p>
                    <p className="text-sm text-slate-500">PDF, PNG, JPG, TIFF (max 50MB)</p>
                  </div>
                )}
              </div>
            </label>

            {/* Existing proofs */}
            {data.files.proofs.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-500 mb-2">Uploaded Proofs</p>
                <div className="space-y-2">
                  {data.files.proofs.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg"
                    >
                      <span className="font-medium text-emerald-700 truncate">{file.name}</span>
                      <span className="text-sm text-emerald-600">{formatBytes(file.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SPECS (collapsed by default) */}
        {data.specs && Object.values(data.specs).some(Boolean) && (
          <button
            onClick={() => setSpecsExpanded(!specsExpanded)}
            className="w-full bg-white rounded-xl shadow-sm p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <span className="font-medium text-slate-700 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              View Full Specifications
            </span>
            {specsExpanded ? (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-400" />
            )}
          </button>
        )}

        {specsExpanded && data.specs && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {data.specs.productType && (
                <div>
                  <span className="text-slate-500">Product Type</span>
                  <p className="font-medium">{data.specs.productType}</p>
                </div>
              )}
              {data.specs.paperType && (
                <div>
                  <span className="text-slate-500">Paper</span>
                  <p className="font-medium">{data.specs.paperType}</p>
                </div>
              )}
              {data.specs.colors && (
                <div>
                  <span className="text-slate-500">Colors</span>
                  <p className="font-medium">{data.specs.colors}</p>
                </div>
              )}
              {data.specs.coating && (
                <div>
                  <span className="text-slate-500">Coating</span>
                  <p className="font-medium">{data.specs.coating}</p>
                </div>
              )}
              {data.specs.finishing && (
                <div>
                  <span className="text-slate-500">Finishing</span>
                  <p className="font-medium">{data.specs.finishing}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center py-8 text-sm text-slate-500">
          <p>Impact Direct Printing</p>
          <p>Questions? Contact your sales rep</p>
        </footer>
      </main>
    </div>
  );
}

export default VendorPortalSimple;
