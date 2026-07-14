/**
 * Third Party Calculator formulas (Drive sheet + Bradford size table).
 *
 * Flow (sell-first):
 *   1. Sell price (customer) is the driver
 *   2. Size table → print CPM + paper CPM (raw)
 *   3. Total cost = JD mfg + paper base + 18% paper markup
 *   4. Margin = sell − total cost → 50/50 Impact / Bradford
 *   5. Bradford also keeps paper markup
 */

import {
  BRADFORD_SIZE_PRICING,
  getBradfordPricing,
  PAPER_COST_PER_LB,
} from './bradfordPricing';

export const PAPER_MARKUP_RATE = 0.18;

export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export function getSizeOptions(): string[] {
  return Object.keys(BRADFORD_SIZE_PRICING);
}

export interface ThirdPartyCalcInput {
  sellPrice: number;
  quantity: number;
  sizeName?: string | null;
  /** Override table print CPM */
  printCPM?: number | null;
  /** Override table paper CPM (raw, before 18%) */
  paperCPM?: number | null;
  /** When paper is not Bradford, skip markup */
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
  impactShare: number;
  bradfordMarginShare: number;
  /** Bradford gets = 50% margin + paper markup (calculator “Bradford Gets”) */
  bradfordGets: number;
  impactGets: number;
  /** Impact → Bradford PO total (Bradford paper route) */
  impactToBradfordBuy: number;
  /** Bradford → JD PO (mfg only) */
  bradfordToJdBuy: number;
  sellCPM: number;
  sizeMatched: boolean;
  sizeName: string | null;
  paperLbsPerM: number | null;
}

export function calculateFromSellPrice(input: ThirdPartyCalcInput): ThirdPartyCalcResult {
  const sell = Number(input.sellPrice) || 0;
  const qty = Number(input.quantity) || 0;
  const qtyM = qty > 0 ? qty / 1000 : 0;
  const table = input.sizeName ? getBradfordPricing(input.sizeName) : undefined;
  const printCPM = input.printCPM != null && input.printCPM > 0
    ? Number(input.printCPM)
    : table?.printCPM ?? 0;
  const paperCPM = input.paperCPM != null && input.paperCPM > 0
    ? Number(input.paperCPM)
    : table?.costCPMPaper ?? 0;

  const jdMfg = round2(printCPM * qtyM);
  const paperBase = round2(paperCPM * qtyM);
  const applyMarkup = !input.paperSource || input.paperSource === 'BRADFORD';
  const paperMarkup = applyMarkup ? round2(paperBase * PAPER_MARKUP_RATE) : 0;
  const totalCost = round2(jdMfg + paperBase + paperMarkup);
  const margin = round2(sell - totalCost);
  const half = round2(margin / 2);

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
    impactShare: half,
    bradfordMarginShare: half,
    bradfordGets: round2(half + paperMarkup),
    impactGets: half,
    impactToBradfordBuy: totalCost,
    bradfordToJdBuy: jdMfg,
    sellCPM: qtyM > 0 ? round2(sell / qtyM) : 0,
    sizeMatched: !!table,
    sizeName: input.sizeName || null,
    paperLbsPerM: table?.paperLbsPerM ?? null,
  };
}

export { getBradfordPricing, PAPER_COST_PER_LB, BRADFORD_SIZE_PRICING };
