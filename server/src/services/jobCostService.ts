/**
 * Job Cost Calculation Service
 *
 * SINGLE SOURCE OF TRUTH for all job cost and profit calculations.
 *
 * This service consolidates scattered cost calculation logic from:
 * - jobsController.ts (lines 86-88, 2027-2030, 2136-2138)
 * - financialsController.ts (lines 7-63)
 * - pricingService.ts (lines 193-267)
 *
 * CRITICAL: All cost calculations MUST use this service.
 * DO NOT write inline cost calculations elsewhere.
 */

import {
  COMPANY_IDS,
  BUSINESS_RULES,
  isImpactOriginPO,
  isImpactToBradfordPO,
  isBradfordToJDPO,
} from '../constants';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PurchaseOrderCost {
  id: string;
  originCompanyId: string | null;
  targetCompanyId: string | null;
  targetVendorId: string | null;
  buyCost: number | string | null;
  paperCost: number | string | null;
  paperMarkup: number | string | null;
  mfgCost: number | string | null;
}

export interface JobWithCostData {
  id: string;
  sellPrice: number | string | null;
  quantity?: number | null;
  PurchaseOrder?: PurchaseOrderCost[];
  ProfitSplit?: {
    sellPrice: number | string | null;
    totalCost: number | string | null;
    grossMargin: number | string | null;
    paperMarkup: number | string | null;
    paperCost: number | string | null;
    bradfordShare: number | string | null;
    impactShare: number | string | null;
    isOverridden?: boolean;
    overrideReason?: string | null;
    calculatedAt?: Date | null;
  } | null;
}

export interface CostBreakdown {
  totalCost: number;
  paperCost: number;
  paperMarkup: number;
  printCost: number;
  poCount: number;
}

export interface ProfitSplitResult {
  sellPrice: number;
  totalCost: number;
  grossMargin: number;
  paperMarkup: number;
  paperCost: number;
  bradfordSpreadShare: number;
  impactSpreadShare: number;
  bradfordTotal: number;
  impactTotal: number;
  marginPercent: number;
  poCount: number;
  isOverridden: boolean;
  overrideReason: string | null;
  calculatedAt: Date | null;
  warnings: string[];
  isHealthy: boolean;
}

// ============================================================================
// CORE CALCULATION FUNCTIONS
// ============================================================================

/**
 * Get Impact-origin POs (all POs where Impact is paying someone)
 *
 * Includes:
 * - Impact → Bradford POs
 * - Impact → Third-party vendor POs
 *
 * Excludes:
 * - Bradford → JD POs (internal tracking only)
 */
export function getImpactOriginPOs(purchaseOrders: PurchaseOrderCost[]): PurchaseOrderCost[] {
  return (purchaseOrders || []).filter(isImpactOriginPO);
}

/**
 * Get Bradford→JD POs (internal routing reference only)
 */
export function getBradfordToJDPOs(purchaseOrders: PurchaseOrderCost[]): PurchaseOrderCost[] {
  return (purchaseOrders || []).filter(isBradfordToJDPO);
}

/**
 * Calculate total cost from POs
 *
 * CRITICAL: Only Impact-origin POs count as Impact's cost.
 * Bradford→JD POs are internal tracking and NOT included.
 *
 * @param purchaseOrders - Array of PurchaseOrder records
 * @returns Total cost Impact pays to vendors
 */
export function calculateJobCost(purchaseOrders: PurchaseOrderCost[]): number {
  const impactPOs = getImpactOriginPOs(purchaseOrders);
  return impactPOs.reduce((sum, po) => {
    return sum + (Number(po.buyCost) || 0);
  }, 0);
}

/**
 * Calculate revenue from sellPrice
 */
export function calculateJobRevenue(sellPrice: number | string | null): number {
  return Number(sellPrice) || 0;
}

/**
 * Calculate paper markup from POs
 */
export function calculateJobPaperMarkup(purchaseOrders: PurchaseOrderCost[]): number {
  const impactPOs = getImpactOriginPOs(purchaseOrders);
  return impactPOs.reduce((sum, po) => {
    return sum + (Number(po.paperMarkup) || 0);
  }, 0);
}

/**
 * Calculate paper cost from POs
 */
