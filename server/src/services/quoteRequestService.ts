import { prisma } from '../utils/prisma';
import { Job, QuoteRequest, VendorQuote, Entity, JobSpecs, LineItem } from '@prisma/client';
import { extractServicesFromSpecs, findTopMatchingVendors, getVendorsByIds, VendorMatch } from './vendorMatchingService';
import sgMail from '@sendgrid/mail';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Initialize Gemini for email generation
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Generate a unique quote request number
 */
async function generateQuoteRequestNumber(): Promise<string> {
  const count = await prisma.quoteRequest.count();
  const nextNumber = count + 1;
  return `QR-${nextNumber.toString().padStart(4, '0')}`;
}

/**
 * Create a quote request for a job
 */
export async function createQuoteRequest(
  jobId: string,
  vendorIds?: string[]
): Promise<QuoteRequest & { vendorQuotes: (VendorQuote & { vendor: Entity })[] }> {
  // Get job with all details
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      specs: true,
      lineItems: true,
      customer: true,
    },
  });

  if (!job) {
    throw new Error('Job not found');
  }

  if (!job.specs) {
    throw new Error('Job specifications not found');
  }

  // Generate request number
  const requestNumber = await generateQuoteRequestNumber();

  // Extract required services
  const requiredServices = extractServicesFromSpecs(job.specs);

  // Find matching vendors
  let vendors: VendorMatch[];
  if (vendorIds && vendorIds.length > 0) {
    vendors = await getVendorsByIds(vendorIds);
  } else {
    vendors = await findTopMatchingVendors(job.specs, 5);
  }

  if (vendors.length === 0) {
    throw new Error('No matching vendors found');
  }

  // Create quote request
  const quoteRequest = await prisma.quoteRequest.create({
    data: {
      jobId,
      requestNumber,
      specs: job.specs as any,
      requiredServices,
      dueDate: job.dueDate,
      status: 'DRAFT',
      vendorQuotes: {
        create: vendors.map(v => ({
          vendorId: v.vendor.id,
          status: 'PENDING',
        })),
      },
    },
    include: {
      vendorQuotes: {
        include: { vendor: true },
      },
    },
  });

  return quoteRequest;
}

/**
 * Generate RFQ email content using AI
 */
