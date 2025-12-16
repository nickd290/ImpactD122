import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { RFQStatus, VendorQuoteStatus } from '@prisma/client';
import { sendRfqEmail } from '../services/emailService';

/**
 * Generate RFQ number in format: RFQ-YYYYMMDD-XXX
 */
async function generateRfqNumber(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

  // Count RFQs created today
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const count = await prisma.vendorRFQ.count({
    where: {
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  return `RFQ-${dateStr}-${String(count + 1).padStart(3, '0')}`;
}

/**
 * GET /api/vendor-rfqs
 * List all RFQs with optional filters
 */
export const listRFQs = async (req: Request, res: Response) => {
  try {
    const { status, startDate, endDate, limit = 50, offset = 0 } = req.query;

    const where: any = {};

    if (status) {
      where.status = status as RFQStatus;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [rfqs, total] = await Promise.all([
      prisma.vendorRFQ.findMany({
        where,
        include: {
          vendors: {
            include: {
              Vendor: {
                select: { id: true, name: true, email: true, isPartner: true },
              },
            },
          },
          quotes: {
            include: {
              Vendor: {
                select: { id: true, name: true },
              },
            },
          },
          Job: {
            select: { id: true, jobNo: true, title: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      prisma.vendorRFQ.count({ where }),
    ]);

    // Calculate stats
    const stats = await prisma.vendorRFQ.groupBy({
      by: ['status'],
      _count: true,
    });

    const statusCounts = stats.reduce((acc, s) => {
      acc[s.status] = s._count;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      rfqs,
      total,
      stats: {
        draft: statusCounts.DRAFT || 0,
        pending: statusCounts.PENDING || 0,
        quoted: statusCounts.QUOTED || 0,
        awarded: statusCounts.AWARDED || 0,
        converted: statusCounts.CONVERTED || 0,
        cancelled: statusCounts.CANCELLED || 0,
      },
    });
  } catch (error: any) {
    console.error('List RFQs error:', error);
    res.status(500).json({ error: error.message || 'Failed to list RFQs' });
  }
};

/**
 * GET /api/vendor-rfqs/:id
 * Get single RFQ with details
 */
export const getRFQ = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const rfq = await prisma.vendorRFQ.findUnique({
      where: { id },
      include: {
        vendors: {
          include: {
            Vendor: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                isPartner: true,
                contacts: true,
              },
            },
          },
        },
        quotes: {
          include: {
            Vendor: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { quoteAmount: 'desc' }, // Sort quotes high to low
        },
        Job: {
          select: { id: true, jobNo: true, title: true, status: true },
        },
      },
    });

    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    res.json(rfq);
  } catch (error: any) {
    console.error('Get RFQ error:', error);
    res.status(500).json({ error: error.message || 'Failed to get RFQ' });
  }
};

/**
 * POST /api/vendor-rfqs
 * Create new RFQ
 */
export const createRFQ = async (req: Request, res: Response) => {
  try {
    const { title, specs, dueDate, notes, jobId, vendorIds } = req.body;

    if (!title || !specs || !dueDate) {
      return res.status(400).json({ error: 'Title, specs, and due date are required' });
    }

    if (!vendorIds || vendorIds.length === 0) {
      return res.status(400).json({ error: 'At least one vendor must be selected' });
    }

    // Validate vendors exist
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: vendorIds } },
    });

    if (vendors.length !== vendorIds.length) {
      return res.status(400).json({ error: 'One or more vendors not found' });
    }

    // Generate RFQ number
    const rfqNumber = await generateRfqNumber();

    // Create RFQ with vendor assignments
    const rfq = await prisma.vendorRFQ.create({
      data: {
        rfqNumber,
        title,
        specs,
        dueDate: new Date(dueDate),
        notes: notes || null,
        jobId: jobId || null,
        status: 'DRAFT',
        vendors: {
          create: vendorIds.map((vendorId: string) => ({
            vendorId,
          })),
        },
      },
      include: {
        vendors: {
          include: {
            Vendor: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        Job: {
          select: { id: true, jobNo: true, title: true },
        },
      },
    });

    res.status(201).json(rfq);
  } catch (error: any) {
    console.error('Create RFQ error:', error);
    res.status(500).json({ error: error.message || 'Failed to create RFQ' });
  }
};

/**
 * PATCH /api/vendor-rfqs/:id
 * Update RFQ
 */
export const updateRFQ = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, specs, dueDate, notes, vendorIds } = req.body;

    const existingRfq = await prisma.vendorRFQ.findUnique({
      where: { id },
    });

    if (!existingRfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    // Only allow updates if DRAFT status
    if (existingRfq.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Can only update RFQs in DRAFT status' });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (specs !== undefined) updateData.specs = specs;
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
    if (notes !== undefined) updateData.notes = notes;

    // Update vendor assignments if provided
    if (vendorIds) {
      // Delete existing assignments and create new ones
      await prisma.vendorRFQVendor.deleteMany({
        where: { rfqId: id },
      });

      await prisma.vendorRFQVendor.createMany({
        data: vendorIds.map((vendorId: string) => ({
          rfqId: id,
          vendorId,
        })),
      });
    }

    const rfq = await prisma.vendorRFQ.update({
      where: { id },
      data: updateData,
      include: {
        vendors: {
          include: {
            Vendor: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    res.json(rfq);
  } catch (error: any) {
    console.error('Update RFQ error:', error);
    res.status(500).json({ error: error.message || 'Failed to update RFQ' });
  }
};

/**
 * DELETE /api/vendor-rfqs/:id
 * Delete RFQ (draft only)
 */
export const deleteRFQ = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const rfq = await prisma.vendorRFQ.findUnique({
      where: { id },
    });

    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    if (rfq.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Can only delete RFQs in DRAFT status' });
    }

    await prisma.vendorRFQ.delete({
      where: { id },
    });

    res.json({ success: true, message: 'RFQ deleted' });
  } catch (error: any) {
    console.error('Delete RFQ error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete RFQ' });
  }
};

/**
 * POST /api/vendor-rfqs/:id/send
 * Send RFQ emails to selected vendors
 */
export const sendRFQ = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const rfq = await prisma.vendorRFQ.findUnique({
      where: { id },
      include: {
        vendors: {
          include: {
            Vendor: {
              include: {
                contacts: true,
              },
            },
          },
        },
      },
    });

    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    if (rfq.status !== 'DRAFT') {
      return res.status(400).json({ error: 'RFQ has already been sent' });
    }

    const results: { vendorId: string; vendorName: string; success: boolean; error?: string }[] = [];
    const now = new Date();

    // Send email to each vendor
    for (const vendorAssignment of rfq.vendors) {
      const vendor = vendorAssignment.Vendor;

      // Get primary contact email or vendor email
      const primaryContact = vendor.contacts?.find(c => c.isPrimary);
      const recipientEmail = primaryContact?.email || vendor.email;

      if (!recipientEmail) {
        results.push({
          vendorId: vendor.id,
          vendorName: vendor.name,
          success: false,
          error: 'No email address',
        });
        continue;
      }

      try {
        const emailResult = await sendRfqEmail(rfq, recipientEmail, vendor.name);

        if (emailResult.success) {
          // Update sent timestamp
          await prisma.vendorRFQVendor.update({
            where: {
              rfqId_vendorId: {
                rfqId: id,
                vendorId: vendor.id,
              },
            },
            data: { sentAt: now },
          });

          results.push({
            vendorId: vendor.id,
            vendorName: vendor.name,
            success: true,
          });
        } else {
          results.push({
            vendorId: vendor.id,
            vendorName: vendor.name,
            success: false,
            error: emailResult.error,
          });
        }
      } catch (err: any) {
        results.push({
          vendorId: vendor.id,
          vendorName: vendor.name,
          success: false,
          error: err.message,
        });
      }
    }

    // Update RFQ status to PENDING
    await prisma.vendorRFQ.update({
      where: { id },
      data: { status: 'PENDING' },
    });

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      message: `RFQ sent to ${successCount} of ${results.length} vendors`,
      results,
    });
  } catch (error: any) {
    console.error('Send RFQ error:', error);
    res.status(500).json({ error: error.message || 'Failed to send RFQ' });
  }
};

/**
 * POST /api/vendor-rfqs/:id/quotes
 * Record vendor quote response (manual entry)
 */
export const recordQuote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { vendorId, quoteAmount, turnaroundDays, notes, status } = req.body;

    if (!vendorId || quoteAmount === undefined) {
      return res.status(400).json({ error: 'Vendor ID and quote amount are required' });
    }

    // Verify vendor is assigned to this RFQ
    const vendorAssignment = await prisma.vendorRFQVendor.findUnique({
      where: {
        rfqId_vendorId: {
          rfqId: id,
          vendorId,
        },
      },
    });

    if (!vendorAssignment) {
      return res.status(400).json({ error: 'Vendor is not assigned to this RFQ' });
    }

    // Upsert vendor quote
    const quote = await prisma.vendorQuote.upsert({
      where: {
        rfqId_vendorId: {
          rfqId: id,
          vendorId,
        },
      },
      create: {
        rfqId: id,
        vendorId,
        quoteAmount,
        turnaroundDays: turnaroundDays || null,
        notes: notes || null,
        status: status || 'RECEIVED',
        respondedAt: new Date(),
      },
      update: {
        quoteAmount,
        turnaroundDays: turnaroundDays || null,
        notes: notes || null,
        status: status || 'RECEIVED',
        respondedAt: new Date(),
      },
      include: {
        Vendor: {
          select: { id: true, name: true },
        },
      },
    });

    // Check if all vendors have responded - if so, update RFQ status to QUOTED
    const rfq = await prisma.vendorRFQ.findUnique({
      where: { id },
      include: {
        vendors: true,
        quotes: true,
      },
    });

    if (rfq && rfq.quotes.filter(q => q.status === 'RECEIVED').length === rfq.vendors.length) {
      await prisma.vendorRFQ.update({
        where: { id },
        data: { status: 'QUOTED' },
      });
    }

    res.json(quote);
  } catch (error: any) {
    console.error('Record quote error:', error);
    res.status(500).json({ error: error.message || 'Failed to record quote' });
  }
};

