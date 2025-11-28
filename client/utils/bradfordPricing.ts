// Bradford Size Pricing Table
// These sizes automatically route to Bradford as vendor
//
// NOTE: Synced with server/src/utils/bradfordPricing.ts
// Paper Cost = paperLbsPerM × PAPER_COST_PER_LB ($0.675/lb)
// Paper Sell = Paper Cost × 1.18 (18% markup)

// Paper cost per pound - standard Bradford pricing
export const PAPER_COST_PER_LB = 0.675;

export const BRADFORD_SIZE_PRICING = {
  '7 1/4 x 16 3/8': {
    costCPMPaper: 15.46,      // 22.90 × 0.675
    sellCPMPaper: 18.55,      // With 18% markup
    paperLbsPerM: 22.90,
    printCPM: 34.74,
  },
  '8 1/2 x 17 1/2': {
    costCPMPaper: 20.36,      // 30.16 × 0.675
    sellCPMPaper: 24.43,      // With 18% markup
    paperLbsPerM: 30.16,
    printCPM: 38.41,
  },
  '9 3/4 x 22 1/8': {
    costCPMPaper: 35.76,      // 52.98 × 0.675
    sellCPMPaper: 42.91,      // With 18% markup
    paperLbsPerM: 52.98,
    printCPM: 49.18,
  },
  '9 3/4 x 26': {
    costCPMPaper: 36.91,      // 54.28 × 0.675
    sellCPMPaper: 48.60,      // CORRECTED from 43.55 - per Bradford doc
    paperLbsPerM: 54.28,
    printCPM: 49.18,
  },
  '6 x 9': {
    costCPMPaper: 13.60,      // From Bradford doc
    sellCPMPaper: 16.32,      // With 18% markup
    paperLbsPerM: 17.10,
    printCPM: 10.00,
  },
  '6 x 11': {
    costCPMPaper: 15.90,      // From Bradford doc
    sellCPMPaper: 19.08,      // With 18% markup
    paperLbsPerM: 20.00,
    printCPM: 10.00,
  },
};

/**
 * Get Bradford pricing for a specific size
 */
export function getBradfordPricing(size: string) {
  return BRADFORD_SIZE_PRICING[size as keyof typeof BRADFORD_SIZE_PRICING];
}

/**
 * Get all Bradford sizes for dropdown
 */
export function getBradfordSizes(): string[] {
  return Object.keys(BRADFORD_SIZE_PRICING);
}

/**
 * Check if a size is a Bradford size
 */
export function isBradfordSize(size: string): boolean {
  return size in BRADFORD_SIZE_PRICING;
}
