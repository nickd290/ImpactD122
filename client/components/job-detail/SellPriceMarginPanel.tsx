import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { authFetch } from '../../lib/api';
import { cn } from '../../lib/utils';
import {
  calculateFromSellPrice,
  getSizeOptions,
  PAPER_MARKUP_RATE,
  THIRD_PARTY_CALCULATOR_URL,
  BRADFORD_MARGIN_SHARE,
  IMPACT_MARGIN_SHARE,
} from '../../utils/thirdPartyCalc';

export { THIRD_PARTY_CALCULATOR_URL };

function money(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function money2(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

interface SellPriceMarginPanelProps {
  jobId: string;
  sellPrice?: number | null;
  quantity?: number | null;
  sizeName?: string | null;
  paperSource?: string | null;
  purchaseOrders?: any[];
  onSaved?: () => void;
  /** When size/qty/sell change, parent can re-fetch */
  className?: string;
}

/**
 * Always-editable sell / size / qty panel.
 * Sell price drives margin; size table fills print/paper CPM (Third Party Calculator).
 */
export function SellPriceMarginPanel({
  jobId,
  sellPrice: sellProp = 0,
  quantity: qtyProp = 0,
  sizeName: sizeProp = '',
  paperSource = 'BRADFORD',
  purchaseOrders = [],
  onSaved,
  className,
}: SellPriceMarginPanelProps) {
  const [sell, setSell] = useState(String(sellProp || ''));
  const [qty, setQty] = useState(String(qtyProp || ''));
  const [size, setSize] = useState(sizeProp || '');
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setSell(String(sellProp || ''));
      setQty(String(qtyProp || ''));
      setSize(sizeProp || '');
    }
  }, [sellProp, qtyProp, sizeProp, dirty]);

  const sellN = parseFloat(sell) || 0;
  const qtyN = parseInt(qty, 10) || 0;

  const calc = useMemo(
    () =>
      calculateFromSellPrice({
        sellPrice: sellN,
        quantity: qtyN,
        sizeName: size || null,
        paperSource,
      }),
    [sellN, qtyN, size, paperSource]
  );

  const saveFields = async (fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await authFetch(`/api/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Save failed');
      }
      setDirty(false);
      toast.success('Saved');
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleBlurSave = async () => {
    if (!dirty) return;
    const payload: Record<string, unknown> = {};
    if (sellN !== Number(sellProp || 0)) payload.sellPrice = sellN;
    if (qtyN !== Number(qtyProp || 0)) payload.quantity = qtyN;
    if ((size || '') !== (sizeProp || '')) payload.sizeName = size || null;
    if (Object.keys(payload).length === 0) {
      setDirty(false);
      return;
    }
    await saveFields(payload);
  };

  const upsertPO = async (existing: any | undefined, body: Record<string, unknown>) => {
    if (existing?.id) {
      const res = await authFetch(`/api/jobs/${jobId}/pos/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update PO');
      return;
    }
    const res = await authFetch(`/api/jobs/${jobId}/pos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Failed to create PO');
  };

  /** Push calculator costs into Bradford/JD POs from size + sell formulas */
  const applyCostsToPOs = async () => {
    if (qtyN <= 0) {
      toast.error('Set quantity first');
      return;
    }
    if (!calc.sizeMatched && calc.printCPM === 0) {
      toast.error('Pick a size (or set vendor CPMs manually)');
      return;
    }
    setApplying(true);
    try {
      // Persist sell/size/qty first
      await saveFields({
        sellPrice: sellN,
        quantity: qtyN,
        sizeName: size || null,
      });

      const impactBradfordPO = purchaseOrders.find(
        (p: any) => p.originCompanyId === 'impact-direct' && p.targetCompanyId === 'bradford'
      );
      const bradfordJdPO = purchaseOrders.find(
        (p: any) => p.originCompanyId === 'bradford' && p.targetCompanyId === 'jd-graphic'
      );

      await upsertPO(bradfordJdPO, {
        poType: 'bradford-jd',
        description: 'JD Graphic Manufacturing',
        buyCost: calc.bradfordToJdBuy,
        mfgCost: calc.bradfordToJdBuy,
        printCPM: calc.printCPM,
      });

      await upsertPO(impactBradfordPO, {
        poType: 'impact-bradford',
        description: 'Impact → Bradford (paper + production)',
        buyCost: calc.impactToBradfordBuy,
        paperCost: calc.paperBase,
        paperMarkup: calc.paperMarkup,
        mfgCost: calc.jdMfg,
        paperCPM: calc.paperCPM,
        printCPM: calc.printCPM,
      });

      toast.success('Costs applied from size table + sell');
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to apply costs');
    } finally {
      setApplying(false);
    }
  };

  const sizes = getSizeOptions();

  return (
    <div className={cn('bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm', className)}>
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Sell → margins
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Sell drives it · size → JD MFG + paper · {Math.round(PAPER_MARKUP_RATE * 100)}% markup · margin{' '}
            {Math.round(IMPACT_MARGIN_SHARE * 100)}% Impact / {Math.round(BRADFORD_MARGIN_SHARE * 100)}% Bradford
          </p>
        </div>
        <a
          href={THIRD_PARTY_CALCULATOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C0512A] hover:underline"
        >
          <Calculator className="w-3.5 h-3.5" />
          Calculator sheet
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Sell price $
          </span>
          <input
            type="number"
            step="0.01"
            value={sell}
            onChange={(e) => {
              setSell(e.target.value);
              setDirty(true);
            }}
            onBlur={handleBlurSave}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-lg font-semibold font-mono tabular-nums text-[#2B3A4A] focus:outline-none focus:ring-2 focus:ring-[#C0512A]/25"
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Quantity
          </span>
          <input
            type="number"
            step="1"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              setDirty(true);
            }}
            onBlur={handleBlurSave}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#2B3A4A]/20"
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Size (table rates)
          </span>
          <select
            value={size}
            onChange={async (e) => {
              setSize(e.target.value);
              setDirty(true);
              // save size immediately so cost apply works
              const v = e.target.value;
              try {
                await saveFields({ sizeName: v || null });
              } catch {
                /* toast already */
              }
            }}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2B3A4A]/20"
          >
            <option value="">Custom / pick size…</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Live margin breakdown */}
      <div className="px-4 pb-4">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label="Total cost" value={money2(calc.totalCost)} sub={calc.sizeMatched ? (calc.product || 'size table') : 'set size or CPMs'} />
          <Metric
            label="Margin"
            value={money2(calc.margin)}
            sub={`${calc.marginPct}%`}
            tone={calc.margin >= 0 ? 'good' : 'bad'}
          />
          <Metric label={`Impact ${Math.round(IMPACT_MARGIN_SHARE * 100)}%`} value={money2(calc.impactGets)} tone="accent" />
          <Metric label={`Bradford ${Math.round(BRADFORD_MARGIN_SHARE * 100)}%+paper`} value={money2(calc.bradfordGets)} tone="rust" />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span>JD mfg {money2(calc.jdMfg)} ({calc.printCPM}/M)</span>
          <span>Paper {money2(calc.paperBase)} + markup {money2(calc.paperMarkup)}</span>
          <span>BGE payout {money2(calc.bradfordPayout)}</span>
          {calc.sellCPM > 0 && <span>Sell {calc.sellCPM}/M</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={applying || saving || qtyN <= 0}
            onClick={applyCostsToPOs}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-[#2B3A4A] hover:bg-[#1f2a36] disabled:opacity-50"
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Apply costs to Bradford + JD
          </button>
          {dirty && (
            <button
              type="button"
              disabled={saving}
              onClick={handleBlurSave}
              className="text-xs font-medium text-[#C0512A] hover:underline"
            >
              {saving ? 'Saving…' : 'Save sell / qty'}
            </button>
          )}
          {saving && !applying && (
            <span className="text-xs text-zinc-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'bad' | 'accent' | 'rust';
}) {
  return (
    <div className="rounded-lg bg-white border border-zinc-100 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium">{label}</p>
      <p
        className={cn(
          'text-sm font-semibold tabular-nums mt-0.5',
          tone === 'good' && 'text-emerald-700',
          tone === 'bad' && 'text-red-600',
          tone === 'accent' && 'text-[#2B3A4A]',
          tone === 'rust' && 'text-[#C0512A]',
          !tone && 'text-zinc-800'
        )}
      >
        {value}
        {sub && <span className="text-[10px] font-normal text-zinc-400 ml-1">{sub}</span>}
      </p>
    </div>
  );
}

export default SellPriceMarginPanel;
