/**
 * Bradford / Third Party size pricing — synced from Drive:
 * "Third Party Calculator - Clean (3).xlsx" → Lookup tab
 * https://docs.google.com/spreadsheets/d/1CQN3i3D3t64wFb6Hc3NvG8UET_q4WCv9
 *
 * Cost structure (Calculator sheet):
 *   JD MFG Cost     = Lookup!JD MFG (col J)
 *   Paper base      = Lookup!Paper Base (col K)
 *   Paper markup    = Paper base × 18%
 *   Total cost/M    = JD MFG + Paper base + markup
 *
 * Margin split (Calculator formulas B20/B21):
 *   Bradford margin share = 30% of total margin
 *   Impact margin share   = 70% of total margin
 *   Bradford Gets = paper markup + Bradford margin share
 *   Impact Gets   = Impact margin share
 *   JD Gets       = JD MFG only
 */

export const PAPER_COST_PER_LB_DEFAULT = 0.675;
export const PAPER_MARKUP_RATE = 0.18;
/** Sheet formula: Bradford 50% label is actually 30% of margin */
export const BRADFORD_MARGIN_SHARE = 0.3;
export const IMPACT_MARGIN_SHARE = 0.7;

export const THIRD_PARTY_CALCULATOR_SHEET_ID = '1CQN3i3D3t64wFb6Hc3NvG8UET_q4WCv9';
export const THIRD_PARTY_CALCULATOR_URL =
  `https://docs.google.com/spreadsheets/d/${THIRD_PARTY_CALCULATOR_SHEET_ID}/edit`;

export interface BradfordSizePricing {
  rollSize: number;
  /** Bradford 4/4 print charge to Impact (Lookup Print CPM) — reference */
  bradfordPrintCPM: number;
  paperLbsPerM: number;
  paperCostPerLb: number;
  /** Paper sell CPM (with markup) — Lookup Paper CPM */
  paperSellCPM: number;
  totalCPM: number;
  product: string;
  /** JD manufacturing CPM — used for JD cost (Lookup JD MFG) */
  printCPM: number;
  /** Alias used by older code */
  costCPMPaper: number;
  paperLbsPerM_alias?: number;
}

/** Canonical size table from Calculator Lookup tab */
export const BRADFORD_SIZE_PRICING: Record<string, BradfordSizePricing> = {
  '7 1/4 x 16 3/8': {
    rollSize: 15,
    bradfordPrintCPM: 49.01,
    paperLbsPerM: 22.9,
    paperCostPerLb: 0.675,
    paperSellCPM: 18.55,
    totalCPM: 67.56,
    product: 'Self Mailer - Matte 7pt',
    printCPM: 34.74, // JD MFG
    costCPMPaper: 15.46, // Paper Base
  },
  '8 1/2 x 17 1/2': {
    rollSize: 18,
    bradfordPrintCPM: 56.57,
    paperLbsPerM: 30.16,
    paperCostPerLb: 0.675,
    paperSellCPM: 24.43,
    totalCPM: 81.0,
    product: 'Self Mailer - Matte 7pt',
    printCPM: 38.41,
    costCPMPaper: 20.36,
  },
  '9 3/4 x 22 1/8': {
    rollSize: 20,
    bradfordPrintCPM: 64.0,
    paperLbsPerM: 65.0,
    paperCostPerLb: 0.675,
    paperSellCPM: 53.3,
    totalCPM: 117.3,
    product: 'Self Mailer - Matte 7pt',
    printCPM: 49.18,
    costCPMPaper: 35.76,
  },
  '9 3/4 x 26': {
    rollSize: 20,
    bradfordPrintCPM: 64.0,
    paperLbsPerM: 60.0,
    paperCostPerLb: 0.675,
    paperSellCPM: 48.6,
    totalCPM: 112.6,
    product: 'Self Mailer - Matte 7pt',
    printCPM: 49.18,
    costCPMPaper: 40.5,
  },
  '6 x 9': {
    rollSize: 20,
    bradfordPrintCPM: 18.38,
    paperLbsPerM: 17.1,
    paperCostPerLb: 0.795,
    paperSellCPM: 16.32,
    totalCPM: 34.7,
    product: 'Postcard - Gloss 9pt',
    printCPM: 10.0,
    costCPMPaper: 13.6,
  },
  '6 x 11': {
    rollSize: 20,
    bradfordPrintCPM: 18.38,
    paperLbsPerM: 20.0,
    paperCostPerLb: 0.795,
    paperSellCPM: 19.08,
    totalCPM: 37.46,
    product: 'Postcard - Gloss 9pt',
    printCPM: 10.0,
    costCPMPaper: 15.9,
  },
  '9 3/4 x 12': {
    rollSize: 20,
    bradfordPrintCPM: 49.78,
    paperLbsPerM: 39.52,
    paperCostPerLb: 0.75,
    paperSellCPM: 33.26,
    totalCPM: 83.04,
    product: 'Self Mailer - Gloss 7pt',
    printCPM: 34.74,
    costCPMPaper: 29.64,
  },
  '9 3/4 x 22 1/8 (100#)': {
    rollSize: 20,
    bradfordPrintCPM: 64.0,
    paperLbsPerM: 52.98,
    paperCostPerLb: 0.675,
    paperSellCPM: 41.47,
    totalCPM: 105.47,
    product: 'Self Mailer - 100# Text',
    printCPM: 49.18,
    costCPMPaper: 34.56,
  },
  '9 3/4 x 26 (100#)': {
    rollSize: 20,
    bradfordPrintCPM: 64.0,
    paperLbsPerM: 60.0,
    paperCostPerLb: 0.675,
    paperSellCPM: 47.62,
    totalCPM: 111.62,
    product: 'Self Mailer - 100# Text',
    printCPM: 49.18,
    costCPMPaper: 39.68,
  },
};

/** Normalize common size strings to table keys */
export function normalizeSizeKey(size: string): string | null {
  if (!size) return null;
  const s = size
    .trim()
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/\s+/g, ' ')
    .replace(/"/g, '');
  // direct match
  for (const key of Object.keys(BRADFORD_SIZE_PRICING)) {
    if (key.toLowerCase() === s) return key;
  }
  // compact 6x11 / 6x9
  const compact = s.replace(/\s/g, '');
  const map: Record<string, string> = {
    '6x9': '6 x 9',
    '6x11': '6 x 11',
    '7.25x16.375': '7 1/4 x 16 3/8',
    '7-1/4x16-3/8': '7 1/4 x 16 3/8',
    '8.5x17.5': '8 1/2 x 17 1/2',
    '8-1/2x17-1/2': '8 1/2 x 17 1/2',
    '9.75x22.125': '9 3/4 x 22 1/8',
    '9.75x26': '9 3/4 x 26',
    '9.75x12': '9 3/4 x 12',
  };
  if (map[compact]) return map[compact];
  // contains
  for (const key of Object.keys(BRADFORD_SIZE_PRICING)) {
    if (s.includes(key.toLowerCase().replace(/\s/g, '')) || key.toLowerCase().includes(s)) {
      return key;
    }
  }
  return null;
}

export function getBradfordPricing(size: string) {
  const key = normalizeSizeKey(size) || size;
  return BRADFORD_SIZE_PRICING[key as keyof typeof BRADFORD_SIZE_PRICING];
}

export function getBradfordSizes(): string[] {
  return Object.keys(BRADFORD_SIZE_PRICING);
}

export function isBradfordSize(size: string): boolean {
  return !!getBradfordPricing(size);
}

// backward compat
export const PAPER_COST_PER_LB = PAPER_COST_PER_LB_DEFAULT;
