import { Request, Response } from 'express';
import {
  processInboundEmail,
  getJobCommunications,
  getPendingCommunications,
  getPendingCommunicationsCount,
  forwardCommunication,
  skipCommunication,
  addInternalNote,
  createOutboundCommunication
} from '../services/communicationService';
import { prisma } from '../utils/prisma';

/**
 * Webhook endpoint for SendGrid Inbound Parse
 * POST /api/communications/webhook/inbound
 */
export async function handleInboundEmailWebhook(req: Request, res: Response) {
  try {
    // SendGrid sends form data, parse it
    const payload = {
      from: req.body.from || req.body.envelope?.from,
      to: req.body.to || req.body.envelope?.to?.[0],
      subject: req.body.subject || '',
      text: req.body.text,
      html: req.body.html,
      attachments: [] as any[]
    };

    // Parse attachments if present
    if (req.body.attachments) {
      try {
        const attachmentInfo = JSON.parse(req.body.attachments);
        // Attachments are uploaded as files, need to handle via multer
        // For now, we'll handle inline attachments only
      } catch (e) {
        console.warn('Could not parse attachments:', e);
      }
    }

    // Handle file attachments if present (multer middleware)
    if (req.files && Array.isArray(req.files)) {
      payload.attachments = req.files.map((file: any) => ({
        filename: file.originalname,
        type: file.mimetype,
        content: file.buffer.toString('base64')
      }));
    }

    const result = await processInboundEmail(payload);

    if (result.success) {
      console.log('✅ Inbound email processed:', result);
      res.status(200).json({ success: true, ...result });
    } else {
      // Still return 200 to SendGrid to prevent retries
      console.warn('⚠️ Inbound email not processed:', result.error);
      res.status(200).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('Error in inbound email webhook:', error);
    // Return 200 to prevent SendGrid retries for processing errors
    res.status(200).json({ success: false, error: error.message });
  }
}

/**
 * Get all communications for a job
 * GET /api/communications/job/:jobId
 */
export async function getJobCommunicationsHandler(req: Request, res: Response) {
  try {
    const { jobId } = req.params;

    const communications = await getJobCommunications(jobId);

    res.json(communications);
  } catch (error: any) {
    console.error('Error getting job communications:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get all pending communications across all jobs
 * GET /api/communications/pending
 */
export async function getPendingCommunicationsHandler(req: Request, res: Response) {
  try {
    const communications = await getPendingCommunications();

    res.json(communications);
  } catch (error: any) {
    console.error('Error getting pending communications:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get count of pending communications
 * GET /api/communications/pending/count
 */
export async function getPendingCountHandler(req: Request, res: Response) {
  try {
    const count = await getPendingCommunicationsCount();

    res.json({ count });
  } catch (error: any) {
    console.error('Error getting pending count:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Forward a communication to the other party
 * POST /api/communications/:id/forward
 */
export async function forwardCommunicationHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { customMessage, forwardedBy } = req.body;

    const result = await forwardCommunication(
      id,
      forwardedBy || 'system',
      customMessage
    );

    if (result.success) {
      res.json({ success: true, communicationId: result.communicationId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('Error forwarding communication:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Skip a communication (don't forward)
 * POST /api/communications/:id/skip
 */
export async function skipCommunicationHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { reason, skippedBy } = req.body;

    await skipCommunication(id, skippedBy || 'system', reason);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error skipping communication:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Add an internal note to a job's communication thread
 * POST /api/communications/job/:jobId/note
 */
export async function addInternalNoteHandler(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const { note, addedBy } = req.body;

    if (!note) {
      return res.status(400).json({ error: 'Note is required' });
    }

    const communicationId = await addInternalNote(
      jobId,
      note,
      addedBy || 'system'
    );

    res.json({ success: true, communicationId });
  } catch (error: any) {
    console.error('Error adding internal note:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create and send a new outbound communication
 * POST /api/communications/job/:jobId/send
 */
export async function sendCommunicationHandler(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const { to, subject, body, createdBy } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }

    if (to !== 'customer' && to !== 'vendor') {
      return res.status(400).json({ error: 'to must be "customer" or "vendor"' });
    }

    const result = await createOutboundCommunication(
      jobId,
      to,
      subject,
      body,
      createdBy || 'system'
    );

    if (result.success) {
      res.json({ success: true, communicationId: result.communicationId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('Error sending communication:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get a single communication by ID
 * GET /api/communications/:id
 */
export async function getCommunicationHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const communication = await prisma.jobCommunication.findUnique({
      where: { id },
      include: {
        job: {
          include: {
            Company: true,
            Vendor: {
              include: {
                contacts: true
              }
            }
          }
        },
        attachments: true
      }
    });

    if (!communication) {
      return res.status(404).json({ error: 'Communication not found' });
    }

    res.json(communication);
  } catch (error: any) {
    console.error('Error getting communication:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update communication (edit before forwarding)
 * PATCH /api/communications/:id
 */
export async function updateCommunicationHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { textBody, htmlBody, maskedSubject, internalNotes } = req.body;

    const updated = await prisma.jobCommunication.update({
      where: { id },
      data: {
        ...(textBody !== undefined && { textBody }),
        ...(htmlBody !== undefined && { htmlBody }),
        ...(maskedSubject !== undefined && { maskedSubject }),
        ...(internalNotes !== undefined && { internalNotes })
      },
      include: {
        attachments: true
      }
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating communication:', error);
    res.status(500).json({ error: error.message });
  }
}
