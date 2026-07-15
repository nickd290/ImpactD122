import React, { useMemo, useState } from 'react';
import {
  Building2, ExternalLink, Check, Loader2, Calculator, ChevronRight, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { authFetch } from '../../lib/api';
import { cn } from '../../lib/utils';
import {
  getBradfordPricing,
  PAPER_COST_PER_LB,
  PAPER_MARKUP_RATE,
  BRADFORD_MARGIN_SHARE,
  IMPACT_MARGIN_SHARE,
  THIRD_PARTY_CALCULATOR_URL,
} from '../../utils/bradfordPricing';
import { calculateFromSellPrice, isJdPaperSource } from '../../utils/thirdPartyCalc';

export { THIRD_PARTY_CALCULATOR_URL };

const PAPER_MARKUP = PAPER_MARKUP_RATE;

interface PurchaseOrder {
  id: string;
  originCompanyId?: string;
  targetCompanyId?: string;
  buyCost?: number;
  paperCost?: number;
  paperMarkup?: number;
  mfgCost?: number;
  printCPM?: number;
  paperCPM?: number;
  description?: string;
}

interface VendorCostEntryProps {
  jobId: string;
  quantity?: number;
  sellPrice?: number;
  sizeName?: string;
  paperSource?: string | null;
  purchaseOrders?: PurchaseOrder[];
  onSaved?: () => void;
}

function money(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function round2(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

/**
 * Click production payee card → enter CPM / $ costs.
 * Bradford paper: Impact → Bradford + Bradford → JD.
 * JD paper: Impact → JD (production cost is the JD check).
 */
export function VendorCostEntry({
  jobId,
  quantity = 0,
  sellPrice = 0,
  sizeName,
  paperSource = 'BRADFORD',
  purchaseOrders = [],
  onSaved,
}: VendorCostEntryProps) {
  const jdPaper = isJdPaperSource(paperSource);

  const impactBradfordPO = purchaseOrders.find(
    (p) => p.originCompanyId === 'impact-direct' && p.targetCompanyId === 'bradford'
  );
  const impactJdPO = purchaseOrders.find(
    (p) => p.originCompanyId === 'impact-direct' && p.targetCompanyId === 'jd-graphic'
  );
  const bradfordJdPO = purchaseOrders.find(
    (p) => p.originCompanyId === 'bradford' && p.targetCompanyId === 'jd-graphic'
  );

  const table = sizeName ? getBradfordPricing(sizeName) : undefined;
  const suggestedPrint = table?.printCPM ?? 0;
  const suggestedPaper = table?.costCPMPaper ?? 0;

  const [open, setOpen] = useState<'bradford' | 'jd' | null>(null);
  const [saving, setSaving] = useState(false);

  const seedJdPO = jdPaper ? impactJdPO : bradfordJdPO;

  const [printCPM, setPrintCPM] = useState(
    () => String(seedJdPO?.printCPM || suggestedPrint || '')
  );
  const [jdTotalOverride, setJdTotalOverride] = useState('');
  const [paperCPM, setPaperCPM] = useState(
    () =>
      String(
        impactBradfordPO?.paperCPM ||
          impactJdPO?.paperCPM ||
          suggestedPaper ||
          ''
      )
  );
  const [paperTotalOverride, setPaperTotalOverride] = useState('');

  const qtyM = quantity > 0 ? quantity / 1000 : 0;

  const calc = useMemo(() => {
    const printCpmN = parseFloat(printCPM) || 0;
    const paperCpmN = parseFloat(paperCPM) || 0;
    if (jdTotalOverride || paperTotalOverride) {
      const jdMfg = jdTotalOverride ? parseFloat(jdTotalOverride) || 0 : round2(printCpmN * qtyM);
      const paperBase = paperTotalOverride
        ? parseFloat(paperTotalOverride) || 0
        : round2(paperCpmN * qtyM);
      // Markup always in cost; who keeps it is payee (JD vs Bradford)
      const paperMarkup = round2(paperBase * PAPER_MARKUP);
      const totalCost = round2(jdMfg + paperBase + paperMarkup);
      const margin = round2((sellPrice || 0) - totalCost);
      const bradfordMarginShare = round2(margin * BRADFORD_MARGIN_SHARE);
      const impactGets = round2(margin * IMPACT_MARGIN_SHARE);
      const bradfordGets = jdPaper
        ? bradfordMarginShare
        : round2(paperMarkup + bradfordMarginShare);
      return {
        printCpmN,
        paperCpmN,
        jdMfg,
        paperBase,
        paperMarkup,
        totalCost,
        margin,
        marginPct: sellPrice > 0 ? (margin / sellPrice) * 100 : 0,
        impactGets,
        bradfordGets,
        impactToBradfordBuy: jdPaper ? 0 : totalCost,
        impactToJdBuy: jdPaper ? totalCost : 0,
        bradfordToJdBuy: jdPaper ? 0 : jdMfg,
        sellCpm: qtyM > 0 ? round2((sellPrice || 0) / qtyM) : 0,
      };
    }
    const r = calculateFromSellPrice({
      sellPrice: sellPrice || 0,
      quantity: quantity || 0,
      sizeName,
      printCPM: printCpmN || null,
      paperCPM: paperCpmN || null,
      paperSource,
    });
    return {
      printCpmN: r.printCPM,
      paperCpmN: r.paperCPM,
      jdMfg: r.jdMfg,
      paperBase: r.paperBase,
      paperMarkup: r.paperMarkup,
      totalCost: r.totalCost,
      margin: r.margin,
      marginPct: r.marginPct,
      impactGets: r.impactGets,
      bradfordGets: r.bradfordGets,
      impactToBradfordBuy: r.impactToBradfordBuy,
      impactToJdBuy: r.impactToJdBuy,
      bradfordToJdBuy: r.bradfordToJdBuy,
      sellCpm: r.sellCPM,
    };
  }, [
    printCPM,
    paperCPM,
    jdTotalOverride,
    paperTotalOverride,
    qtyM,
    sellPrice,
    quantity,
    sizeName,
    paperSource,
    jdPaper,
  ]);

  const openVendor = (v: 'bradford' | 'jd') => {
    setOpen((prev) => (prev === v ? null : v));
    if (v === 'jd') {
      const src = jdPaper ? impactJdPO : bradfordJdPO;
      if (src?.printCPM) setPrintCPM(String(src.printCPM));
      else if (src?.buyCost && qtyM > 0 && !jdPaper) {
        setPrintCPM(String(round2(src.buyCost / qtyM)));
      } else if (src?.mfgCost && qtyM > 0) {
        setPrintCPM(String(round2(src.mfgCost / qtyM)));
      }
    }
    if (v === 'bradford') {
      const src = impactBradfordPO || impactJdPO;
      if (src?.paperCPM) setPaperCPM(String(src.paperCPM));
      else if (src?.paperCost && qtyM > 0) {
        setPaperCPM(String(round2(src.paperCost / qtyM)));
      }
    }
  };

  const upsertPO = async (
    existing: PurchaseOrder | undefined,
    body: Record<string, unknown>
  ) => {
    if (existing?.id) {
      const res = await authFetch(`/api/jobs/${jobId}/pos/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update PO');
      return res.json();
    }
    const res = await authFetch(`/api/jobs/${jobId}/pos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create PO');
    }
    return res.json();
  };

  const handleSaveAll = async () => {
    if (!quantity || quantity <= 0) {
      toast.error('Set job quantity before entering costs');
      return;
    }
    setSaving(true);
    try {
      if (jdPaper) {
        // Same total as Bradford route: mfg + paper + 18% — JD keeps the paper markup
        await upsertPO(impactJdPO, {
          poType: 'impact-jd',
          description: 'Impact → JD Graphic (mfg + paper + markup)',
          buyCost: calc.impactToJdBuy,
          mfgCost: calc.jdMfg,
          paperCost: calc.paperBase,
          paperMarkup: calc.paperMarkup,
          printCPM: calc.printCpmN || null,
          paperCPM: calc.paperCpmN || null,
        });
        toast.success('JD production cost saved (mfg+paper+markup → JD)');
      } else {
        await upsertPO(bradfordJdPO, {
          poType: 'bradford-jd',
          description: 'JD Graphic Manufacturing',
          buyCost: calc.bradfordToJdBuy,
          mfgCost: calc.bradfordToJdBuy,
          printCPM: calc.printCpmN || null,
          paperCost: null,
          paperMarkup: null,
          paperCPM: null,
        });
        await upsertPO(impactBradfordPO, {
          poType: 'impact-bradford',
          description: 'Impact → Bradford (paper + production)',
          buyCost: calc.impactToBradfordBuy,
          paperCost: calc.paperBase,
          paperMarkup: calc.paperMarkup,
          mfgCost: calc.jdMfg,
          paperCPM: calc.paperCpmN || null,
          printCPM: calc.printCpmN || null,
        });
        toast.success('Bradford & JD costs saved');
      }
      setOpen(null);
      onSaved?.();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save costs');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVendor = async (vendor: 'bradford' | 'jd') => {
    if (!quantity || quantity <= 0) {
      toast.error('Set job quantity first');
      return;
    }
    setSaving(true);
    try {
      if (jdPaper) {
        // On JD paper: one Impact → JD PO with full cost (JD keeps paper markup)
        await upsertPO(impactJdPO, {
          poType: 'impact-jd',
          description: 'Impact → JD Graphic (mfg + paper + markup)',
          buyCost: calc.impactToJdBuy,
          mfgCost: calc.jdMfg,
          paperCost: calc.paperBase,
          paperMarkup: calc.paperMarkup,
          printCPM: calc.printCpmN || null,
          paperCPM: calc.paperCpmN || null,
        });
        toast.success('JD production cost saved (mfg+paper+markup)');
      } else if (vendor === 'jd') {
        await upsertPO(bradfordJdPO, {
          poType: 'bradford-jd',
          description: 'JD Graphic Manufacturing',
          buyCost: calc.bradfordToJdBuy,
          mfgCost: calc.bradfordToJdBuy,
          printCPM: calc.printCpmN || null,
        });
        if (impactBradfordPO) {
          const paperBase = impactBradfordPO.paperCost ?? calc.paperBase;
          const markup = impactBradfordPO.paperMarkup ?? calc.paperMarkup;
          await upsertPO(impactBradfordPO, {
            mfgCost: calc.jdMfg,
            buyCost: round2(Number(paperBase) + Number(markup) + calc.jdMfg),
            printCPM: calc.printCpmN || null,
          });
        }
        toast.success('JD cost saved');
      } else {
        const jdMfg =
          calc.jdMfg ||
          Number(bradfordJdPO?.buyCost) ||
          Number(bradfordJdPO?.mfgCost) ||
          0;
        await upsertPO(impactBradfordPO, {
          poType: 'impact-bradford',
          description: 'Impact → Bradford (paper + production)',
          buyCost: round2(calc.paperBase + calc.paperMarkup + jdMfg),
          paperCost: calc.paperBase,
          paperMarkup: calc.paperMarkup,
          mfgCost: jdMfg,
          paperCPM: calc.paperCpmN || null,
          printCPM: calc.printCpmN || null,
        });
        toast.success('Bradford cost saved');
      }
      setOpen(null);
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const applySizeDefaults = () => {
    if (!table) {
      toast.message('No standard size pricing for this job');
      return;
    }
    setPrintCPM(String(table.printCPM));
    setPaperCPM(String(table.costCPMPaper));
    setJdTotalOverride('');
    setPaperTotalOverride('');
    toast.success(`Loaded ${sizeName} table rates`);
  };

  const jdDisplay = jdPaper
    ? Number(impactJdPO?.mfgCost) || Number(impactJdPO?.buyCost) || calc.jdMfg || 0
    : Number(bradfordJdPO?.buyCost) || Number(bradfordJdPO?.mfgCost) || calc.jdMfg || 0;

  const bradfordDisplay = jdPaper
    ? 0 // Bradford is margin-only on JD paper (not a production cost card amount)
    : Number(impactBradfordPO?.buyCost) ||
      calc.paperBase + calc.paperMarkup + jdDisplay ||
      0;

  const productionDisplay = jdPaper
    ? Number(impactJdPO?.buyCost) || calc.impactToJdBuy || 0
    : Number(impactBradfordPO?.buyCost) || calc.impactToBradfordBuy || 0;

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Vendor costs
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {jdPaper
              ? 'JD paper · same cost stack (mfg+paper+18%) · JD keeps paper markup'
              : 'Bradford paper · same cost stack · BGE keeps paper markup'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {table && (
            <button
              type="button"
              onClick={applySizeDefaults}
              className="text-xs font-medium text-[#2B3A4A] hover:underline"
            >
              Load size rates
            </button>
          )}
          <a
            href={THIRD_PARTY_CALCULATOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C0512A] hover:underline"
          >
            <Calculator className="w-3.5 h-3.5" />
            Third Party Calculator
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {jdPaper && (
        <div className="mx-3 mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          <span className="font-semibold">JD paper:</span> total cost same as Bradford route
          (mfg + paper + 18%). Markup goes to <span className="font-semibold">JD</span> via{' '}
          <span className="font-mono">Impact → JD</span>. Bradford still gets margin split only.
        </div>
      )}

      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Production payee card — Bradford or JD depending on paper */}
        {jdPaper ? (
          <button
            type="button"
            onClick={() => openVendor('jd')}
            className={cn(
              'text-left rounded-xl border p-4 transition-all sm:col-span-2',
              open === 'jd'
                ? 'border-[#2B3A4A] ring-2 ring-[#2B3A4A]/15 bg-slate-50'
                : 'border-zinc-200 hover:border-[#2B3A4A]/40 bg-white'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-[#2B3A4A]/10 text-[#2B3A4A] flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#2B3A4A]">JD Graphic — production</p>
                  <p className="text-[11px] text-zinc-500">Impact pays JD · mfg + paper + 18% (JD keeps mk)</p>
                </div>
              </div>
              {open === 'jd' ? (
                <Pencil className="w-4 h-4 text-[#2B3A4A]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-300" />
              )}
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-[#2B3A4A]">
              {money(productionDisplay)}
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">
              {impactJdPO
                ? `PO · mfg ${money(Number(impactJdPO.mfgCost) || 0)} + paper ${money(Number(impactJdPO.paperCost) || 0)} + mk ${money(Number(impactJdPO.paperMarkup) || 0)}`
                : 'Click to enter JD production cost'}
            </p>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openVendor('bradford')}
              className={cn(
                'text-left rounded-xl border p-4 transition-all',
                open === 'bradford'
                  ? 'border-[#C0512A] ring-2 ring-[#C0512A]/20 bg-orange-50/40'
                  : 'border-zinc-200 hover:border-[#C0512A]/50 bg-white'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-[#C0512A]/10 text-[#C0512A] flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#2B3A4A]">Bradford</p>
                    <p className="text-[11px] text-zinc-500">Impact pays BGE · paper + 18% + mfg</p>
                  </div>
                </div>
                {open === 'bradford' ? (
                  <Pencil className="w-4 h-4 text-[#C0512A]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zinc-300" />
                )}
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-[#2B3A4A]">
                {money(
                  impactBradfordPO
                    ? Number(impactBradfordPO.buyCost) || 0
                    : calc.paperBase + calc.paperMarkup
                )}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                {impactBradfordPO
                  ? `PO · paper ${money(Number(impactBradfordPO.paperCost) || 0)} + markup ${money(Number(impactBradfordPO.paperMarkup) || 0)}`
                  : 'Click to enter paper cost'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => openVendor('jd')}
              className={cn(
                'text-left rounded-xl border p-4 transition-all',
                open === 'jd'
                  ? 'border-[#2B3A4A] ring-2 ring-[#2B3A4A]/15 bg-slate-50'
                  : 'border-zinc-200 hover:border-[#2B3A4A]/40 bg-white'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-[#2B3A4A]/10 text-[#2B3A4A] flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#2B3A4A]">JD Graphic</p>
                    <p className="text-[11px] text-zinc-500">Mfg tracking (Bradford → JD)</p>
                  </div>
                </div>
                {open === 'jd' ? (
                  <Pencil className="w-4 h-4 text-[#2B3A4A]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zinc-300" />
                )}
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-[#2B3A4A]">
                {money(jdDisplay)}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                {bradfordJdPO
                  ? `PO · print CPM ${bradfordJdPO.printCPM ?? '—'}`
                  : 'Click to enter mfg cost'}
              </p>
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="border-t border-zinc-100 bg-zinc-50/80 px-4 py-4 space-y-4">
          {(open === 'jd' || jdPaper) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Print CPM ($/M)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={printCPM}
                  onChange={(e) => {
                    setPrintCPM(e.target.value);
                    setJdTotalOverride('');
                  }}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2B3A4A]/20"
                  placeholder="10.00"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Or total $ (JD mfg)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={jdTotalOverride}
                  onChange={(e) => setJdTotalOverride(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2B3A4A]/20"
                  placeholder={String(calc.jdMfg || '')}
                />
              </label>
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  JD mfg
                </span>
                <p className="text-lg font-semibold tabular-nums text-[#2B3A4A] mt-0.5">
                  {money(calc.jdMfg)}
                </p>
                {qtyM > 0 && (
                  <p className="text-[10px] text-zinc-400">{quantity.toLocaleString()} pcs</p>
                )}
              </div>
            </div>
          )}

          {(open === 'bradford' || jdPaper) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Paper CPM base ($/M)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={paperCPM}
                  onChange={(e) => {
                    setPaperCPM(e.target.value);
                    setPaperTotalOverride('');
                  }}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C0512A]/20"
                  placeholder="15.90"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Or paper total $
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={paperTotalOverride}
                  onChange={(e) => setPaperTotalOverride(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C0512A]/20"
                  placeholder={String(calc.paperBase || '')}
                />
              </label>
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Paper base</span>
                  <span className="font-mono tabular-nums">{money(calc.paperBase)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">
                    + 18% markup → {jdPaper ? 'JD' : 'Bradford'}
                  </span>
                  <span className="font-mono tabular-nums text-[#C0512A]">{money(calc.paperMarkup)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold pt-1 border-t border-zinc-100">
                  <span>Paper w/ markup</span>
                  <span className="font-mono tabular-nums">
                    {money(calc.paperBase + calc.paperMarkup)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="w-3.5 h-3.5 text-[#C0512A]" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Calculator preview
              </span>
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-medium',
                  jdPaper ? 'text-slate-700 bg-slate-100' : 'text-amber-800 bg-amber-50'
                )}
              >
                {jdPaper ? 'Pay JD' : 'Pay Bradford'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Metric label="Total cost" value={money(calc.totalCost)} />
              <Metric label="Margin" value={money(calc.margin)} sub={`${calc.marginPct.toFixed(1)}%`} good={calc.margin >= 0} />
              <Metric label={`Impact ${Math.round(IMPACT_MARGIN_SHARE * 100)}%`} value={money(calc.impactGets)} />
              <Metric
                label={jdPaper ? `Bradford margin ${Math.round(BRADFORD_MARGIN_SHARE * 100)}%` : `Bradford ${Math.round(BRADFORD_MARGIN_SHARE * 100)}%+markup`}
                value={money(calc.bradfordGets)}
                accent
              />
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-500">
              {jdPaper ? (
                <p>
                  Impact → JD PO:{' '}
                  <span className="font-mono text-zinc-800">{money(calc.impactToJdBuy)}</span>
                </p>
              ) : (
                <>
                  <p>
                    Impact → Bradford PO:{' '}
                    <span className="font-mono text-zinc-800">{money(calc.impactToBradfordBuy)}</span>
                  </p>
                  <p>
                    Bradford → JD PO:{' '}
                    <span className="font-mono text-zinc-800">{money(calc.bradfordToJdBuy)}</span>
                  </p>
                </>
              )}
            </div>
            {table && (
              <p className="text-[10px] text-zinc-400 mt-2">
                Table {sizeName}: print ${table.printCPM}/M · paper ${table.costCPMPaper}/M
                {table.paperLbsPerM ? ` · ${table.paperLbsPerM} lbs/M @ $${PAPER_COST_PER_LB}/lb` : ''}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 rounded-lg"
            >
              Cancel
            </button>
            {!jdPaper && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveVendor(open)}
                className="px-3 py-1.5 text-sm font-medium text-[#2B3A4A] border border-zinc-300 rounded-lg hover:bg-white disabled:opacity-50"
              >
                Save {open === 'jd' ? 'JD only' : 'Bradford only'}
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveAll}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-[#2B3A4A] rounded-lg hover:bg-[#1f2a36] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {jdPaper ? 'Save JD production cost' : 'Save both costs'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  good,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p
        className={cn(
          'text-sm font-semibold font-mono tabular-nums',
          good === false ? 'text-red-600' : good ? 'text-emerald-700' : accent ? 'text-[#C0512A]' : 'text-zinc-800'
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-zinc-400">{sub}</p>}
    </div>
  );
}

export default VendorCostEntry;
