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

const VALID_KINDS = ['ARTWORK', 'DATA_FILE', 'PROOF', 'INVOICE', 'PO_PDF', 'CUSTOMER_PO', 'VENDOR_PROOF'];

function persistUploadedFile(
  jobId: string,
  file: Express.Multer.File,
  kind: string
) {
  const fileBuffer = fs.readFileSync(file.path);
  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  return prisma.file.create({
    data: {
      id: crypto.randomUUID(),
      jobId,
      kind: kind as any,
      objectKey: file.path,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      checksum,
      uploadedBy: 'system',
    },
  });
}

// Upload file(s) to a job — single or multi (array)
export const uploadJobFile = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { kind = 'ARTWORK' } = req.body;
    const files: Express.Multer.File[] = [
      ...((req.files as Express.Multer.File[]) || []),
      ...(req.file ? [req.file] : []),
    ];

    if (!files.length) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      for (const f of files) {
        if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
      }
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!VALID_KINDS.includes(kind)) {
      for (const f of files) {
        if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
      }
      return res.status(400).json({
        error: `Invalid file kind. Must be one of: ${VALID_KINDS.join(', ')}`,
      });
    }

    const created = [];
    for (const file of files) {
      const fileRecord = await persistUploadedFile(jobId, file, kind);
      created.push({
        id: fileRecord.id,
        fileName: fileRecord.fileName,
        kind: fileRecord.kind,
        mimeType: fileRecord.mimeType,
        size: fileRecord.size,
        createdAt: fileRecord.createdAt,
      });
    }

    // Back-compat: single file response shape + multi
    res.json({
      success: true,
      file: created[0],
      files: created,
      count: created.length,
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

    const view =
      req.query.view === '1' ||
      req.query.view === 'true' ||
      req.query.inline === '1' ||
      req.query.inline === 'true';
    const safeName = String(file.fileName || 'file').replace(/"/g, '');
    res.setHeader(
      'Content-Disposition',
      `${view ? 'inline' : 'attachment'}; filename="${safeName}"`
    );
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.sendFile(path.resolve(file.objectKey));
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
};
