import { prisma } from '../utils/prisma';
import { Entity, VendorCapability, JobSpecs } from '@prisma/client';

// Vendor match result with scoring
export interface VendorMatch {
  vendor: Entity;
  capabilities: VendorCapability | null;
  matchScore: number;  // 0-100
  missingServices: string[];
  canFulfill: boolean;
  estimatedLeadTime: number;
  matchDetails: {
    serviceMatch: number;
    quantityFit: number;
    leadTimeScore: number;
    partnerBonus: number;
  };
}

/**
 * Extract required services from job specifications
 */
export function extractServicesFromSpecs(specs: JobSpecs): string[] {
  const services: string[] = ['printing']; // Base service always required

  if (!specs) return services;

  // Parse finishing field for additional services
  if (specs.finishing) {
    const finishing = specs.finishing.toLowerCase();

    if (finishing.includes('foil')) services.push('foilStamping');
    if (finishing.includes('emboss')) services.push('embossing');
    if (finishing.includes('die cut') || finishing.includes('die-cut')) services.push('dieCutting');
    if (finishing.includes('lamination') || finishing.includes('laminate')) services.push('lamination');
    if (finishing.includes('score') || finishing.includes('scoring')) services.push('scoring');
    if (finishing.includes('fold')) services.push('folding');
  }

  // Binding
  if (specs.bindingStyle) {
    services.push('binding');
  }

  // Coating
  if (specs.coating) {
    const coating = specs.coating.toLowerCase();
    if (coating.includes('uv')) {
      services.push('uvCoating');
    } else if (coating.includes('lamination')) {
      services.push('lamination');
    }
  }

  // Remove duplicates
  return [...new Set(services)];
}

/**
 * Calculate match score for a vendor based on job requirements
 */
function calculateMatchScore(
  vendor: Entity,
  capabilities: VendorCapability | null,
  requiredServices: string[],
  specs: JobSpecs
): {
  score: number;
  details: {
    serviceMatch: number;
    quantityFit: number;
    leadTimeScore: number;
    partnerBonus: number;
  };
} {
  const details = {
    serviceMatch: 0,
    quantityFit: 0,
    leadTimeScore: 0,
    partnerBonus: 0,
  };

  if (!capabilities) {
    // No capabilities defined - can only do basic printing
    if (requiredServices.length === 1 && requiredServices[0] === 'printing') {
      details.serviceMatch = 70;
    } else {
      details.serviceMatch = 0;
    }
    return { score: details.serviceMatch, details };
  }

  // Service capability match (70% weight)
  const serviceMatches = requiredServices.filter(service => {
    // @ts-ignore - Dynamic property access
    return capabilities[service] === true;
  });
  details.serviceMatch = (serviceMatches.length / requiredServices.length) * 70;

  // Quantity compatibility (10% weight)
  // Estimate quantity from line items or page count
  const estimatedQuantity = specs.pageCount || 1000;
  if (capabilities.minQuantity && estimatedQuantity >= capabilities.minQuantity) {
    details.quantityFit += 5;
  }
  if (capabilities.maxQuantity && estimatedQuantity <= capabilities.maxQuantity) {
    details.quantityFit += 5;
  } else if (!capabilities.maxQuantity) {
    details.quantityFit += 5; // No max limit is good
  }

  // Lead time (10% weight)
  if (capabilities.avgLeadTimeDays) {
    if (capabilities.avgLeadTimeDays <= 7) {
      details.leadTimeScore = 10;
    } else if (capabilities.avgLeadTimeDays <= 14) {
      details.leadTimeScore = 5;
    } else {
      details.leadTimeScore = 2;
    }
  } else {
    details.leadTimeScore = 5; // Default middle score if unknown
  }

  // Partner status (10% weight)
  if (vendor.isPartner) {
    details.partnerBonus = 10;
  }

  const totalScore = Math.min(
    details.serviceMatch + details.quantityFit + details.leadTimeScore + details.partnerBonus,
    100
  );

  return { score: totalScore, details };
}

/**
 * Find vendors that match the job specifications
 */
export async function matchVendorsToJobSpecs(specs: JobSpecs): Promise<VendorMatch[]> {
  // Extract required services
  const requiredServices = extractServicesFromSpecs(specs);

  // Fetch all vendors with their capabilities
  const vendors = await prisma.entity.findMany({
    where: { type: 'VENDOR' },
    include: { capability: true },
  });

  // Score each vendor
  const matches: VendorMatch[] = vendors.map(vendor => {
    const capabilities = vendor.capability;
    const { score, details } = calculateMatchScore(vendor, capabilities, requiredServices, specs);

    // Find missing services
    const missingServices = requiredServices.filter(service => {
      if (!capabilities) return service !== 'printing';
      // @ts-ignore
      return !capabilities[service];
    });

    return {
      vendor,
      capabilities,
      matchScore: score,
      missingServices,
      canFulfill: score >= 70 && missingServices.length === 0,
      estimatedLeadTime: capabilities?.avgLeadTimeDays || 14,
      matchDetails: details,
    };
  });

  // Sort by match score (descending)
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Find top N matching vendors for a job
 */
export async function findTopMatchingVendors(
  specs: JobSpecs,
  limit: number = 5
): Promise<VendorMatch[]> {
  const allMatches = await matchVendorsToJobSpecs(specs);

  // Filter to vendors that can fulfill (score >= 70 and no missing services)
  const canFulfill = allMatches.filter(m => m.canFulfill);

  if (canFulfill.length >= limit) {
    return canFulfill.slice(0, limit);
  }

  // If not enough perfect matches, include partial matches (score >= 50)
  const partialMatches = allMatches.filter(m => m.matchScore >= 50);
  return partialMatches.slice(0, limit);
}

/**
 * Get vendors by specific IDs with capabilities
 */
export async function getVendorsByIds(vendorIds: string[]): Promise<VendorMatch[]> {
  const vendors = await prisma.entity.findMany({
    where: {
      id: { in: vendorIds },
      type: 'VENDOR',
    },
    include: { capability: true },
  });

  return vendors.map(vendor => ({
    vendor,
    capabilities: vendor.capability,
    matchScore: 100, // Manually selected
    missingServices: [],
    canFulfill: true,
    estimatedLeadTime: vendor.capability?.avgLeadTimeDays || 14,
    matchDetails: {
      serviceMatch: 100,
      quantityFit: 0,
      leadTimeScore: 0,
      partnerBonus: 0,
    },
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
