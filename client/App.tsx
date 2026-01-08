import React, { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { jobsApi, entitiesApi, communicationsApi } from './lib/api';
import { SpecParser } from './components/SpecParser';
import { POUploader } from './components/POUploader';
import { EmailDraftModal } from './components/EmailDraftModal';
import { ParsedJobReviewModal } from './components/ParsedJobReviewModal';
import EntityEditModal from './components/EntityEditModal';
import EntityCreateModal from './components/EntityCreateModal';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import { DashboardView } from './components/DashboardView';
import { JobsView } from './components/JobsView';
import { Sidebar } from './components/Sidebar';
import { SearchModal } from './components/SearchModal';
import { EntitiesView } from './components/EntitiesView';
import { UnifiedFinancialsView } from './components/financials/UnifiedFinancialsView';
import { CommunicationsView } from './components/CommunicationsView';
import { VendorRFQView } from './components/VendorRFQView';
import { ProductionMeetingView } from './components/ProductionMeetingView';
import { JobFormModal } from './components/JobFormModal';
import { JobExcelImporter } from './components/JobExcelImporter';
import { JobImportPreviewModal } from './components/JobImportPreviewModal';
import { NewJobChoiceModal } from './components/NewJobChoiceModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { AppLoadingSkeleton } from './components/LoadingSkeleton';

type View = 'DASHBOARD' | 'JOBS' | 'PRODUCTION_MEETING' | 'CUSTOMERS' | 'VENDORS' | 'FINANCIALS' | 'PARTNER_STATS' | 'PAPER_INVENTORY' | 'ACCOUNTING' | 'COMMUNICATIONS' | 'VENDOR_RFQS';

// Impact Direct entity for PDF generation
const IMPACT_DIRECT_ENTITY = {
  id: 'impact-direct',
  name: 'IMPACT DIRECT PRINTING',
  contactPerson: 'Impact Direct Team',
  email: 'info@impactdirect.com',
  phone: '(555) 123-4567',
  address: '123 Business St\nCity, State 12345',
  notes: '',
  type: 'VENDOR' as const
};

function App() {
  const [currentView, setCurrentView] = useState<View>('PRODUCTION_MEETING');
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [pendingCommunicationsCount, setPendingCommunicationsCount] = useState(0);

  // AI Feature Modals
  const [showSpecParser, setShowSpecParser] = useState(false);
  const [showPOUploader, setShowPOUploader] = useState(false);
  const [showEmailDraft, setShowEmailDraft] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showJobFormModal, setShowJobFormModal] = useState(false);
  const [showNewJobChoiceModal, setShowNewJobChoiceModal] = useState(false);
  const [parsedJobData, setParsedJobData] = useState<any>(null);
  const [jobFormInitialData, setJobFormInitialData] = useState<any>(null);
  const [originalPOFile, setOriginalPOFile] = useState<File | null>(null);

  // Excel Import Modals
  const [showExcelImporter, setShowExcelImporter] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [parsedExcelJobs, setParsedExcelJobs] = useState<any[]>([]);

  // CRUD Modals
  const [editingJob, setEditingJob] = useState<any | null>(null);
  const [showEntityEditModal, setShowEntityEditModal] = useState(false);
  const [showEntityCreateModal, setShowEntityCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [entityToEdit, setEntityToEdit] = useState<any>(null);
  const [entityCreateType, setEntityCreateType] = useState<'customer' | 'vendor'>('customer');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'job' | 'customer' | 'vendor'; item: any } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // JobDrawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Search Modal state
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadPendingCount = async () => {
    try {
      const { count } = await communicationsApi.getPendingCount();
      setPendingCommunicationsCount(count);
    } catch (error) {
      console.error('Failed to load pending count:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [jobsResponse, customersData, vendorsData] = await Promise.all([
        jobsApi.getAll(),
        entitiesApi.getAll('CUSTOMER'),
        entitiesApi.getAll('VENDOR'),
      ]);
      // API now returns { jobs, counts } structure
      const jobsData = jobsResponse.jobs || jobsResponse;
      setJobs(jobsData);
      setCustomers(customersData);
      setVendors(vendorsData);
      // Also load pending communications count
      loadPendingCount();
      // Update selectedJob with fresh data if one is currently selected
      if (selectedJob) {
        const updatedJob = jobsData.find((j: any) => j.id === selectedJob.id);
        if (updatedJob) {
          setSelectedJob(updatedJob);
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJob = () => {
    setShowNewJobChoiceModal(true);
  };

  // Choice modal handlers
  const handleChooseUploadAndParse = () => {
    setShowNewJobChoiceModal(false);
    setShowPOUploader(true);
  };

  const handleChooseManualEntry = () => {
    setShowNewJobChoiceModal(false);
    setJobFormInitialData(null); // Clear any previous data
    setEditingJob(null);
    setShowJobFormModal(true);
  };

  const handleSubmitJobForm = async (jobData: any) => {
    try {
      // Extract pending files before creating job
      const { pendingFiles, pendingCustomerPOFile, ...jobDataWithoutFiles } = jobData;

      // Create the job
      const newJob = await jobsApi.create(jobDataWithoutFiles);
      setJobs([newJob, ...jobs]);
      setSelectedJob(newJob);

      let uploadedCount = 0;
      const failedFiles: string[] = [];

      // Upload customer PO file if provided (new simplified form)
      if (pendingCustomerPOFile) {
        try {
          const formData = new FormData();
          formData.append('file', pendingCustomerPOFile);
          formData.append('kind', 'CUSTOMER_PO');
          const response = await fetch(`/api/files/jobs/${newJob.id}/files`, {
            method: 'POST',
            body: formData,
          });
          if (!response.ok) throw new Error('Upload failed');
          uploadedCount++;
        } catch (error) {
          console.error('Failed to upload customer PO file:', error);
          failedFiles.push(pendingCustomerPOFile.name || 'Customer PO');
        }
      }

      // Upload any pending files after job creation (legacy support)
      if (pendingFiles && pendingFiles.length > 0) {
        for (const file of pendingFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('kind', 'ARTWORK');

          try {
            const response = await fetch(`/api/files/jobs/${newJob.id}/files`, {
              method: 'POST',
              body: formData,
            });
            if (!response.ok) throw new Error('Upload failed');
            uploadedCount++;
          } catch (error) {
            console.error('Failed to upload file:', file.name, error);
            failedFiles.push(file.name);
          }
        }
      }

      // Upload original PO file if this job was created from parsed PO
      if (originalPOFile && jobData._originalPOFile) {
        try {
          const formData = new FormData();
          formData.append('file', originalPOFile);
          formData.append('kind', 'PO_PDF');
          const response = await fetch(`/api/files/jobs/${newJob.id}/files`, {
            method: 'POST',
            body: formData,
          });
          if (!response.ok) throw new Error('Upload failed');
          uploadedCount++;
        } catch (error) {
          console.error('Failed to upload original PO file:', error);
          failedFiles.push(originalPOFile.name || 'Original PO');
        }
        // Clear the original PO file reference
        setOriginalPOFile(null);
      }

      // Show appropriate toast based on results
      if (failedFiles.length > 0 && uploadedCount > 0) {
        toast.warning(`Job created. ${uploadedCount} file(s) uploaded, but failed: ${failedFiles.join(', ')}`);
      } else if (failedFiles.length > 0) {
        toast.warning(`Job created, but file upload failed: ${failedFiles.join(', ')}`);
      } else if (uploadedCount > 0) {
        toast.success(`Job created with ${uploadedCount} file(s) uploaded`);
      } else {
        toast.success('Job created successfully');
      }
    } catch (error: any) {
      console.error('Failed to create job:', error);
      toast.error(error.message || 'Failed to create job');
    }
  };

  const handleUpdateJobStatus = async (jobId: string, status: string) => {
    try {
      const updated = await jobsApi.updateStatus(jobId, status);
      setJobs(jobs.map(j => j.id === jobId ? updated : j));
      if (selectedJob?.id === jobId) {
        setSelectedJob(updated);
      }
    } catch (error) {
      console.error('Failed to update job status:', error);
    }
  };

  // AI Feature Handlers
  const handleSpecsParsed = (parsedData: any) => {
    // Transform parsed data to form format for JobFormModal
    const formData = transformParsedDataToFormData(parsedData);
    setJobFormInitialData(formData);
    setEditingJob(null);
    setShowSpecParser(false);
    setShowJobFormModal(true);
  };

  const handlePOParsed = (parsedData: any, originalFile: File) => {
    // Store original PO file for upload after job creation
    setOriginalPOFile(originalFile);
    // Transform parsed data to form format for JobFormModal
    const formData = transformParsedDataToFormData(parsedData);
    setJobFormInitialData(formData);
    setEditingJob(null);
    setShowPOUploader(false);
    setShowJobFormModal(true);
  };

  // Helper to transform parsed AI data to form-compatible format
  const transformParsedDataToFormData = (parsedData: any) => {
    // Find Bradford vendor if size matches Bradford sizes
    const bradfordSizes = ['6 x 9', '6 x 11', '7 1/4 x 16 3/8', '8 1/2 x 17 1/2', '9 3/4 x 22 1/8', '9 3/4 x 26'];
    const finishedSize = parsedData.specs?.finishedSize || '';
    const isBradfordSize = bradfordSizes.some(size =>
      finishedSize.toLowerCase().replace(/\s+/g, '') === size.toLowerCase().replace(/\s+/g, '')
    );

    // Find Bradford vendor
    const bradfordVendor = isBradfordSize
      ? vendors.find(v => v.isPartner === true || v.name?.toLowerCase().includes('bradford'))
      : null;

    // Try to auto-match customer by name (case-insensitive partial match)
    const parsedCustomerName = parsedData.customerName || '';
    const matchedCustomer = parsedCustomerName
      ? customers.find(c =>
          c.name?.toLowerCase().includes(parsedCustomerName.toLowerCase()) ||
          parsedCustomerName.toLowerCase().includes(c.name?.toLowerCase())
        )
      : null;

    return {
      title: parsedData.title || 'New Print Job',
      customerId: matchedCustomer?.id || '', // Auto-select if matched
      vendorId: bradfordVendor?.id || '',
      // Auto-set routing based on size match
      routingType: isBradfordSize ? 'BRADFORD_JD' : 'THIRD_PARTY_VENDOR',
      // Pass parsed customer info for inline creation if no match
      parsedCustomer: !matchedCustomer && parsedCustomerName ? {
        name: parsedCustomerName,
        contactName: parsedData.contactPerson || '',
        email: parsedData.contactEmail || '',
        phone: parsedData.contactPhone || '',
        address: parsedData.customerAddress || '',
      } : null,
      customerPONumber: parsedData.customerPONumber || '',
      dueDate: parsedData.dueDate || '',
      status: 'ACTIVE',
      specs: {
        productType: parsedData.specs?.productType || 'OTHER',
        paperType: parsedData.specs?.paperType || '',
        paperWeight: parsedData.specs?.paperWeight || '',
        colors: parsedData.specs?.colors || '',
        coating: parsedData.specs?.coating || '',
        finishing: parsedData.specs?.finishing || '',
        flatSize: parsedData.specs?.flatSize || '',
        finishedSize: finishedSize,
        pageCount: parsedData.specs?.pageCount || '',
        bindingStyle: parsedData.specs?.bindingStyle || '',
        coverType: parsedData.specs?.coverType || '',
        coverPaperType: parsedData.specs?.coverPaperType || '',
        // Additional print specs
        folds: parsedData.specs?.folds || '',
        perforations: parsedData.specs?.perforations || '',
        dieCut: parsedData.specs?.dieCut || '',
        bleed: parsedData.specs?.bleed || '',
        proofType: parsedData.specs?.proofType || '',
        // Ship-to information
        shipToName: parsedData.shipToName || '',
        shipToAddress: parsedData.shipToAddress || '',
        shipVia: parsedData.shipVia || '',
        // All parsed notes/instructions - CRITICAL for vendor PO
        specialInstructions: parsedData.specs?.specialInstructions || parsedData.specialInstructions || '',
        artworkInstructions: parsedData.artworkInstructions || '',
        packingInstructions: parsedData.packingInstructions || '',
        labelingInstructions: parsedData.labelingInstructions || '',
        additionalNotes: parsedData.notes || '',
        artworkUrl: '',
        // ===== PHASE 15: Enhanced Universal PO Parsing =====
        // Multiple Product Versions
        versions: parsedData.versions || [],
        // Language breakdown
        languageBreakdown: parsedData.languageBreakdown || [],
        totalVersionQuantity: parsedData.totalVersionQuantity || 0,
        // Timeline/Milestones
        timeline: parsedData.timeline || {},
        // Mailing details
        mailing: parsedData.mailing || {},
        // Responsibility matrix
        responsibilities: parsedData.responsibilities || { vendorTasks: [], customerTasks: [] },
        // Special handling
        specialHandling: parsedData.specialHandling || {},
        // Payment terms
        paymentTerms: parsedData.paymentTerms || '',
        fob: parsedData.fob || '',
        accountNumber: parsedData.accountNumber || '',
      },
      lineItems: parsedData.lineItems?.length > 0
        ? parsedData.lineItems.map((item: any) => ({
            description: item.description || '',
            quantity: item.quantity || 0,
            unitCost: item.unitCost || 0,
            markupPercent: item.markupPercent || 20,
            unitPrice: item.unitPrice || item.pricePerM || 0,
          }))
        : [{ description: '', quantity: 0, unitCost: 0, markupPercent: 20, unitPrice: 0 }],
      // CRITICAL: Include ALL text from PO in notes for vendor PO
      notes: [
        parsedData.rawDescriptionText,  // Full PO text from AI extraction
        parsedData.notes,
        parsedData.specs?.specialInstructions,
      ].filter(Boolean).join('\n\n---\n\n'),
      // Flag that this is from parsed data (for potential Bradford auto-detection)
      _isParsedData: true,
      // Store original file reference for upload after job creation
      _originalPOFile: true,
    };
  };

  const handleCreateJobFromParsed = async (jobData: any) => {
    try {
      const newJob = await jobsApi.create(jobData);
      setJobs([newJob, ...jobs]);
      setSelectedJob(newJob);
      setShowReviewModal(false);
      setParsedJobData(null);
    } catch (error) {
      console.error('Failed to create job:', error);
    }
  };

  const handleSaveDraftFromParsed = async (jobData: any) => {
    try {
      const newJob = await jobsApi.create({ ...jobData, status: 'ACTIVE' });
      setJobs([newJob, ...jobs]);
      setSelectedJob(newJob);
      setShowReviewModal(false);
      setParsedJobData(null);
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  };

  // Excel Import Handlers
  const handleExcelParsed = (parsedJobs: any[]) => {
    setParsedExcelJobs(parsedJobs);
    setShowExcelImporter(false);
    setShowImportPreview(true);
  };

  const handleImportJobs = async (jobs: any[], entityMappings: any) => {
    try {
      setIsSaving(true);
      const result = await jobsApi.importBatch(jobs, entityMappings);
      await loadData(); // Refresh all data - needed for batch import
      setShowImportPreview(false);
      setParsedExcelJobs([]);
      toast.success(`Successfully imported ${result.created} jobs!`);
    } catch (error) {
      console.error('Failed to import jobs:', error);
      toast.error('Failed to import jobs. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // CRUD Handlers
  const handleEditJob = (job: any) => {
    setEditingJob(job);
    setShowJobFormModal(true);
  };

  const handleUpdateJob = async (jobId: string, jobData: any, fromModal = false) => {
    try {
      setIsSaving(true);
      const updated = await jobsApi.update(jobId, jobData);
      setJobs(jobs.map(j => j.id === jobId ? updated : j));
      if (selectedJob?.id === jobId) {
        setSelectedJob(updated);
      }
      // Only close modal if edit came from modal
      if (fromModal) {
        setShowJobFormModal(false);
        setEditingJob(null);
        toast.success('Job updated successfully');
      }
    } catch (error) {
      console.error('Failed to update job:', error);
      if (fromModal) {
        toast.error('Failed to update job. Please try again.');
      }
      throw error; // Re-throw for inline edits to handle
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteJob = (job: any) => {
    setDeleteTarget({ type: 'job', item: job });
    setShowDeleteModal(true);
  };

  // Copy Job - opens form with pre-filled data
  const handleCopyJob = (job: any) => {
    // Create a copy of the job data, clearing transactional/unique fields
    const copyData = {
      title: `Copy of ${job.title || ''}`,
      customerId: job.Company?.id || job.customerId || '',
      vendorId: job.Vendor?.id || job.vendorId || '',
      // Keep specs and pricing
      specs: job.specs || {},
      quantity: job.quantity || 0,
      sellPrice: job.sellPrice || 0,
      paperCostCPM: job.paperCostCPM || 0,
      notes: job.notes || '',
      // Clear transactional data
      customerPONumber: '',
      status: 'ACTIVE',
      // Dates should be fresh
      dueDate: '',
      mailDate: job.mailDate || '',
      inHomesDate: job.inHomesDate || '',
    };

    setJobFormInitialData(copyData);
    setEditingJob(null);
    setShowJobFormModal(true);
    toast.info('Creating copy of job - review and save');
  };

  const handleCreateEntity = (type: 'customer' | 'vendor') => {
    setEntityCreateType(type);
    setShowEntityCreateModal(true);
  };

  const handleSubmitNewEntity = async (entityData: any) => {
    try {
      setIsSaving(true);
      const newEntity = await entitiesApi.create({
        type: entityCreateType === 'customer' ? 'CUSTOMER' : 'VENDOR',
        ...entityData
      });

      if (entityCreateType === 'customer') {
        setCustomers([newEntity, ...customers]);
      } else {
        setVendors([newEntity, ...vendors]);
      }

      setShowEntityCreateModal(false);
      toast.success(`${entityCreateType === 'customer' ? 'Customer' : 'Vendor'} created successfully`);
    } catch (error) {
      console.error('Failed to create entity:', error);
      toast.error('Failed to create entity. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditEntity = (entity: any) => {
    setEntityToEdit(entity);
    setShowEntityEditModal(true);
  };

  const handleUpdateEntity = async (entityId: string, entityData: any) => {
    try {
      setIsSaving(true);
      const updated = await entitiesApi.update(entityId, entityData);

      if (entityToEdit?.type === 'CUSTOMER') {
        setCustomers(customers.map(c => c.id === entityId ? updated : c));
      } else {
        setVendors(vendors.map(v => v.id === entityId ? updated : v));
      }

      setShowEntityEditModal(false);
      setEntityToEdit(null);
      toast.success(`${entityToEdit?.type === 'CUSTOMER' ? 'Customer' : 'Vendor'} updated successfully`);
    } catch (error) {
      console.error('Failed to update entity:', error);
      toast.error('Failed to update entity. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEntity = (entity: any) => {
    const type = entity.type === 'CUSTOMER' ? 'customer' : 'vendor';
    setDeleteTarget({ type, item: entity });
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);

      if (deleteTarget.type === 'job') {
        await jobsApi.delete(deleteTarget.item.id);
        setJobs(jobs.filter(j => j.id !== deleteTarget.item.id));
        if (selectedJob?.id === deleteTarget.item.id) {
          setSelectedJob(null);
        }
      } else if (deleteTarget.type === 'customer') {
        await entitiesApi.delete(deleteTarget.item.id);
        setCustomers(customers.filter(c => c.id !== deleteTarget.item.id));
      } else if (deleteTarget.type === 'vendor') {
        await entitiesApi.delete(deleteTarget.item.id);
        setVendors(vendors.filter(v => v.id !== deleteTarget.item.id));
      }

      setShowDeleteModal(false);
      setDeleteTarget(null);
      toast.success(`${deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1)} deleted successfully`);
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Failed to delete. This item may be in use by other records.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Keyboard shortcuts - placed after all handlers are defined
  useKeyboardShortcuts({
    onShowSearch: () => setShowSearchModal(true),
    onViewChange: setCurrentView,
    onCreateJob: handleCreateJob,
    enabled: !showSpecParser && !showPOUploader && !showEmailDraft && !showReviewModal && !showJobFormModal && !showEntityEditModal && !showEntityCreateModal && !showDeleteModal && !showSearchModal && !showExcelImporter && !showImportPreview,
  });

  if (loading) {
    return <AppLoadingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        jobsCount={jobs.length}
        customersCount={customers.length}
        vendorsCount={vendors.length}
        partnerJobsCount={jobs.filter(j => j.vendor?.isPartner).length}
        pendingCommunicationsCount={pendingCommunicationsCount}
        onShowSpecParser={() => setShowSpecParser(true)}
        onCreateJob={handleCreateJob}
        onShowSearch={() => setShowSearchModal(true)}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {currentView === 'DASHBOARD' && (
            <DashboardView
              jobs={jobs}
              onCreateJob={() => {
                setCurrentView('JOBS');
                handleCreateJob();
              }}
              onShowSpecParser={() => setShowSpecParser(true)}
              onShowPOUploader={() => setShowPOUploader(true)}
              onViewAllJobs={() => setCurrentView('JOBS')}
            />
          )}

          {currentView === 'JOBS' && (
            <JobsView
              jobs={jobs}
              customers={customers}
              vendors={vendors}
              selectedJob={selectedJob}
              onSelectJob={setSelectedJob}
              onCreateJob={handleCreateJob}
              onEditJob={handleEditJob}
              onDeleteJob={handleDeleteJob}
              onCopyJob={handleCopyJob}
              onUpdateStatus={handleUpdateJobStatus}
              onUpdateJob={handleUpdateJob}
              onRefresh={loadData}
              onShowSpecParser={() => setShowSpecParser(true)}
              onShowPOUploader={() => setShowPOUploader(true)}
              onShowEmailDraft={() => setShowEmailDraft(true)}
              onShowExcelImporter={() => setShowExcelImporter(true)}
            />
          )}

          {currentView === 'PRODUCTION_MEETING' && (
            <ProductionMeetingView
              onSelectJob={(jobId) => {
                const job = jobs.find(j => j.id === jobId);
                if (job) {
                  setSelectedJob(job);
                  setCurrentView('JOBS');
                }
              }}
            />
          )}

          {currentView === 'CUSTOMERS' && (
            <EntitiesView
              entities={customers}
              type="CUSTOMER"
              jobs={jobs}
              onCreateEntity={handleCreateEntity}
              onEditEntity={handleEditEntity}
              onDeleteEntity={handleDeleteEntity}
              onRefresh={loadData}
              onJobClick={(job) => {
                setSelectedJob(job);
                setCurrentView('JOBS');
              }}
            />
          )}

          {currentView === 'VENDORS' && (
            <EntitiesView
              entities={vendors}
              type="VENDOR"
              jobs={jobs}
              onCreateEntity={handleCreateEntity}
              onEditEntity={handleEditEntity}
              onDeleteEntity={handleDeleteEntity}
              onRefresh={loadData}
              onJobClick={(job) => {
                setSelectedJob(job);
                setCurrentView('JOBS');
              }}
            />
          )}

          {(currentView === 'FINANCIALS' || currentView === 'PARTNER_STATS' || currentView === 'PAPER_INVENTORY' || currentView === 'ACCOUNTING') && (
            <UnifiedFinancialsView
              jobs={jobs.filter(j => j.vendor?.isPartner)}
              allJobs={jobs}
              customers={customers}
              vendors={vendors}
              onUpdateStatus={handleUpdateJobStatus}
              onRefresh={loadData}
              onShowEmailDraft={(job) => {
                setSelectedJob(job);
                setShowEmailDraft(true);
              }}
            />
          )}

          {currentView === 'COMMUNICATIONS' && (
            <CommunicationsView
              onGoToJob={(jobId) => {
                const job = jobs.find(j => j.id === jobId);
                if (job) {
                  setSelectedJob(job);
                  setCurrentView('JOBS');
                }
              }}
              onRefreshCount={loadPendingCount}
            />
          )}

          {currentView === 'VENDOR_RFQS' && <VendorRFQView />}
        </div>
      </div>

      {/* AI Feature Modals */}
      {showSpecParser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <SpecParser
            onParsed={handleSpecsParsed}
            onCancel={() => setShowSpecParser(false)}
          />
        </div>
      )}

      {showPOUploader && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <POUploader
            onParsed={handlePOParsed}
            onCancel={() => setShowPOUploader(false)}
          />
        </div>
      )}

      {showEmailDraft && selectedJob && (
        <EmailDraftModal
          job={selectedJob}
          onClose={() => setShowEmailDraft(false)}
        />
      )}

      {showReviewModal && parsedJobData && (
        <ParsedJobReviewModal
          parsedData={parsedJobData}
          customers={customers}
          vendors={vendors}
          onCancel={() => {
            setShowReviewModal(false);
            setParsedJobData(null);
          }}
          onCreate={handleCreateJobFromParsed}
          onSaveDraft={handleSaveDraftFromParsed}
        />
      )}

      {/* New Job Choice Modal */}
      <NewJobChoiceModal
        isOpen={showNewJobChoiceModal}
        onClose={() => setShowNewJobChoiceModal(false)}
        onChooseUpload={handleChooseUploadAndParse}
        onChooseManual={handleChooseManualEntry}
      />

      {/* Job Form Modal (Create and Edit) */}
      <JobFormModal
        isOpen={showJobFormModal}
        onClose={() => {
          setShowJobFormModal(false);
          setEditingJob(null);
          setJobFormInitialData(null);
        }}
        onSubmit={async (jobData) => {
          if (editingJob) {
            await handleUpdateJob(editingJob.id, jobData, true); // fromModal = true
          } else {
            await handleSubmitJobForm(jobData);
            setShowJobFormModal(false);
            setJobFormInitialData(null);
          }
        }}
        customers={customers}
        vendors={vendors}
        initialData={editingJob || jobFormInitialData}
        onCustomerCreated={(newCustomer) => {
          // Add newly created customer to the list
          setCustomers((prev: any[]) => [...prev, newCustomer]);
        }}
      />

      {/* CRUD Modals */}
      <EntityCreateModal
        isOpen={showEntityCreateModal}
        onClose={() => setShowEntityCreateModal(false)}
        onSubmit={handleSubmitNewEntity}
        entityType={entityCreateType}
        isSaving={isSaving}
      />

      <EntityEditModal
        isOpen={showEntityEditModal}
        onClose={() => {
          setShowEntityEditModal(false);
          setEntityToEdit(null);
        }}
        onSubmit={handleUpdateEntity}
        entity={entityToEdit}
        isSaving={isSaving}
      />

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
        itemType={deleteTarget?.type || 'job'}
        itemName={deleteTarget?.item?.title || deleteTarget?.item?.name || ''}
        warningMessage={
          deleteTarget?.type === 'customer' || deleteTarget?.type === 'vendor'
            ? `This ${deleteTarget.type} may have associated jobs.`
            : undefined
        }
        isDeleting={isDeleting}
      />

      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        jobs={jobs}
        customers={customers}
        vendors={vendors}
        onSelectJob={(job) => {
          setCurrentView('JOBS');
          setSelectedJob(job);
          setIsDrawerOpen(true);
        }}
        onSelectCustomer={(customer) => {
          setCurrentView('CUSTOMERS');
          handleEditEntity(customer);
        }}
        onSelectVendor={(vendor) => {
          setCurrentView('VENDORS');
          handleEditEntity(vendor);
        }}
      />

      {/* Excel Import Modals */}
      <JobExcelImporter
        isOpen={showExcelImporter}
        onClose={() => setShowExcelImporter(false)}
        onParsed={handleExcelParsed}
        customers={customers}
        vendors={vendors}
      />

      <JobImportPreviewModal
        isOpen={showImportPreview}
        onClose={() => {
          setShowImportPreview(false);
          setParsedExcelJobs([]);
        }}
        onImport={handleImportJobs}
        parsedJobs={parsedExcelJobs}
        existingCustomers={customers}
        existingVendors={vendors}
      />

      {/* Toast Notifications */}
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

export default App;
