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
import {
  getPaymentDueDate,
  isPaymentOverdue,
  getDaysPaymentOverdue,
  paymentTermsLabel,
  getPaymentTermsDays,
} from '../../lib/jobPipeline';

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
  /** When set, show note that PDF must be re-downloaded after price edits */
  invoiceGeneratedAt?: string | null;
  /** Customer invoice # from old or new system */
  customerInvoiceNumber?: string | null;
  paymentTermsDays?: number | null;
  customer?: { paymentTermsDays?: number | null } | null;
  /** Soft parent refresh; optional patch for instant UI (e.g. paperSource) */
  onSaved?: (patch?: Record<string, unknown>) => void;
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
  invoiceGeneratedAt = null,
  customerInvoiceNumber = null,
  paymentTermsDays = null,
  customer = null,
  onSaved,
}: JobMoneyBoardProps) {
  const arJob = {
    invoiceGeneratedAt,
    customerInvoiceNumber,
    paymentTermsDays,
    customer,
    customerPaymentDate: customerPaidDate,
    status: customerPaid ? 'PAID' : 'ACTIVE',
  };
  const payDue = getPaymentDueDate(arJob);
  const payOverdue = isPaymentOverdue(arJob);
  const daysOver = getDaysPaymentOverdue(arJob);
  const termsLbl = paymentTermsLabel(getPaymentTermsDays(arJob));
  const [invNo, setInvNo] = useState(customerInvoiceNumber || '');
  const [invDate, setInvDate] = useState(() =>
    invoiceGeneratedAt
      ? new Date(invoiceGeneratedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [savingInv, setSavingInv] = useState(false);
  /** JD-paper commission override (Impact → Bradford margin) */
  const [commissionAmt, setCommissionAmt] = useState('');
  const [sell, setSell] = useState(String(sellProp || ''));
  const [qty, setQty] = useState(String(qtyProp || ''));
  const [cpm, setCpm] = useState(() => {
    const s = Number(sellProp) || 0;
    const q = Number(qtyProp) || 0;
    return q > 0 ? String(round2((s / q) * 1000)) : '';
  });
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

  useEffect(() => {
    if (!dirtyHeader) {
      setSell(String(sellProp || ''));
      setQty(String(qtyProp || ''));
      const s = Number(sellProp) || 0;
      const q = Number(qtyProp) || 0;
      setCpm(q > 0 ? String(round2((s / q) * 1000)) : '');
      setSize(sizeProp || '');
      setPaper((paperProp as PaperSourceKey) || 'BRADFORD');
    }
  }, [sellProp, qtyProp, sizeProp, paperProp, dirtyHeader]);

  useEffect(() => {
    setInvNo(customerInvoiceNumber || '');
    if (invoiceGeneratedAt) {
      setInvDate(new Date(invoiceGeneratedAt).toISOString().slice(0, 10));
    }
  }, [customerInvoiceNumber, invoiceGeneratedAt]);

  const saveInvoiced = async () => {
    const no = invNo.trim();
    if (!no) {
      toast.error('Invoice number required');
      return;
    }
    setSavingInv(true);
    try {
      await jobsApi.markInvoiced(jobId, {
        invoiceNumber: no,
        invoicedAt: invDate || undefined,
      });
      toast.success(`Invoiced ${no} — unpaid until client paid`);
      onSaved?.({
        customerInvoiceNumber: no,
        invoiceNumber: no,
        invoiceGeneratedAt: invDate
          ? new Date(invDate).toISOString()
          : new Date().toISOString(),
        workflowStatus: 'INVOICED',
        workflowStatusOverride: 'INVOICED',
      });
    } catch (e: any) {
      toast.error(e?.message || e?.error || 'Failed to mark invoiced');
    } finally {
      setSavingInv(false);
    }
  };

  const clearInvoiced = async () => {
    setSavingInv(true);
    try {
      await jobsApi.markInvoiced(jobId, { status: 'clear' });
      setInvNo('');
      toast.success('Invoice cleared');
      onSaved?.({
        customerInvoiceNumber: null,
        invoiceGeneratedAt: null,
        workflowStatus: 'COMPLETED',
        workflowStatusOverride: 'COMPLETED',
      });
    } catch (e: any) {
      toast.error(e?.message || e?.error || 'Failed to clear invoice');
    } finally {
      setSavingInv(false);
    }
  };

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

  // Seed cost fields: PO wins; else table calc (esp. JD paper → Impact pays JD)
  useEffect(() => {
    if (costDirty) return;
    if (jdPaper) {
      const fromPo =
        impactJdPO?.buyCost != null && Number(impactJdPO.buyCost) > 0
          ? Number(impactJdPO.buyCost)
          : 0;
      // Same stack as Bradford route — Impact pays JD full production outlay
      const suggested = calc.impactToJdBuy || calc.totalCost || 0;
      setProdCost(fromPo > 0 ? String(fromPo) : suggested > 0 ? String(suggested) : '');
      setJdMfg('');
    } else {
      const fromPo =
        impactBradfordPO?.buyCost != null && Number(impactBradfordPO.buyCost) > 0
          ? Number(impactBradfordPO.buyCost)
          : 0;
      const suggested = calc.impactToBradfordBuy || calc.totalCost || 0;
      setProdCost(fromPo > 0 ? String(fromPo) : suggested > 0 ? String(suggested) : '');
      const mfg =
        Number(bradfordJdPO?.buyCost) ||
        Number(bradfordJdPO?.mfgCost) ||
        Number(impactBradfordPO?.mfgCost) ||
        calc.bradfordToJdBuy ||
        calc.jdMfg ||
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
    calc.impactToJdBuy,
    calc.impactToBradfordBuy,
    calc.totalCost,
    calc.bradfordToJdBuy,
    calc.jdMfg,
  ]);

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
      // Instant UI + keep popup open (parent soft-refresh only)
      onSaved?.({
        sellPrice: sellN,
        quantity: qtyN,
        sizeName: size || null,
        paperSource: (extra.paperSource as string) || paper,
      });
      toast.success('Saved');
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

  const sizes = getSizeOptions();
  const bgeAmt = jdPaper ? 0 : prodCostN || Number(impactBradfordPO?.buyCost) || 0;
  const jdAmt = jdPaper
    ? prodCostN || Number(impactJdPO?.buyCost) || 0
    : jdMfgN || Number(bradfordJdPO?.buyCost) || 0;
  // JD paper commission default = table Bradford share; user can override
  const commissionDefault = Number(calc.bradfordGets) || Number(calc.bradfordMarginShare) || 0;
  const commissionN =
    parseFloat(commissionAmt) ||
    (bradfordPaidDate ? 0 : 0) ||
    commissionDefault;

  // Seed commission override from table (user can type e.g. 35)
  useEffect(() => {
    if (commissionAmt !== '') return;
    if (commissionDefault > 0) setCommissionAmt(String(round2(commissionDefault)));
  }, [commissionDefault]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePaid = async (who: 'customer' | 'bradford' | 'jd', currently: boolean) => {
    setPayLoading(who);
    try {
      const status = currently ? 'unpaid' : 'paid';
      if (who === 'customer') {
        await jobsApi.markCustomerPaid(jobId, { status });
        toast.success(currently ? 'Customer → unpaid' : 'Customer paid');
        onSaved?.(
          currently
            ? { customerPaymentDate: null, status: 'ACTIVE' }
            : { customerPaymentDate: new Date().toISOString() }
        );
      } else if (who === 'bradford') {
        const amt = jdPaper
          ? parseFloat(commissionAmt) || commissionDefault
          : bgeAmt;
        await jobsApi.markBradfordPaid(jobId, {
          status,
          sendInvoice: !jdPaper && !currently,
          amount: currently ? undefined : amt > 0 ? amt : undefined,
        });
        toast.success(
          currently
            ? 'Bradford → unpaid'
            : jdPaper
              ? `Bradford commission $${amt.toFixed(0)} recorded`
              : 'BGE production paid'
        );
        onSaved?.(
          currently
            ? { bradfordPaymentDate: null, bradfordPaymentPaid: false, bradfordPaymentAmount: null }
            : {
                bradfordPaymentDate: new Date().toISOString(),
                bradfordPaymentPaid: true,
                bradfordPaymentAmount: amt,
              }
        );
      } else {
        await jobsApi.markJDPaid(jobId, { status });
        toast.success(currently ? 'JD → unpaid' : 'JD production paid');
        onSaved?.(
          currently
            ? { jdPaymentDate: null, jdPaymentPaid: false }
            : { jdPaymentDate: new Date().toISOString(), jdPaymentPaid: true }
        );
      }
    } catch (e: any) {
      toast.error(e?.message || e?.error || 'Payment update failed');
    } finally {
      setPayLoading(null);
    }
  };

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

      {/* 1. Sell / CPM / qty / size — editable even after invoice (re-download PDF) */}
      {invoiceGeneratedAt && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-800">
          Invoice already generated — edit sell / CPM / qty below, then re-download Invoice PDF.
        </div>
      )}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-zinc-100">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Sell $</span>
          <input
            type="number"
            step="0.01"
            value={sell}
            onChange={(e) => {
              const next = e.target.value;
              setSell(next);
              const sn = parseFloat(next) || 0;
              if (qtyN > 0) setCpm(String(round2((sn / qtyN) * 1000)));
              setDirtyHeader(true);
            }}
            onBlur={() => dirtyHeader && saveHeader()}
            className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono font-semibold border border-zinc-200 rounded-lg focus:ring-2 focus:ring-[#C0512A]/20 focus:border-[#C0512A]/40"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Sell CPM ($/M)
          </span>
          <input
            type="number"
            step="0.01"
            value={cpm}
            onChange={(e) => {
              const next = e.target.value;
              setCpm(next);
              const cpmN = parseFloat(next) || 0;
              if (qtyN > 0) {
                setSell(String(round2((cpmN * qtyN) / 1000)));
              }
              setDirtyHeader(true);
            }}
            onBlur={() => dirtyHeader && saveHeader()}
            className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono font-semibold border border-zinc-200 rounded-lg focus:ring-2 focus:ring-[#C0512A]/20 focus:border-[#C0512A]/40"
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Qty</span>
          <input
            type="number"
            value={qty}
            onChange={(e) => {
              const next = e.target.value;
              setQty(next);
              const qn = parseInt(next, 10) || 0;
              const cpmN = parseFloat(cpm) || 0;
              // Keep CPM fixed when qty changes → recompute sell total
              if (qn > 0 && cpmN > 0) {
                setSell(String(round2((cpmN * qn) / 1000)));
              } else if (qn > 0 && sellN > 0) {
                setCpm(String(round2((sellN / qn) * 1000)));
              }
              setDirtyHeader(true);
            }}
            onBlur={() => dirtyHeader && saveHeader()}
            className="mt-1 w-full px-2.5 py-1.5 text-sm font-mono border border-zinc-200 rounded-lg focus:ring-2 focus:ring-[#C0512A]/20"
          />
        </label>
        <label className="block">
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
                // Allow seed effect to re-run for new paper after save (don't leave costDirty stuck)
                setCostDirty(false);

                let filled = 0;
                if (nextJd) {
                  // Impact pays JD — always fill production $ (mfg+paper+markup)
                  filled = nextCalc.impactToJdBuy || nextCalc.totalCost || 0;
                  setProdCost(filled > 0 ? String(filled) : '');
                  setJdMfg('');
                } else {
                  filled = nextCalc.impactToBradfordBuy || nextCalc.totalCost || 0;
                  const mfg = nextCalc.bradfordToJdBuy || nextCalc.jdMfg || 0;
                  setProdCost(filled > 0 ? String(filled) : '');
                  setJdMfg(mfg > 0 ? String(mfg) : '');
                }

                await saveHeader({ paperSource: nextPaper });

                // After save/refresh, re-apply fill (seed can race with empty PO)
                if (filled > 0) {
                  setProdCost(String(filled));
                  if (!nextJd) {
                    const mfg = nextCalc.bradfordToJdBuy || nextCalc.jdMfg || 0;
                    if (mfg > 0) setJdMfg(String(mfg));
                  }
                  toast.message(
                    nextJd
                      ? `Impact → JD = ${money2(filled)} — click Save costs`
                      : `Impact → BGE = ${money2(filled)} — click Save costs`
                  );
                } else {
                  toast.message('Set sell, qty, and size so costs can calculate');
                }
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

      {/* 2.5 Customer invoice (legacy # + date → INVOICED, still unpaid) */}
      <div className="p-4 border-b border-zinc-100 bg-zinc-50/60">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Customer invoice
          </span>
          {(customerInvoiceNumber || invoiceGeneratedAt) && (
            <span className="text-[10px] font-bold uppercase text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
              Invoiced · unpaid until client paid
            </span>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 mb-2">
          Invoice date + customer terms ({termsLbl}) = payment due. Not delivery date.
          {payDue && (
            <span className={payOverdue ? ' text-red-600 font-semibold' : ' text-zinc-700'}>
              {' '}Pay due {fmtDate(payDue.toISOString())}
              {payOverdue && daysOver != null ? ` · ${daysOver}d overdue` : ''}
            </span>
          )}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <label className="block sm:col-span-1">
            <span className="text-[10px] font-semibold uppercase text-zinc-500">Invoice #</span>
            <input
              value={invNo}
              onChange={(e) => setInvNo(e.target.value)}
              placeholder="Old system #"
              className="mt-0.5 w-full px-2 py-1.5 text-sm border border-zinc-200 rounded-lg bg-white"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase text-zinc-500">Invoiced date</span>
            <input
              type="date"
              value={invDate}
              onChange={(e) => setInvDate(e.target.value)}
              className="mt-0.5 w-full px-2 py-1.5 text-sm border border-zinc-200 rounded-lg bg-white"
            />
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={savingInv}
              onClick={saveInvoiced}
              className="flex-1 px-2 py-1.5 text-xs font-semibold text-white bg-[#2B3A4A] rounded-lg hover:bg-[#1f2a36] disabled:opacity-50"
            >
              {savingInv ? '…' : customerInvoiceNumber || invoiceGeneratedAt ? 'Update' : 'Mark invoiced'}
            </button>
            {(customerInvoiceNumber || invoiceGeneratedAt) && (
              <button
                type="button"
                disabled={savingInv}
                onClick={clearInvoiced}
                className="px-2 py-1.5 text-xs font-semibold text-zinc-600 border border-zinc-200 rounded-lg hover:bg-white disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Payments
          Bradford paper: Client + Impact→BGE
          JD paper: Client + Impact→JD + Impact→Bradford commission (overridable $)
      */}
      <div className="p-4">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Payments — click to mark paid / unpaid
        </span>
        <div
          className={cn(
            'mt-2 grid grid-cols-1 gap-2',
            jdPaper ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          )}
        >
          <PayToggle
            title="Customer"
            sub="Client → Impact"
            amount={sellN}
            paid={!!customerPaid}
            date={customerPaidDate}
            loading={payLoading === 'customer'}
            onClick={() => togglePaid('customer', !!customerPaid)}
          />
          {jdPaper ? (
            <>
              <PayToggle
                title="JD Graphic"
                sub="Impact → JD production"
                amount={jdAmt}
                paid={!!jdPaid}
                date={jdPaidDate}
                loading={payLoading === 'jd'}
                onClick={() => togglePaid('jd', !!jdPaid)}
                accent="navy"
              />
              <div className="rounded-xl border border-[#C0512A]/35 bg-orange-50/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#2B3A4A]">Bradford commission</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Impact → Bradford margin</p>
                  </div>
                  {bradfordPaid ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      Paid
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                      Open
                    </span>
                  )}
                </div>
                <label className="block mt-2">
                  <span className="text-[10px] font-semibold uppercase text-zinc-500">
                    Commission $ (override)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={commissionAmt}
                    onChange={(e) => setCommissionAmt(e.target.value)}
                    disabled={!!bradfordPaid || payLoading === 'bradford'}
                    placeholder={commissionDefault > 0 ? String(commissionDefault) : '35'}
                    className="mt-0.5 w-full px-2 py-1.5 text-lg font-mono font-semibold border border-zinc-200 rounded-lg bg-white disabled:bg-zinc-50"
                  />
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">
                    Table suggests {money2(commissionDefault)} — type actual (e.g. 35)
                  </span>
                </label>
                <button
                  type="button"
                  disabled={payLoading === 'bradford'}
                  onClick={() => togglePaid('bradford', !!bradfordPaid)}
                  className={cn(
                    'mt-2 w-full px-2 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50',
                    bradfordPaid
                      ? 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                      : 'bg-[#C0512A] text-white hover:bg-[#a84422]'
                  )}
                >
                  {payLoading === 'bradford'
                    ? '…'
                    : bradfordPaid
                      ? 'Clear commission paid'
                      : `Mark commission paid $${(parseFloat(commissionAmt) || commissionDefault || 0).toFixed(0)}`}
                </button>
                {bradfordPaid && bradfordPaidDate && (
                  <p className="text-[10px] text-emerald-700 mt-1">
                    Paid {fmtDate(bradfordPaidDate)}
                  </p>
                )}
              </div>
            </>
          ) : (
            <PayToggle
              title="Bradford (BGE)"
              sub="Impact → BGE production"
              amount={bgeAmt}
              paid={!!bradfordPaid}
              date={bradfordPaidDate}
              loading={payLoading === 'bradford'}
              onClick={() => togglePaid('bradford', !!bradfordPaid)}
              accent="rust"
            />
          )}
        </div>
        {customerPaid && !jdPaper && !bradfordPaid && (
          <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Client paid — still need to <strong>pay BGE</strong> ({money(bgeAmt || prodCostN)}). Then Complete.
          </p>
        )}
        {customerPaid && jdPaper && !jdPaid && (
          <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Client paid — still need to <strong>pay JD</strong> ({money(jdAmt || prodCostN)}).
          </p>
        )}
        {customerPaid && jdPaper && jdPaid && !bradfordPaid && (
          <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            JD paid — still need <strong>Bradford commission</strong> (enter $ and mark paid). Then Complete.
          </p>
        )}
        {customerPaid &&
          ((jdPaper && jdPaid && bradfordPaid) || (!jdPaper && bradfordPaid)) && (
            <p className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              All payments recorded — job <strong>Complete</strong>.
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
