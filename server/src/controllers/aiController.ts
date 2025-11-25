import { Request, Response } from 'express';
import { parsePrintSpecs, parsePurchaseOrder, generateEmailDraft } from '../services/geminiService';
import * as fs from 'fs';

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

    // Read file and convert to base64
    const fileBuffer = fs.readFileSync(req.file.path);
    const base64Data = fileBuffer.toString('base64');

    const result = await parsePurchaseOrder(base64Data, req.file.mimetype);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json(result);
  } catch (error) {
    console.error('Parse PO error:', error);
    res.status(500).json({ error: 'Failed to parse purchase order' });
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
