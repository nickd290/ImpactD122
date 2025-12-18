import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { VendorPortalStatus } from '@prisma/client';
import { generateVendorPOPDF } from '../services/pdfService';
import { getJobEmailAddress } from '../services/emailService';
import archiver from 'archiver';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sgMail from '@sendgrid/mail';

// Initialize SendGrid if available
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
}

/**
 * Helper to send internal notification emails
 */
async function sendInternalNotification(
  jobNo: string,
  subject: string,
  body: string
): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('SendGrid not configured, skipping notification');
    return;
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'brandon@impactdirectprinting.com';
  const jobEmail = getJobEmailAddress(jobNo);

  try {
    await sgMail.send({
      to: jobEmail,
      from: { email: fromEmail, name: 'Impact Direct Printing' },
      subject,
      html: body,
      replyTo: jobEmail,
    });
    console.log(`📧 Notification sent to ${jobEmail}: ${subject}`);
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

/**
 * GET /api/vendor-portal/:token
 * Get portal data for a vendor token
 */
export async function getVendorPortal(req: Request, res: Response) {
  try {
    const { token } = req.params;

    const portal = await prisma.jobPortal.findUnique({
      where: { shareToken: token },
      include: {
        Job: {
          include: {
            Company: true,
            Vendor: true,
            File: true,
          },
        },
      },
    });

    if (!portal) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    // Check expiration
    if (portal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Portal link has expired' });
    }

    // Update access tracking
    await prisma.jobPortal.update({
      where: { id: portal.id },
      data: {
        accessedAt: new Date(),
        accessCount: { increment: 1 },
      },
    });

    // Fetch purchase order if linked
    const purchaseOrder = portal.purchaseOrderId
      ? await prisma.purchaseOrder.findUnique({ where: { id: portal.purchaseOrderId } })
      : null;

    const job = portal.Job;
    const specs = (job.specs as any) || {};

    // Organize files by category
    const files = {
      artwork: job.File.filter((f) => f.kind === 'ARTWORK').map((f) => ({
        id: f.id,
        name: f.fileName,
        size: f.size,
      })),
      dataFiles: job.File.filter((f) => f.kind === 'DATA_FILE').map((f) => ({
        id: f.id,
        name: f.fileName,
        size: f.size,
      })),
      proofs: job.File.filter((f) => f.kind === 'PROOF' || f.kind === 'VENDOR_PROOF').map((f) => ({
        id: f.id,
        name: f.fileName,
        size: f.size,
        isVendorProof: f.kind === 'VENDOR_PROOF',
      })),
      other: job.File.filter(
        (f) => !['ARTWORK', 'DATA_FILE', 'PROOF', 'VENDOR_PROOF', 'PO_PDF'].includes(f.kind)
      ).map((f) => ({
        id: f.id,
        name: f.fileName,
        size: f.size,
      })),
    };

    res.json({
      job: {
        jobNo: job.jobNo,
        title: job.title,
        quantity: job.quantity,
        sizeName: job.sizeName,
        deliveryDate: job.deliveryDate,
        mailDate: job.mailDate,
        vendorSpecialInstructions: job.vendorSpecialInstructions,
        specs: {
          paperType: specs.paperType || specs.paper,
          colors: specs.colors || specs.inkColors,
          coating: specs.coating,
          finishing: specs.finishing || specs.bindery,
          folds: specs.folds,
          perforations: specs.perforations,
        },
      },
      customer: job.Company?.name,
      vendor: job.Vendor?.name,
      purchaseOrder: purchaseOrder
        ? {
            poNumber: purchaseOrder.poNumber,
            buyCost: purchaseOrder.buyCost
              ? Number(purchaseOrder.buyCost)
              : null,
          }
        : null,
      files,
      portal: {
        confirmedAt: portal.confirmedAt,
        confirmedByName: portal.confirmedByName,
        vendorStatus: portal.vendorStatus,
        statusUpdatedAt: portal.statusUpdatedAt,
        trackingNumber: portal.trackingNumber,
        trackingCarrier: portal.trackingCarrier,
      },
      expiresAt: portal.expiresAt,
    });
  } catch (error) {
    console.error('Get vendor portal error:', error);
    res.status(500).json({ error: 'Failed to get portal data' });
  }
}

/**
 * POST /api/vendor-portal/:token/confirm
 * Confirm PO receipt
 */
export async function confirmPO(req: Request, res: Response) {
  try {
    const { token } = req.params;
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const portal = await prisma.jobPortal.findUnique({
      where: { shareToken: token },
      include: {
        Job: { include: { Vendor: true } },
      },
    });

    // Fetch purchase order if linked
    const purchaseOrder = portal?.purchaseOrderId
      ? await prisma.purchaseOrder.findUnique({ where: { id: portal.purchaseOrderId } })
      : null;

    if (!portal) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    if (portal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Portal link has expired' });
    }

    if (portal.confirmedAt) {
      return res.status(400).json({ error: 'PO has already been confirmed' });
    }

    // Update portal with confirmation
    const updatedPortal = await prisma.jobPortal.update({
      where: { id: portal.id },
      data: {
        confirmedAt: new Date(),
        confirmedByName: name,
        confirmedByEmail: email,
        vendorStatus: 'PO_RECEIVED',
        statusUpdatedAt: new Date(),
      },
    });

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId: portal.jobId,
        action: 'VENDOR_CONFIRMED_PO',
        field: 'vendorPortal',
        oldValue: null,
        newValue: `Confirmed by ${name} (${email})`,
        changedBy: 'vendor',
        changedByRole: 'CUSTOMER', // Using CUSTOMER as proxy for vendor
      },
    });

    // Send notification
    const vendorName = portal.Job.Vendor?.name || 'Vendor';
    const poNumber = purchaseOrder?.poNumber || 'N/A';
    await sendInternalNotification(
      portal.Job.jobNo,
      `[Job #${portal.Job.jobNo}] Vendor Confirmed PO - ${vendorName}`,
      `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #22C55E;">PO Confirmation Received</h2>
          <p><strong>Job:</strong> #${portal.Job.jobNo}</p>
          <p><strong>PO:</strong> #${poNumber}</p>
          <p><strong>Vendor:</strong> ${vendorName}</p>
          <p><strong>Confirmed By:</strong> ${name} (${email})</p>
          <p><strong>Confirmed At:</strong> ${new Date().toLocaleString()}</p>
        </div>
      `
    );

    res.json({
      success: true,
      confirmedAt: updatedPortal.confirmedAt,
      vendorStatus: updatedPortal.vendorStatus,
    });
  } catch (error) {
    console.error('Confirm PO error:', error);
    res.status(500).json({ error: 'Failed to confirm PO' });
  }
}

