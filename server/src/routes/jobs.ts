import { Router } from 'express';
import {
  getAllJobs,
  getJob,
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
} from '../controllers/jobsController';

const router = Router();

// Job CRUD
router.get('/', getAllJobs);
router.get('/:id', getJob);
router.post('/', createJob);
router.post('/import', importBatchJobs);
router.post('/batch-delete', batchDeleteJobs);
router.post('/bulk-update-paper-source', bulkUpdatePaperSource);
router.put('/:id', updateJob);
router.patch('/:id', updateJob);  // Support both PUT and PATCH for job updates
router.delete('/:id', deleteJob);
router.patch('/:id/status', updateJobStatus);
router.patch('/:id/lock', toggleJobLock);
router.patch('/:id/bradford-ref', updateBradfordRef);
router.patch('/:id/bradford-payment', updateBradfordPayment);

// NEW: Payment tracking routes
router.patch('/:id/payments', updatePayments);
router.post('/batch-payment', batchUpdatePayments);

// PO management routes
router.get('/:jobId/pos', getJobPOs);
router.post('/:jobId/pos', createJobPO);
router.put('/pos/:poId', updatePO);
router.delete('/pos/:poId', deletePO);

export default router;
