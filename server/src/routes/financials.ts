import { Router } from 'express';
import {
  getFinancialSummary,
  getFinancialsByCustomer,
  getFinancialsByVendor,
} from '../controllers/financialsController';

const router = Router();

router.get('/summary', getFinancialSummary);
router.get('/by-customer', getFinancialsByCustomer);
router.get('/by-vendor', getFinancialsByVendor);

export default router;
