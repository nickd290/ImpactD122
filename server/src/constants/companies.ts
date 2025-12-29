/**
 * Company and Business Rule Constants
 *
 * CRITICAL: These values are the single source of truth for:
 * - Internal company identifiers
 * - Business rule percentages
 * - Vendor detection patterns
 *
 * DO NOT hard-code these strings elsewhere in the codebase.
 * Import from this file instead.
 */

// ============================================================================
// COMPANY IDENTIFIERS
// ============================================================================

/**
 * Internal company IDs used in PurchaseOrder.originCompanyId and targetCompanyId
 * These are NOT foreign keys - they're string identifiers.
 * TODO: Migrate to actual FK relationships in Phase 3
 */
export const COMPANY_IDS = {
  IMPACT_DIRECT: 'impact-direct',
  BRADFORD: 'bradford',
  JD_GRAPHIC: 'jd-graphic',
} as const;

export type CompanyId = typeof COMPANY_IDS[keyof typeof COMPANY_IDS];

// ============================================================================
// VENDOR DETECTION
// ============================================================================

/**
 * Vendor codes for special vendor detection
 */
export const VENDOR_CODES = {
  BRADFORD: 'BRADFORD',
  THREEZ: 'THREEZ',
} as const;

/**
 * Check if a vendor is Bradford partner
 * Centralizes the scattered `vendorCode === 'BRADFORD' || name.includes('bradford')` checks
 */
export function isBradfordVendor(vendor: { vendorCode?: string | null; name?: string | null }): boolean {
  if (!vendor) return false;
  return vendor.vendorCode === VENDOR_CODES.BRADFORD ||
         vendor.name?.toLowerCase().includes('bradford') === true;
}

/**
 * Check if a vendor is ThreeZ
 */
export function isThreeZVendor(vendor: { name?: string | null }): boolean {
  if (!vendor?.name) return false;
  return vendor.name.toLowerCase() === 'threez';
}

// ============================================================================
// BUSINESS RULES
// ============================================================================

/**
 * Core business rule percentages
 * These control profit splitting and paper markup calculations
 */
export const BUSINESS_RULES = {
  /** Paper markup percentage Bradford applies (18%) */
  PAPER_MARKUP_PERCENT: 0.18,

  /** Profit split percentage (50/50 between Impact and Bradford) */
  PROFIT_SPLIT_PERCENT: 0.50,

  /** Alternative split for non-Bradford vendors (35% to Bradford) */
  NON_BRADFORD_SPLIT_PERCENT: 0.35,
} as const;

// ============================================================================
// PO TYPE IDENTIFIERS
// ============================================================================

/**
 * Purchase Order type strings
 */
export const PO_TYPES = {
  BRADFORD_JD: 'bradford-jd',              // Bradford → JD Graphic (internal, for BRADFORD_JD routing)
  IMPACT_BRADFORD: 'impact-bradford',       // Impact → Bradford (for BRADFORD_JD routing)
  IMPACT_JD: 'impact-jd',                   // Impact → JD Graphic (direct, for IMPACT_JD routing)
  IMPACT_VENDOR: 'impact-vendor',           // Impact → Third-party vendor
  BRADFORD_REFERRAL: 'bradford-referral',   // Bradford referral/consulting fee (for IMPACT_JD routing)
} as const;

export type POType = typeof PO_TYPES[keyof typeof PO_TYPES];

// ============================================================================
// ROUTING TYPES (mirrors Prisma enum)
// ============================================================================

export const ROUTING_TYPES = {
  BRADFORD_JD: 'BRADFORD_JD',           // Bradford Commercial: Impact → Bradford → JD (50/50 + paper markup)
  IMPACT_JD: 'IMPACT_JD',               // Impact Direct to JD: Impact → JD (65/35, Bradford gets referral fee)
  THIRD_PARTY_VENDOR: 'THIRD_PARTY_VENDOR', // Third-party vendor: Impact → Vendor (65/35)
} as const;

export type RoutingType = typeof ROUTING_TYPES[keyof typeof ROUTING_TYPES];

// ============================================================================
// PAPER SOURCES (mirrors Prisma enum)
// ============================================================================

