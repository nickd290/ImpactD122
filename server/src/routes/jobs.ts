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
  importBatchJobs,
  batchDeleteJobs,
  toggleDuplicateFlag,
  detectDuplicates,
} from '../controllers/jobsController';

const router = Router();

router.get('/', getAllJobs);
router.get('/detect-duplicates', detectDuplicates);
router.get('/:id', getJob);
router.post('/', createJob);
router.post('/import', importBatchJobs);
router.post('/batch-delete', batchDeleteJobs);
router.put('/:id', updateJob);
router.delete('/:id', deleteJob);
router.patch('/:id/status', updateJobStatus);
router.patch('/:id/lock', toggleJobLock);
router.patch('/:id/bradford-ref', updateBradfordRef);
router.patch('/:id/duplicate', toggleDuplicateFlag);

export default router;
