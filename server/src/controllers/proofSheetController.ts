/**
 * Proof Sheet Controller
 *
 * Generates proof sheets for customer approval with all job specs.
 * Supports PDF generation and web approval links.
 */

import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
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
    const { expirationDays = 14, recipientEmail, message, proofId } = req.body;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        Company: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Generate unique token (regenerating invalidates any previously sent link)
    const approvalToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Target a specific proof if given, otherwise the latest (or create v1)
    let proof = proofId
      ? await prisma.proof.findUnique({ where: { id: proofId } })
      : await prisma.proof.findFirst({
          where: { jobId: id },
          orderBy: { version: 'desc' },
        });

    if (proof && proof.jobId !== id) {
      return res.status(400).json({ error: 'Proof does not belong to this job' });
    }

    if (proof) {
      proof = await prisma.proof.update({
        where: { id: proof.id },
        data: {
          shareToken: approvalToken,
          shareExpiresAt: expiresAt,
        },
      });
    } else {
      proof = await prisma.proof.create({
        data: {
          id: crypto.randomUUID(),
          jobId: id,
          version: 1,
          status: 'PENDING',
          shareToken: approvalToken,
          shareExpiresAt: expiresAt,
          updatedAt: new Date(),
        },
      });
    }

    // Generate the approval URL
    const baseUrl = process.env.APP_URL || 'https://impactd122-server-production.up.railway.app';
    const approvalUrl = `${baseUrl}/approve/${approvalToken}`;

    // Optionally email the review link to the customer
    let emailedTo: string | null = null;
    if (recipientEmail) {
      const { sendProofReviewLinkEmail } = await import('../services/emailService');
      const emailResult = await sendProofReviewLinkEmail(
        { jobNo: job.jobNo, title: job.title, customerName: job.Company?.name || null },
        recipientEmail,
        approvalUrl,
        message
      );
      if (!emailResult.success) {
        return res.status(500).json({
          success: false,
          error: emailResult.error || 'Link created but email failed',
          approvalUrl,
          expiresAt,
          proofId: proof.id,
        });
      }
      emailedTo = recipientEmail;
      await prisma.proof.update({
        where: { id: proof.id },
        data: { sentToCustomerAt: new Date(), sentToEmail: recipientEmail },
      });
      await prisma.job.update({
        where: { id },
        data: {
          workflowStatus: 'AWAITING_CUSTOMER_RESPONSE',
          workflowUpdatedAt: new Date(),
        },
      });
    }

    // Log activity
    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId: id,
        action: emailedTo ? 'PROOF_SENT_TO_CUSTOMER' : 'APPROVAL_LINK_CREATED',
        field: 'approvalLink',
        oldValue: null,
        newValue: `${emailedTo ? `Sent to ${emailedTo}. ` : ''}Expires ${expiresAt.toLocaleDateString()}`,
        changedBy: 'admin',
        changedByRole: 'BROKER_ADMIN',
      },
    });

    res.json({
      success: true,
      approvalUrl,
      expiresAt,
      proofId: proof.id,
      emailedTo,
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
        File: true,
        ProofComment: { orderBy: { createdAt: 'asc' } },
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

    // Full version history for the rail
    const versions = await prisma.proof.findMany({
      where: { jobId: job.id },
      orderBy: { version: 'asc' },
      select: {
        id: true,
        version: true,
        status: true,
        proofUrl: true,
        createdAt: true,
        approvedAt: true,
        approvedByName: true,
        fileId: true,
      },
    });

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
        proofUrl: proof.proofUrl,
        file: proof.File
          ? { id: proof.File.id, name: proof.File.fileName, type: proof.File.mimeType }
          : null,
        approvedAt: proof.approvedAt,
        approvedBy: proof.approvedByName,
        approvalComments: proof.approvalComments,
      },
      versions,
      comments: proof.ProofComment.map((c) => ({
        id: c.id,
        authorName: c.authorName,
        authorRole: c.authorRole,
        body: c.body,
        createdAt: c.createdAt,
      })),
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

    if (!status || !['APPROVED', 'CHANGES_REQUESTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    if (status === 'CHANGES_REQUESTED' && !comments) {
      return res.status(400).json({ error: 'Please describe the changes you need' });
    }

    const proof = await prisma.proof.findFirst({
      where: { shareToken: token },
      include: {
        Job: { include: { Vendor: true, JobPortal: true } },
      },
    });

    if (!proof) {
      return res.status(404).json({ error: 'Approval link not found' });
    }

    if (proof.shareExpiresAt && proof.shareExpiresAt < new Date()) {
      return res.status(410).json({ error: 'Approval link has expired' });
    }

    // Reject re-decisions — a decided proof stays decided
    if (proof.status !== 'PENDING') {
      return res.status(409).json({
        error: `This proof has already been ${proof.status === 'APPROVED' ? 'approved' : 'responded to'}.`,
        status: proof.status,
      });
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

    // Audit-trail row (parity with proofController.approveProof)
    await prisma.proofApproval.create({
      data: {
        id: crypto.randomUUID(),
        proofId: proof.id,
        approved: status === 'APPROVED',
        comments: comments || null,
        approvedBy: `${name} (${email})`,
      },
    });

    // Workflow transitions — approval means "vendor may proceed", NOT in production
    await prisma.job.update({
      where: { id: proof.jobId },
      data: {
        workflowStatus: status === 'APPROVED' ? 'APPROVED_PENDING_VENDOR' : 'AWAITING_PROOF_FROM_VENDOR',
        workflowUpdatedAt: new Date(),
      },
    });

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

    // Notifications: internal + vendor (fire-and-forget — decision is already saved)
    try {
      const { sendProofDecisionNotifications } = await import('../services/emailService');
      await sendProofDecisionNotifications(
        {
          jobNo: proof.Job.jobNo,
          title: proof.Job.title,
          vendorName: proof.Job.Vendor?.name || null,
          vendorEmail: proof.Job.Vendor?.email || null,
          vendorPortalToken: proof.Job.JobPortal?.shareToken || null,
        },
        {
          decision: status as 'APPROVED' | 'CHANGES_REQUESTED',
          version: proof.version,
          reviewerName: name,
          reviewerEmail: email,
          comments: comments || null,
        }
      );
    } catch (notifyError) {
      console.error('Proof decision notification failed (decision saved):', notifyError);
    }

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

/**
 * GET /api/approve/:token/files/:fileId
 * Token-scoped inline file serving so the review page can embed the proof.
 * Restricted to PROOF / VENDOR_PROOF files belonging to the proof's job.
 */
export async function getApprovalFile(req: Request, res: Response) {
  try {
    const { token, fileId } = req.params;

    const proof = await prisma.proof.findFirst({
      where: { shareToken: token },
      select: { jobId: true, shareExpiresAt: true },
    });

    if (!proof) {
      return res.status(404).json({ error: 'Approval link not found' });
    }
    if (proof.shareExpiresAt && proof.shareExpiresAt < new Date()) {
      return res.status(410).json({ error: 'Approval link has expired' });
    }

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.jobId !== proof.jobId || !['PROOF', 'VENDOR_PROOF'].includes(file.kind)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(__dirname, '../../uploads/', file.objectKey);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File no longer available' });
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error serving approval file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
}

/**
 * POST /api/approve/:token/comments
 * Customer adds a comment to the proof thread.
 */
export async function addApprovalComment(req: Request, res: Response) {
  try {
    const { token } = req.params;
    const { name, email, body } = req.body;

    if (!name || !body) {
      return res.status(400).json({ error: 'Name and comment are required' });
    }

    const proof = await prisma.proof.findFirst({
      where: { shareToken: token },
      include: { Job: true },
    });

    if (!proof) {
      return res.status(404).json({ error: 'Approval link not found' });
    }
    if (proof.shareExpiresAt && proof.shareExpiresAt < new Date()) {
      return res.status(410).json({ error: 'Approval link has expired' });
    }

    const comment = await prisma.proofComment.create({
      data: {
        id: crypto.randomUUID(),
        proofId: proof.id,
        authorName: name,
        authorEmail: email || null,
        authorRole: 'CUSTOMER',
        body,
      },
    });

    await prisma.jobActivity.create({
      data: {
        id: crypto.randomUUID(),
        jobId: proof.jobId,
        action: 'PROOF_COMMENT_ADDED',
        field: 'proofComment',
        oldValue: null,
        newValue: `${name}: ${body.slice(0, 200)}`,
        changedBy: email || name,
        changedByRole: 'CUSTOMER',
      },
    });

    res.status(201).json({
      success: true,
      comment: {
        id: comment.id,
        authorName: comment.authorName,
        authorRole: comment.authorRole,
        body: comment.body,
        createdAt: comment.createdAt,
      },
    });
  } catch (error) {
    console.error('Error adding approval comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
}