/**
 * POST /api/vendor-portal/:token/status
 * Update vendor status
 */
export async function updateVendorStatus(req: Request, res: Response) {
  try {
    const { token } = req.params;
    const { status, trackingNumber, trackingCarrier } = req.body;

    const validStatuses: VendorPortalStatus[] = [
      'PO_RECEIVED',
      'IN_PRODUCTION',
      'PRINTING_COMPLETE',
      'SHIPPED',
    ];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: ' + validStatuses.join(', '),
      });
    }

    if (status === 'SHIPPED' && !trackingNumber) {
      return res.status(400).json({
        error: 'Tracking number is required for SHIPPED status',
      });
    }

    const portal = await prisma.jobPortal.findUnique({
      where: { shareToken: token },
      include: {
        Job: { include: { Vendor: true } },
      },
    });

    if (!portal) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    if (portal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Portal link has expired' });
    }

    const oldStatus = portal.vendorStatus;

    // Update portal status
    const updatedPortal = await prisma.jobPortal.update({
      where: { id: portal.id },
      data: {
        vendorStatus: status,
        statusUpdatedAt: new Date(),
        trackingNumber: status === 'SHIPPED' ? trackingNumber : portal.trackingNumber,
        trackingCarrier: status === 'SHIPPED' ? (trackingCarrier || null) : portal.trackingCarrier,
      },
    });

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId: portal.jobId,
        action: 'VENDOR_STATUS_UPDATE',
        field: 'vendorStatus',
        oldValue: oldStatus,
        newValue: status + (trackingNumber ? ` (Tracking: ${trackingNumber})` : ''),
        changedBy: 'vendor',
        changedByRole: 'CUSTOMER',
      },
    });

    // Send notification
    const vendorName = portal.Job.Vendor?.name || 'Vendor';
    const statusLabels: Record<string, string> = {
      PO_RECEIVED: 'PO Received',
      IN_PRODUCTION: 'In Production',
      PRINTING_COMPLETE: 'Printing Complete',
      SHIPPED: 'Shipped',
    };

    let trackingHtml = '';
    if (status === 'SHIPPED' && trackingNumber) {
      const carrier = trackingCarrier || 'Unknown';
      let trackingUrl = '';
      if (carrier.toLowerCase().includes('ups')) {
        trackingUrl = `https://www.ups.com/track?tracknum=${trackingNumber}`;
      } else if (carrier.toLowerCase().includes('fedex')) {
        trackingUrl = `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
      } else if (carrier.toLowerCase().includes('usps')) {
        trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
      }
      trackingHtml = `
        <p><strong>Carrier:</strong> ${carrier}</p>
        <p><strong>Tracking #:</strong> ${trackingUrl ? `<a href="${trackingUrl}">${trackingNumber}</a>` : trackingNumber}</p>
      `;
    }

    await sendInternalNotification(
      portal.Job.jobNo,
      `[Job #${portal.Job.jobNo}] Vendor Status: ${statusLabels[status]} - ${vendorName}`,
      `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #2563EB;">Vendor Status Update</h2>
          <p><strong>Job:</strong> #${portal.Job.jobNo}</p>
          <p><strong>Vendor:</strong> ${vendorName}</p>
          <p><strong>New Status:</strong> ${statusLabels[status]}</p>
          <p><strong>Previous Status:</strong> ${statusLabels[oldStatus] || oldStatus}</p>
          ${trackingHtml}
          <p><strong>Updated At:</strong> ${new Date().toLocaleString()}</p>
        </div>
      `
    );

    res.json({
      success: true,
      vendorStatus: updatedPortal.vendorStatus,
      statusUpdatedAt: updatedPortal.statusUpdatedAt,
      trackingNumber: updatedPortal.trackingNumber,
      trackingCarrier: updatedPortal.trackingCarrier,
    });
  } catch (error) {
    console.error('Update vendor status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
}

/**
 * POST /api/vendor-portal/:token/upload
 * Upload vendor proofs
 */
export async function uploadVendorProofs(req: Request, res: Response) {
  try {
    const { token } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const portal = await prisma.jobPortal.findUnique({
      where: { shareToken: token },
      include: {
        Job: { include: { Vendor: true } },
      },
    });

    if (!portal) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    if (portal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Portal link has expired' });
    }

    // Create file records
    const createdFiles = await Promise.all(
      files.map(async (file) => {
        // Calculate checksum
        const fileBuffer = fs.readFileSync(file.path);
        const checksum = crypto.createHash('md5').update(fileBuffer).digest('hex');

        return prisma.file.create({
          data: {
            id: crypto.randomUUID(),
            kind: 'VENDOR_PROOF',
            jobId: portal.jobId,
            objectKey: file.filename,
            fileName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            checksum,
            uploadedBy: 'vendor',
          },
        });
      })
    );

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId: portal.jobId,
        action: 'VENDOR_PROOF_UPLOADED',
        field: 'files',
        oldValue: null,
        newValue: `${files.length} proof(s) uploaded: ${files.map((f) => f.originalname).join(', ')}`,
        changedBy: 'vendor',
        changedByRole: 'CUSTOMER',
      },
    });

    // Send notification
    const vendorName = portal.Job.Vendor?.name || 'Vendor';
    await sendInternalNotification(
      portal.Job.jobNo,
      `[Job #${portal.Job.jobNo}] Vendor Proof Uploaded - ${vendorName}`,
      `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #8B5CF6;">New Vendor Proof Uploaded</h2>
          <p><strong>Job:</strong> #${portal.Job.jobNo}</p>
          <p><strong>Vendor:</strong> ${vendorName}</p>
          <p><strong>Files Uploaded:</strong></p>
          <ul>
            ${files.map((f) => `<li>${f.originalname} (${Math.round(f.size / 1024)}KB)</li>`).join('')}
          </ul>
          <p><strong>Uploaded At:</strong> ${new Date().toLocaleString()}</p>
        </div>
      `
    );

    res.json({
      success: true,
      files: createdFiles.map((f) => ({
        id: f.id,
        name: f.fileName,
        size: f.size,
      })),
    });
  } catch (error) {
    console.error('Upload vendor proofs error:', error);
    res.status(500).json({ error: 'Failed to upload proofs' });
  }
}

