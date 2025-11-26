// Vendor Matching Service - Stub for production schema
// This service depends on models not present in the production database
// (Entity, VendorCapability, etc.)
//
// The production schema uses Company and Vendor models directly

import { prisma } from '../utils/prisma';

export interface VendorMatch {
  vendor: any;
  score: number;
  matchedServices: string[];
}

/**
 * Extract required print services from job specs - Stub implementation
 */
export function extractServicesFromSpecs(specs: any): string[] {
  const services: string[] = [];

  if (specs?.productType) services.push(specs.productType);
  if (specs?.coating) services.push('COATING');
  if (specs?.finishing) services.push('FINISHING');
  if (specs?.bindingStyle) services.push('BINDING');

  return services;
}

/**
 * Find top matching vendors for job requirements - Stub implementation
 */
export async function findTopMatchingVendors(
  specs: any,
  limit: number = 5
): Promise<VendorMatch[]> {
  // In production schema, just return all active vendors
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    take: limit,
  });

  const services = extractServicesFromSpecs(specs);

  return vendors.map(vendor => ({
    vendor: {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
      phone: vendor.phone,
      type: 'VENDOR',
      isPartner: vendor.vendorCode === 'BRADFORD' || vendor.name?.toLowerCase().includes('bradford'),
    },
    score: 50, // Default score since we don't have capability matching
    matchedServices: services,
  }));
}

/**
 * Get vendors by IDs - Uses production Vendor model
 */
export async function getVendorsByIds(vendorIds: string[]): Promise<any[]> {
  const vendors = await prisma.vendor.findMany({
    where: {
      id: { in: vendorIds },
      isActive: true,
    },
  });

  return vendors.map(vendor => ({
    id: vendor.id,
    name: vendor.name,
    email: vendor.email,
    phone: vendor.phone,
    type: 'VENDOR',
    isPartner: vendor.vendorCode === 'BRADFORD' || vendor.name?.toLowerCase().includes('bradford'),
    address: [vendor.streetAddress, vendor.city, vendor.state, vendor.zip].filter(Boolean).join(', '),
  }));
}

/**
 * Get all vendors - Uses production Vendor model
 */
export async function getAllVendors(): Promise<any[]> {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  return vendors.map(vendor => ({
    id: vendor.id,
    name: vendor.name,
    email: vendor.email,
    phone: vendor.phone,
    type: 'VENDOR',
    isPartner: vendor.vendorCode === 'BRADFORD' || vendor.name?.toLowerCase().includes('bradford'),
    address: [vendor.streetAddress, vendor.city, vendor.state, vendor.zip].filter(Boolean).join(', '),
  }));
}

/**
 * Get service name in human-readable format
 */
export function getServiceDisplayName(service: string): string {
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
  return names[service] || service;
}
