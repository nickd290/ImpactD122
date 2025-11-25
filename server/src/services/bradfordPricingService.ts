/**
 * Bradford Partner Pricing Service
 *
 * Business Logic:
 * - Impact sources job to Bradford
 * - Bradford buys printing services from JD Graphic
 * - Bradford supplies paper to JD
 * - Impact buys from Bradford at: (paper + markup) + JD cost + 50% of spread
 * - Bradford profits from: paper markup + 50% of spread
 */

export interface BradfordFinancialsInput {
  impactCustomerTotal: number;    // What customer pays Impact
  jdServicesTotal: number;         // What Bradford pays JD
  bradfordPaperCost: number;       // What Bradford paid for paper
  paperMarkupAmount: number;       // Dollar markup on paper
}

export interface BradfordFinancialsCalculated extends BradfordFinancialsInput {
  calculatedSpread: number;        // Spread amount
  bradfordShareAmount: number;     // Bradford's 50% share
  impactCostFromBradford: number;  // Total Impact pays Bradford
  bradfordTotalProfit: number;     // Bradford's total profit
  impactProfit: number;            // Impact's profit
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Calculate complete Bradford pricing breakdown
 */
export function calculateBradfordPricing(input: BradfordFinancialsInput): BradfordFinancialsCalculated {
  const {
    impactCustomerTotal,
    jdServicesTotal,
    bradfordPaperCost,
    paperMarkupAmount,
  } = input;

  // Base cost to Bradford
  const bradfordBaseCost = bradfordPaperCost + jdServicesTotal;

  // What Bradford charges for paper (cost + markup)
  const bradfordPaperCharge = bradfordPaperCost + paperMarkupAmount;

  // Base cost to Impact (paper with markup + JD services)
  const impactBaseCost = bradfordPaperCharge + jdServicesTotal;

  // Calculate spread
  const calculatedSpread = impactCustomerTotal - impactBaseCost;

  // Bradford gets 50% of spread
  const bradfordShareAmount = calculatedSpread * 0.5;

  // Total Impact pays Bradford
  const impactCostFromBradford = impactBaseCost + bradfordShareAmount;

  // Bradford's total profit (paper markup + their share of spread)
  const bradfordTotalProfit = paperMarkupAmount + bradfordShareAmount;

  // Impact's profit
  const impactProfit = impactCustomerTotal - impactCostFromBradford;

  return {
    ...input,
    calculatedSpread,
    bradfordShareAmount,
    impactCostFromBradford,
    bradfordTotalProfit,
    impactProfit,
  };
}

/**
 * Validate Bradford financials input
 */
export function validateBradfordFinancials(input: BradfordFinancialsInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required fields
  if (!input.impactCustomerTotal || input.impactCustomerTotal <= 0) {
    errors.push('Customer total must be greater than 0');
  }

  if (!input.jdServicesTotal || input.jdServicesTotal < 0) {
    errors.push('JD services total cannot be negative');
  }

  if (!input.bradfordPaperCost || input.bradfordPaperCost < 0) {
    errors.push('Bradford paper cost cannot be negative');
  }

  if (input.paperMarkupAmount === undefined || input.paperMarkupAmount < 0) {
    errors.push('Paper markup cannot be negative');
  }

  // Calculate to check for warnings
  if (errors.length === 0) {
    const calculated = calculateBradfordPricing(input);

    // Warn if spread is negative (losing money)
    if (calculated.calculatedSpread < 0) {
      warnings.push('Negative spread detected - job is losing money!');
    }

    // Warn if spread is very small
    if (calculated.calculatedSpread > 0 && calculated.calculatedSpread < 100) {
      warnings.push('Very small spread - profit margin is tight');
    }

    // Warn if paper markup is 0
    if (input.paperMarkupAmount === 0) {
      warnings.push('No paper markup - Bradford only profits from spread');
    }

    // Warn if Impact profit is less than Bradford profit
    if (calculated.impactProfit < calculated.bradfordTotalProfit) {
      warnings.push('Bradford profit exceeds Impact profit on this job');
    }

    // Warn if JD cost is very high relative to customer total
    const jdPercentage = (input.jdServicesTotal / input.impactCustomerTotal) * 100;
    if (jdPercentage > 70) {
      warnings.push(`JD services are ${jdPercentage.toFixed(0)}% of customer total - very high`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
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
 * Get Bradford pricing summary for display
 */
export function getBradfordPricingSummary(calculated: BradfordFinancialsCalculated): string {
  return `
Bradford Partner Pricing Breakdown:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Customer Total:           ${formatCurrency(calculated.impactCustomerTotal)}

BRADFORD'S COSTS:
  Paper Cost:             ${formatCurrency(calculated.bradfordPaperCost)}
  JD Services:            ${formatCurrency(calculated.jdServicesTotal)}
  ─────────────────────
  Total Costs:            ${formatCurrency(calculated.bradfordPaperCost + calculated.jdServicesTotal)}

BRADFORD'S REVENUE:
  Paper (cost + markup):  ${formatCurrency(calculated.bradfordPaperCost + calculated.paperMarkupAmount)}
  JD Services (pass-thru):${formatCurrency(calculated.jdServicesTotal)}
  50% of Spread:          ${formatCurrency(calculated.bradfordShareAmount)}
  ─────────────────────
  Total Revenue:          ${formatCurrency(calculated.impactCostFromBradford)}

BRADFORD'S PROFIT:        ${formatCurrency(calculated.bradfordTotalProfit)}

IMPACT'S COSTS:
  From Bradford:          ${formatCurrency(calculated.impactCostFromBradford)}

IMPACT'S PROFIT:          ${formatCurrency(calculated.impactProfit)}

SPREAD DETAILS:
  Total Spread:           ${formatCurrency(calculated.calculatedSpread)}
  Bradford's Share (50%): ${formatCurrency(calculated.bradfordShareAmount)}
  Impact's Share (50%):   ${formatCurrency(calculated.bradfordShareAmount)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();
}
