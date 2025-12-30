import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { TabbedJobForm } from './job-form/TabbedJobForm';
import { JobFormData, Specs, LineItem } from './job-form/types';

interface ParsedCustomer {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface JobFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (jobData: any) => void;
  customers: any[];
  vendors: any[];
  initialData?: any;
  onCustomerCreated?: (newCustomer: any) => void;
}

export function JobFormModal({
  isOpen,
  onClose,
  onSubmit,
  customers,
  vendors,
  initialData,
  onCustomerCreated,
}: JobFormModalProps) {
  // Extract parsedCustomer from initialData if present
  const parsedCustomer: ParsedCustomer | null = initialData?.parsedCustomer || null;
  // Form data managed by TabbedJobForm - we track it here for submission
  const [formState, setFormState] = useState<{
    formData: JobFormData;
    specs: Specs;
    lineItems: LineItem[];
    sellPrice: string;
    bradfordCut: number;
  } | null>(null);

  // File upload state - managed here and passed to TabbedJobForm
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch existing files when editing a job
  useEffect(() => {
    if (isOpen && initialData?.id) {
      fetch(`/api/jobs/${initialData.id}/files`)
        .then(res => res.json())
        .then(files => setUploadedFiles(files || []))
        .catch(() => setUploadedFiles([]));
    } else {
      setUploadedFiles([]);
    }
    // Clear pending files when modal opens/closes
    setPendingFiles([]);
    setUploadError('');
  }, [isOpen, initialData?.id]);

  // File selection handler
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError('');

    if (initialData?.id) {
      // Existing job: upload immediately
      setIsUploading(true);
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('kind', 'ARTWORK');

        try {
          const response = await fetch(`/api/jobs/${initialData.id}/files`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
          }

          const result = await response.json();
          setUploadedFiles(prev => [...prev, result.file]);
        } catch (error: any) {
          setUploadError(error.message || 'Failed to upload file');
        }
      }
      setIsUploading(false);
    } else {
      // New job: queue files for later upload
      setPendingFiles(prev => [...prev, ...Array.from(files)]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Delete file handler
  const handleDeleteFile = async (fileId: string) => {
    if (initialData?.id) {
      try {
        const response = await fetch(`/api/jobs/${initialData.id}/files/${fileId}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
        }
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formState) {
      alert('Form not ready');
      return;
    }

    const { formData, specs, lineItems, sellPrice, bradfordCut } = formState;

    if (!formData.title.trim()) {
      alert('Please enter a job title');
      return;
    }

    if (!formData.customerId) {
      alert('Please select a customer');
      return;
    }

    // Vendor only required for single-vendor jobs
    if (formData.jobType !== 'multipart' && !formData.vendorId) {
      alert('Please select a vendor');
      return;
    }

    // Validate sell price
    const parsedSellPrice = parseFloat(sellPrice);
    if (!sellPrice || isNaN(parsedSellPrice)) {
      alert('Sell price is required');
      return;
    }
    if (parsedSellPrice <= 0) {
      alert('Sell price must be greater than $0');
      return;
    }

    // Validate line items
    const validLineItems = lineItems.filter(item => item.description.trim());
    if (validLineItems.length === 0) {
      alert('Please add at least one line item with a description');
      return;
    }

    // Check if any line item has negative pricing
    const hasInvalidPricing = validLineItems.some(item => item.unitPrice < 0 || item.unitCost < 0);
    if (hasInvalidPricing) {
      alert('Pricing cannot be negative (Price >= $0, Cost >= $0)');
      return;
    }

    // Check if vendor is Bradford partner
    const selectedVendor = vendors.find(v => v.id === formData.vendorId);
    const isBradfordVendor = selectedVendor?.isPartner === true;

    // Prepare specs object
    const hasSpecs = specs.productType !== 'OTHER' ||
      specs.paperType || specs.colors || specs.coating ||
      specs.finishing || specs.flatSize || specs.finishedSize || specs.paperLbs ||
      specs.artworkUrl;

    const specsData = hasSpecs ? {
      ...specs,
      pageCount: specs.pageCount ? parseInt(specs.pageCount as any) : null,
      paperLbs: specs.paperLbs ? parseFloat(specs.paperLbs as any) : null,
    } : null;

    onSubmit({
      ...formData,
      // Clear vendorId for multipart jobs (vendors assigned per component)
      vendorId: formData.jobType === 'multipart' ? undefined : formData.vendorId,
      sellPrice: parsedSellPrice,
      specs: specsData,
      lineItems: validLineItems,
      bradfordCut: !isBradfordVendor && bradfordCut > 0 ? bradfordCut : null,
      bradfordPaperLbs: specs.paperLbs ? parseFloat(specs.paperLbs as any) : null,
      pendingFiles: pendingFiles.length > 0 ? pendingFiles : undefined,
    });
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-2xl font-bold text-gray-900">
              {initialData ? 'Edit Job' : 'Create New Job'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <TabbedJobForm
              customers={customers}
              vendors={vendors}
              initialData={initialData}
              onFormDataChange={setFormState}
              uploadedFiles={uploadedFiles}
              pendingFiles={pendingFiles}
              setPendingFiles={setPendingFiles}
              isUploading={isUploading}
              uploadError={uploadError}
              onFileSelect={handleFileSelect}
              onDeleteFile={handleDeleteFile}
              parsedCustomer={parsedCustomer}
              onCustomerCreated={onCustomerCreated}
            />

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
                {initialData ? 'Update Job' : 'Create Job'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