export const PAPER_SOURCES = {
  BRADFORD: 'BRADFORD',
  VENDOR: 'VENDOR',
  CUSTOMER: 'CUSTOMER',
} as const;

export type PaperSource = typeof PAPER_SOURCES[keyof typeof PAPER_SOURCES];

// ============================================================================
// COMPANY DISPLAY NAMES
// ============================================================================

/**
 * Human-readable company names for PDFs and emails
 */
export const COMPANY_NAMES = {
  [COMPANY_IDS.IMPACT_DIRECT]: 'Impact Direct',
  [COMPANY_IDS.BRADFORD]: 'Bradford Direct',
  [COMPANY_IDS.JD_GRAPHIC]: 'JD Graphic',
} as const;

/**
 * Get display name from company ID
 */
export function getCompanyDisplayName(companyId: string | null | undefined): string {
  if (!companyId) return 'Unknown';
  return COMPANY_NAMES[companyId as CompanyId] || companyId;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a PO is Impact-origin (counts toward Impact's cost)
 */
export function isImpactOriginPO(po: { originCompanyId?: string | null }): boolean {
  return po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT;
}

/**
 * Check if a PO is Bradford→JD (internal routing, not counted as Impact cost)
 */
export function isBradfordToJDPO(po: { originCompanyId?: string | null; targetCompanyId?: string | null }): boolean {
  return po.originCompanyId === COMPANY_IDS.BRADFORD &&
         po.targetCompanyId === COMPANY_IDS.JD_GRAPHIC;
}

/**
 * Check if a PO is Impact→Bradford
 */
export function isImpactToBradfordPO(po: { originCompanyId?: string | null; targetCompanyId?: string | null }): boolean {
  return po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT &&
         po.targetCompanyId === COMPANY_IDS.BRADFORD;
}

/**
 * Check if a PO is Impact→JD (direct routing, bypassing Bradford)
 */
export function isImpactToJDPO(po: { originCompanyId?: string | null; targetCompanyId?: string | null }): boolean {
  return po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT &&
         po.targetCompanyId === COMPANY_IDS.JD_GRAPHIC;
}

/**
 * Check if routing type uses 65/35 split (IMPACT_JD or THIRD_PARTY_VENDOR)
 */
export function isDirectRoutingType(routingType: string | null | undefined): boolean {
  return routingType === ROUTING_TYPES.IMPACT_JD ||
         routingType === ROUTING_TYPES.THIRD_PARTY_VENDOR;
}

/**
 * Get the company name that JD should write up the job for based on routing type
 */
export function getJobOriginCompanyForJD(routingType: string | null | undefined): {
  companyId: string;
  companyName: string;
  onBehalfOf: string;
} {
  if (routingType === ROUTING_TYPES.IMPACT_JD) {
    return {
      companyId: COMPANY_IDS.IMPACT_DIRECT,
      companyName: COMPANY_NAMES[COMPANY_IDS.IMPACT_DIRECT],
      onBehalfOf: 'On behalf of Impact Direct',
    };
  }
  // Default to Bradford for BRADFORD_JD routing
  return {
    companyId: COMPANY_IDS.BRADFORD,
    companyName: COMPANY_NAMES[COMPANY_IDS.BRADFORD],
    onBehalfOf: 'On behalf of Bradford Direct',
  };
}

/**
 * Calculate paper markup amount
 */
export function calculatePaperMarkup(rawPaperCost: number): number {
  return Math.round(rawPaperCost * BUSINESS_RULES.PAPER_MARKUP_PERCENT * 100) / 100;
}

/**
 * Calculate profit split shares
 */
export function calculateProfitShares(spreadAmount: number, paperMarkup: number = 0): {
  bradfordShare: number;
  impactShare: number;
  bradfordTotal: number;
} {
  const bradfordShare = Math.round(spreadAmount * BUSINESS_RULES.PROFIT_SPLIT_PERCENT * 100) / 100;
  const impactShare = Math.round(spreadAmount * BUSINESS_RULES.PROFIT_SPLIT_PERCENT * 100) / 100;
  const bradfordTotal = Math.round((bradfordShare + paperMarkup) * 100) / 100;

  return { bradfordShare, impactShare, bradfordTotal };
}
