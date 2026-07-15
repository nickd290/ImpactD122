import React, { useMemo, useState } from 'react';
import { Check, Loader2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { jobsApi } from '../../lib/api';
import { cn } from '../../lib/utils';
import { isJdPaperSource, calculateFromSellPrice } from '../../utils/thirdPartyCalc';

interface PurchaseOrder {
  originCompanyId?: string;
  targetCompanyId?: string;
  buyCost?: number;
  mfgCost?: number;
  paperCost?: number;
  paperMarkup?: number;
}

interface PayeesPaymentPanelProps {
  jobId: string;
  paperSource?: string | null;
  sellPrice?: number | null;
  quantity?: number | null;
  sizeName?: string | null;
  customerPaid?: boolean;
  customerPaidDate?: string | null;
  bradfordPaid?: boolean;
  bradfordPaidDate?: string | null;
  bradfordPaidAmount?: number | null;
  jdPaid?: boolean;
  jdPaidDate?: string | null;
  jdPaidAmount?: number | null;
  /** From profit split when available */
  bradfordShare?: number | null;
  purchaseOrders?: PurchaseOrder[];
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

function formatDate(d?: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Always-visible Paid Bradford / Paid JD toggles.
 * JD paper: pay JD production AND still pay Bradford margin commission.
 * Bradford paper: pay Bradford full outlay; JD = BGE→JD mfg tracking.
 */
export function PayeesPaymentPanel({
  jobId,
  paperSource = 'BRADFORD',
  sellPrice = 0,
  quantity = 0,
  sizeName,
  customerPaid = false,
  customerPaidDate,
  bradfordPaid = false,
  bradfordPaidDate,
  bradfordPaidAmount,
  jdPaid = false,
  jdPaidDate,
  jdPaidAmount,
  bradfordShare,
  purchaseOrders = [],
  onSaved,
}: PayeesPaymentPanelProps) {
  const [loading, setLoading] = useState<'customer' | 'bradford' | 'jd' | null>(null);
  const jdPaper = isJdPaperSource(paperSource);

  const amounts = useMemo(() => {
    const calc = calculateFromSellPrice({
      sellPrice: Number(sellPrice) || 0,
      quantity: Number(quantity) || 0,
      sizeName,
      paperSource,
    });

    const impactBradfordPO = purchaseOrders.find(
      (p) => p.originCompanyId === 'impact-direct' && p.targetCompanyId === 'bradford'
    );
    const impactJdPO = purchaseOrders.find(
      (p) => p.originCompanyId === 'impact-direct' && p.targetCompanyId === 'jd-graphic'
    );
    const bradfordJdPO = purchaseOrders.find(
      (p) => p.originCompanyId === 'bradford' && p.targetCompanyId === 'jd-graphic'
    );

    if (jdPaper) {
      const jdAmt =
        Number(impactJdPO?.buyCost) ||
        calc.impactToJdBuy ||
        0;
      // Bradford commission = margin share only (not paper markup — JD kept that)
      const bgeAmt =
        Number(bradfordPaidAmount) ||
        Number(bradfordShare) ||
        calc.bradfordGets ||
        0;
      return { jdAmt, bgeAmt, jdLabel: 'Impact → JD (production)', bgeLabel: 'Impact → Bradford (commission)' };
    }

    const bgeAmt =
      Number(impactBradfordPO?.buyCost) ||
      Number(bradfordPaidAmount) ||
      calc.impactToBradfordBuy ||
      0;
    const jdAmt =
      Number(bradfordJdPO?.buyCost) ||
      Number(bradfordJdPO?.mfgCost) ||
      Number(jdPaidAmount) ||
      calc.bradfordToJdBuy ||
      0;
    return {
      jdAmt,
      bgeAmt,
      jdLabel: 'Bradford → JD (mfg)',
      bgeLabel: 'Impact → Bradford (production)',
    };
  }, [
    sellPrice,
    quantity,
    sizeName,
    paperSource,
    jdPaper,
    purchaseOrders,
    bradfordPaidAmount,
    jdPaidAmount,
    bradfordShare,
  ]);

  const toggle = async (who: 'customer' | 'bradford' | 'jd', currentlyPaid: boolean) => {
    setLoading(who);
    try {
      const status = currentlyPaid ? 'unpaid' : 'paid';
      if (who === 'customer') {
        await jobsApi.markCustomerPaid(jobId, { status });
        toast.success(currentlyPaid ? 'Customer payment cleared' : 'Customer paid');
      } else if (who === 'bradford') {
        await jobsApi.markBradfordPaid(jobId, {
          status,
          // Don't auto-email JD invoice on JD-paper margin payment
          sendInvoice: !jdPaper && !currentlyPaid,
        });
        toast.success(
          currentlyPaid
            ? 'Bradford payment cleared'
            : jdPaper
              ? 'Bradford commission marked paid'
              : 'Bradford paid'
        );
      } else {
        await jobsApi.markJDPaid(jobId, { status });
        toast.success(
          currentlyPaid
            ? 'JD payment cleared'
            : jdPaper
              ? 'JD production marked paid'
              : 'JD mfg marked paid'
        );
      }
      onSaved?.();
    } catch (e: any) {
      const msg = e?.message || e?.error || 'Payment update failed';
      toast.error(typeof msg === 'string' ? msg : 'Payment update failed');
    } finally {
      setLoading(null);
    }
  };

  const bothDone = customerPaid && bradfordPaid && jdPaid;

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            Payees
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {jdPaper
              ? 'JD paper: pay JD production + still pay Bradford commission'
              : 'Bradford paper: pay BGE production · track JD mfg'}
          </p>
        </div>
        {bothDone && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
            <Check className="w-3 h-3" /> All paid
          </span>
        )}
      </div>

      <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <PayButton
          title="Customer"
          sub="Client → Impact"
          amount={Number(sellPrice) || 0}
          paid={!!customerPaid}
          date={customerPaidDate}
          loading={loading === 'customer'}
          onClick={() => toggle('customer', !!customerPaid)}
          accent="slate"
        />
        <PayButton
          title="Bradford"
          sub={amounts.bgeLabel}
          amount={amounts.bgeAmt}
          paid={!!bradfordPaid}
          date={bradfordPaidDate}
          loading={loading === 'bradford'}
          onClick={() => toggle('bradford', !!bradfordPaid)}
          accent="rust"
          hint={jdPaper ? 'Commission / margin only' : undefined}
        />
        <PayButton
          title="JD Graphic"
          sub={amounts.jdLabel}
          amount={amounts.jdAmt}
          paid={!!jdPaid}
          date={jdPaidDate}
          loading={loading === 'jd'}
          onClick={() => toggle('jd', !!jdPaid)}
          accent="navy"
          hint={jdPaper ? 'Production (mfg+paper+mk)' : 'Mfg tracking'}
        />
      </div>

      {jdPaper && customerPaid && jdPaid && !bradfordPaid && (
        <div className="mx-3 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <span className="font-semibold">Still owe Bradford commission</span>
          {' — '}
          mark <span className="font-semibold">Paid Bradford</span> when their margin share is sent
          ({money(amounts.bgeAmt)}).
        </div>
      )}
    </div>
  );
}

function PayButton({
  title,
  sub,
  amount,
  paid,
  date,
  loading,
  onClick,
  accent,
  hint,
}: {
  title: string;
  sub: string;
  amount: number;
  paid: boolean;
  date?: string | null;
  loading: boolean;
  onClick: () => void;
  accent: 'slate' | 'rust' | 'navy';
  hint?: string;
}) {
  const ring =
    accent === 'rust'
      ? paid
        ? 'border-emerald-300 bg-emerald-50/60'
        : 'border-[#C0512A]/40 hover:border-[#C0512A] bg-orange-50/30'
      : accent === 'navy'
        ? paid
          ? 'border-emerald-300 bg-emerald-50/60'
          : 'border-[#2B3A4A]/30 hover:border-[#2B3A4A] bg-slate-50'
        : paid
          ? 'border-emerald-300 bg-emerald-50/60'
          : 'border-zinc-200 hover:border-zinc-400 bg-white';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'text-left rounded-xl border p-3 transition-all disabled:opacity-60',
        ring
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
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
            <Check className="w-3 h-3" /> Paid
          </span>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
            Mark paid
          </span>
        )}
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-[#2B3A4A]">{money(amount)}</p>
      {paid && date ? (
        <p className="text-[10px] text-emerald-700 mt-1">{formatDate(date)}</p>
      ) : hint ? (
        <p className="text-[10px] text-zinc-400 mt-1">{hint}</p>
      ) : null}
    </button>
  );
}

export default PayeesPaymentPanel;
