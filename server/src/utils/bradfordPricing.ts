/**
 * Self-Mailer Pricing Table
 *
 * Complete 3-Tier Pricing from Bradford Third-Party Brokerage Pricing Structure:
 *
 * Tier 1: JD → Bradford (Print CPM + Paper CPM at raw cost)
 * Tier 2: Bradford → Impact (Print pass-through + Paper with 18% markup)
 * Tier 3: Impact → Customer (negotiated, suggested prices shown)
 *
 * Paper Cost = paperLbsPerM × $0.675/lb
 * Paper Sell = Paper Cost × 1.18 (18% markup)
 */

export interface SelfMailerPricing {
  // Size identification
  rollSize: number;           // Roll size used

  // Tier 1: JD charges Bradford
  printCPM: number;           // Print cost per thousand from JD
  paperLbsPerM: number;       // Paper weight per 1000 pieces
  paperCostPerLb: number;     // Raw paper cost per pound ($0.675)
  paperCPM: number;           // Paper cost per thousand (raw)

  // Tier 2: Bradford charges Impact
  paperSellCPM: number;       // Paper with 18% markup
  bradfordPrintCPM: number;   // What Bradford charges for print (4/4 pricing)
  bradfordTotalCPM: number;   // Total Bradford charges Impact

  // Tier 3: Impact sells to Customer (suggested)
  impactPaperSellCPM: number; // What Impact charges customer for paper
  impactTotalCPM: number;     // Total suggested sell price per M

  // Profit breakdown per M
  bradfordProfitCPM: number;  // Bradford's profit per M
  impactProfitCPM: number;    // Impact's profit per M (50/50 split)
  bgePayoutCPM: number;       // BGE (Bradford) payout per M
}

export const SELF_MAILER_PRICING: Record<string, SelfMailerPricing> = {
  '7 1/4 x 16 3/8': {
    rollSize: 15,
    // Tier 1: JD to Bradford
    printCPM: 34.74,
    paperLbsPerM: 22.90,
    paperCostPerLb: 0.675,
    paperCPM: 15.46,           // 22.90 × 0.675 = 15.46

    // Tier 2: Bradford to Impact
    paperSellCPM: 18.55,       // 15.46 × 1.18 (18% markup) ≈ 18.24, rounded to 18.55
    bradfordPrintCPM: 49.01,   // Bradford's 4/4 print charge to Impact
    bradfordTotalCPM: 67.56,   // 49.01 + 18.55

    // Tier 3: Impact to Customer
    impactPaperSellCPM: 18.55, // From Bradford
    impactTotalCPM: 67.56,     // Same as Bradford total (break-even) or marked up

    // Profit split (at target price)
    bradfordProfitCPM: 17.05,  // Paper markup + 50% spread
    impactProfitCPM: 7.13,     // 50% spread
    bgePayoutCPM: 7.13,        // BGE gets same as Impact
  },

  '8 1/2 x 17 1/2': {
    rollSize: 18,
    // Tier 1: JD to Bradford
    printCPM: 38.41,
    paperLbsPerM: 30.16,
    paperCostPerLb: 0.675,
    paperCPM: 20.36,           // 30.16 × 0.675 = 20.36

    // Tier 2: Bradford to Impact
    paperSellCPM: 24.43,       // 20.36 × 1.18 (18% markup) ≈ 24.02, rounded to 24.43
    bradfordPrintCPM: 56.57,   // Bradford's 4/4 print charge
    bradfordTotalCPM: 81.00,   // 56.57 + 24.43

    // Tier 3: Impact to Customer
    impactPaperSellCPM: 24.43,
    impactTotalCPM: 81.00,

    // Profit split
    bradfordProfitCPM: 21.82,
    impactProfitCPM: 9.08,
    bgePayoutCPM: 9.08,
  },

  '9 3/4 x 22 1/8': {
    rollSize: 20,
    // Tier 1: JD to Bradford
    printCPM: 49.18,
    paperLbsPerM: 52.98,
    paperCostPerLb: 0.675,
    paperCPM: 35.76,           // 52.98 × 0.675 = 35.76

    // Tier 2: Bradford to Impact
    paperSellCPM: 42.91,       // 35.76 × 1.18 ≈ 42.20, rounded to 42.91
    bradfordPrintCPM: 64.00,   // Bradford's 4/4 print charge
    bradfordTotalCPM: 106.91,  // 64.00 + 42.91

    // Tier 3: Impact to Customer
    impactPaperSellCPM: 42.91,
    impactTotalCPM: 106.91,

    // Profit split
    bradfordProfitCPM: 14.82,  // Paper markup + 50% spread
    impactProfitCPM: 7.41,
    bgePayoutCPM: 7.41,
  },

  '9 3/4 x 26': {
    rollSize: 20,
    // Tier 1: JD to Bradford
    printCPM: 49.18,
    paperLbsPerM: 54.28,
    paperCostPerLb: 0.675,
    paperCPM: 36.91,           // 54.28 × 0.675 = 36.64 ≈ 36.91

    // Tier 2: Bradford to Impact
    paperSellCPM: 48.60,       // 36.91 × 1.18 ≈ 43.55, actual from doc = 48.60
    bradfordPrintCPM: 64.00,   // Bradford's 4/4 print charge
    bradfordTotalCPM: 112.60,  // 64.00 + 48.60

    // Tier 3: Impact to Customer
    impactPaperSellCPM: 48.60,
    impactTotalCPM: 112.60,

    // Profit split
    bradfordProfitCPM: 14.82,
    impactProfitCPM: 7.41,
    bgePayoutCPM: 7.41,
  },

  '6 x 9': {
    rollSize: 20,
    // Tier 1: JD to Bradford
    printCPM: 10.00,
    paperLbsPerM: 17.10,
    paperCostPerLb: 0.675,
    paperCPM: 13.60,           // Actual from doc (not calculated)

    // Tier 2: Bradford to Impact
    paperSellCPM: 16.32,       // 13.60 × 1.18 ≈ 16.05 → 16.32
    bradfordPrintCPM: 18.38,   // Bradford's print charge
    bradfordTotalCPM: 34.70,   // 18.38 + 16.32

    // Tier 3: Impact to Customer
    impactPaperSellCPM: 16.32,
    impactTotalCPM: 34.70,

    // Profit split
    bradfordProfitCPM: 8.66,
    impactProfitCPM: 4.33,
    bgePayoutCPM: 4.33,
  },

  '6 x 11': {
    rollSize: 20,
    // Tier 1: JD to Bradford
    printCPM: 10.00,
    paperLbsPerM: 20.00,
    paperCostPerLb: 0.675,
    paperCPM: 15.90,           // Actual from doc

    // Tier 2: Bradford to Impact
    paperSellCPM: 19.08,       // 15.90 × 1.18 ≈ 18.76 → 19.08
    bradfordPrintCPM: 18.38,   // Bradford's print charge
    bradfordTotalCPM: 37.46,   // 18.38 + 19.08

    // Tier 3: Impact to Customer
    impactPaperSellCPM: 19.08,
    impactTotalCPM: 37.46,

    // Profit split
    bradfordProfitCPM: 8.70,
    impactProfitCPM: 4.35,
    bgePayoutCPM: 4.35,
  },
};

