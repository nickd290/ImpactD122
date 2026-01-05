import { Router } from 'express';
import {
  getAllJobs,
  getJob,
  getJobsWorkflowView,
  createJob,
  updateJob,
  deleteJob,
  updateJobStatus,
  toggleJobLock,
  updateBradfordRef,
  updateBradfordPayment,
  importBatchJobs,
  batchDeleteJobs,
  bulkUpdatePaperSource,
  // NEW: Payment tracking
  updatePayments,
  batchUpdatePayments,
  // PO management
  getJobPOs,
  createJobPO,
  updatePO,
  deletePO,
  // Multi-step payment workflow (4-step process)
  markInvoiceSent,
  markCustomerPaid,
  markVendorPaid,
  markImpactToBradfordPaid,
  sendJDInvoice,
  downloadJDInvoicePDF,
  markJDPaid,
  bulkGenerateJDInvoices,
  // Invoice status
  updateInvoiceStatus,
  // QC overrides
  updateQCOverrides,
  // Workflow status override
  updateWorkflowStatus,
  // Active tasks (production meeting action items)
  setJobTask,
  completeJobTask,
  // Email webhook
  createFromEmail,
  // Job Readiness & QC
  getJobReadiness,
  updateJobQcFlags,
  recalculateReadiness,
  // Job Components
  getJobComponents,
  createJobComponent,
  updateJobComponent,
  deleteJobComponent,
  // Mailing type detection
  detectMailingTypeEndpoint,
} from '../controllers/jobsController';
import {
  // Change Orders
  listChangeOrders,
  getChangeOrder,
  createChangeOrder,
  updateChangeOrder,
  deleteChangeOrder,
  submitForApproval,
  approveChangeOrder,
  rejectChangeOrder,
  getEffectiveJobState,
} from '../controllers/changeOrderController';

const router = Router();

// Job CRUD
router.get('/', getAllJobs);
router.get('/workflow-view', getJobsWorkflowView); // Must be before /:id
router.get('/:id', getJob);
router.post('/', createJob);
router.post('/from-email', createFromEmail); // Webhook for n8n email automation
router.post('/detect-mailing-type', detectMailingTypeEndpoint); // Mailing type detection preview
router.post('/import', importBatchJobs);
router.post('/batch-delete', batchDeleteJobs);
router.post('/bulk-update-paper-source', bulkUpdatePaperSource);
router.put('/:id', updateJob);
router.delete('/:id', deleteJob);
router.patch('/:id/status', updateJobStatus);
router.patch('/:id/lock', toggleJobLock);
router.patch('/:id/bradford-ref', updateBradfordRef);
router.patch('/:id/bradford-payment', updateBradfordPayment);
router.patch('/:id/qc-overrides', updateQCOverrides);
router.patch('/:id/workflow-status', updateWorkflowStatus);

// Active task routes (production meeting action items)
router.patch('/:id/task', setJobTask);
router.patch('/:id/task/complete', completeJobTask);

// NEW: Payment tracking routes
router.patch('/:id/payments', updatePayments);
router.post('/batch-payment', batchUpdatePayments);

// Multi-step payment workflow (4-step process)
// Invoice sent (manual tracking)
router.patch('/:id/invoice-sent', markInvoiceSent);
// Step 1: Customer → Impact (Financials tab)
router.patch('/:id/customer-paid', markCustomerPaid);
// Vendor payment (for non-Bradford vendors)
router.patch('/:id/vendor-paid', markVendorPaid);
// Step 2: Impact → Bradford (Bradford Stats tab) - triggers JD Invoice
router.patch('/:id/bradford-paid', markImpactToBradfordPaid);
// Step 3: Send JD Invoice manually (can resend)
router.post('/:id/send-jd-invoice', sendJDInvoice);
// Download JD Invoice PDF
router.get('/:id/jd-invoice-pdf', downloadJDInvoicePDF);
// Bulk generate JD invoice numbers (one-time operation)
router.post('/bulk-generate-jd-invoices', bulkGenerateJDInvoices);
// Step 4: Bradford → JD Paid (Bradford Stats tab)
router.patch('/:id/jd-paid', markJDPaid);

// PO management routes
router.get('/:jobId/pos', getJobPOs);
router.post('/:jobId/pos', createJobPO);
router.put('/:jobId/pos/:poId', updatePO);
router.delete('/:jobId/pos/:poId', deletePO);

// Invoice status
router.patch('/invoices/:invoiceId/status', updateInvoiceStatus);

// Job Readiness & QC routes
router.get('/:id/readiness', getJobReadiness);
router.patch('/:id/qc', updateJobQcFlags);
router.post('/:id/readiness/recalculate', recalculateReadiness);

// Job Component routes
router.get('/:id/components', getJobComponents);
router.post('/:id/components', createJobComponent);
router.put('/:id/components/:componentId', updateJobComponent);
router.delete('/:id/components/:componentId', deleteJobComponent);

// Change Order routes
router.get('/:jobId/change-orders', listChangeOrders);
router.post('/:jobId/change-orders', createChangeOrder);
router.get('/:jobId/effective-state', getEffectiveJobState);
// Non-nested change order routes (for operations on specific COs)
router.get('/change-orders/:id', getChangeOrder);
router.patch('/change-orders/:id', updateChangeOrder);
router.delete('/change-orders/:id', deleteChangeOrder);
router.post('/change-orders/:id/submit', submitForApproval);
router.post('/change-orders/:id/approve', approveChangeOrder);
router.post('/change-orders/:id/reject', rejectChangeOrder);

export default router;
