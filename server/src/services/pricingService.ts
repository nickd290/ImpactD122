/**
 * Impact Direct Print Brokerage - Pricing Service
 *
 * 3-Tier Pricing Model:
 * ====================
 * Tier 1: JD charges Bradford (Print CPM + Paper CPM at raw cost)
 * Tier 2: Bradford charges Impact (Print pass-through + Paper with 18% markup)
 * Tier 3: Impact charges Customer (negotiated price)
 *
 * Profit Split Rules (ALWAYS APPLY):
 * ==================================
 * - Spread = Customer Price - Total Cost (includes paper markup)
 * - Split: 50% of spread to Impact, 50% of spread to Bradford
 * - Bradford ALSO keeps 18% paper markup when they supply paper
 * - So: Bradford = 50% spread + paper markup; Impact = 50% spread only
 *
 * Job Types:
 * ==========
 * - Standard Sizes: Auto-calculate from SELF_MAILER_PRICING table
 * - Custom Jobs: Manual cost entry, but 50/50 split still applies
 */

import { SELF_MAILER_PRICING, normalizeSize, getSelfMailerPricing } from '../utils/bradfordPricing';

// ============================================
// TYPES & INTERFACES
// ============================================

export type PaperSource = 'BRADFORD' | 'VENDOR' | 'CUSTOMER';

export interface TierPricingInput {
  sizeName?: string;          // For standard sizes (lookup from table)
  quantity: number;           // Total pieces
  paperSource: PaperSource;   // Who supplies paper

  // For custom jobs (override table values)
  customPrintCPM?: number;    // Override print CPM
  customPaperCPM?: number;    // Override raw paper CPM
}

export interface Tier1Pricing {
  printCPM: number;           // Print cost per thousand (JD charges)
  printTotal: number;         // Print cost × quantity
  paperCPM: number;           // Raw paper cost per thousand
  paperTotal: number;         // Paper cost × quantity
  totalCost: number;          // Print + Paper
}

export interface Tier2Pricing {
  printCPM: number;           // Same as Tier 1 (pass-through)
  printTotal: number;
  paperCPM: number;           // With 18% markup
  paperTotal: number;
  paperMarkup: number;        // The 18% amount Bradford keeps
  totalCost: number;          // What Impact pays Bradford
}

export interface Tier3Pricing {
  suggestedMinPrice: number;  // Break-even (Tier 2 cost)
  suggestedPrice: number;     // With healthy margin (~25%)
  targetSellCPM: number;      // From pricing table (if standard size)
}

export interface TierPricingResult {
  tier1: Tier1Pricing;        // JD → Bradford
  tier2: Tier2Pricing;        // Bradford → Impact
  tier3: Tier3Pricing;        // Impact → Customer (suggested)
  quantity: number;
  sizeName: string | null;
  paperSource: PaperSource;
  isStandardSize: boolean;
}

export interface ProfitSplitInput {
  sellPrice: number;          // What customer pays (total)
  totalCost: number;          // What Impact pays (from POs, excluding paper markup)
  paperMarkup: number;        // Bradford's 18% paper markup
}

export interface ProfitSplitResult {
  sellPrice: number;
  totalCost: number;
  paperMarkup: number;

  // Calculated values
  grossMargin: number;        // sellPrice - totalCost
  spreadAmount: number;       // What gets split 50/50 (grossMargin - paperMarkup already in cost)
  bradfordSpreadShare: number; // 50% of spread
  impactSpreadShare: number;   // 50% of spread

  // Final amounts each party gets
  bradfordTotal: number;      // 50% spread + paperMarkup (they handle paper)
  impactTotal: number;        // 50% spread only

  // Metrics
  marginPercent: number;      // grossMargin / sellPrice × 100
  isHealthy: boolean;         // true if marginPercent >= 15%
  warnings: string[];
}

// ============================================
// CONSTANTS
// ============================================

export const PAPER_MARKUP_PERCENT = 0.18;  // 18% markup on paper
export const DEFAULT_TARGET_MARGIN = 0.25; // 25% target margin for suggestions

// ============================================
// 3-TIER PRICING CALCULATOR
// ============================================

/**
 * Calculate complete 3-tier pricing breakdown
 *
 * @param input - Pricing input with size, quantity, and paper source
 * @returns Complete tier pricing breakdown
 */
