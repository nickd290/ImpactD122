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