/**
 * GET /api/vendor-portal/:token/files/:fileId
 * Download a single file
 */
export async function downloadFile(req: Request, res: Response) {
  try {
    const { token, fileId } = req.params;

    const portal = await prisma.jobPortal.findUnique({
      where: { shareToken: token },
      include: {
        Job: { include: { File: true } },
      },
    });

    if (!portal) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    if (portal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Portal link has expired' });
    }

    const file = portal.Job.File.find((f) => f.id === fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(__dirname, '../../uploads/', file.objectKey);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
}

/**
 * GET /api/vendor-portal/:token/download-all
 * Download all files as a zip
 */
export async function downloadAllFiles(req: Request, res: Response) {
  try {
    const { token } = req.params;

    const portal = await prisma.jobPortal.findUnique({
      where: { shareToken: token },
      include: {
        Job: { include: { File: true } },
      },
    });

    if (!portal) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    if (portal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Portal link has expired' });
    }

    const files = portal.Job.File.filter((f) => f.kind !== 'PO_PDF' && f.kind !== 'INVOICE');

    if (files.length === 0) {
      return res.status(404).json({ error: 'No files available for download' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Job-${portal.Job.jobNo}-Files.zip"`
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const file of files) {
      const filePath = path.join(__dirname, '../../uploads/', file.objectKey);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file.fileName });
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Download all files error:', error);
    res.status(500).json({ error: 'Failed to create zip file' });
  }
}

/**
 * GET /api/vendor-portal/:token/po
 * Download PO PDF
 */
export async function downloadPO(req: Request, res: Response) {
  try {
    const { token } = req.params;

    const portal = await prisma.jobPortal.findUnique({
      where: { shareToken: token },
      include: {
        Job: {
          include: {
            Company: true,
            Vendor: true,
          },
        },
      },
    });

    if (!portal) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    if (portal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Portal link has expired' });
    }

    // Fetch purchase order if linked
    const po = portal.purchaseOrderId
      ? await prisma.purchaseOrder.findUnique({ where: { id: portal.purchaseOrderId } })
      : null;

    if (!po) {
      return res.status(404).json({ error: 'No purchase order associated with this portal' });
    }

    const job = portal.Job;
    const specs = (job.specs as any) || {};

    // Transform job for PDF generation
    const jobForPDF = {
      id: job.id,
      number: job.jobNo,
      title: job.title || '',
      customer: job.Company?.name || '',
      vendor: job.Vendor?.name || '',
      quantity: job.quantity || 0,
      size: job.sizeName || '',
      deliveryDate: job.deliveryDate,
      mailDate: job.mailDate,
      specs: {
        paperType: specs.paperType || specs.paper,
        colors: specs.colors || specs.inkColors,
        coating: specs.coating,
        finishing: specs.finishing || specs.bindery,
      },
      vendorSpecialInstructions: job.vendorSpecialInstructions,
      buyCost: po.buyCost ? Number(po.buyCost) : 0,
      artworkToFollow: specs.artworkToFollow || false,
    };

    const pdfBuffer = generateVendorPOPDF(jobForPDF);

    res.contentType('application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="PO-${po.poNumber || job.jobNo}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Download PO error:', error);
    res.status(500).json({ error: 'Failed to generate PO PDF' });
  }
}

/**
 * Helper: Create or update a job portal for a job
 */
export async function createOrUpdateJobPortal(
  jobId: string,
  purchaseOrderId?: string,
  expirationDays: number = 14
): Promise<{ token: string; expiresAt: Date }> {
  const shareToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  // Check if portal already exists for this job
  const existingPortal = await prisma.jobPortal.findUnique({
    where: { jobId },
  });

  if (existingPortal) {
    // Update existing portal with new token and expiration
    await prisma.jobPortal.update({
      where: { id: existingPortal.id },
      data: {
        shareToken,
        expiresAt,
        purchaseOrderId: purchaseOrderId || existingPortal.purchaseOrderId,
      },
    });
  } else {
    // Create new portal
    await prisma.jobPortal.create({
      data: {
        jobId,
        purchaseOrderId: purchaseOrderId || null,
        shareToken,
        expiresAt,
      },
    });
  }

  return { token: shareToken, expiresAt };
}