export function calculateTierPricing(input: TierPricingInput): TierPricingResult {
  const { sizeName, quantity, paperSource, customPrintCPM, customPaperCPM } = input;
  const quantityInThousands = quantity / 1000;

  // Try to get standard pricing from table
  let basePricing = null;
  let normalizedSize: string | null = null;
  let isStandardSize = false;

  if (sizeName) {
    normalizedSize = normalizeSize(sizeName);
    basePricing = getSelfMailerPricing(sizeName);
    isStandardSize = basePricing !== null;
  }

  // Determine print and paper CPM (from table or custom)
  const printCPM = customPrintCPM ?? basePricing?.printCPM ?? 0;
  const rawPaperCPM = customPaperCPM ?? basePricing?.paperCPM ?? 0;

  // ============================================
  // TIER 1: JD charges Bradford
  // ============================================
  const tier1PrintTotal = printCPM * quantityInThousands;
  const tier1PaperTotal = rawPaperCPM * quantityInThousands;
  const tier1TotalCost = tier1PrintTotal + tier1PaperTotal;

  const tier1: Tier1Pricing = {
    printCPM,
    printTotal: round2(tier1PrintTotal),
    paperCPM: rawPaperCPM,
    paperTotal: round2(tier1PaperTotal),
    totalCost: round2(tier1TotalCost),
  };

  // ============================================
  // TIER 2: Bradford charges Impact
  // ============================================
  // Paper markup only applies when Bradford supplies paper
  let tier2PaperCPM = 0;
  let tier2PaperTotal = 0;
  let paperMarkupAmount = 0;

  if (paperSource === 'BRADFORD') {
    // Bradford supplies paper - apply 18% markup
    tier2PaperCPM = rawPaperCPM * (1 + PAPER_MARKUP_PERCENT);
    tier2PaperTotal = tier2PaperCPM * quantityInThousands;
    paperMarkupAmount = (rawPaperCPM * PAPER_MARKUP_PERCENT) * quantityInThousands;
  } else if (paperSource === 'VENDOR') {
    // Vendor (JD) supplies paper - no markup, cost included in print
    tier2PaperCPM = rawPaperCPM;
    tier2PaperTotal = tier1PaperTotal;
    paperMarkupAmount = 0;
  }
  // CUSTOMER supplies paper - no paper cost to Impact

  const tier2TotalCost = tier1PrintTotal + tier2PaperTotal;

  const tier2: Tier2Pricing = {
    printCPM,
    printTotal: round2(tier1PrintTotal),
    paperCPM: round2(tier2PaperCPM),
    paperTotal: round2(tier2PaperTotal),
    paperMarkup: round2(paperMarkupAmount),
    totalCost: round2(tier2TotalCost),
  };

  // ============================================
  // TIER 3: Impact charges Customer (suggested)
  // ============================================
  const suggestedMinPrice = tier2TotalCost;
  const suggestedPrice = tier2TotalCost / (1 - DEFAULT_TARGET_MARGIN); // 25% margin
  const targetSellCPM = basePricing?.impactTotalCPM ?? (suggestedPrice / quantityInThousands);

  const tier3: Tier3Pricing = {
    suggestedMinPrice: round2(suggestedMinPrice),
    suggestedPrice: round2(suggestedPrice),
    targetSellCPM: round2(targetSellCPM),
  };

  return {
    tier1,
    tier2,
    tier3,
    quantity,
    sizeName: normalizedSize,
    paperSource,
    isStandardSize,
  };
}

// ============================================
// PROFIT SPLIT CALCULATOR
// ============================================

/**
 * Calculate the 50/50 profit split between Impact and Bradford
 *
 * Business Logic:
 * - Gross Margin = Sell Price - Total Cost
 * - Spread = Gross Margin (split 50/50)
 * - Bradford gets: 50% of Spread + Paper Markup (18%) - they handle paper procurement
 * - Impact gets: 50% of Spread only
 *
 * Note: The paper markup goes to Bradford as they handle paper procurement.
 *
 * @param input - Sell price, total cost, and paper markup
 * @returns Complete profit split breakdown
 */
