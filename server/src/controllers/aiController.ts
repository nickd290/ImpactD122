import { Request, Response } from 'express';
import { parsePrintSpecs, parsePurchaseOrder, generateEmailDraft } from '../services/openaiService';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';

// Parse print specs from text
export const parseSpecs = async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const result = await parsePrintSpecs(text);
    res.json(result);
  } catch (error) {
    console.error('Parse specs error:', error);
    res.status(500).json({ error: 'Failed to parse specs' });
  }
};

// Parse purchase order document
export const parsePO = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const { jobId } = req.body;

    // Read file and convert to base64
    const fileBuffer = fs.readFileSync(req.file.path);
    const base64Data = fileBuffer.toString('base64');

    const result = await parsePurchaseOrder(base64Data, req.file.mimetype);

    let fileRecord = null;

    // If jobId provided, save file to database
    if (jobId) {
      // Verify job exists
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (job) {
        // Move file to permanent location
        const uploadsDir = path.join(__dirname, '../../uploads/po');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const ext = path.extname(req.file.originalname);
        const newFileName = `${jobId}-${Date.now()}${ext}`;
        const newPath = path.join(uploadsDir, newFileName);

        fs.renameSync(req.file.path, newPath);

        // Calculate checksum
        const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Create file record
        fileRecord = await prisma.file.create({
          data: {
            id: crypto.randomUUID(),
            jobId,
            kind: 'PO_PDF',
            objectKey: newPath,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            checksum,
            uploadedBy: 'system',
          },
        });
      } else {
        // Job not found, clean up file
        fs.unlinkSync(req.file.path);
      }
    } else {
      // No jobId, clean up uploaded file
      fs.unlinkSync(req.file.path);
    }

    res.json({
      ...result,
      file: fileRecord ? {
        id: fileRecord.id,
        fileName: fileRecord.fileName,
        size: fileRecord.size,
        createdAt: fileRecord.createdAt,
      } : null,
    });
  } catch (error: any) {
    console.error('Parse PO error:', error);
    // Clean up file on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Return specific error type for debugging
    const message = error.message || 'Failed to parse purchase order';
    const errorType = message.includes('API key') || message.includes('configured') ? 'config'
      : message.includes('PDF conversion') ? 'pdf'
      : message.includes('OpenAI') || message.includes('API') ? 'ai'
      : 'unknown';

    res.status(500).json({
      error: message,
      errorType,
    });
  }
};

// Generate email draft
export const generateEmail = async (req: Request, res: Response) => {
  try {
    const { jobData, recipientName, type, senderIdentity } = req.body;

    if (!jobData || !recipientName || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const draft = await generateEmailDraft(jobData, recipientName, type, senderIdentity);
    res.json({ draft });
  } catch (error) {
    console.error('Generate email error:', error);
    res.status(500).json({ error: 'Failed to generate email' });
  }
};
