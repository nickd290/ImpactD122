/**
 * Proof Sheet Controller
 *
 * Generates proof sheets for customer approval with all job specs.
 * Supports PDF generation and web approval links.
 */

import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';

/**
 * GET /api/jobs/:id/proof-sheet
 * Generate a PDF proof sheet for the job
 */
export async function generateProofSheet(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        Company: true,
        Vendor: true,
        File: {
          where: {
            kind: { in: ['PROOF', 'VENDOR_PROOF'] }
          }
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const specs = (job.specs as any) || {};

    // Create PDF
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 50,
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ProofSheet-${job.jobNo}.pdf"`);

    // Pipe to response
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold')
       .text('IMPACT DIRECT - PROOF APPROVAL', { align: 'center' });

    doc.moveDown(0.5);
    doc.strokeColor('#666666')
       .lineWidth(2)
       .moveTo(50, doc.y)
       .lineTo(562, doc.y)
       .stroke();

    doc.moveDown(1);

    // Job Info Section
    doc.fontSize(12).font('Helvetica-Bold')
       .fillColor('#333333')
       .text('JOB INFORMATION');

    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');

    const leftCol = 50;
    const rightCol = 300;
    let y = doc.y;

    // Left column
    doc.text(`Job #: ${job.jobNo}`, leftCol, y);
    doc.text(`Title: ${job.title || 'N/A'}`, leftCol, y + 15);
    doc.text(`Customer: ${job.Company?.name || 'N/A'}`, leftCol, y + 30);
    doc.text(`PO #: ${job.customerPONumber || 'N/A'}`, leftCol, y + 45);

    // Right column
    doc.text(`Due Date: ${job.deliveryDate ? new Date(job.deliveryDate).toLocaleDateString() : 'N/A'}`, rightCol, y);
    doc.text(`Mail Date: ${job.mailDate ? new Date(job.mailDate).toLocaleDateString() : 'N/A'}`, rightCol, y + 15);
    doc.text(`Quantity: ${job.quantity?.toLocaleString() || 'N/A'}`, rightCol, y + 30);

    doc.y = y + 70;
    doc.moveDown(1);

    // Separator
    doc.strokeColor('#cccccc')
       .lineWidth(1)
       .moveTo(50, doc.y)
       .lineTo(562, doc.y)
       .stroke();

    doc.moveDown(1);

    // Specifications Section
    doc.fontSize(12).font('Helvetica-Bold')
       .fillColor('#333333')
       .text('SPECIFICATIONS');

    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');

    y = doc.y;
    const specItems = [
      { label: 'Product Type', value: specs.productType || 'N/A' },
      { label: 'Size (Flat)', value: specs.flatSize || job.sizeName || 'N/A' },
      { label: 'Size (Finished)', value: specs.finishedSize || 'N/A' },
      { label: 'Paper', value: specs.paperType || 'N/A' },
      { label: 'Colors', value: specs.colors || specs.inkColors || 'N/A' },
      { label: 'Coating', value: specs.coating || 'N/A' },
      { label: 'Finishing', value: specs.finishing || specs.bindery || 'N/A' },
    ];

    // Two-column spec display
    for (let i = 0; i < specItems.length; i++) {
      const item = specItems[i];
      const col = i % 2 === 0 ? leftCol : rightCol;
      const row = Math.floor(i / 2) * 20;
      doc.font('Helvetica-Bold').text(`${item.label}: `, col, y + row, { continued: true });
      doc.font('Helvetica').text(item.value);
    }

    doc.y = y + Math.ceil(specItems.length / 2) * 20 + 20;
    doc.moveDown(1);

    // Special Instructions if any
    if (job.vendorSpecialInstructions) {
      doc.fontSize(12).font('Helvetica-Bold')
         .fillColor('#333333')
         .text('SPECIAL INSTRUCTIONS');

      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica')
         .fillColor('#666666')
         .text(job.vendorSpecialInstructions, {
           width: 512,
         });

      doc.moveDown(1);
    }

    // Separator
    doc.strokeColor('#cccccc')
       .lineWidth(1)
       .moveTo(50, doc.y)
       .lineTo(562, doc.y)
       .stroke();

    doc.moveDown(1);

    // Approval Section
    doc.fontSize(12).font('Helvetica-Bold')
       .fillColor('#333333')
       .text('APPROVAL');

    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica')
       .fillColor('#666666')
       .text('Please review the attached proof(s) and respond with one of the following:');

    doc.moveDown(0.5);

    // Checkbox options
    const checkboxY = doc.y;
    doc.rect(leftCol, checkboxY, 12, 12).stroke();
    doc.text('APPROVED - Proceed with production', leftCol + 20, checkboxY);

    doc.rect(leftCol, checkboxY + 25, 12, 12).stroke();
    doc.text('APPROVED WITH CHANGES - Please note changes:', leftCol + 20, checkboxY + 25);

    doc.rect(leftCol, checkboxY + 50, 12, 12).stroke();
    doc.text('REVISE AND RESUBMIT - Please address the following:', leftCol + 20, checkboxY + 50);

    doc.moveDown(5);

    // Signature area
    doc.y = Math.max(doc.y, checkboxY + 100);

    doc.fontSize(10).font('Helvetica');
    doc.text('____________________________________', leftCol, doc.y);
    doc.text('Signature', leftCol, doc.y + 5);

    doc.text('____________________________________', rightCol, doc.y - 5);
    doc.text('Date', rightCol, doc.y);

    doc.moveDown(3);

    // Footer
    doc.fontSize(8).font('Helvetica')
       .fillColor('#999999')
       .text('Please email your approval to proofs@impactdirectprinting.com or reply to the email containing this proof sheet.', {
         align: 'center',
         width: 512,
       });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Error generating proof sheet:', error);
    res.status(500).json({ error: 'Failed to generate proof sheet' });
  }
}