/**
 * POST /api/vendor-rfqs/:id/award/:vendorId
 * Award RFQ to a vendor
 */
export const awardToVendor = async (req: Request, res: Response) => {
  try {
    const { id, vendorId } = req.params;

    const rfq = await prisma.vendorRFQ.findUnique({
      where: { id },
      include: {
        quotes: true,
      },
    });

    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    if (rfq.status === 'CONVERTED') {
      return res.status(400).json({ error: 'RFQ has already been converted to a job' });
    }

    // Verify quote exists from this vendor
    const quote = rfq.quotes.find(q => q.vendorId === vendorId);
    if (!quote) {
      return res.status(400).json({ error: 'No quote found from this vendor' });
    }

    // Clear any previous awards and set this one
    await prisma.vendorQuote.updateMany({
      where: { rfqId: id },
      data: { isAwarded: false },
    });

    await prisma.vendorQuote.update({
      where: { id: quote.id },
      data: { isAwarded: true },
    });

    // Update RFQ status
    await prisma.vendorRFQ.update({
      where: { id },
      data: { status: 'AWARDED' },
    });

    res.json({
      success: true,
      message: 'Vendor awarded',
      awardedQuote: quote,
    });
  } catch (error: any) {
    console.error('Award vendor error:', error);
    res.status(500).json({ error: error.message || 'Failed to award vendor' });
  }
};

