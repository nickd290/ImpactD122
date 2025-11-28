import React, { useState, useRef } from 'react';
import { Upload, FileText, Loader2, X } from 'lucide-react';
import { aiApi } from '../lib/api';

interface POUploaderProps {
  onParsed: (data: any) => void;
  onCancel: () => void;
}

export function POUploader({ onParsed, onCancel }: POUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!validTypes.includes(selectedFile.type)) {
        setError('Please upload a PDF or image file (JPG, PNG)');
        return;
      }
      setFile(selectedFile);
      setError('');
    }
  };

  const handleParse = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await aiApi.parsePO(file);
      onParsed(result);
    } catch (err: any) {
      setError(err.message || 'Failed to parse purchase order');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!validTypes.includes(droppedFile.type)) {
        setError('Please upload a PDF or image file (JPG, PNG)');
        return;
      }
      setFile(droppedFile);
      setError('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <FileText className="w-6 h-6 text-orange-600" />
          <h3 className="text-xl font-bold">Upload Purchase Order</h3>
        </div>
      </div>

      <div className="space-y-4">
        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            file
              ? 'border-green-300 bg-green-50'
              : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileChange}
            className="hidden"
            disabled={loading}
          />

          {file ? (
            <div className="space-y-2">
              <FileText className="w-12 h-12 mx-auto text-green-600" />
              <p className="font-medium text-green-800">{file.name}</p>
              <p className="text-sm text-gray-600">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="text-sm text-red-600 hover:text-red-700 mt-2"
              >
                Remove file
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-12 h-12 mx-auto text-gray-400" />
              <p className="text-gray-600">
                <span className="font-medium text-orange-600">Click to upload</span> or drag and drop
              </p>
              <p className="text-sm text-gray-500">PDF, JPG, PNG (max 50MB)</p>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex items-center space-x-3">
          <button
            onClick={handleParse}
            disabled={!file || loading}
            className="flex items-center space-x-2 bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Parsing PO with AI...</span>
              </>
            ) : (
              <>
                <FileText className="w-5 h-5" />
                <span>Parse Purchase Order</span>
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-medium mb-2">💡 What AI will extract:</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 ml-2">
            <ul className="list-disc list-inside space-y-1">
              <li>Customer name & contact</li>
              <li>PO number</li>
              <li>Due date, mail date, in-homes</li>
              <li>Shipping address</li>
              <li>Quantities & pricing</li>
            </ul>
            <ul className="list-disc list-inside space-y-1">
              <li>Sizes (flat & finished)</li>
              <li>Paper type & weight</li>
              <li>Colors & coating</li>
              <li>Folds, perfs, die cuts</li>
              <li>Special instructions</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
