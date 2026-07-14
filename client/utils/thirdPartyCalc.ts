/**
 * Third Party Calculator — formulas from Drive xlsx:
 * https://docs.google.com/spreadsheets/d/1CQN3i3D3t64wFb6Hc3NvG8UET_q4WCv9
 *
 * Sell (or Sell CPM × qty) drives everything.
 * Costs from size Lookup: JD MFG + Paper Base + 18% markup.
 * Margin split: Bradford 30% / Impact 70% (sheet B20/B21 — labels still say 50/50).
 */

import {
  BRADFORD_MARGIN_SHARE,
  IMPACT_MARGIN_SHARE,
  PAPER_MARKUP_RATE,
  THIRD_PARTY_CALCULATOR_URL,
  getBradfordPricing,
  getBradfordSizes,
  PAPER_COST_PER_LB,
  BRADFORD_SIZE_PRICING,
  normalizeSizeKey,
} from './bradfordPricing';

export { PAPER_MARKUP_RATE, THIRD_PARTY_CALCULATOR_URL, PAPER_COST_PER_LB, BRADFORD_SIZE_PRICING };
export { BRADFORD_MARGIN_SHARE, IMPACT_MARGIN_SHARE };

export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export function getSizeOptions(): string[] {
  return getBradfordSizes();
}

export interface ThirdPartyCalcInput {
  sellPrice: number;
  quantity: number;
  sizeName?: string | null;
  printCPM?: number | null;
  paperCPM?: number | null;
  paperSource?: 'BRADFORD' | 'VENDOR' | 'CUSTOMER' | string | null;
}

export interface ThirdPartyCalcResult {
  qtyM: number;
  printCPM: number;
  paperCPM: number;
  jdMfg: number;
  paperBase: number;
  paperMarkup: number;
  totalCost: number;
  margin: number;
  marginPct: number;
  /** Impact share of margin (70%) */
  impactShare: number;
  /** Bradford share of margin (30%) — not including paper markup */
  bradfordMarginShare: number;
  /** Bradford Gets = paper markup + 30% margin */
  bradfordGets: number;
  /** Impact Gets = 70% margin */
  impactGets: number;
  impactToBradfordBuy: number;
  bradfordToJdBuy: number;
  sellCPM: number;
  sizeMatched: boolean;
  sizeName: string | null;
  paperLbsPerM: number | null;
  product: string | null;
  /** Full Bradford check (paper pass-through + Bradford gets + JD mfg) */
  bradfordPayout: number;
}

export function calculateFromSellPrice(input: ThirdPartyCalcInput): ThirdPartyCalcResult {
  const sell = Number(input.sellPrice) || 0;
  const qty = Number(input.quantity) || 0;
  const qtyM = qty > 0 ? qty / 1000 : 0;
  const key = input.sizeName ? normalizeSizeKey(input.sizeName) || input.sizeName : null;
  const table = key ? getBradfordPricing(key) : undefined;

  // JD MFG CPM + Paper Base CPM from Lookup (or overrides)
  const printCPM =
    input.printCPM != null && input.printCPM > 0
      ? Number(input.printCPM)
      : table?.printCPM ?? 0;
  const paperCPM =
    input.paperCPM != null && input.paperCPM > 0
      ? Number(input.paperCPM)
      : table?.costCPMPaper ?? 0;

  const jdMfg = round2(printCPM * qtyM);
  const paperBase = round2(paperCPM * qtyM);
  const applyMarkup = !input.paperSource || input.paperSource === 'BRADFORD';
  const paperMarkup = applyMarkup ? round2(paperBase * PAPER_MARKUP_RATE) : 0;
  const totalCost = round2(jdMfg + paperBase + paperMarkup);
  const margin = round2(sell - totalCost);
  const bradfordMarginShare = round2(margin * BRADFORD_MARGIN_SHARE);
  const impactShare = round2(margin * IMPACT_MARGIN_SHARE);
  const bradfordGets = round2(paperMarkup + bradfordMarginShare);
  const impactGets = impactShare;

  return {
    qtyM,
    printCPM,
    paperCPM,
    jdMfg,
    paperBase,
    paperMarkup,
    totalCost,
    margin,
    marginPct: sell > 0 ? round2((margin / sell) * 100) : 0,
    impactShare,
    bradfordMarginShare,
    bradfordGets,
    impactGets,
    // Impact pays Bradford: paper + markup + mfg (Bradford paper route)
    impactToBradfordBuy: totalCost,
    bradfordToJdBuy: jdMfg,
    sellCPM: qtyM > 0 ? round2(sell / qtyM) : 0,
    sizeMatched: !!table,
    sizeName: key,
    paperLbsPerM: table?.paperLbsPerM ?? null,
    product: table?.product ?? null,
    // Sheet C32: paper pass-through + Bradford gets + JD mfg
    bradfordPayout: round2(paperBase + bradfordGets + jdMfg),
  };
}

export { getBradfordPricing };