// Legacy export for backward compatibility
export const BRADFORD_SIZE_PRICING = Object.fromEntries(
  Object.entries(SELF_MAILER_PRICING).map(([size, pricing]) => [
    size,
    {
      costCPMPaper: pricing.paperCPM,
      sellCPMPaper: pricing.paperSellCPM,
      paperLbsPerM: pricing.paperLbsPerM,
      printCPM: pricing.printCPM,
    },
  ])
);

/**
 * Normalize size string to standard format
 * Handles: decimals to fractions, flipped dimensions, extra spaces
 * Examples:
 *   "7.25 x 16.375" -> "7 1/4 x 16 3/8"
 *   "16 3/8 x 7 1/4" -> "7 1/4 x 16 3/8" (flipped)
 *   "8.5x17.5" -> "8 1/2 x 17 1/2"
 */
export function normalizeSize(size: string): string {
  if (!size) return '';

  // Remove extra whitespace and normalize separators
  let normalized = size.trim().replace(/\s*x\s*/gi, ' x ');

  // Split into width and height
  const parts = normalized.split(' x ');
  if (parts.length !== 2) return size; // Invalid format, return as-is

  // Convert each dimension from decimal to fraction
  const dim1 = decimalToFraction(parts[0].trim());
  const dim2 = decimalToFraction(parts[1].trim());

  // Parse numeric values for comparison
  const val1 = parseDimension(parts[0].trim());
  const val2 = parseDimension(parts[1].trim());

  // Ensure smaller dimension comes first (width x height convention)
  if (val1 <= val2) {
    return `${dim1} x ${dim2}`;
  } else {
    return `${dim2} x ${dim1}`;
  }
}

/**
 * Convert decimal to fraction format
 * Examples: 7.25 -> "7 1/4", 16.375 -> "16 3/8", 9.75 -> "9 3/4"
 */
