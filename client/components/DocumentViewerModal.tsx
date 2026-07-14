/**
 * Popup viewer for invoices, POs, quotes, artwork, and other job files.
 * Fetches as blob + iframes so the browser never auto-downloads PDFs.
 */
import React, { useEffect, useState } from 'react';
import { X, Download, Loader2, ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';

export type DocumentSource =
  | { type: 'file'; fileId: string; fileName?: string; mimeType?: string }
  | { type: 'url'; url: string; fileName?: string; mimeType?: string };

interface DocumentViewerModalProps {
  source: DocumentSource;
  title?: string;
  onClose: () => void;
}

function isImageMime(mime?: string, name?: string) {
  if (mime?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|tif{1,2}|bmp|svg)$/i.test(name || '');
}

function withViewParam(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('view', '1');
    return u.pathname + u.search;
  } catch {
    return url.includes('?') ? `${url}&view=1` : `${url}?view=1`;
  }
}

export function DocumentViewerModal({ source, title, onClose }: DocumentViewerModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [resolvedMime, setResolvedMime] = useState<string | undefined>(source.mimeType);

  const fileName =
    title ||
    source.fileName ||
    (source.type === 'file' ? `File ${source.fileId.slice(0, 8)}` : 'Document');

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setPreviewUrl(null);

      try {
        const fetchUrl =
          source.type === 'file'
            ? `/api/files/${source.fileId}/download?view=1`
            : withViewParam(source.url);

        const response = await fetch(fetchUrl, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`Failed to load document (${response.status})`);
        }

        const contentType = response.headers.get('content-type') || source.mimeType || '';
        const blob = await response.blob();

        // Force PDF mime so iframe renders instead of download
        const typed =
          contentType.includes('pdf') || /\.pdf$/i.test(fileName)
            ? new Blob([blob], { type: 'application/pdf' })
            : contentType
              ? new Blob([blob], { type: contentType })
              : blob;

        objectUrl = URL.createObjectURL(typed);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setResolvedMime(typed.type || contentType || source.mimeType);
        setBlobUrl(objectUrl);
        setPreviewUrl(objectUrl);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load document');
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source.type === 'file' ? source.fileId : source.url, fileName]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleDownload = async () => {
    try {
      const fetchUrl =
        source.type === 'file'
          ? `/api/files/${source.fileId}/download`
          : source.url.replace(/([?&])view=1&?/, '$1').replace(/[?&]$/, '');
      const response = await fetch(fetchUrl, { credentials: 'include' });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.endsWith('.pdf') || fileName.includes('.') ? fileName : `${fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open raw URL
      if (source.type === 'file') {
        window.open(`/api/files/${source.fileId}/download`, '_blank');
      } else {
        window.open(source.url, '_blank');
      }
    }
  };

  const showImage = isImageMime(resolvedMime, fileName);

  return (
    <div
      className="fixed inset-0 bg-black/65 z-[80] flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-[96vw] h-[94vh] max-w-6xl flex flex-col ring-1 ring-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-[#2B3A4A] text-white flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {showImage ? (
              <ImageIcon className="w-4 h-4 text-white/70 flex-shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-white/70 flex-shrink-0" />
            )}
            <h3 className="font-medium truncate text-sm sm:text-base">{fileName}</h3>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#C0512A] text-white rounded-lg hover:bg-[#C0512A]/90 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={() => {
                if (previewUrl) window.open(previewUrl, '_blank');
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-zinc-100">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#C0512A]" />
                <p className="text-sm text-zinc-600">Loading preview…</p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm px-4">
                <p className="text-status-danger mb-3 text-sm">{error}</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Preview unavailable — download the file instead.
                </p>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-[#2B3A4A] text-white rounded-lg text-sm hover:bg-[#2B3A4A]/90"
                >
                  Download
                </button>
              </div>
            </div>
          )}

          {previewUrl && !loading && !error && showImage && (
            <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
              <img
                src={previewUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain shadow-lg rounded"
              />
            </div>
          )}

          {previewUrl && !loading && !error && !showImage && (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0 bg-white"
              title={`Preview: ${fileName}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentViewerModal;
