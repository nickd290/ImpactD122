// Quote Request Service - Stub for production schema
// This service depends on models not present in the production database
// (VendorQuote, Entity.isPartner, etc.)
//
// The production schema uses a different approach with Company/Vendor models

import { prisma } from '../utils/prisma';

/**
 * Generate a unique quote request number
 */
async function generateQuoteRequestNumber(): Promise<string> {
  const count = await prisma.quoteRequest.count();
  const nextNumber = count + 1;
  return `QR-${nextNumber.toString().padStart(4, '0')}`;
}

/**
 * Create a quote request for a job - Stub implementation
 */
export async function createQuoteRequest(
  jobId: string,
  vendorIds?: string[]
): Promise<any> {
  console.warn('createQuoteRequest: Feature not available in production schema');
  throw new Error('Quote request feature not available - production schema uses a different workflow');
}

/**
 * Get quote request by ID - Stub implementation
 */
export async function getQuoteRequestById(requestId: string): Promise<any> {
  console.warn('getQuoteRequestById: Feature not available in production schema');
  throw new Error('Quote request feature not available - production schema uses a different workflow');
}

/**
 * Get quote requests for a job - Stub implementation
 */
export async function getQuoteRequestsForJob(jobId: string): Promise<any[]> {
  console.warn('getQuoteRequestsForJob: Feature not available in production schema');
  return [];
}

/**
 * Send quote request to vendors - Stub implementation
 */
export async function sendQuoteRequest(requestId: string): Promise<any> {
  console.warn('sendQuoteRequest: Feature not available in production schema');
  throw new Error('Quote request feature not available - production schema uses a different workflow');
}

/**
 * Record vendor quote response - Stub implementation
 */
export async function recordVendorQuote(
  requestId: string,
  vendorId: string,
  price: number,
  notes?: string,
  turnaroundDays?: number
): Promise<any> {
  console.warn('recordVendorQuote: Feature not available in production schema');
  throw new Error('Quote request feature not available - production schema uses a different workflow');
}

/**
 * Award job to vendor - Stub implementation
 */
export async function awardToVendor(requestId: string, vendorId: string): Promise<any> {
  console.warn('awardToVendor: Feature not available in production schema');
  throw new Error('Quote request feature not available - production schema uses a different workflow');
}

/**
 * Get all quote requests for a job - Stub implementation
 */
export async function getJobQuoteRequests(jobId: string): Promise<any[]> {
  console.warn('getJobQuoteRequests: Feature not available in production schema');
  return [];
}
