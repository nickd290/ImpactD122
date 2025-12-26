import React, { useRef } from 'react';
import { Upload, FileText, Image, File as FileIcon, Trash2, Loader2 } from 'lucide-react';
import { JobFormData, Specs } from '../types';

interface FilesTabProps {
  formData: JobFormData;
  setFormData: React.Dispatch<React.SetStateAction<JobFormData>>;
  specs: Specs;
  setSpecs: React.Dispatch<React.SetStateAction<Specs>>;
  uploadedFiles: any[];
  pendingFiles: File[];
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
  isUploading: boolean;
  uploadError: string;
  isDragging: boolean;
  setIsDragging: (value: boolean) => void;
  onFileSelect: (files: FileList) => void;
  onDeleteFile: (fileId: string) => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
    return <Image className="w-5 h-5 text-purple-500" />;
  }
  if (['pdf'].includes(ext || '')) {
    return <FileText className="w-5 h-5 text-red-500" />;
  }
  return <FileIcon className="w-5 h-5 text-gray-500" />;
};

export function FilesTab({
  formData,
  setFormData,
  specs,
  setSpecs,
  uploadedFiles,
  pendingFiles,
  setPendingFiles,
  isUploading,
  uploadError,
  isDragging,
  setIsDragging,
  onFileSelect,
  onDeleteFile,
}: FilesTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={3}
          placeholder="Add any additional notes..."
        />
      </div>

      {/* Artwork Link */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Artwork Files</h3>
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-blue-900">
              Artwork URL / Link
            </label>
            <label className="flex items-center gap-2 text-xs text-blue-700 cursor-pointer">
              <input
                type="checkbox"
                checked={specs.artworkToFollow}
                onChange={(e) => setSpecs({ ...specs, artworkToFollow: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-blue-300 text-blue-600"
              />
              Artwork to Follow
            </label>
          </div>
          <input
            type="url"
            value={specs.artworkUrl}
            onChange={(e) => setSpecs({ ...specs, artworkUrl: e.target.value })}
            className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            placeholder="https://sharefile.com/... or similar"
          />
          {specs.artworkToFollow && !specs.artworkUrl && (
            <p className="mt-2 text-sm text-amber-600">
              ⚠️ Artwork marked as "to follow" - will be sent separately
            </p>
          )}
        </div>
      </div>

      {/* File Upload */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">File Uploads</h3>
        <div className="space-y-4">
          {/* Drop Zone */}
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
              multiple
              onChange={(e) => e.target.files && onFileSelect(e.target.files)}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">
              Drag & drop files here, or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-600 hover:underline"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              PDF, Images, Office documents
            </p>
          </div>

          {/* Upload Error */}
          {uploadError && (
            <p className="text-sm text-red-600">{uploadError}</p>
          )}

          {/* Pending Files */}
          {pendingFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase">
                Pending Upload ({pendingFiles.length})
              </p>
              {pendingFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-3">
                    {getFileIcon(file.name)}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingFiles(pendingFiles.filter((_, i) => i !== index))}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Uploaded Files */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase">
                Uploaded Files ({uploadedFiles.length})
              </p>
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between bg-green-50 p-3 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    {getFileIcon(file.fileName)}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.fileName}</p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)} • {file.kind}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteFile(file.id)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