export function calculateProfitSplit(input: ProfitSplitInput): ProfitSplitResult {
  const { sellPrice, totalCost, paperMarkup } = input;
  const warnings: string[] = [];

  // Gross margin = what customer pays - what we pay
  const grossMargin = sellPrice - totalCost;

  // The spread (what gets split 50/50) is the margin MINUS paper markup
  // Because paper markup is Bradford's guaranteed profit
  // BUT: if totalCost already INCLUDES paper markup, don't double count
  // In our model: totalCost = Print + Paper with markup, so:
  // spreadAmount = grossMargin (the 50/50 part)
  const spreadAmount = grossMargin;

  // 50/50 split of the spread
  const bradfordSpreadShare = spreadAmount * 0.5;
  const impactSpreadShare = spreadAmount * 0.5;

  // Bradford gets paper markup + 50% of spread (they handle paper procurement)
  // Impact gets 50% of spread only
  const bradfordTotal = bradfordSpreadShare + paperMarkup;
  const impactTotal = impactSpreadShare;

  // Calculate margin percentage
  const marginPercent = sellPrice > 0 ? (grossMargin / sellPrice) * 100 : 0;

  // Generate warnings
  if (grossMargin < 0) {
    warnings.push(`Negative margin: Job is losing $${Math.abs(grossMargin).toFixed(2)}`);
  } else if (marginPercent < 10) {
    warnings.push(`Low margin: ${marginPercent.toFixed(1)}% is below 10% target`);
  } else if (marginPercent < 15) {
    warnings.push(`Margin below target: ${marginPercent.toFixed(1)}% (target: 15%+)`);
  }

  if (sellPrice > 0 && totalCost > sellPrice) {
    warnings.push('Cost exceeds sell price - job is losing money!');
  }

  if (bradfordTotal < 0) {
    warnings.push('Bradford share is negative - check pricing');
  }

  return {
    sellPrice: round2(sellPrice),
    totalCost: round2(totalCost),
    paperMarkup: round2(paperMarkup),
    grossMargin: round2(grossMargin),
    spreadAmount: round2(spreadAmount),
    bradfordSpreadShare: round2(bradfordSpreadShare),
    impactSpreadShare: round2(impactSpreadShare),
    bradfordTotal: round2(bradfordTotal),
    impactTotal: round2(impactTotal),
    marginPercent: round2(marginPercent),
    isHealthy: marginPercent >= 15 && grossMargin >= 0,
    warnings,
  };
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Calculate complete pricing for a standard size job
 *
 * @param sizeName - Self-mailer size (e.g., "7 1/4 x 16 3/8")
 * @param quantity - Total pieces
 * @param sellPrice - What customer pays (if set, otherwise use suggested)
 * @param paperSource - Who supplies paper
 * @returns Complete pricing with profit split
 */
export function calculateStandardJobPricing(
  sizeName: string,
  quantity: number,
  sellPrice?: number,
  paperSource: PaperSource = 'BRADFORD'
): {
  tiers: TierPricingResult;
  profitSplit: ProfitSplitResult;
} {
  const tiers = calculateTierPricing({
    sizeName,
    quantity,
    paperSource,
  });

  // Use provided sell price or suggested price
  const finalSellPrice = sellPrice ?? tiers.tier3.suggestedPrice;

  const profitSplit = calculateProfitSplit({
    sellPrice: finalSellPrice,
    totalCost: tiers.tier2.totalCost,
    paperMarkup: tiers.tier2.paperMarkup,
  });

  return { tiers, profitSplit };
}

/**
 * Calculate profit split for a custom job (manual cost entry)
 *
 * @param sellPrice - What customer pays
 * @param costs - Array of cost items from POs
 * @param paperMarkup - Bradford's paper markup (if Bradford supplies paper)
 * @returns Profit split breakdown
 */
export function calculateCustomJobProfitSplit(
  sellPrice: number,
  costs: Array<{ amount: number; description?: string }>,
  paperMarkup: number = 0
): ProfitSplitResult {
  const totalCost = costs.reduce((sum, cost) => sum + cost.amount, 0);

  return calculateProfitSplit({
    sellPrice,
    totalCost,
    paperMarkup,
  });
}

/**
 * Calculate paper markup amount
 *
 * @param rawPaperCost - Raw paper cost (before markup)
 * @returns Paper markup amount (18%)
 */
export function calculatePaperMarkup(rawPaperCost: number): number {
  return round2(rawPaperCost * PAPER_MARKUP_PERCENT);
}

/**
 * Get Bradford's total share for a job
 *
 * @param paperMarkup - Bradford's paper markup
 * @param grossMargin - Total margin (sell - cost)
 * @returns Bradford's total profit
 */
export function getBradfordShare(paperMarkup: number, grossMargin: number): number {
  const spreadShare = grossMargin * 0.5;
  return round2(paperMarkup + spreadShare);
}

/**
 * Get Impact's total share for a job
 *
 * @param grossMargin - Total margin (sell - cost)
 * @returns Impact's profit (50% of margin)
 */
export function getImpactShare(grossMargin: number): number {
  return round2(grossMargin * 0.5);
}

// ============================================
// VALIDATION
// ============================================

export interface PricingValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate pricing inputs
 */
export function validatePricingInput(input: TierPricingInput): PricingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.quantity || input.quantity <= 0) {
    errors.push('Quantity must be greater than 0');
  }

  if (input.quantity && input.quantity < 1000) {
    warnings.push('Small quantity may have different pricing');
  }

  if (input.sizeName && !getSelfMailerPricing(input.sizeName)) {
    if (!input.customPrintCPM && !input.customPaperCPM) {
      warnings.push(`Size "${input.sizeName}" not in standard pricing table - using custom pricing`);
    }
  }

  if (input.customPrintCPM !== undefined && input.customPrintCPM < 0) {
    errors.push('Print CPM cannot be negative');
  }

  if (input.customPaperCPM !== undefined && input.customPaperCPM < 0) {
    errors.push('Paper CPM cannot be negative');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate profit split inputs
 */
export function validateProfitSplitInput(input: ProfitSplitInput): PricingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.sellPrice < 0) {
    errors.push('Sell price cannot be negative');
  }

  if (input.totalCost < 0) {
    errors.push('Total cost cannot be negative');
  }

  if (input.paperMarkup < 0) {
    errors.push('Paper markup cannot be negative');
  }

  if (input.sellPrice > 0 && input.totalCost > input.sellPrice) {
    warnings.push('Total cost exceeds sell price - job will have negative margin');
  }

  if (input.paperMarkup > input.totalCost) {
    warnings.push('Paper markup exceeds total cost - check values');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

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
 * Format CPM for display (per thousand)
 */
export function formatCPM(amount: number): string {
  return `$${amount.toFixed(2)}/M`;
}

/**
 * Get pricing summary string for display
 */
export function getPricingSummary(tiers: TierPricingResult, profitSplit: ProfitSplitResult): string {
  return `
Impact Direct Print Brokerage - Pricing Summary
================================================
Size: ${tiers.sizeName || 'Custom'}
Quantity: ${tiers.quantity.toLocaleString()} pieces
Paper Source: ${tiers.paperSource}

TIER 1: JD → Bradford
  Print: ${formatCPM(tiers.tier1.printCPM)} × ${(tiers.quantity / 1000).toFixed(1)} = ${formatCurrency(tiers.tier1.printTotal)}
  Paper: ${formatCPM(tiers.tier1.paperCPM)} × ${(tiers.quantity / 1000).toFixed(1)} = ${formatCurrency(tiers.tier1.paperTotal)}
  Total: ${formatCurrency(tiers.tier1.totalCost)}

TIER 2: Bradford → Impact
  Print: ${formatCurrency(tiers.tier2.printTotal)} (pass-through)
  Paper: ${formatCurrency(tiers.tier2.paperTotal)}${tiers.paperSource === 'BRADFORD' ? ` (includes ${formatCurrency(tiers.tier2.paperMarkup)} markup)` : ''}
  Total: ${formatCurrency(tiers.tier2.totalCost)}

TIER 3: Impact → Customer
  Sell Price: ${formatCurrency(profitSplit.sellPrice)}

PROFIT SPLIT
  Gross Margin: ${formatCurrency(profitSplit.grossMargin)} (${profitSplit.marginPercent.toFixed(1)}%)

  Bradford Gets:
    Paper Markup: ${formatCurrency(profitSplit.paperMarkup)}
    50% Spread:   ${formatCurrency(profitSplit.bradfordSpreadShare)}
    TOTAL:        ${formatCurrency(profitSplit.bradfordTotal)}

  Impact Gets:
    50% Spread:   ${formatCurrency(profitSplit.impactSpreadShare)}
    TOTAL:        ${formatCurrency(profitSplit.impactTotal)}

${profitSplit.warnings.length > 0 ? '\nWARNINGS:\n' + profitSplit.warnings.map(w => `  ⚠️ ${w}`).join('\n') : ''}
================================================
  `.trim();
}

// ============================================
// EXPORTS
// ============================================

export default {
  calculateTierPricing,
  calculateProfitSplit,
  calculateStandardJobPricing,
  calculateCustomJobProfitSplit,
  calculatePaperMarkup,
  getBradfordShare,
  getImpactShare,
  validatePricingInput,
  validateProfitSplitInput,
  formatCurrency,
  formatCPM,
  getPricingSummary,
  PAPER_MARKUP_PERCENT,
  DEFAULT_TARGET_MARGIN,
};
