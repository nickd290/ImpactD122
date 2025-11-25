import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { generateQuotePDF, generateInvoicePDF, generateVendorPOPDF } from '../services/pdfService';

// Generate Quote PDF
export const generateQuote = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        customer: true,
        vendor: true,
        lineItems: { orderBy: { sortOrder: 'asc' } },
        specs: true,
        financials: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const pdfBuffer = generateQuotePDF(job);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Quote-${job.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate quote error:', error);
    res.status(500).json({ error: 'Failed to generate quote' });
  }
};

// Generate Invoice PDF
export const generateInvoice = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        customer: true,
        vendor: true,
        lineItems: { orderBy: { sortOrder: 'asc' } },
        specs: true,
        financials: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const pdfBuffer = generateInvoicePDF(job);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${job.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate invoice error:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
};

// Generate Vendor PO PDF
export const generateVendorPO = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        customer: true,
        vendor: true,
        lineItems: { orderBy: { sortOrder: 'asc' } },
        specs: true,
        financials: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const pdfBuffer = generateVendorPOPDF(job);

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PO-${job.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate vendor PO error:', error);
    res.status(500).json({ error: 'Failed to generate vendor PO' });
  }
};
