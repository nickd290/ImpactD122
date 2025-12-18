import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma';

// Get files for a job
export const getJobFiles = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const files = await prisma.file.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(files);
  } catch (error) {
    console.error('Get job files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
};

// Upload file to a job
export const uploadJobFile = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { kind = 'ARTWORK' } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify job exists
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      // Clean up uploaded file
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(404).json({ error: 'Job not found' });
    }

    // Validate kind
    const validKinds = ['ARTWORK', 'DATA_FILE', 'PROOF', 'INVOICE', 'PO_PDF'];
    if (!validKinds.includes(kind)) {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({ error: `Invalid file kind. Must be one of: ${validKinds.join(', ')}` });
    }

    // Calculate checksum
    const fileBuffer = fs.readFileSync(file.path);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Create file record
    const fileRecord = await prisma.file.create({
      data: {
        id: crypto.randomUUID(),
        jobId,
        kind: kind as any,
        objectKey: file.path, // In production, this would be S3/R2 key
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        checksum,
        uploadedBy: 'system', // TODO: Get from auth context
      },
    });

    res.json({
      success: true,
      file: {
        id: fileRecord.id,
        fileName: fileRecord.fileName,
        kind: fileRecord.kind,
        size: fileRecord.size,
        createdAt: fileRecord.createdAt,
      },
    });
  } catch (error) {
    console.error('Upload job file error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
};

// Delete a file
export const deleteJobFile = async (req: Request, res: Response) => {
  try {
    const { jobId, fileId } = req.params;

    // Verify file belongs to job
    const file = await prisma.file.findFirst({
      where: { id: fileId, jobId },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete physical file if it exists
    if (file.objectKey && fs.existsSync(file.objectKey)) {
      try {
        fs.unlinkSync(file.objectKey);
      } catch (e) {
        console.warn('Could not delete physical file:', e);
      }
    }

    // Delete database record
    await prisma.file.delete({ where: { id: fileId } });

    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    console.error('Delete job file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
};

// Download a file
export const downloadFile = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    const file = await prisma.file.findUnique({ where: { id: fileId } });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if physical file exists
    if (!file.objectKey || !fs.existsSync(file.objectKey)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Type', file.mimeType);
    res.sendFile(path.resolve(file.objectKey));
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
};
