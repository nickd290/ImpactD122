import React, { useState, useEffect } from 'react';
import { jobsApi, entitiesApi } from './lib/api';
import { SpecParser } from './components/SpecParser';
import { POUploader } from './components/POUploader';
import { EmailDraftModal } from './components/EmailDraftModal';
import { ParsedJobReviewModal } from './components/ParsedJobReviewModal';
import JobEditModal from './components/JobEditModal';
import EntityEditModal from './components/EntityEditModal';
import EntityCreateModal from './components/EntityCreateModal';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import { DashboardView } from './components/DashboardView';
import { JobsView } from './components/JobsView';
import { Sidebar } from './components/Sidebar';
import { SearchModal } from './components/SearchModal';
import { EntitiesView } from './components/EntitiesView';
import { BradfordStatsView } from './components/BradfordStatsView';
import { FinancialsView } from './components/FinancialsView';
import { JobFormModal } from './components/JobFormModal';
import { JobExcelImporter } from './components/JobExcelImporter';
import { JobImportPreviewModal } from './components/JobImportPreviewModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

type View = 'DASHBOARD' | 'JOBS' | 'CUSTOMERS' | 'VENDORS' | 'FINANCIALS' | 'PARTNER_STATS';

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
  const [currentView, setCurrentView] = useState<View>('DASHBOARD');
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);

  // AI Feature Modals
  const [showSpecParser, setShowSpecParser] = useState(false);
  const [showPOUploader, setShowPOUploader] = useState(false);
  const [showEmailDraft, setShowEmailDraft] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showJobFormModal, setShowJobFormModal] = useState(false);
  const [parsedJobData, setParsedJobData] = useState<any>(null);

  // Excel Import Modals
  const [showExcelImporter, setShowExcelImporter] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [parsedExcelJobs, setParsedExcelJobs] = useState<any[]>([]);

  // CRUD Modals
  const [showJobEditModal, setShowJobEditModal] = useState(false);
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

  const loadData = async () => {
    try {
      setLoading(true);
      const [jobsData, customersData, vendorsData] = await Promise.all([
        jobsApi.getAll(),
        entitiesApi.getAll('CUSTOMER'),
        entitiesApi.getAll('VENDOR'),
      ]);
      setJobs(jobsData);
      setCustomers(customersData);
      setVendors(vendorsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJob = () => {
    setShowJobFormModal(true);
  };

  const handleSubmitJobForm = async (jobData: any) => {
    try {
      const newJob = await jobsApi.create(jobData);
      setJobs([newJob, ...jobs]);
      setSelectedJob(newJob);
    } catch (error) {
      console.error('Failed to create job:', error);
      alert('Failed to create job. Please try again.');
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
    setParsedJobData(parsedData);
    setShowSpecParser(false);
    setShowReviewModal(true);
  };

  const handlePOParsed = (parsedData: any) => {
    setParsedJobData(parsedData);
    setShowPOUploader(false);
    setShowReviewModal(true);
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
      const newJob = await jobsApi.create({ ...jobData, status: 'DRAFT' });
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
      await loadData(); // Refresh all data
      setShowImportPreview(false);
      setParsedExcelJobs([]);
      alert(`Successfully imported ${result.created} jobs!`);
    } catch (error) {
      console.error('Failed to import jobs:', error);
      alert('Failed to import jobs. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // CRUD Handlers
  const handleEditJob = (job: any) => {
    setSelectedJob(job);
    setShowJobEditModal(true);
  };

  const handleUpdateJob = async (jobId: string, jobData: any) => {
    try {
      setIsSaving(true);
      const updated = await jobsApi.update(jobId, jobData);
      setJobs(jobs.map(j => j.id === jobId ? updated : j));
      if (selectedJob?.id === jobId) {
        setSelectedJob(updated);
      }
      setShowJobEditModal(false);
      await loadData(); // Refresh to get complete data with relations
    } catch (error) {
      console.error('Failed to update job:', error);
      alert('Failed to update job. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteJob = (job: any) => {
    setDeleteTarget({ type: 'job', item: job });
    setShowDeleteModal(true);
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
      await loadData(); // Refresh data
    } catch (error) {
      console.error('Failed to create entity:', error);
      alert('Failed to create entity. Please try again.');
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
      await loadData(); // Refresh data
    } catch (error) {
      console.error('Failed to update entity:', error);
      alert('Failed to update entity. Please try again.');
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
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete. This item may be in use by other records.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Keyboard shortcuts - placed after all handlers are defined
  useKeyboardShortcuts({
    onShowSearch: () => setShowSearchModal(true),
    onViewChange: setCurrentView,
    onCreateJob: handleCreateJob,
    enabled: !showSpecParser && !showPOUploader && !showEmailDraft && !showReviewModal && !showJobEditModal && !showEntityEditModal && !showEntityCreateModal && !showDeleteModal && !showSearchModal && !showExcelImporter && !showImportPreview,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-impact-red mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
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
        onShowSpecParser={() => setShowSpecParser(true)}
        onShowPOUploader={() => setShowPOUploader(true)}
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
              onUpdateStatus={handleUpdateJobStatus}
              onUpdateJob={handleUpdateJob}
              onRefresh={loadData}
              onShowSpecParser={() => setShowSpecParser(true)}
              onShowPOUploader={() => setShowPOUploader(true)}
              onShowEmailDraft={() => setShowEmailDraft(true)}
              onShowExcelImporter={() => setShowExcelImporter(true)}
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

          {currentView === 'FINANCIALS' && <FinancialsView />}

          {currentView === 'PARTNER_STATS' && (
            <BradfordStatsView
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

      {/* Job Form Modal */}
      <JobFormModal
        isOpen={showJobFormModal}
        onClose={() => setShowJobFormModal(false)}
        onSubmit={handleSubmitJobForm}
        customers={customers}
        vendors={vendors}
      />

      {/* CRUD Modals */}
      <JobEditModal
        isOpen={showJobEditModal}
        onClose={() => setShowJobEditModal(false)}
        onSubmit={handleUpdateJob}
        job={selectedJob}
        customers={customers}
        vendors={vendors}
        isSaving={isSaving}
      />

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
    </div>
  );
}

export default App;