/**
 * POST /api/jobs/:id/approval-link
 * Create a web approval link for the customer
 */
export async function createApprovalLink(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { expirationDays = 14 } = req.body;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        Company: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Generate unique token
    const approvalToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Check if proof record exists for this job
    let proof = await prisma.proof.findFirst({
      where: { jobId: id },
      orderBy: { version: 'desc' },
    });

    if (proof) {
      // Update existing proof with new share token
      proof = await prisma.proof.update({
        where: { id: proof.id },
        data: {
          shareToken: approvalToken,
          shareExpiresAt: expiresAt,
        },
      });
    } else {
      // Create new proof record
      proof = await prisma.proof.create({
        data: {
          id: crypto.randomUUID(),
          jobId: id,
          version: 1,
          status: 'PENDING',
          shareToken: approvalToken,
          shareExpiresAt: expiresAt,
        },
      });
    }

    // Generate the approval URL
    const baseUrl = process.env.APP_URL || 'https://impactd122-server-production.up.railway.app';
    const approvalUrl = `${baseUrl}/approve/${approvalToken}`;

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId: id,
        action: 'APPROVAL_LINK_CREATED',
        field: 'approvalLink',
        oldValue: null,
        newValue: `Expires ${expiresAt.toLocaleDateString()}`,
        changedBy: 'admin',
        changedByRole: 'BROKER_ADMIN',
      },
    });

    res.json({
      success: true,
      approvalUrl,
      expiresAt,
      proofId: proof.id,
    });

  } catch (error) {
    console.error('Error creating approval link:', error);
    res.status(500).json({ error: 'Failed to create approval link' });
  }
}

/**
 * GET /api/approve/:token
 * Get proof approval page data
 */
export async function getApprovalPage(req: Request, res: Response) {
  try {
    const { token } = req.params;

    const proof = await prisma.proof.findFirst({
      where: { shareToken: token },
      include: {
        Job: {
          include: {
            Company: true,
            Vendor: true,
            File: {
              where: {
                kind: { in: ['PROOF', 'VENDOR_PROOF'] }
              }
            },
          },
        },
      },
    });

    if (!proof) {
      return res.status(404).json({ error: 'Approval link not found' });
    }

    if (proof.shareExpiresAt && proof.shareExpiresAt < new Date()) {
      return res.status(410).json({ error: 'Approval link has expired' });
    }

    const job = proof.Job;
    const specs = (job.specs as any) || {};

    res.json({
      job: {
        jobNo: job.jobNo,
        title: job.title,
        quantity: job.quantity,
        dueDate: job.deliveryDate,
        customerPONumber: job.customerPONumber,
      },
      customer: job.Company?.name,
      specs: {
        productType: specs.productType,
        flatSize: specs.flatSize || job.sizeName,
        finishedSize: specs.finishedSize,
        paper: specs.paperType,
        colors: specs.colors || specs.inkColors,
        coating: specs.coating,
        finishing: specs.finishing || specs.bindery,
      },
      proofs: job.File.map(f => ({
        id: f.id,
        name: f.fileName,
        type: f.mimeType,
      })),
      proof: {
        id: proof.id,
        status: proof.status,
        version: proof.version,
        approvedAt: proof.approvedAt,
        approvedBy: proof.approvedByName,
      },
    });

  } catch (error) {
    console.error('Error getting approval page:', error);
    res.status(500).json({ error: 'Failed to load approval page' });
  }
}

/**
 * POST /api/approve/:token
 * Submit proof approval or rejection
 */
export async function submitApproval(req: Request, res: Response) {
  try {
    const { token } = req.params;
    const { status, name, email, comments } = req.body;

    if (!status || !['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const proof = await prisma.proof.findFirst({
      where: { shareToken: token },
      include: {
        Job: true,
      },
    });

    if (!proof) {
      return res.status(404).json({ error: 'Approval link not found' });
    }

    if (proof.shareExpiresAt && proof.shareExpiresAt < new Date()) {
      return res.status(410).json({ error: 'Approval link has expired' });
    }

    // Update proof status
    const updatedProof = await prisma.proof.update({
      where: { id: proof.id },
      data: {
        status,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        approvedByName: name,
        approvedByEmail: email,
        approvalComments: comments || null,
      },
    });

    // If approved, advance workflow to IN_PRODUCTION
    if (status === 'APPROVED') {
      await prisma.job.update({
        where: { id: proof.jobId },
        data: {
          workflowStatus: 'IN_PRODUCTION',
          workflowUpdatedAt: new Date(),
        },
      });
    }

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId: proof.jobId,
        action: 'CUSTOMER_PROOF_RESPONSE',
        field: 'proofStatus',
        oldValue: proof.status,
        newValue: `${status} by ${name} (${email})${comments ? ` - ${comments}` : ''}`,
        changedBy: email,
        changedByRole: 'CUSTOMER',
      },
    });

    res.json({
      success: true,
      status: updatedProof.status,
      approvedAt: updatedProof.approvedAt,
    });

  } catch (error) {
    console.error('Error submitting approval:', error);
    res.status(500).json({ error: 'Failed to submit approval' });
  }
}
