import { Router } from 'express';
import multer from 'multer';
import {
  handleInboundEmailWebhook,
  getJobCommunicationsHandler,
  getPendingCommunicationsHandler,
  getPendingCountHandler,
  forwardCommunicationHandler,
  skipCommunicationHandler,
  addInternalNoteHandler,
  sendCommunicationHandler,
  getCommunicationHandler,
  updateCommunicationHandler
} from '../controllers/communicationController';

const router = Router();

// Configure multer for handling email attachments
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max file size
  }
});

// Webhook endpoint for SendGrid Inbound Parse
// This receives emails sent to job-{jobNo}@impactdirectprinting.com
router.post('/webhook/inbound', upload.any(), handleInboundEmailWebhook);

// Get pending communications (for notification badge)
router.get('/pending', getPendingCommunicationsHandler);
router.get('/pending/count', getPendingCountHandler);

// Get all communications for a specific job
router.get('/job/:jobId', getJobCommunicationsHandler);

// Add internal note to a job's thread
router.post('/job/:jobId/note', addInternalNoteHandler);

// Send a new outbound communication
router.post('/job/:jobId/send', sendCommunicationHandler);

// Get/update/forward/skip a specific communication
router.get('/:id', getCommunicationHandler);
router.patch('/:id', updateCommunicationHandler);
router.post('/:id/forward', forwardCommunicationHandler);
router.post('/:id/skip', skipCommunicationHandler);

export default router;
