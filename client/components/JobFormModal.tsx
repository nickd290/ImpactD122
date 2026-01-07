import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SimpleJobForm, SimpleJobFormData, defaultSimpleJobFormData, Customer, Vendor } from './job-form/SimpleJobForm';

interface JobFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (jobData: any) => void;
  customers: Customer[];
  vendors: Vendor[];
  initialData?: any;
  onCustomerCreated?: (newCustomer: Customer) => void;
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
  // Form data state
  const [formData, setFormData] = useState<SimpleJobFormData>(defaultSimpleJobFormData);

  // Customer PO file state
  const [pendingPOFile, setPendingPOFile] = useState<File | null>(null);
  const [uploadedPOFile, setUploadedPOFile] = useState<any | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // Editing existing job
        setFormData({
          title: initialData.title || '',
          customerId: initialData.customerId || '',
          vendorId: initialData.vendorId || '',
          routingType: initialData.routingType || 'THIRD_PARTY_VENDOR',
          customerPONumber: initialData.customerPONumber || '',
          description: initialData.description || '',
          sellPrice: initialData.sellPrice?.toString() || '',
          dueDate: initialData.dueDate ? new Date(initialData.dueDate).toISOString().split('T')[0] : '',
        });
        // Fetch existing customer PO file
        fetchExistingPOFile(initialData.id);
      } else {
        // New job - reset form
        setFormData(defaultSimpleJobFormData);
        setUploadedPOFile(null);
      }
      setPendingPOFile(null);
      setUploadError('');
    }
  }, [isOpen, initialData]);

  // Fetch existing customer PO file for a job
  const fetchExistingPOFile = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/files`);
      if (response.ok) {
        const files = await response.json();
        const customerPO = files.find((f: any) => f.kind === 'CUSTOMER_PO');
        setUploadedPOFile(customerPO || null);
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  };

  // Delete uploaded PO file
  const handleDeletePOFile = async () => {
    if (uploadedPOFile && initialData?.id) {
      try {
        const response = await fetch(`/api/jobs/${initialData.id}/files/${uploadedPOFile.id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          setUploadedPOFile(null);
          toast.success('File deleted');
        } else {
          toast.error('Failed to delete file');
        }
      } catch (error) {
        console.error('Failed to delete file:', error);
        toast.error('Failed to delete file');
      }
    } else if (pendingPOFile) {
      setPendingPOFile(null);
      toast.success('File removed');
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validation
    if (!formData.title.trim()) {
      toast.error('Please enter a job title');
      setIsSubmitting(false);
      return;
    }

    if (!formData.customerId) {
      toast.error('Please select a customer');
      setIsSubmitting(false);
      return;
    }

    if (!formData.vendorId) {
      toast.error('Please select a vendor');
      setIsSubmitting(false);
      return;
    }

    const parsedSellPrice = parseFloat(formData.sellPrice);
    if (!formData.sellPrice || isNaN(parsedSellPrice) || parsedSellPrice <= 0) {
      toast.error('Please enter a valid sell price greater than $0');
      setIsSubmitting(false);
      return;
    }

    // Get vendor info for routing calculation
    const selectedVendor = vendors.find(v => v.id === formData.vendorId);

    // Build submission data
    const submitData = {
      title: formData.title.trim(),
      customerId: formData.customerId,
      vendorId: formData.vendorId,
      routingType: formData.routingType,
      customerPONumber: formData.customerPONumber.trim() || null,
      description: formData.description.trim() || null,
      sellPrice: parsedSellPrice,
      dueDate: formData.dueDate || null,
      // Include pending PO file for upload after job creation
      pendingCustomerPOFile: pendingPOFile,
      // For editing: flag if we should upload a new file
      hasExistingPOFile: !!uploadedPOFile,
    };

    onSubmit(submitData);
    setIsSubmitting(false);
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
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
            <SimpleJobForm
              formData={formData}
              setFormData={setFormData}
              customers={customers}
              vendors={vendors}
              pendingPOFile={pendingPOFile}
              setPendingPOFile={setPendingPOFile}
              uploadedPOFile={uploadedPOFile}
              onDeletePOFile={handleDeletePOFile}
              isUploading={isUploading}
              uploadError={uploadError}
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
                disabled={isUploading || isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {(isUploading || isSubmitting) && <Loader2 className="w-4 h-4 animate-spin" />}
                {initialData ? 'Update Job' : 'Create Job'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
