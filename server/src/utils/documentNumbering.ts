/**
 * Document Numbering Utilities for Impact Direct
 *
 * Generates unique document numbers for:
 * - Customer Invoices: {customerCode}-{number} (e.g., "ABC-001")
 * - Vendor POs: {vendorCode}-{number} (e.g., "VEN-001")
 * - Quotes: Q-{jobNumber}-{version} (e.g., "Q-1001-01")
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  // Check if code already exists
  const existing = await prisma.entity.findUnique({
    where: { uniqueCode: code }
  });

  if (existing) {
    // Add numbers until we find a unique code
    for (let i = 1; i <= 99; i++) {
      const numberedCode = code.substring(0, 2) + i.toString().padStart(1, '0');
      const exists = await prisma.entity.findUnique({
        where: { uniqueCode: numberedCode }
      });

      if (!exists) {
        return numberedCode;
      }
    }

    // Fallback: Use random letters
    const randomCode = generateRandomCode();
    return randomCode;
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
 * Format: {customerCode}-{sequentialNumber}
 * Example: "ABC-001", "ABC-002", etc.
 */
export async function generateInvoiceNumber(customerId: string): Promise<string> {
  const customer = await prisma.entity.findUnique({
    where: { id: customerId }
  });

  if (!customer) {
    throw new Error('Customer not found');
  }

  if (!customer.uniqueCode) {
    throw new Error('Customer does not have a unique code assigned');
  }

  // Increment the counter
  const nextNumber = customer.lastInvoiceNumber + 1;

  // Update the counter in the database
  await prisma.entity.update({
    where: { id: customerId },
    data: { lastInvoiceNumber: nextNumber }
  });

  // Format: ABC-001
  return `${customer.uniqueCode}-${nextNumber.toString().padStart(3, '0')}`;
}

/**
 * Generates the next PO number for a vendor
 * Format: {vendorCode}-{sequentialNumber}
 * Example: "VEN-001", "VEN-002", etc.
 */
export async function generatePONumber(vendorId: string): Promise<string> {
  const vendor = await prisma.entity.findUnique({
    where: { id: vendorId }
  });

  if (!vendor) {
    throw new Error('Vendor not found');
  }

  if (!vendor.uniqueCode) {
    throw new Error('Vendor does not have a unique code assigned');
  }

  // Increment the counter
  const nextNumber = vendor.lastPONumber + 1;

  // Update the counter in the database
  await prisma.entity.update({
    where: { id: vendorId },
    data: { lastPONumber: nextNumber }
  });

  // Format: VEN-001
  return `${vendor.uniqueCode}-${nextNumber.toString().padStart(3, '0')}`;
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
  const jobNumberPart = job.number.replace('J-', '');
  return `Q-${jobNumberPart}-${version.toString().padStart(2, '0')}`;
}

/**
 * Logs a generated document to the job's document history
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

  const documents = Array.isArray(job.generatedDocuments)
    ? job.generatedDocuments as any[]
    : [];

  const newDocument = {
    type: documentType,
    number: documentNumber,
    generatedAt: new Date().toISOString(),
    generatedBy: 'System', // TODO: Add actual user when auth is implemented
    downloadUrl: downloadUrl || null
  };

  documents.push(newDocument);

  await prisma.job.update({
    where: { id: jobId },
    data: {
      generatedDocuments: documents
    }
  });

  return newDocument;
}

/**
 * Retrieves all generated documents for a job
 */
export async function getJobDocuments(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    throw new Error('Job not found');
  }

  return Array.isArray(job.generatedDocuments) ? job.generatedDocuments : [];
}
