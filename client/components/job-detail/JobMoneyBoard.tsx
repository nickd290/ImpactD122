/**
 * Single money board for job modal.
 * Sell / paper · type vendor costs · mark paid/unpaid.
 * Replaces the old Sell + VendorCost + Payees stack (less redundant).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Calculator, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { authFetch, jobsApi } from '../../lib/api';
import { cn } from '../../lib/utils';
import {
  calculateFromSellPrice,
  getSizeOptions,
  isJdPaperSource,
  PAPER_MARKUP_RATE,
  THIRD_PARTY_CALCULATOR_URL,
} from '../../utils/thirdPartyCalc';

type PaperSourceKey = 'BRADFORD' | 'VENDOR' | 'CUSTOMER';

interface PO {
  id: string;
  originCompanyId?: string;
  targetCompanyId?: string;
  buyCost?: number;
  mfgCost?: number;
  paperCost?: number;
  paperMarkup?: number;
  printCPM?: number;
  paperCPM?: number;
}

interface JobMoneyBoardProps {
  jobId: string;
  sellPrice?: number | null;
  quantity?: number | null;
  sizeName?: string | null;
  paperSource?: string | null;
  purchaseOrders?: PO[];
  customerPaid?: boolean;
  customerPaidDate?: string | null;
  bradfordPaid?: boolean;
  bradfordPaidDate?: string | null;
  jdPaid?: boolean;
  jdPaidDate?: string | null;
  onSaved?: () => void;
}

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

function round2(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

function fmtDate(d?: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function JobMoneyBoard({
  jobId,
  sellPrice: sellProp = 0,
  quantity: qtyProp = 0,
  sizeName: sizeProp = '',
  paperSource: paperProp = 'BRADFORD',
  purchaseOrders = [],
  customerPaid = false,
  customerPaidDate,
  bradfordPaid = false,
  bradfordPaidDate,
  jdPaid = false,
  jdPaidDate,
  onSaved,
}: JobMoneyBoardProps) {
  const [sell, setSell] = useState(String(sellProp || ''));
  const [qty, setQty] = useState(String(qtyProp || ''));
  const [size, setSize] = useState(sizeProp || '');
  const [paper, setPaper] = useState<PaperSourceKey>((paperProp as PaperSourceKey) || 'BRADFORD');
  const [dirtyHeader, setDirtyHeader] = useState(false);

  const jdPaper = isJdPaperSource(paper);

  const impactBradfordPO = purchaseOrders.find(
    (p) => p.originCompanyId === 'impact-direct' && p.targetCompanyId === 'bradford'
  );
  const impactJdPO = purchaseOrders.find(
    (p) => p.originCompanyId === 'impact-direct' && p.targetCompanyId === 'jd-graphic'
  );
  const bradfordJdPO = purchaseOrders.find(
    (p) => p.originCompanyId === 'bradford' && p.targetCompanyId === 'jd-graphic'
  );

  // Manual cost $ fields — always visible
  const [prodCost, setProdCost] = useState(''); // what Impact pays production (BGE or JD)
  const [jdMfg, setJdMfg] = useState(''); // Bradford→JD mfg track (Bradford paper only)
  const [costDirty, setCostDirty] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingCost, setSavingCost] = useState(false);
  const [payLoading, setPayLoading] = useState<'customer' | 'bradford' | 'jd' | null>(null);

  const sellN = parseFloat(sell) || 0;
  const qtyN = parseInt(qty, 10) || 0;

  // Seed cost fields from POs when not dirty
  useEffect(() => {
    if (costDirty) return;
    if (jdPaper) {
      setProdCost(
        impactJdPO?.buyCost != null && Number(impactJdPO.buyCost) > 0
          ? String(Number(impactJdPO.buyCost))
          : ''
      );
      setJdMfg('');
    } else {
      setProdCost(
        impactBradfordPO?.buyCost != null && Number(impactBradfordPO.buyCost) > 0
          ? String(Number(impactBradfordPO.buyCost))
          : ''
      );
      const mfg =
        Number(bradfordJdPO?.buyCost) ||
        Number(bradfordJdPO?.mfgCost) ||
        Number(impactBradfordPO?.mfgCost) ||
        0;
      setJdMfg(mfg > 0 ? String(mfg) : '');
    }
  }, [
    costDirty,
    jdPaper,
    impactBradfordPO?.buyCost,
    impactBradfordPO?.mfgCost,
    impactJdPO?.buyCost,
    bradfordJdPO?.buyCost,
    bradfordJdPO?.mfgCost,
  ]);

  useEffect(() => {
    if (!dirtyHeader) {
      setSell(String(sellProp || ''));
      setQty(String(qtyProp || ''));
      setSize(sizeProp || '');
      setPaper((paperProp as PaperSourceKey) || 'BRADFORD');
    }
  }, [sellProp, qtyProp, sizeProp, paperProp, dirtyHeader]);

  const calc = useMemo(
    () =>
      calculateFromSellPrice({
        sellPrice: sellN,
        quantity: qtyN,
        sizeName: size || null,
        paperSource: paper,
      }),
    [sellN, qtyN, size, paper]
  );

  const prodCostN = parseFloat(prodCost) || 0;
  const jdMfgN = parseFloat(jdMfg) || 0;
  const totalCost = jdPaper ? prodCostN : prodCostN || calc.totalCost;
  const spread = round2(sellN - (prodCostN || totalCost));

  const upsertPO = async (existing: PO | undefined, body: Record<string, unknown>) => {
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create PO');
    }
  };

  const saveHeader = async (extra: Record<string, unknown> = {}) => {
    setSavingHeader(true);
    try {
      const payload: Record<string, unknown> = {
        sellPrice: sellN,
        quantity: qtyN,
        sizeName: size || null,
        paperSource: paper,
        allowNegativeMargin: true,
        ...extra,
      };
      const res = await authFetch(`/api/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Save failed');
      }
      setDirtyHeader(false);
      toast.success('Saved');
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSavingHeader(false);
    }
  };

  const saveCosts = async () => {
    if (qtyN <= 0) {
      toast.error('Set quantity first');
      return;
    }
    if (prodCostN <= 0 && jdMfgN <= 0) {
      toast.error('Enter a production cost $');
      return;
    }
    setSavingCost(true);
    try {
      // Keep sell/qty/paper on the job
      const res = await authFetch(`/api/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellPrice: sellN,
          quantity: qtyN,
          sizeName: size || null,
          paperSource: paper,
          allowNegativeMargin: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save job fields');
      }

      if (jdPaper) {
        await upsertPO(impactJdPO, {
          poType: 'impact-jd',
          description: 'Impact → JD Graphic (production)',
          buyCost: prodCostN,
          mfgCost: prodCostN,
          paperCost: null,
          paperMarkup: null,
        });
      } else {
        const mfg = jdMfgN || 0;
        const total =
          prodCostN > 0
            ? prodCostN
            : round2(mfg + (calc.paperBase || 0) + (calc.paperMarkup || 0));
        await upsertPO(bradfordJdPO, {
          poType: 'bradford-jd',
          description: 'JD Graphic Manufacturing',
          buyCost: mfg || null,
          mfgCost: mfg || null,
        });
        await upsertPO(impactBradfordPO, {
          poType: 'impact-bradford',
          description: 'Impact → Bradford (production)',
          buyCost: total,
          mfgCost: mfg || null,
          paperCost: calc.paperBase || null,
          paperMarkup: calc.paperMarkup || null,
        });
      }
      setCostDirty(false);
      setDirtyHeader(false);
      toast.success('Costs saved');
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save costs');
    } finally {
      setSavingCost(false);
    }
  };

  const fillFromTable = () => {
    if (!calc.sizeMatched && calc.totalCost === 0) {
      toast.message('Pick a size first for table rates');
      return;
    }
    if (jdPaper) {
      setProdCost(String(calc.impactToJdBuy || calc.totalCost || ''));
    } else {
      setProdCost(String(calc.impactToBradfordBuy || calc.totalCost || ''));
      setJdMfg(String(calc.bradfordToJdBuy || calc.jdMfg || ''));
    }
    setCostDirty(true);
    toast.success('Filled from size table — hit Save costs');
  };

  const togglePaid = async (who: 'customer' | 'bradford' | 'jd', currently: boolean) => {
    setPayLoading(who);
    try {
      const status = currently ? 'unpaid' : 'paid';
      if (who === 'customer') {
        await jobsApi.markCustomerPaid(jobId, { status });
        toast.success(currently ? 'Customer → unpaid' : 'Customer paid');
      } else if (who === 'bradford') {
        await jobsApi.markBradfordPaid(jobId, {
          status,
          sendInvoice: !jdPaper && !currently,
        });
        toast.success(currently ? 'Bradford → unpaid' : 'Bradford paid');
      } else {
        await jobsApi.markJDPaid(jobId, { status });
        toast.success(currently ? 'JD → unpaid' : 'JD paid');
      }
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || e?.error || 'Payment update failed');
    } finally {
      setPayLoading(null);
    }
  };

  const sizes = getSizeOptions();
  const bgeAmt = jdPaper ? 0 : prodCostN || Number(impactBradfordPO?.buyCost) || 0;
  const jdAmt = jdPaper
    ? prodCostN || Number(impactJdPO?.buyCost) || 0
    : jdMfgN || Number(bradfordJdPO?.buyCost) || 0;

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Money</h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Sell · vendor costs · mark paid / unpaid
          </p>
        </div>
        <a
          href={THIRD_PARTY_CALCULATOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#C0512A] hover:underline"
        >
          <Calculator className="w-3.5 h-3.5" />
          Calc sheet
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* 1. Sell / qty / size */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-zinc-100">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Sell $</span>
          <input
            type="number"
            step="0.01"
            value={sell}
            onChange={(e) => {
              setSell(e.target.value);
              setDirtyHeader(true);
            }}
            onBlur={() => dirtyHeader && saveHeader()}
            className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono font-semibold border border-zinc-200 rounded-lg focus:ring-2 focus:ring-[#C0512A]/20 focus:border-[#C0512A]/40"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Qty</span>
          <input
            type="number"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              setDirtyHeader(true);
            }}
            onBlur={() => dirtyHeader && saveHeader()}
            className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono border border-zinc-200 rounded-lg focus:ring-2 focus:ring-[#C0512A]/20"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Size</span>
          <select
            value={size}
            onChange={async (e) => {
              setSize(e.target.value);
              setDirtyHeader(true);
              setPaper(paper);
              await saveHeader({ sizeName: e.target.value || null });
            }}
            className="mt-1 w-full px-2.5 py-1.5 text-sm border border-zinc-200 rounded-lg bg-white"
          >
            <option value="">Custom / pick size…</option>
            {sizes.map((s: string) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Paper / who Impact pays */}
      <div className="px-4 py-3 border-b border-zinc-100">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Who Impact pays for production
        </span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(
            [
              { value: 'BRADFORD' as const, label: 'Bradford (BGE paper)' },
              { value: 'VENDOR' as const, label: 'JD Graphic (JD paper)' },
              { value: 'CUSTOMER' as const, label: 'Customer paper → JD' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={async () => {
                const nextPaper = opt.value;
                const nextJd = nextPaper === 'VENDOR' || nextPaper === 'CUSTOMER';
                // Recalc for the NEW paper source so Impact→JD / Impact→BGE fills correctly
                const nextCalc = calculateFromSellPrice({
                  sellPrice: sellN,
                  quantity: qtyN,
                  sizeName: size || null,
                  paperSource: nextPaper,
                });

                setPaper(nextPaper);
                setDirtyHeader(true);

                if (nextJd) {
                  // Impact pays JD — fill production $ (mfg+paper+markup stack)
                  const impactPaysJd =
                    nextCalc.impactToJdBuy || nextCalc.totalCost || 0;
                  if (impactPaysJd > 0) {
                    setProdCost(String(impactPaysJd));
                    setCostDirty(true);
                  } else {
                    setProdCost('');
                    setCostDirty(false);
                  }
                  setJdMfg('');
                  toast.message(
                    impactPaysJd > 0
                      ? `Impact → JD filled ${money2(impactPaysJd)} — Save costs to lock in`
                      : 'Set sell + qty + size, then pick JD paper again to auto-fill'
                  );
                } else {
                  // Bradford paper — fill BGE total + JD mfg track
                  const bge =
                    nextCalc.impactToBradfordBuy || nextCalc.totalCost || 0;
                  const mfg = nextCalc.bradfordToJdBuy || nextCalc.jdMfg || 0;
                  if (bge > 0) {
                    setProdCost(String(bge));
                    setJdMfg(mfg > 0 ? String(mfg) : '');
                    setCostDirty(true);
                    toast.message(
                      `Impact → BGE filled ${money2(bge)} — Save costs to lock in`
                    );
                  } else {
                    setCostDirty(false);
                  }
                }

                await saveHeader({ paperSource: nextPaper });
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                paper === opt.value
                  ? 'bg-[#2B3A4A] text-white border-[#2B3A4A]'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Manual vendor costs */}
      <div className="p-4 border-b border-zinc-100 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Vendor costs — type $ and save
          </span>
          <button
            type="button"
            onClick={fillFromTable}
            className="text-[11px] font-medium text-[#C0512A] hover:underline"
          >
            Fill from size table
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-[#2B3A4A]">
              {jdPaper ? 'Impact → JD (production) $' : 'Impact → Bradford (BGE) $'}
            </span>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={prodCost}
              onChange={(e) => {
                setProdCost(e.target.value);
                setCostDirty(true);
              }}
              className="mt-1 w-full px-3 py-2 text-base font-mono font-semibold border border-zinc-200 rounded-lg focus:ring-2 focus:ring-[#C0512A]/25 focus:border-[#C0512A]/50"
            />
            <span className="text-[10px] text-zinc-400 mt-0.5 block">
              {jdPaper ? 'What Impact cuts JD for this job' : 'What Impact pays BGE (full outlay)'}
            </span>
          </label>

          {!jdPaper && (
            <label className="block">
              <span className="text-xs font-semibold text-[#2B3A4A]">Bradford → JD (mfg) $</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={jdMfg}
                onChange={(e) => {
                  setJdMfg(e.target.value);
                  setCostDirty(true);
                }}
                className="mt-1 w-full px-3 py-2 text-base font-mono font-semibold border border-zinc-200 rounded-lg focus:ring-2 focus:ring-[#2B3A4A]/15"
              />
              <span className="text-[10px] text-zinc-400 mt-0.5 block">
                Mfg track only — BGE pays JD downstream
              </span>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveCosts}
            disabled={savingCost || savingHeader}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2B3A4A] text-white text-sm font-semibold hover:bg-[#1f2a36] disabled:opacity-50"
          >
            {savingCost ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save costs
          </button>
          <span className="text-xs text-zinc-500 tabular-nums">
            Cost {money2(prodCostN || totalCost)}
            <span className="mx-1.5 text-zinc-300">·</span>
            Spread{' '}
            <span className={spread >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>
              {money2(spread)}
            </span>
            {sellN > 0 && (
              <span className="text-zinc-400">
                {' '}
                ({((spread / sellN) * 100).toFixed(0)}%)
              </span>
            )}
          </span>
          <span className="text-[10px] text-zinc-400">
            Paper mk {Math.round(PAPER_MARKUP_RATE * 100)}% in table rates
          </span>
        </div>
      </div>

      {/* 3. Paid / unpaid */}
      <div className="p-4">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Payments — click to toggle paid / unpaid
        </span>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <PayToggle
            title="Customer"
            sub="Client → Impact"
            amount={sellN}
            paid={!!customerPaid}
            date={customerPaidDate}
            loading={payLoading === 'customer'}
            onClick={() => togglePaid('customer', !!customerPaid)}
          />
          <PayToggle
            title={jdPaper ? 'Bradford (commission)' : 'Bradford (BGE)'}
            sub={jdPaper ? 'Margin only' : 'Impact → BGE production'}
            amount={jdPaper ? calc.bradfordGets || 0 : bgeAmt}
            paid={!!bradfordPaid}
            date={bradfordPaidDate}
            loading={payLoading === 'bradford'}
            onClick={() => togglePaid('bradford', !!bradfordPaid)}
            accent="rust"
          />
          <PayToggle
            title="JD Graphic"
            sub={jdPaper ? 'Impact → JD production' : 'BGE → JD mfg track'}
            amount={jdAmt}
            paid={!!jdPaid}
            date={jdPaidDate}
            loading={payLoading === 'jd'}
            onClick={() => togglePaid('jd', !!jdPaid)}
            accent="navy"
          />
        </div>
        {customerPaid && !jdPaper && !bradfordPaid && (
          <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Client paid — still need to <strong>pay BGE</strong> ({money(bgeAmt || prodCostN)}).
          </p>
        )}
        {customerPaid && jdPaper && !jdPaid && (
          <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Client paid — still need to <strong>pay JD</strong> ({money(jdAmt || prodCostN)}).
          </p>
        )}
      </div>
    </div>
  );
}

function PayToggle({
  title,
  sub,
  amount,
  paid,
  date,
  loading,
  onClick,
  accent = 'slate',
}: {
  title: string;
  sub: string;
  amount: number;
  paid: boolean;
  date?: string | null;
  loading: boolean;
  onClick: () => void;
  accent?: 'slate' | 'rust' | 'navy';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'text-left rounded-xl border p-3 transition-all disabled:opacity-60',
        paid
          ? 'border-emerald-300 bg-emerald-50/70'
          : accent === 'rust'
            ? 'border-[#C0512A]/35 bg-orange-50/40 hover:border-[#C0512A]'
            : accent === 'navy'
              ? 'border-[#2B3A4A]/25 bg-slate-50 hover:border-[#2B3A4A]'
              : 'border-zinc-200 bg-white hover:border-zinc-400'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#2B3A4A]">{title}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        ) : paid ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
            <Check className="w-3 h-3" /> Paid
          </span>
        ) : (
          <span className="text-[10px] font-bold uppercase text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
            Mark paid
          </span>
        )}
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-[#2B3A4A]">{money(amount)}</p>
      {paid ? (
        <p className="text-[10px] text-emerald-700 mt-1">
          {fmtDate(date) || 'Paid'} · click = unpaid
        </p>
      ) : (
        <p className="text-[10px] text-zinc-400 mt-1">Click to mark paid</p>
      )}
    </button>
  );
}

export default JobMoneyBoard;
