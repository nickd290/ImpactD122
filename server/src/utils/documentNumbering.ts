/**
 * Document Numbering Utilities for Impact Direct - Production Schema Version
 *
 * Generates unique document numbers for:
 * - Customer Invoices: {customerCode}-{number} (e.g., "ABC-001")
 * - Vendor POs: {vendorCode}-{number} (e.g., "VEN-001")
 * - Quotes: Q-{jobNumber}-{version} (e.g., "Q-1001-01")
 */

import { prisma } from './prisma';

/**
 * Generates a unique 3-character code for an entity
 * Uses company name to create a pronounceable code
 */
export async function generateEntityUniqueCode(entityName: string, entityType: 'CUSTOMER' | 'VENDOR'): Promise<string> {
  // Clean the name - remove special chars, keep only letters
  const cleanName = entityName.replace(/[^A-Za-z\s]/g, '').toUpperCase();

  // Try to create a meaningful code from the name
  const words = cleanName.split(' ').filter(w => w.length > 0);

  let code = '';

  if (words.length >= 3) {
    // Use first letter of first 3 words
    code = words.slice(0, 3).map(w => w[0]).join('');
  } else if (words.length === 2) {
    // Use first 2 letters of first word + first letter of second
    code = words[0].substring(0, 2) + words[1][0];
  } else if (words.length === 1 && words[0].length >= 3) {
    // Use first 3 letters
    code = words[0].substring(0, 3);
  } else {
    // Fallback: pad with type indicator
    const prefix = entityType === 'CUSTOMER' ? 'C' : 'V';
    code = (words[0] || prefix).substring(0, 2).padEnd(2, 'X') + prefix;
  }

  // For production schema, check against Company or Vendor based on type
  if (entityType === 'CUSTOMER') {
    const existing = await prisma.company.findFirst({
      where: { name: { contains: cleanName } }
    });
    if (existing) {
      // Add number to make unique
      code = code + Math.floor(Math.random() * 99).toString().padStart(2, '0');
    }
  } else {
    const existing = await prisma.vendor.findFirst({
      where: { name: { contains: cleanName } }
    });
    if (existing) {
      code = code + Math.floor(Math.random() * 99).toString().padStart(2, '0');
    }
  }

  return code;
}

/**
 * Generate a random 3-character code as fallback
 */
function generateRandomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generates the next invoice number for a customer
 * Format: INV-{jobNumber}
 */
export async function generateInvoiceNumber(customerId: string): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { id: customerId }
  });

  if (!company) {
    throw new Error('Customer not found');
  }

  // Count existing jobs for this customer to generate unique number
  const jobCount = await prisma.job.count({
    where: { customerId }
  });

  const code = company.name.substring(0, 3).toUpperCase();
  return `${code}-${(jobCount + 1).toString().padStart(3, '0')}`;
}

/**
 * Generates the next PO number for a vendor
 * Format: PO-{vendorCode}-{number}
 */
export async function generatePONumber(vendorId: string): Promise<string> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId }
  });

  if (!vendor) {
    throw new Error('Vendor not found');
  }

  // Count existing jobs for this vendor to generate unique number
  const jobCount = await prisma.job.count({
    where: { vendorId }
  });

  const code = vendor.vendorCode || vendor.name.substring(0, 3).toUpperCase();
  return `${code}-${(jobCount + 1).toString().padStart(3, '0')}`;
}

/**
 * Generates a quote number for a job
 * Format: Q-{jobNumber}-{version}
 * Example: "Q-1001-01", "Q-1001-02" for revisions
 */
export async function generateQuoteNumber(jobId: string, version: number = 1): Promise<string> {
  const job = await prisma.job.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    throw new Error('Job not found');
  }

  // Format: Q-1001-01
  const jobNumberPart = job.jobNo.replace('J-', '');
  return `Q-${jobNumberPart}-${version.toString().padStart(2, '0')}`;
}

/**
 * Logs a generated document to the job's document history
 * Note: Production schema doesn't have generatedDocuments field - this is a stub
 */
export async function logGeneratedDocument(
  jobId: string,
  documentType: 'INVOICE' | 'PO' | 'QUOTE',
  documentNumber: string,
  downloadUrl?: string
) {
  const job = await prisma.job.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    throw new Error('Job not found');
  }

  // Production schema doesn't have generatedDocuments field
  // Just return the document info
  const newDocument = {
    type: documentType,
    number: documentNumber,
    generatedAt: new Date().toISOString(),
    generatedBy: 'System',
    downloadUrl: downloadUrl || null
  };

  console.log(`Document generated: ${documentType} ${documentNumber} for job ${job.jobNo}`);

  return newDocument;
}

/**
 * Retrieves all generated documents for a job
 * Note: Production schema doesn't have generatedDocuments field - returns empty array
 */
export async function getJobDocuments(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    throw new Error('Job not found');
  }

  // Production schema doesn't have generatedDocuments field
  return [];
}
