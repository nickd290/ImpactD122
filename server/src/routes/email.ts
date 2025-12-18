import { Router } from 'express';
import {
  emailInvoice,
  emailPO,
  emailArtworkNotification,
  emailCustomerConfirmation,
  emailShipmentTracking,
  emailVendorPOWithPortal,
  sendProofToCustomer,
} from '../controllers/emailController';

const router = Router();

// Email invoice to customer
router.post('/invoice/:jobId', emailInvoice);

// Email PO to vendor
router.post('/po/:poId', emailPO);

// Email artwork notification to vendor
router.post('/artwork/:jobId', emailArtworkNotification);

// Email customer order confirmation
router.post('/confirmation/:jobId', emailCustomerConfirmation);

// Email shipment tracking notification
router.post('/tracking/:jobId/:shipmentId', emailShipmentTracking);

// Email vendor PO with portal link
router.post('/po-portal/:jobId/:poId', emailVendorPOWithPortal);

// Send proof to customer
router.post('/proof/:jobId', sendProofToCustomer);

export default router;
