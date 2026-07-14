/**
 * Popup viewer for invoices, POs, quotes, artwork, and other job files.
 * Fetches as blob so the browser never auto-downloads PDFs.
 */
import React, { useEffect, useState } from 'react';
import { X, Download, Loader2, ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';
import { authFetch } from '../lib/api';

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
    // Prefer relative path for same-origin fetch
    return u.pathname + u.search;
  } catch {
    return url.includes('?') ? `${url}&view=1` : `${url}?view=1`;
  }
}

export function DocumentViewerModal({ source, title, onClose }: DocumentViewerModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedMime, setResolvedMime] = useState<string | undefined>(source.mimeType);
  const [byteSize, setByteSize] = useState(0);

  const fileName =
    title ||
    source.fileName ||
    (source.type === 'file' ? `File ${source.fileId.slice(0, 8)}` : 'Document');

  const sourceKey = source.type === 'file' ? `file:${source.fileId}` : `url:${source.url}`;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setPreviewUrl(null);
      setByteSize(0);

      try {
        const fetchUrl =
          source.type === 'file'
            ? `/api/files/${source.fileId}/download?view=1`
            : withViewParam(source.url);

        // authFetch adds Bearer when VITE_INTERNAL_API_SECRET is baked in
        const response = await authFetch(fetchUrl);
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(
            text?.slice(0, 120) || `Failed to load document (${response.status})`
          );
        }

        const contentType = response.headers.get('content-type') || source.mimeType || '';
        const buf = await response.arrayBuffer();
        if (cancelled) return;

        if (!buf.byteLength) {
          throw new Error('Document is empty');
        }

        // Detect HTML error pages masquerading as success
        const head = new TextDecoder().decode(buf.slice(0, 64)).toLowerCase();
        if (head.includes('<!doctype') || head.includes('<html')) {
          throw new Error('Server returned HTML instead of a document');
        }

        const isPdf =
          contentType.includes('pdf') ||
          /\.pdf$/i.test(fileName) ||
          head.startsWith('%pdf');
        const isImg =
          contentType.startsWith('image/') ||
          isImageMime(contentType, fileName) ||
          head.startsWith('\x89png') ||
          head.startsWith('\xff\xd8\xff');

        const mime = isPdf
          ? 'application/pdf'
          : isImg
            ? contentType.startsWith('image/')
              ? contentType
              : 'image/png'
            : contentType || 'application/octet-stream';

        const typed = new Blob([buf], { type: mime });
        objectUrl = URL.createObjectURL(typed);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setResolvedMime(mime);
        setByteSize(buf.byteLength);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

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
      const response = await authFetch(fetchUrl);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        fileName.endsWith('.pdf') || /\.\w{2,5}$/i.test(fileName)
          ? fileName
          : `${fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      if (source.type === 'file') {
        window.open(`/api/files/${source.fileId}/download`, '_blank');
      } else {
        window.open(source.url, '_blank');
      }
    }
  };

  const showImage = isImageMime(resolvedMime, fileName);
  const showPdf = !showImage && (resolvedMime === 'application/pdf' || /\.pdf$/i.test(fileName));

  return (
    <div
      className="fixed inset-0 bg-black/65 z-[80] flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-[96vw] h-[94vh] max-w-6xl flex flex-col ring-1 ring-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-[#2B3A4A] text-white flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {showImage ? (
              <ImageIcon className="w-4 h-4 text-white/70 flex-shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-white/70 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="font-medium truncate text-sm sm:text-base">{fileName}</h3>
              {byteSize > 0 && !loading && (
                <p className="text-[10px] text-white/50 tabular-nums">
                  {(byteSize / 1024).toFixed(1)} KB
                  {resolvedMime ? ` · ${resolvedMime}` : ''}
                </p>
              )}
            </div>
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
              disabled={!previewUrl}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-40"
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

        {/* Content — min-h-0 is required for flex children + iframe height */}
        <div className="flex-1 min-h-0 relative overflow-hidden bg-zinc-200">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#C0512A]" />
                <p className="text-sm text-zinc-600">Loading preview…</p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
              <div className="text-center max-w-sm px-4">
                <p className="text-red-600 mb-3 text-sm font-medium">{error}</p>
                <p className="text-xs text-zinc-500 mb-4">
                  Preview failed. You can still download the file.
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
            <div className="absolute inset-0 overflow-auto flex items-center justify-center p-6 bg-zinc-800/90">
              <img
                src={previewUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain shadow-2xl rounded bg-white"
              />
            </div>
          )}

          {previewUrl && !loading && !error && showPdf && (
            <object
              data={`${previewUrl}#view=FitH`}
              type="application/pdf"
              className="absolute inset-0 w-full h-full border-0 bg-white"
              title={`Preview: ${fileName}`}
            >
              <iframe
                src={`${previewUrl}#view=FitH`}
                className="absolute inset-0 w-full h-full border-0 bg-white"
                title={`Preview: ${fileName}`}
              />
            </object>
          )}

          {previewUrl && !loading && !error && !showImage && !showPdf && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
              <div className="text-center px-4">
                <FileText className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
                <p className="text-sm text-zinc-600 mb-3">
                  No in-browser preview for this file type.
                </p>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-[#2B3A4A] text-white rounded-lg text-sm"
                >
                  Download to open
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentViewerModal;
