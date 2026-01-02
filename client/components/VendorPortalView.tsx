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
  MapPin,
  Phone,
  Calendar,
  ClipboardList,
  ExternalLink,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

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
  inHomesDate: string | null;
  specialInstructions: string;
  // Customer references
  customerPONumber: string;
  customerJobNumber: string;
  // Job notes
  description: string;
  notes: string;
  packingSlipNotes: string;
  // Vendor shipping
  vendorShipping: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
  };
  specs: {
    productType?: string;
    paperType?: string;
    paperWeight?: string;
    coverPaperType?: string;
    colors?: string;
    coating?: string;
    finishing?: string;
    bindingStyle?: string;
    coverType?: string;
    pageCount?: string;
    flatSize?: string;
    finishedSize?: string;
    folds?: string;
    perforations?: string;
    dieCut?: string;
    bleed?: string;
    proofType?: string;
    shipVia?: string;
  };
  // Timeline dates
  timeline?: {
    orderDate?: string;
    filesDueDate?: string;
    proofDueDate?: string;
    approvalDueDate?: string;
    productionStartDate?: string;
    uspsDeliveryDate?: string;
  };
  // Product components
  productComponents?: Array<{
    componentType: string;
    description: string;
    quantity?: number;
    specs?: string;
    priceOnPO?: number;
  }>;
  // Line items
  lineItems?: Array<{
    description: string;
    quantity?: number;
    pricePerThousand?: number;
    lineTotal?: number;
    unitPrice?: number;
  }>;
  // Mailing details
  mailing?: {
    isDirectMail: boolean;
    mailClass?: string;
    mailProcess?: string;
    dropLocation?: string;
    uspsRequirements?: string;
    mailDatRequired?: boolean;
    mailDatResponsibility?: string;
    presortType?: string;
  } | null;
  // Special handling
  specialHandling?: {
    handSortRequired?: boolean;
    handSortItems?: string;
    handSortReason?: string;
    rushJob?: boolean;
    fragile?: boolean;
    oversizedShipment?: boolean;
  };
  // Instructions
  instructions?: {
    artwork?: string;
    packing?: string;
    labeling?: string;
    special?: string;
  };
  // Raw PO text
  rawPOText?: string;
  additionalNotes?: string;
  // Versions/breakdowns
  versions?: Array<{
    versionName: string;
    pageCount?: string;
    quantity?: number;
    specs?: string;
    languageBreakdown?: Array<{ language: string; quantity: number }>;
  }>;
  languageBreakdown?: Array<{ language: string; quantity: number; handSort?: boolean }>;
  // Responsibilities
  responsibilities?: {
    vendor?: Array<{ task: string; deadline?: string }>;
    customer?: Array<{ task: string; deadline?: string }>;
  };
  // Payment
  paymentTerms?: string;
  fob?: string;
  accountNumber?: string;
  // Files
  files: {
    artwork: Array<{ id: string; name: string; size: number; uploadedAt: string }>;
    dataFiles: Array<{ id: string; name: string; size: number; uploadedAt: string }>;
    proofs: Array<{ id: string; name: string; size: number; uploadedAt: string; isVendorProof?: boolean }>;
    other: Array<{ id: string; name: string; size: number; uploadedAt: string }>;
  };
  hasVendorPO: boolean;
  artworkFilesLink: string | null;
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
            <div className="text-right space-y-1">
              {data.poNumber && (
                <p className="text-sm text-gray-500">PO #{data.poNumber}</p>
              )}
              {data.customerPONumber && (
                <p className="text-xs text-gray-400">Customer PO: {data.customerPONumber}</p>
              )}
              {data.customerJobNumber && (
                <p className="text-xs text-gray-400">Customer Job #: {data.customerJobNumber}</p>
              )}
            </div>
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

            {/* Key Dates */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Key Dates
              </h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-blue-600 text-xs uppercase">Due Date</p>
                  <p className="font-bold text-blue-900">{formatDate(data.dueDate)}</p>
                </div>
                <div>
                  <p className="text-blue-600 text-xs uppercase">Mail Date</p>
                  <p className="font-bold text-blue-900">{formatDate(data.mailDate)}</p>
                </div>
                <div>
                  <p className="text-blue-600 text-xs uppercase">In-Homes</p>
                  <p className="font-bold text-blue-900">{formatDate(data.inHomesDate)}</p>
                </div>
              </div>
            </div>

            {/* Job Description */}
            {data.description && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Job Description</h3>
                <p className="text-gray-600 whitespace-pre-wrap">{data.description}</p>
              </div>
            )}

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
                {data.specs.productType && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Product Type</span>
                    <span className="font-medium">{data.specs.productType}</span>
                  </div>
                )}
                {data.sizeName && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Finished Size</span>
                    <span className="font-medium">{data.sizeName}</span>
                  </div>
                )}
                {data.specs.flatSize && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Flat Size</span>
                    <span className="font-medium">{data.specs.flatSize}</span>
                  </div>
                )}
                {data.specs.paperType && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Paper</span>
                    <span className="font-medium">{data.specs.paperType}</span>
                  </div>
                )}
                {data.specs.paperWeight && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Paper Weight</span>
                    <span className="font-medium">{data.specs.paperWeight}</span>
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
                {data.specs.bindingStyle && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Binding</span>
                    <span className="font-medium">{data.specs.bindingStyle}</span>
                  </div>
                )}
                {data.specs.coverType && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Cover Type</span>
                    <span className="font-medium">{data.specs.coverType}</span>
                  </div>
                )}
                {data.specs.pageCount && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Page Count</span>
                    <span className="font-medium">{data.specs.pageCount}</span>
                  </div>
                )}
                {data.specs.folds && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Folds</span>
                    <span className="font-medium">{data.specs.folds}</span>
                  </div>
                )}
                {data.specs.perforations && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Perforations</span>
                    <span className="font-medium">{data.specs.perforations}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Shipping Info */}
            {(data.vendorShipping?.name || data.vendorShipping?.address || data.specs.shipVia) && (
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-green-900 mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Shipping Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {(data.vendorShipping?.name || data.vendorShipping?.address) && (
                    <div>
                      <p className="text-xs text-green-600 uppercase font-medium mb-1">Ship To</p>
                      {data.vendorShipping.name && (
                        <p className="font-medium text-green-900">{data.vendorShipping.name}</p>
                      )}
                      {data.vendorShipping.address && (
                        <p className="text-green-800">{data.vendorShipping.address}</p>
                      )}
                      {(data.vendorShipping.city || data.vendorShipping.state || data.vendorShipping.zip) && (
                        <p className="text-green-800">
                          {[data.vendorShipping.city, data.vendorShipping.state, data.vendorShipping.zip].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {data.vendorShipping.phone && (
                        <p className="text-green-700 text-sm mt-1 flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {data.vendorShipping.phone}
                        </p>
                      )}
                    </div>
                  )}
                  {data.specs.shipVia && (
                    <div>
                      <p className="text-xs text-green-600 uppercase font-medium mb-1">Ship Via</p>
                      <p className="font-medium text-green-900">{data.specs.shipVia}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Notes Section */}
            {(data.notes || data.packingSlipNotes) && (
              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Notes
                </h3>
                {data.notes && (
                  <div className="mb-3">
                    <p className="text-xs text-purple-600 uppercase font-medium mb-1">Job Notes</p>
                    <p className="text-purple-800 whitespace-pre-wrap">{data.notes}</p>
                  </div>
                )}
                {data.packingSlipNotes && (
                  <div>
                    <p className="text-xs text-purple-600 uppercase font-medium mb-1">Packing Slip Notes</p>
                    <p className="text-purple-800 whitespace-pre-wrap">{data.packingSlipNotes}</p>
                  </div>
                )}
              </div>
            )}

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

            {/* Extended Timeline */}
            {data.timeline && Object.values(data.timeline).some(v => v) && (
              <div className="bg-indigo-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Production Timeline
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {data.timeline.orderDate && (
                    <div>
                      <p className="text-indigo-600 text-xs uppercase">Order Date</p>
                      <p className="font-medium text-indigo-900">{formatDate(data.timeline.orderDate)}</p>
                    </div>
                  )}
                  {data.timeline.filesDueDate && (
                    <div>
                      <p className="text-indigo-600 text-xs uppercase">Files Due</p>
                      <p className="font-medium text-indigo-900">{formatDate(data.timeline.filesDueDate)}</p>
                    </div>
                  )}
                  {data.timeline.proofDueDate && (
                    <div>
                      <p className="text-indigo-600 text-xs uppercase">Proof Due</p>
                      <p className="font-medium text-indigo-900">{formatDate(data.timeline.proofDueDate)}</p>
                    </div>
                  )}
                  {data.timeline.approvalDueDate && (
                    <div>
                      <p className="text-indigo-600 text-xs uppercase">Approval Due</p>
                      <p className="font-medium text-indigo-900">{formatDate(data.timeline.approvalDueDate)}</p>
                    </div>
                  )}
                  {data.timeline.productionStartDate && (
                    <div>
                      <p className="text-indigo-600 text-xs uppercase">Production Start</p>
                      <p className="font-medium text-indigo-900">{formatDate(data.timeline.productionStartDate)}</p>
                    </div>
                  )}
                  {data.timeline.uspsDeliveryDate && (
                    <div>
                      <p className="text-indigo-600 text-xs uppercase">USPS Delivery</p>
                      <p className="font-medium text-indigo-900">{formatDate(data.timeline.uspsDeliveryDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Product Components */}
            {data.productComponents && data.productComponents.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 pb-2 border-b border-orange-500">
                  Product Components
                </h3>
                <div className="grid gap-3">
                  {data.productComponents.map((comp, idx) => (
                    <div key={idx} className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                      <div className="flex justify-between items-start mb-2">
                        <span className="bg-orange-200 text-orange-800 px-2 py-0.5 rounded text-xs font-semibold uppercase">
                          {comp.componentType}
                        </span>
                        {comp.quantity && (
                          <span className="text-orange-700 font-medium">
                            Qty: {comp.quantity.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {comp.description && (
                        <p className="text-orange-900 font-medium">{comp.description}</p>
                      )}
                      {comp.specs && (
                        <p className="text-orange-700 text-sm mt-1">{comp.specs}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Line Items */}
            {data.lineItems && data.lineItems.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 pb-2 border-b border-teal-500">
                  Line Items
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-teal-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-teal-700">Description</th>
                        <th className="text-right px-3 py-2 text-teal-700">Quantity</th>
                        {data.lineItems.some(li => li.pricePerThousand) && (
                          <th className="text-right px-3 py-2 text-teal-700">Per 1000</th>
                        )}
                        {data.lineItems.some(li => li.unitPrice) && (
                          <th className="text-right px-3 py-2 text-teal-700">Unit Price</th>
                        )}
                        {data.lineItems.some(li => li.lineTotal) && (
                          <th className="text-right px-3 py-2 text-teal-700">Total</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.lineItems.map((item, idx) => (
                        <tr key={idx} className="border-b border-teal-100">
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="text-right px-3 py-2">{item.quantity?.toLocaleString()}</td>
                          {data.lineItems.some(li => li.pricePerThousand) && (
                            <td className="text-right px-3 py-2">
                              {item.pricePerThousand ? `$${item.pricePerThousand.toFixed(2)}` : '-'}
                            </td>
                          )}
                          {data.lineItems.some(li => li.unitPrice) && (
                            <td className="text-right px-3 py-2">
                              {item.unitPrice ? `$${item.unitPrice.toFixed(4)}` : '-'}
                            </td>
                          )}
                          {data.lineItems.some(li => li.lineTotal) && (
                            <td className="text-right px-3 py-2 font-medium">
                              {item.lineTotal ? `$${item.lineTotal.toFixed(2)}` : '-'}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Mailing Details */}
            {data.mailing && data.mailing.isDirectMail && (
              <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-200">
                <h3 className="text-sm font-semibold text-cyan-900 mb-3 flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Direct Mail Details
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {data.mailing.mailClass && (
                    <div>
                      <p className="text-cyan-600 text-xs uppercase">Mail Class</p>
                      <p className="font-medium text-cyan-900">{data.mailing.mailClass}</p>
                    </div>
                  )}
                  {data.mailing.mailProcess && (
                    <div>
                      <p className="text-cyan-600 text-xs uppercase">Process</p>
                      <p className="font-medium text-cyan-900">{data.mailing.mailProcess}</p>
                    </div>
                  )}
                  {data.mailing.dropLocation && (
                    <div>
                      <p className="text-cyan-600 text-xs uppercase">Drop Location</p>
                      <p className="font-medium text-cyan-900">{data.mailing.dropLocation}</p>
                    </div>
                  )}
                  {data.mailing.presortType && (
                    <div>
                      <p className="text-cyan-600 text-xs uppercase">Presort Type</p>
                      <p className="font-medium text-cyan-900">{data.mailing.presortType}</p>
                    </div>
                  )}
                  {data.mailing.mailDatResponsibility && (
                    <div>
                      <p className="text-cyan-600 text-xs uppercase">Mail.dat Responsibility</p>
                      <p className="font-medium text-cyan-900">{data.mailing.mailDatResponsibility}</p>
                    </div>
                  )}
                </div>
                {data.mailing.uspsRequirements && (
                  <div className="mt-3 pt-3 border-t border-cyan-200">
                    <p className="text-cyan-600 text-xs uppercase mb-1">USPS Requirements</p>
                    <p className="text-cyan-800 whitespace-pre-wrap">{data.mailing.uspsRequirements}</p>
                  </div>
                )}
                {data.mailing.mailDatRequired && (
                  <div className="mt-2">
                    <span className="bg-cyan-200 text-cyan-800 px-2 py-0.5 rounded text-xs font-medium">
                      Mail.dat Required
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Special Handling */}
            {data.specialHandling && (
              data.specialHandling.rushJob ||
              data.specialHandling.fragile ||
              data.specialHandling.oversizedShipment ||
              data.specialHandling.handSortRequired
            ) && (
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <h3 className="text-sm font-semibold text-red-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Special Handling
                </h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {data.specialHandling.rushJob && (
                    <span className="bg-red-200 text-red-800 px-3 py-1 rounded-full text-xs font-semibold uppercase">
                      RUSH JOB
                    </span>
                  )}
                  {data.specialHandling.fragile && (
                    <span className="bg-red-200 text-red-800 px-3 py-1 rounded-full text-xs font-semibold uppercase">
                      FRAGILE
                    </span>
                  )}
                  {data.specialHandling.oversizedShipment && (
                    <span className="bg-red-200 text-red-800 px-3 py-1 rounded-full text-xs font-semibold uppercase">
                      OVERSIZED
                    </span>
                  )}
                  {data.specialHandling.handSortRequired && (
                    <span className="bg-red-200 text-red-800 px-3 py-1 rounded-full text-xs font-semibold uppercase">
                      HAND SORT REQUIRED
                    </span>
                  )}
                </div>
                {data.specialHandling.handSortItems && (
                  <div className="mt-2">
                    <p className="text-red-600 text-xs uppercase mb-1">Hand Sort Items</p>
                    <p className="text-red-800">{data.specialHandling.handSortItems}</p>
                  </div>
                )}
                {data.specialHandling.handSortReason && (
                  <div className="mt-2">
                    <p className="text-red-600 text-xs uppercase mb-1">Reason</p>
                    <p className="text-red-800">{data.specialHandling.handSortReason}</p>
                  </div>
                )}
              </div>
            )}

            {/* All Instructions */}
            {data.instructions && (
              data.instructions.artwork ||
              data.instructions.packing ||
              data.instructions.labeling
            ) && (
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <h3 className="text-sm font-semibold text-yellow-900 mb-3 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Production Instructions
                </h3>
                <div className="space-y-3">
                  {data.instructions.artwork && (
                    <div>
                      <p className="text-yellow-700 text-xs uppercase font-medium mb-1">Artwork Instructions</p>
                      <p className="text-yellow-900 whitespace-pre-wrap">{data.instructions.artwork}</p>
                    </div>
                  )}
                  {data.instructions.packing && (
                    <div>
                      <p className="text-yellow-700 text-xs uppercase font-medium mb-1">Packing Instructions</p>
                      <p className="text-yellow-900 whitespace-pre-wrap">{data.instructions.packing}</p>
                    </div>
                  )}
                  {data.instructions.labeling && (
                    <div>
                      <p className="text-yellow-700 text-xs uppercase font-medium mb-1">Labeling Instructions</p>
                      <p className="text-yellow-900 whitespace-pre-wrap">{data.instructions.labeling}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Versions / Language Breakdown */}
            {((data.versions && data.versions.length > 0) || (data.languageBreakdown && data.languageBreakdown.length > 0)) && (
              <div className="bg-violet-50 rounded-lg p-4 border border-violet-200">
                <h3 className="text-sm font-semibold text-violet-900 mb-3">
                  Versions & Language Breakdown
                </h3>
                {data.versions && data.versions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-violet-700 text-xs uppercase font-medium mb-2">Versions</p>
                    <div className="space-y-2">
                      {data.versions.map((ver, idx) => (
                        <div key={idx} className="bg-white rounded p-3 border border-violet-100">
                          <div className="flex justify-between items-start">
                            <span className="font-medium text-violet-900">{ver.versionName}</span>
                            {ver.quantity && (
                              <span className="text-violet-700 text-sm">Qty: {ver.quantity.toLocaleString()}</span>
                            )}
                          </div>
                          {ver.pageCount && <p className="text-violet-600 text-sm">Pages: {ver.pageCount}</p>}
                          {ver.specs && <p className="text-violet-600 text-sm mt-1">{ver.specs}</p>}
                          {ver.languageBreakdown && ver.languageBreakdown.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {ver.languageBreakdown.map((lb, lbIdx) => (
                                <span key={lbIdx} className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded text-xs">
                                  {lb.language}: {lb.quantity.toLocaleString()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.languageBreakdown && data.languageBreakdown.length > 0 && (
                  <div>
                    <p className="text-violet-700 text-xs uppercase font-medium mb-2">Language Breakdown</p>
                    <div className="flex flex-wrap gap-2">
                      {data.languageBreakdown.map((lb, idx) => (
                        <span key={idx} className={`px-3 py-1 rounded text-sm ${lb.handSort ? 'bg-red-100 text-red-700' : 'bg-violet-100 text-violet-700'}`}>
                          {lb.language}: {lb.quantity.toLocaleString()}
                          {lb.handSort && ' (Hand Sort)'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Responsibilities */}
            {data.responsibilities && (
              (data.responsibilities.vendor && data.responsibilities.vendor.length > 0) ||
              (data.responsibilities.customer && data.responsibilities.customer.length > 0)
            ) && (
              <div className="grid md:grid-cols-2 gap-4">
                {data.responsibilities.vendor && data.responsibilities.vendor.length > 0 && (
                  <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                    <h3 className="text-sm font-semibold text-emerald-900 mb-3">Vendor Tasks</h3>
                    <ul className="space-y-2">
                      {data.responsibilities.vendor.map((task, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-emerald-800">{task.task}</p>
                            {task.deadline && (
                              <p className="text-emerald-600 text-xs">Due: {task.deadline}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.responsibilities.customer && data.responsibilities.customer.length > 0 && (
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Customer Tasks</h3>
                    <ul className="space-y-2">
                      {data.responsibilities.customer.map((task, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Clock className="h-4 w-4 text-slate-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-slate-800">{task.task}</p>
                            {task.deadline && (
                              <p className="text-slate-600 text-xs">Due: {task.deadline}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Payment Terms */}
            {(data.paymentTerms || data.fob || data.accountNumber) && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment & Terms</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  {data.paymentTerms && (
                    <div>
                      <p className="text-gray-500 text-xs uppercase">Payment Terms</p>
                      <p className="font-medium text-gray-900">{data.paymentTerms}</p>
                    </div>
                  )}
                  {data.fob && (
                    <div>
                      <p className="text-gray-500 text-xs uppercase">FOB</p>
                      <p className="font-medium text-gray-900">{data.fob}</p>
                    </div>
                  )}
                  {data.accountNumber && (
                    <div>
                      <p className="text-gray-500 text-xs uppercase">Account #</p>
                      <p className="font-medium text-gray-900">{data.accountNumber}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Additional Notes */}
            {data.additionalNotes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-amber-800 mb-2">Additional Notes</h3>
                <p className="text-amber-700 whitespace-pre-wrap">{data.additionalNotes}</p>
              </div>
            )}

            {/* Raw PO Text (Expandable) */}
            {data.rawPOText && (
              <details className="bg-gray-100 rounded-lg border border-gray-300">
                <summary className="px-4 py-3 cursor-pointer font-semibold text-gray-700 hover:bg-gray-200 rounded-lg">
                  Original PO Description (click to expand)
                </summary>
                <div className="px-4 py-3 border-t border-gray-300 bg-white rounded-b-lg">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">{data.rawPOText}</pre>
                </div>
              </details>
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

            {/* External Artwork Link (ShareFile, Dropbox, etc.) */}
            {data.artworkFilesLink && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <ExternalLink className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-blue-900">Artwork Files</p>
                    <a
                      href={data.artworkFilesLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm break-all"
                    >
                      {data.artworkFilesLink}
                    </a>
                  </div>
                </div>
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

            {totalFiles === 0 && !data.artworkFilesLink && (
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