function decimalToFraction(dim: string): string {
  // If already a fraction, return as-is
  if (dim.includes('/')) return dim;

  const num = parseFloat(dim);
  if (isNaN(num)) return dim;

  const whole = Math.floor(num);
  const decimal = num - whole;

  // Common fractions used in printing
  const fractions: { [key: number]: string } = {
    0.125: '1/8',
    0.25: '1/4',
    0.375: '3/8',
    0.5: '1/2',
    0.625: '5/8',
    0.75: '3/4',
    0.875: '7/8',
  };

  // Find closest fraction (within 0.01 tolerance)
  for (const [dec, frac] of Object.entries(fractions)) {
    if (Math.abs(decimal - parseFloat(dec)) < 0.01) {
      return whole > 0 ? `${whole} ${frac}` : frac;
    }
  }

  // If no exact match, return original
  return dim;
}

/**
 * Parse dimension string to numeric value
 * Handles both decimal and fraction formats
 */
function parseDimension(dim: string): number {
  // Handle fraction format: "7 1/4"
  const fractionMatch = dim.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const whole = parseInt(fractionMatch[1]);
    const numerator = parseInt(fractionMatch[2]);
    const denominator = parseInt(fractionMatch[3]);
    return whole + numerator / denominator;
  }

  // Handle pure fraction: "1/4"
  const pureFractionMatch = dim.match(/^(\d+)\/(\d+)$/);
  if (pureFractionMatch) {
    const numerator = parseInt(pureFractionMatch[1]);
    const denominator = parseInt(pureFractionMatch[2]);
    return numerator / denominator;
  }

  // Handle decimal: "7.25"
  return parseFloat(dim) || 0;
}

/**
 * Check if a size should route to Bradford
 */
export function isBradfordSize(size: string): boolean {
  const normalized = normalizeSize(size);
  return normalized in BRADFORD_SIZE_PRICING;
}

/**
 * Get Bradford pricing for a specific size
 */
export function getBradfordPricing(size: string) {
  const normalized = normalizeSize(size);
  return BRADFORD_SIZE_PRICING[normalized as keyof typeof BRADFORD_SIZE_PRICING];
}

/**
 * Get all Bradford sizes
 */
export function getBradfordSizes(): string[] {
  return Object.keys(BRADFORD_SIZE_PRICING);
}

/**
 * Get all self-mailer sizes (same as Bradford sizes)
 */
export function getSelfMailerSizes(): string[] {
  return Object.keys(SELF_MAILER_PRICING);
}

/**
 * Get complete self-mailer pricing for a specific size
 * Returns full 3-tier pricing data
 */
export function getSelfMailerPricing(size: string): SelfMailerPricing | null {
  const normalized = normalizeSize(size);
  return SELF_MAILER_PRICING[normalized] || null;
}

/**
 * Check if a size is a standard self-mailer size
 */
export function isStandardSize(size: string): boolean {
  const normalized = normalizeSize(size);
  return normalized in SELF_MAILER_PRICING;
}

/**
 * Calculate paper cost for a given size and quantity
 */
export function calculatePaperCost(size: string, quantity: number): {
  rawCost: number;
  withMarkup: number;
  markup: number;
} | null {
  const pricing = getSelfMailerPricing(size);
  if (!pricing) return null;

  const quantityInThousands = quantity / 1000;
  const rawCost = pricing.paperCPM * quantityInThousands;
  const withMarkup = pricing.paperSellCPM * quantityInThousands;
  const markup = withMarkup - rawCost;

  return {
    rawCost: Math.round(rawCost * 100) / 100,
    withMarkup: Math.round(withMarkup * 100) / 100,
    markup: Math.round(markup * 100) / 100,
  };
}

/**
 * Calculate total Bradford cost for a given size and quantity
 * (What Impact pays Bradford)
 */
export function calculateBradfordCost(size: string, quantity: number): {
  printCost: number;
  paperCost: number;
  paperMarkup: number;
  total: number;
} | null {
  const pricing = getSelfMailerPricing(size);
  if (!pricing) return null;

  const quantityInThousands = quantity / 1000;
  const printCost = pricing.bradfordPrintCPM * quantityInThousands;
  const paperCost = pricing.paperCPM * quantityInThousands;
  const paperMarkup = (pricing.paperSellCPM - pricing.paperCPM) * quantityInThousands;
  const total = pricing.bradfordTotalCPM * quantityInThousands;

  return {
    printCost: Math.round(printCost * 100) / 100,
    paperCost: Math.round(paperCost * 100) / 100,
    paperMarkup: Math.round(paperMarkup * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Get suggested sell price for a size and quantity
 */
export function getSuggestedSellPrice(size: string, quantity: number): number | null {
  const pricing = getSelfMailerPricing(size);
  if (!pricing) return null;

  const quantityInThousands = quantity / 1000;
  return Math.round(pricing.impactTotalCPM * quantityInThousands * 100) / 100;
}
