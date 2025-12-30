import React, { useState, useEffect } from 'react';
import { X, Download, Loader2 } from 'lucide-react';

interface PDFPreviewModalProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

export function PDFPreviewModal({ fileId, fileName, onClose }: PDFPreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPDF = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/files/${fileId}/download`);
        if (!response.ok) {
          throw new Error('Failed to load PDF');
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } catch (err: any) {
        setError(err.message || 'Failed to load PDF');
      } finally {
        setLoading(false);
      }
    };

    fetchPDF();

    // Cleanup blob URL on unmount
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [fileId]);

  const handleDownload = () => {
    window.open(`/api/files/${fileId}/download`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-[95vw] h-[95vh] max-w-7xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 rounded-t-lg">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-900 truncate max-w-md">
              {fileName}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p className="text-gray-600">Loading PDF...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Download Instead
                </button>
              </div>
            </div>
          )}

          {previewUrl && !loading && !error && (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title={`Preview: ${fileName}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