/**
 * POST /api/vendor-rfqs/:id/convert-to-job
 * Convert awarded RFQ to a new Job
 */
export const convertToJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { customerId, title: overrideTitle } = req.body;

    const rfq = await prisma.vendorRFQ.findUnique({
      where: { id },
      include: {
        quotes: {
          where: { isAwarded: true },
          include: {
            Vendor: true,
          },
        },
        Job: true,
      },
    });

    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    if (rfq.status === 'CONVERTED') {
      return res.status(400).json({ error: 'RFQ has already been converted to a job' });
    }

    if (rfq.quotes.length === 0) {
      return res.status(400).json({ error: 'No vendor has been awarded. Award a vendor first.' });
    }

    const awardedQuote = rfq.quotes[0];

    // If RFQ already has a linked job, just update the vendorId
    if (rfq.Job) {
      await prisma.job.update({
        where: { id: rfq.Job.id },
        data: {
          vendorId: awardedQuote.vendorId,
          sellPrice: awardedQuote.quoteAmount,
        },
      });

      await prisma.vendorRFQ.update({
        where: { id },
        data: { status: 'CONVERTED' },
      });

      return res.json({
        success: true,
        message: 'Job updated with awarded vendor',
        jobId: rfq.Job.id,
        jobNo: rfq.Job.jobNo,
      });
    }

    // Require customerId for new job
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required to create a new job' });
    }

    // Generate job number
    const lastJob = await prisma.job.findFirst({
      orderBy: { jobNo: 'desc' },
    });

    let jobNo = 'J-1001';
    if (lastJob) {
      const match = lastJob.jobNo.match(/J-(\d+)/);
      if (match) {
        const lastNumber = parseInt(match[1]);
        jobNo = `J-${(lastNumber + 1).toString().padStart(4, '0')}`;
      }
    }

    // Create new job
    const job = await prisma.job.create({
      data: {
        id: crypto.randomUUID(),
        jobNo,
        title: overrideTitle || rfq.title,
        customerId,
        vendorId: awardedQuote.vendorId,
        status: 'ACTIVE',
        sellPrice: awardedQuote.quoteAmount,
        specs: {
          rfqSpecs: rfq.specs,
          rfqNumber: rfq.rfqNumber,
        },
        updatedAt: new Date(),
      },
    });

    // Link RFQ to job and update status
    await prisma.vendorRFQ.update({
      where: { id },
      data: {
        jobId: job.id,
        status: 'CONVERTED',
      },
    });

    res.json({
      success: true,
      message: 'Job created from RFQ',
      jobId: job.id,
      jobNo: job.jobNo,
    });
  } catch (error: any) {
    console.error('Convert to job error:', error);
    res.status(500).json({ error: error.message || 'Failed to convert RFQ to job' });
  }
};