export function calculateJobPaperCost(purchaseOrders: PurchaseOrderCost[]): number {
  const impactPOs = getImpactOriginPOs(purchaseOrders);
  return impactPOs.reduce((sum, po) => {
    return sum + (Number(po.paperCost) || 0);
  }, 0);
}

/**
 * Get full cost breakdown from POs
 */
export function getCostBreakdown(purchaseOrders: PurchaseOrderCost[]): CostBreakdown {
  const impactPOs = getImpactOriginPOs(purchaseOrders);

  const totalCost = impactPOs.reduce((sum, po) => sum + (Number(po.buyCost) || 0), 0);
  const paperCost = impactPOs.reduce((sum, po) => sum + (Number(po.paperCost) || 0), 0);
  const paperMarkup = impactPOs.reduce((sum, po) => sum + (Number(po.paperMarkup) || 0), 0);
  const printCost = totalCost - paperCost - paperMarkup;

  return {
    totalCost: round2(totalCost),
    paperCost: round2(paperCost),
    paperMarkup: round2(paperMarkup),
    printCost: round2(printCost),
    poCount: impactPOs.length,
  };
}

// ============================================================================
// PROFIT SPLIT CALCULATION
// ============================================================================

/**
 * Calculate profit split between Bradford and Impact
 *
 * Formula:
 * - Spread = Sell Price - Total Cost
 * - Bradford Share = 50% of Spread + Paper Markup
 * - Impact Share = 50% of Spread
 *
 * Uses cached ProfitSplit record if available, otherwise calculates on-the-fly.
 */
export function calculateJobProfitSplit(job: JobWithCostData): ProfitSplitResult {
  // If job has cached ProfitSplit and not forcing recalculation, use it
  if (job.ProfitSplit) {
    const ps = job.ProfitSplit;
    const sellPrice = Number(ps.sellPrice) || 0;
    const totalCost = Number(ps.totalCost) || 0;
    const grossMargin = Number(ps.grossMargin) || 0;
    const paperMarkup = Number(ps.paperMarkup) || 0;

    return {
      sellPrice,
      totalCost,
      grossMargin,
      paperMarkup,
      paperCost: Number(ps.paperCost) || 0,
      bradfordSpreadShare: round2(grossMargin * BUSINESS_RULES.PROFIT_SPLIT_PERCENT),
      impactSpreadShare: round2(grossMargin * BUSINESS_RULES.PROFIT_SPLIT_PERCENT),
      bradfordTotal: Number(ps.bradfordShare) || 0,
      impactTotal: Number(ps.impactShare) || 0,
      marginPercent: sellPrice > 0 ? round2((grossMargin / sellPrice) * 100) : 0,
      poCount: (job.PurchaseOrder || []).length,
      isOverridden: ps.isOverridden || false,
      overrideReason: ps.overrideReason || null,
      calculatedAt: ps.calculatedAt || null,
      warnings: [],
      isHealthy: grossMargin >= 0,
    };
  }

  // Calculate on-the-fly from POs
  return calculateProfitSplitFromPOs(job);
}

/**
 * Calculate profit split from POs (bypasses cache)
 */
export function calculateProfitSplitFromPOs(job: JobWithCostData): ProfitSplitResult {
  const purchaseOrders = job.PurchaseOrder || [];
  const sellPrice = calculateJobRevenue(job.sellPrice);

  const breakdown = getCostBreakdown(purchaseOrders);
  const { totalCost, paperCost, paperMarkup, poCount } = breakdown;

  const grossMargin = sellPrice - totalCost;
  const warnings: string[] = [];
  let isHealthy = true;

  // Validation warnings
  if (grossMargin < 0) {
    warnings.push('Negative margin: sell price is below cost');
    isHealthy = false;
  }

  if (sellPrice > 0 && grossMargin < sellPrice * 0.15) {
    warnings.push('Low margin: less than 15% of sell price');
  }

  // Calculate split
  const bradfordSpreadShare = round2(grossMargin * BUSINESS_RULES.PROFIT_SPLIT_PERCENT);
  const impactSpreadShare = round2(grossMargin * BUSINESS_RULES.PROFIT_SPLIT_PERCENT);
  const bradfordTotal = round2(bradfordSpreadShare + paperMarkup);
  const impactTotal = round2(impactSpreadShare);
  const marginPercent = sellPrice > 0 ? round2((grossMargin / sellPrice) * 100) : 0;

  return {
    sellPrice,
    totalCost,
    grossMargin: round2(grossMargin),
    paperMarkup,
    paperCost,
    bradfordSpreadShare,
    impactSpreadShare,
    bradfordTotal,
    impactTotal,
    marginPercent,
    poCount,
    isOverridden: false,
    overrideReason: null,
    calculatedAt: null,
    warnings,
    isHealthy,
  };
}

