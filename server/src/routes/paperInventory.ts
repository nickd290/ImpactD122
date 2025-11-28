import { Router } from 'express';
import {
  getAllPaperInventory,
  getPaperInventory,
  createPaperInventory,
  updatePaperInventory,
  deletePaperInventory,
  adjustInventory,
  getTransactionHistory,
  getInventorySummary,
  applyJobUsage,
} from '../controllers/paperInventoryController';

const router = Router();

// Summary endpoint (before :id to avoid conflict)
router.get('/summary', getInventorySummary);

// Apply job usage
router.post('/apply-job-usage', applyJobUsage);

// CRUD operations
router.get('/', getAllPaperInventory);
router.get('/:id', getPaperInventory);
router.post('/', createPaperInventory);
router.put('/:id', updatePaperInventory);
router.delete('/:id', deletePaperInventory);

// Inventory adjustments
router.post('/:id/adjust', adjustInventory);
router.get('/:id/transactions', getTransactionHistory);

export default router;
