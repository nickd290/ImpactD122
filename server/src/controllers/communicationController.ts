import { Request, Response } from 'express';
import { simpleParser } from 'mailparser';
import {
  processInboundEmail,
  getJobCommunications,
  getPendingCommunications,
  getPendingCommunicationsCount,
  forwardCommunication,
  skipCommunication,
  addInternalNote,
  createOutboundCommunication,
  initiateCustomerThread,
  initiateVendorThread,
  initiateBothThreads
} from '../services/communicationService';
import { prisma } from '../utils/prisma';

/**
 * Parse raw MIME email using mailparser
 * Handles quoted-printable decoding, base64, charset conversion, etc.
 */
async function parseRawEmail(rawEmail: string): Promise<{ text: string; html: string; from: string; to: string; subject: string }> {
  try {
    const parsed = await simpleParser(rawEmail);

    // Handle 'to' field which can be a single AddressObject or an array
    let toAddress = '';
    if (parsed.to) {
      if (Array.isArray(parsed.to)) {
        toAddress = parsed.to[0]?.text || '';
      } else {
        toAddress = parsed.to.text || '';
      }
    }

    const result = {
      text: parsed.text || '',
      html: typeof parsed.html === 'string' ? parsed.html : '',
      from: parsed.from?.text || '',
      to: toAddress,
      subject: parsed.subject || ''
    };

    console.log('📨 Parsed raw email with mailparser:', {
      from: result.from,
      to: result.to,
      subject: result.subject,
      textLength: result.text.length,
      htmlLength: result.html.length
    });

    return result;
  } catch (e) {
    console.error('Error parsing raw email with mailparser:', e);
    return { text: '', html: '', from: '', to: '', subject: '' };
  }
}

/**
 * Webhook endpoint for SendGrid Inbound Parse
 * POST /api/communications/webhook/inbound
 */
export async function handleInboundEmailWebhook(req: Request, res: Response) {
  try {
    // Log ALL incoming fields for debugging
    console.log('📬 Inbound email webhook received:', {
      contentType: req.headers['content-type'],
      bodyKeys: Object.keys(req.body || {}),
      hasFiles: !!(req.files && Array.isArray(req.files) && req.files.length > 0),
    });

    // Log each field with its value/length for comprehensive debugging
    console.log('📧 All body fields:');
    for (const [key, value] of Object.entries(req.body || {})) {
      const strValue = String(value);
      console.log(`  ${key}: ${strValue.length > 200 ? strValue.substring(0, 200) + '...[' + strValue.length + ' chars]' : strValue}`);
    }

    // SendGrid sends form data with these fields:
    // Standard mode: from, to, subject, text, html, envelope, headers, dkim, SPF, spam_score
    // Raw mode: email (raw MIME), to, from, subject, envelope
    let payload = {
      from: req.body.from || '',
      to: req.body.to || '',
      subject: req.body.subject || '',
      text: req.body.text || '',
      html: req.body.html || '',
      attachments: [] as any[]
    };

    // Check if this is a "raw" email (SendGrid sends full MIME in 'email' field)
    if (req.body.email && (!payload.text && !payload.html)) {
      console.log('📧 Raw email mode detected, parsing MIME with mailparser...');
      const parsed = await parseRawEmail(req.body.email);
      if (!payload.from && parsed.from) payload.from = parsed.from;
      if (!payload.to && parsed.to) payload.to = parsed.to;
      if (!payload.subject && parsed.subject) payload.subject = parsed.subject;
      payload.text = parsed.text;
      payload.html = parsed.html;
    }

    // Try parsing envelope if from/to are missing
    if ((!payload.from || !payload.to) && req.body.envelope) {
      try {
        const envelope = typeof req.body.envelope === 'string'
          ? JSON.parse(req.body.envelope)
          : req.body.envelope;
        if (!payload.from && envelope.from) payload.from = envelope.from;
        if (!payload.to && envelope.to) {
          payload.to = Array.isArray(envelope.to) ? envelope.to[0] : envelope.to;
        }
        console.log('📨 Parsed envelope:', envelope);
      } catch (e) {
        console.warn('Could not parse envelope:', e);
      }
    }

    // Parse attachments info if present (SendGrid sends as JSON string)
    if (req.body.attachments) {
      try {
        const attachmentInfo = typeof req.body.attachments === 'string'
          ? JSON.parse(req.body.attachments)
          : req.body.attachments;
        console.log('📎 Attachment info:', attachmentInfo);
      } catch (e) {
        console.warn('Could not parse attachments info:', e);
      }
    }

    // Handle file attachments if present (multer middleware)
    if (req.files && Array.isArray(req.files)) {
      payload.attachments = req.files.map((file: any) => ({
        filename: file.originalname,
        type: file.mimetype,
        content: file.buffer.toString('base64')
      }));
      console.log('📎 File attachments:', payload.attachments.map(a => a.filename));
    }

    // Log final payload
    console.log('📦 Final payload:', {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      textPreview: payload.text?.substring(0, 200) || '(empty)',
      htmlPreview: payload.html?.substring(0, 200) || '(empty)',
      attachmentCount: payload.attachments.length
    });

    const result = await processInboundEmail(payload);

    if (result.success) {
      console.log('✅ Inbound email processed:', result);
      res.status(200).json(result);
    } else {
      // Still return 200 to SendGrid to prevent retries
      console.warn('⚠️ Inbound email not processed:', result.error);
      res.status(200).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('❌ Error in inbound email webhook:', error);
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

/**
 * Initiate customer thread (send welcome email)
 * POST /api/communications/job/:jobId/initiate-customer
 */
export async function initiateCustomerThreadHandler(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const { customMessage } = req.body;

    const result = await initiateCustomerThread(jobId, { customMessage });

    if (result.success) {
      res.json({ success: true, communicationId: result.communicationId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('Error initiating customer thread:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Initiate vendor thread (send job notification email)
 * POST /api/communications/job/:jobId/initiate-vendor
 */
export async function initiateVendorThreadHandler(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const { customMessage } = req.body;

    const result = await initiateVendorThread(jobId, { customMessage });

    if (result.success) {
      res.json({ success: true, communicationId: result.communicationId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('Error initiating vendor thread:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Initiate both customer and vendor threads
 * POST /api/communications/job/:jobId/initiate-both
 */
export async function initiateBothThreadsHandler(req: Request, res: Response) {
  try {
    const { jobId } = req.params;
    const { customMessage } = req.body;

    const { customerResult, vendorResult } = await initiateBothThreads(jobId, { customMessage });

    res.json({
      success: customerResult.success || vendorResult.success,
      customer: customerResult,
      vendor: vendorResult
    });
  } catch (error: any) {
    console.error('Error initiating both threads:', error);
    res.status(500).json({ error: error.message });
  }
}