export async function generateVendorQuoteRequestEmail(
  job: Job & { specs: JobSpecs | null; lineItems: LineItem[]; customer: Entity },
  vendor: Entity,
  requiredServices: string[]
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const servicesList = requiredServices
    .map(s => {
      const names: Record<string, string> = {
        printing: 'Printing',
        binding: 'Binding',
        foilStamping: 'Foil Stamping',
        embossing: 'Embossing',
        dieCutting: 'Die Cutting',
        uvCoating: 'UV Coating',
        lamination: 'Lamination',
        scoring: 'Scoring',
        folding: 'Folding',
      };
      return names[s] || s;
    })
    .join(', ');

  const specsDetails = job.specs
    ? `
**Product Type**: ${job.specs.productType}
**Finished Size**: ${job.specs.finishedSize || 'TBD'}
**Flat Size**: ${job.specs.flatSize || 'TBD'}
**Colors**: ${job.specs.colors || 'TBD'}
**Paper Type**: ${job.specs.paperType || 'TBD'}
${job.specs.coverPaperType ? `**Cover Paper**: ${job.specs.coverPaperType}` : ''}
${job.specs.pageCount ? `**Page Count**: ${job.specs.pageCount}` : ''}
${job.specs.bindingStyle ? `**Binding**: ${job.specs.bindingStyle}` : ''}
${job.specs.coating ? `**Coating**: ${job.specs.coating}` : ''}
${job.specs.finishing ? `**Finishing**: ${job.specs.finishing}` : ''}
  `.trim()
    : 'Specifications to be determined.';

  const lineItemsList = job.lineItems
    .map(item => `- ${item.description} (Quantity: ${item.quantity.toLocaleString()})`)
    .join('\n');

  const dueDateText = job.dueDate
    ? `**Required by**: ${new Date(job.dueDate).toLocaleDateString()}`
    : '**Required by**: As soon as possible';

  const prompt = `Write a professional Request for Quote (RFQ) email to send to a print vendor.

**Context:**
- Sending to: ${vendor.name} (${vendor.contactPerson})
- For Job: ${job.number} - ${job.title}
- Customer: ${job.customer.name}
- Required Services: ${servicesList}

**Job Specifications:**
${specsDetails}

**Line Items:**
${lineItemsList}

**Deadline:**
${dueDateText}

**Required in Quote Response:**
1. Unit pricing breakdown for each line item/service
2. Lead time (turnaround time)
3. Any setup, tooling, or die costs
4. Minimum order quantities (if applicable)
5. Shipping costs or options
6. Payment terms

**Tone:**
- Professional and clear
- Include all technical specs
- Request detailed pricing breakdown
- Friendly but business-focused

**Sign-off:**
Brandon Ferris
Impact Direct Printing
brandon@impactdirectprinting.com
Phone: [Your phone number]

Generate the email body only (no subject line). Make it well-formatted with proper line breaks.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

/**
 * Send quote request emails to vendors
 */
export async function sendQuoteRequest(quoteRequestId: string): Promise<void> {
  const quoteRequest = await prisma.quoteRequest.findUnique({
    where: { id: quoteRequestId },
    include: {
      job: {
        include: {
          specs: true,
          lineItems: true,
          customer: true,
        },
      },
      vendorQuotes: {
        include: { vendor: true },
      },
    },
  });

  if (!quoteRequest) {
    throw new Error('Quote request not found');
  }

  if (!quoteRequest.job.specs) {
    throw new Error('Job specifications not found');
  }

  // Generate and send email to each vendor
  for (const vendorQuote of quoteRequest.vendorQuotes) {
    const emailBody = await generateVendorQuoteRequestEmail(
      quoteRequest.job,
      vendorQuote.vendor,
      quoteRequest.requiredServices
    );

    // Send email via SendGrid
    if (process.env.SENDGRID_API_KEY) {
      try {
        await sgMail.send({
          to: vendorQuote.vendor.email,
          from: process.env.SENDGRID_FROM_EMAIL || 'brandon@impactdirectprinting.com',
          subject: `RFQ: ${quoteRequest.job.number} - ${quoteRequest.job.title}`,
          text: emailBody,
          html: emailBody.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
        });

        // Update vendor quote status
        await prisma.vendorQuote.update({
          where: { id: vendorQuote.id },
          data: {
            sentEmailAt: new Date(),
            status: 'PENDING',
          },
        });
      } catch (error) {
        console.error(`Failed to send email to ${vendorQuote.vendor.name}:`, error);
        throw new Error(`Failed to send email to ${vendorQuote.vendor.name}`);
      }
    } else {
      // No SendGrid configured - just mark as sent for testing
      await prisma.vendorQuote.update({
        where: { id: vendorQuote.id },
        data: {
          sentEmailAt: new Date(),
          status: 'PENDING',
        },
      });
    }
  }

  // Update quote request status
  await prisma.quoteRequest.update({
    where: { id: quoteRequestId },
    data: {
      status: 'SENT',
      sentAt: new Date(),
    },
  });
}

/**
 * Get quote request with all vendor quotes
 */
export async function getQuoteRequest(quoteRequestId: string) {
  return await prisma.quoteRequest.findUnique({
    where: { id: quoteRequestId },
    include: {
      job: {
        include: {
          specs: true,
          lineItems: true,
          customer: true,
        },
      },
      vendorQuotes: {
        include: { vendor: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

/**
 * Record a vendor's quote response
 */
export async function recordVendorQuote(
  vendorQuoteId: string,
  quoteData: {
    quoteNumber?: string;
    totalCost: number;
    leadTimeDays: number;
    notes?: string;
    lineItems?: any;
  }
) {
  const vendorQuote = await prisma.vendorQuote.update({
    where: { id: vendorQuoteId },
    data: {
      ...quoteData,
      status: 'RECEIVED',
      receivedAt: new Date(),
    },
  });

  // Update quote request status to RESPONSES_RECEIVED
  await prisma.quoteRequest.update({
    where: { id: vendorQuote.quoteRequestId },
    data: { status: 'RESPONSES_RECEIVED' },
  });

  return vendorQuote;
}

/**
 * Award quote to a vendor (select winning vendor)
 */
export async function awardQuoteToVendor(vendorQuoteId: string) {
  const vendorQuote = await prisma.vendorQuote.findUnique({
    where: { id: vendorQuoteId },
    include: {
      quoteRequest: {
        include: { job: true },
      },
      vendor: true,
    },
  });

  if (!vendorQuote) {
    throw new Error('Vendor quote not found');
  }

  // Update vendor quote status
  await prisma.vendorQuote.update({
    where: { id: vendorQuoteId },
    data: {
      status: 'ACCEPTED',
      acceptedAt: new Date(),
    },
  });

  // Update job vendor assignment
  await prisma.job.update({
    where: { id: vendorQuote.quoteRequest.jobId },
    data: { vendorId: vendorQuote.vendorId },
  });

  // Update quote request status
  await prisma.quoteRequest.update({
    where: { id: vendorQuote.quoteRequestId },
    data: { status: 'AWARDED' },
  });

  // Reject other vendor quotes
  await prisma.vendorQuote.updateMany({
    where: {
      quoteRequestId: vendorQuote.quoteRequestId,
      id: { not: vendorQuoteId },
      status: { in: ['PENDING', 'RECEIVED'] },
    },
    data: { status: 'REJECTED' },
  });

  return vendorQuote;
}

/**
 * Get all quote requests for a job
 */
export async function getQuoteRequestsForJob(jobId: string) {
  return await prisma.quoteRequest.findMany({
    where: { jobId },
    include: {
      vendorQuotes: {
        include: { vendor: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get vendor quote by ID
 */
export async function getVendorQuote(vendorQuoteId: string) {
  return await prisma.vendorQuote.findUnique({
    where: { id: vendorQuoteId },
    include: {
      vendor: true,
      quoteRequest: {
        include: {
          job: {
            include: {
              specs: true,
              lineItems: true,
            },
          },
        },
      },
    },
  });
}
