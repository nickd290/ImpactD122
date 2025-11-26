// Bradford Size Pricing Table
// These sizes automatically route to Bradford as vendor
export const BRADFORD_SIZE_PRICING = {
  '7 1/4 x 16 3/8': {
    costCPMPaper: 15.46,
    sellCPMPaper: 18.55,
    paperLbsPerM: 22.90,
    printCPM: 34.74,
  },
  '8 1/2 x 17 1/2': {
    costCPMPaper: 20.36,
    sellCPMPaper: 24.43,
    paperLbsPerM: 30.16,
    printCPM: 38.41,
  },
  '9 3/4 x 22 1/8': {
    costCPMPaper: 35.76,
    sellCPMPaper: 42.91,
    paperLbsPerM: 52.98,
    printCPM: 49.18,
  },
  '9 3/4 x 26': {
    costCPMPaper: 36.91,
    sellCPMPaper: 43.55,
    paperLbsPerM: 54.28,
    printCPM: 49.18,
  },
  '6 x 9': {
    costCPMPaper: 13.60,
    sellCPMPaper: 16.32,
    paperLbsPerM: 17.10,
    printCPM: 10.00,
  },
  '6 x 11': {
    costCPMPaper: 15.90,
    sellCPMPaper: 19.08,
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
