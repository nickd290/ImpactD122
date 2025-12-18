import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileText, Image, Database, File, AlertTriangle, Calendar, Package, Loader2, Clock } from 'lucide-react';

interface PortalFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
}

interface PortalData {
  jobNumber: string;
  jobTitle: string;
  customer: string;
  vendor: string;
  poNumber: string;
  quantity: number;
  sizeName: string;
  dueDate: string | null;
  mailDate: string | null;
  specialInstructions: string;
  files: {
    artwork: PortalFile[];
    dataFiles: PortalFile[];
    proofs: PortalFile[];
    other: PortalFile[];
  };
  hasVendorPO: boolean;
  expiresAt: string;
}

export function PortalView() {
  const { token } = useParams<{ token: string }>();
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid portal link');
      setLoading(false);
      return;
    }

    fetch(`/api/portal/${token}`)
      .then(async (res) => {
        if (res.status === 410) {
          setExpired(true);
          throw new Error('This portal link has expired');
        }
        if (!res.ok) {
          throw new Error('Portal not found');
        }
        return res.json();
      })
      .then((data) => {
        setPortalData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleDownloadPO = () => {
    window.open(`/api/portal/${token}/po`, '_blank');
  };

  const handleDownloadFile = (fileId: string) => {
    window.open(`/api/portal/${token}/files/${fileId}`, '_blank');
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading job portal...</p>
        </div>
      </div>
    );
  }

  // Expired state
  if (expired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Portal Link Expired</h1>
          <p className="text-gray-600 mb-6">
            This portal link has expired. Please contact Impact Direct Printing for a new link.
          </p>
          <a
            href="mailto:brandon@impactdirectprinting.com"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Contact Us
          </a>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Portal Not Found</h1>
          <p className="text-gray-600 mb-6">
            {error || 'This portal link is invalid or has been removed.'}
          </p>
          <a
            href="mailto:brandon@impactdirectprinting.com"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Contact Us
          </a>
        </div>
      </div>
    );
  }

  const totalFiles =
    portalData.files.artwork.length +
    portalData.files.dataFiles.length +
    portalData.files.proofs.length +
    portalData.files.other.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">IMPACT DIRECT PRINTING</h1>
              <p className="text-sm text-gray-500">Job Portal</p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>Link expires: {formatDate(portalData.expiresAt)}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Job Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Job #{portalData.jobNumber}
              </h2>
              {portalData.jobTitle && (
                <p className="text-lg text-gray-600 mt-1">{portalData.jobTitle}</p>
              )}
              <p className="text-sm text-gray-500 mt-2">
                Vendor: <span className="font-medium text-gray-700">{portalData.vendor}</span>
              </p>
            </div>

            {/* Download PO Button */}
            {portalData.hasVendorPO && (
              <button
                onClick={handleDownloadPO}
                className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
              >
                <Download className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-semibold">Download PO</div>
                  <div className="text-xs text-blue-200">#{portalData.poNumber}</div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Job Specifications */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-gray-400" />
            Specifications
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Quantity</p>
              <p className="text-lg font-semibold text-gray-900">
                {portalData.quantity?.toLocaleString() || 'N/A'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Size</p>
              <p className="text-lg font-semibold text-gray-900">
                {portalData.sizeName || 'N/A'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Due Date
              </p>
              <p className="text-lg font-semibold text-gray-900">
                {formatDate(portalData.dueDate)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Mail Date
              </p>
              <p className="text-lg font-semibold text-gray-900">
                {formatDate(portalData.mailDate)}
              </p>
            </div>
          </div>
        </div>

        {/* Files Section */}
        {totalFiles > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-400" />
              Files ({totalFiles})
            </h3>

            <div className="space-y-6">
              {/* Artwork */}
              {portalData.files.artwork.length > 0 && (
                <FileSection
                  title="Artwork"
                  icon={<Image className="w-4 h-4 text-purple-500" />}
                  files={portalData.files.artwork}
                  onDownload={handleDownloadFile}
                  formatFileSize={formatFileSize}
                />
              )}

              {/* Data Files */}
              {portalData.files.dataFiles.length > 0 && (
                <FileSection
                  title="Data Files"
                  icon={<Database className="w-4 h-4 text-green-500" />}
                  files={portalData.files.dataFiles}
                  onDownload={handleDownloadFile}
                  formatFileSize={formatFileSize}
                />
              )}

              {/* Proofs */}
              {portalData.files.proofs.length > 0 && (
                <FileSection
                  title="Proofs"
                  icon={<FileText className="w-4 h-4 text-blue-500" />}
                  files={portalData.files.proofs}
                  onDownload={handleDownloadFile}
                  formatFileSize={formatFileSize}
                />
              )}

              {/* Other */}
              {portalData.files.other.length > 0 && (
                <FileSection
                  title="Other Files"
                  icon={<File className="w-4 h-4 text-gray-500" />}
                  files={portalData.files.other}
                  onDownload={handleDownloadFile}
                  formatFileSize={formatFileSize}
                />
              )}
            </div>
          </div>
        )}

        {/* No Files Message */}
        {totalFiles === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No files have been uploaded yet.</p>
          </div>
        )}

        {/* Special Instructions */}
        {portalData.specialInstructions && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-amber-800 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Special Instructions
            </h3>
            <p className="text-amber-900 whitespace-pre-wrap">
              {portalData.specialInstructions}
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          <p>Questions? Contact <a href="mailto:brandon@impactdirectprinting.com" className="text-blue-600 hover:underline">brandon@impactdirectprinting.com</a></p>
          <p className="mt-1">&copy; {new Date().getFullYear()} Impact Direct Printing</p>
        </div>
      </footer>
    </div>
  );
}

// File Section Component
function FileSection({
  title,
  icon,
  files,
  onDownload,
  formatFileSize,
}: {
  title: string;
  icon: React.ReactNode;
  files: PortalFile[];
  onDownload: (fileId: string) => void;
  formatFileSize: (bytes: number) => string;
}) {
  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
        {icon}
        {title}
      </h4>
      <div className="space-y-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <button
              onClick={() => onDownload(file.id)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PortalView;