/**
 * Calculate profit split from raw values (for new jobs before POs exist)
 */
export function calculateProfitSplitFromValues(input: {
  sellPrice: number;
  totalCost: number;
  paperMarkup?: number;
}): {
  grossMargin: number;
  bradfordSpreadShare: number;
  impactSpreadShare: number;
  bradfordTotal: number;
  impactTotal: number;
  marginPercent: number;
} {
  const { sellPrice, totalCost, paperMarkup = 0 } = input;
  const grossMargin = sellPrice - totalCost;

  const bradfordSpreadShare = round2(grossMargin * BUSINESS_RULES.PROFIT_SPLIT_PERCENT);
  const impactSpreadShare = round2(grossMargin * BUSINESS_RULES.PROFIT_SPLIT_PERCENT);
  const bradfordTotal = round2(bradfordSpreadShare + paperMarkup);
  const impactTotal = round2(impactSpreadShare);
  const marginPercent = sellPrice > 0 ? round2((grossMargin / sellPrice) * 100) : 0;

  return {
    grossMargin: round2(grossMargin),
    bradfordSpreadShare,
    impactSpreadShare,
    bradfordTotal,
    impactTotal,
    marginPercent,
  };
}

// ============================================================================
// UPSERT HELPERS (for syncing ProfitSplit record)
// ============================================================================

/**
 * Generate ProfitSplit upsert data from calculated values
 */
export function generateProfitSplitData(
  jobId: string,
  sellPrice: number,
  purchaseOrders: PurchaseOrderCost[]
): {
  where: { jobId: string };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
} {
  const breakdown = getCostBreakdown(purchaseOrders);
  const split = calculateProfitSplitFromValues({
    sellPrice,
    totalCost: breakdown.totalCost,
    paperMarkup: breakdown.paperMarkup,
  });

  const data = {
    sellPrice,
    totalCost: breakdown.totalCost,
    paperCost: breakdown.paperCost,
    paperMarkup: breakdown.paperMarkup,
    grossMargin: split.grossMargin,
    bradfordShare: split.bradfordTotal,
    impactShare: split.impactTotal,
    calculatedAt: new Date(),
  };

  return {
    where: { jobId },
    create: { jobId, ...data },
    update: data,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Round to 2 decimal places
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Validate that margin is not negative
 * @returns Error message if invalid, null if valid
 */
export function validateMargin(sellPrice: number, totalCost: number): string | null {
  if (sellPrice < totalCost) {
    return `Sell price ($${sellPrice.toFixed(2)}) is below cost ($${totalCost.toFixed(2)}). Margin would be negative.`;
  }
  return null;
}

// ============================================================================
// LEGACY COMPATIBILITY EXPORTS
// ============================================================================

/**
 * @deprecated Use calculateJobCost() instead
 * This is maintained for backward compatibility during migration.
 */
export function calculateProfit(job: JobWithCostData) {
  const result = calculateJobProfitSplit(job);
  return {
    sellPrice: result.sellPrice,
    totalCost: result.totalCost,
    spread: result.grossMargin,
    paperMarkup: result.paperMarkup,
    paperCost: result.paperCost,
    bradfordSpreadShare: result.bradfordSpreadShare,
    impactSpreadShare: result.impactSpreadShare,
    bradfordTotal: result.bradfordTotal,
    impactTotal: result.impactTotal,
    marginPercent: result.marginPercent,
    poCount: result.poCount,
    isOverridden: result.isOverridden,
    overrideReason: result.overrideReason,
    calculatedAt: result.calculatedAt,
    warnings: result.warnings,
    isHealthy: result.isHealthy,
  };
}
