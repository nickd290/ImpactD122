import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react';

interface LedgerJob {
  id: string;
  jobNo?: string;
  number?: string;
  title?: string;
  status?: string;
  customerName?: string;
  vendorName?: string;
  sellPrice?: number;
  customerPaymentAmount?: number | null;
  customerPaymentDate?: string | null;
  bradfordPaymentAmount?: number | null;
  bradfordPaymentDate?: string | null;
  bradfordPaymentPaid?: boolean;
  jdPaymentAmount?: number | null;
  jdPaymentDate?: string | null;
  jdPaymentPaid?: boolean;
  vendorPaymentAmount?: number | null;
  vendorPaymentDate?: string | null;
}

interface PaymentRow {
  key: string;
  date: string | null;
  jobId: string;
  jobNo: string;
  jobTitle: string;
  from: string;
  to: string;
  amount: number | null;
  direction: 'in' | 'out';
}

interface PaymentsLedgerViewProps {
  jobs: LedgerJob[];
  onJobClick?: (jobId: string) => void;
}

const fmtMoney = (n: number | null) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const fmtDate = (d: string | null) => {
  if (!d) return 'Not recorded';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? 'Not recorded' : dt.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

function buildLedger(jobs: LedgerJob[]): PaymentRow[] {
  const rows: PaymentRow[] = [];
  for (const job of jobs) {
    const jobNo = job.jobNo || job.number || '';
    const base = { jobId: job.id, jobNo, jobTitle: job.title || '' };

    // Money in: client -> Impact
    if (job.customerPaymentDate || job.status === 'PAID') {
      rows.push({
        ...base,
        key: `${job.id}-customer`,
        date: job.customerPaymentDate || null,
        from: job.customerName || 'Client',
        to: 'Impact Direct',
        amount: job.customerPaymentAmount ?? job.sellPrice ?? null,
        direction: 'in',
      });
    }

    // Money out: Impact -> BGE (Bradford)
    if (job.bradfordPaymentDate || job.bradfordPaymentPaid) {
      rows.push({
        ...base,
        key: `${job.id}-bge`,
        date: job.bradfordPaymentDate || null,
        from: 'Impact Direct',
        to: 'BGE (Bradford)',
        amount: job.bradfordPaymentAmount ?? null,
        direction: 'out',
      });
    }

    // Money out: Impact -> JD Graphic
    if (job.jdPaymentDate || job.jdPaymentPaid) {
      rows.push({
        ...base,
        key: `${job.id}-jd`,
        date: job.jdPaymentDate || null,
        from: 'Impact Direct',
        to: 'JD Graphic',
        amount: job.jdPaymentAmount ?? null,
        direction: 'out',
      });
    }

    // Money out: Impact -> outside vendor
    if (job.vendorPaymentDate) {
      rows.push({
        ...base,
        key: `${job.id}-vendor`,
        date: job.vendorPaymentDate,
        from: 'Impact Direct',
        to: job.vendorName || 'Vendor',
        amount: job.vendorPaymentAmount ?? null,
        direction: 'out',
      });
    }
  }

  // Newest first; undated rows sink to the bottom
  return rows.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

export function PaymentsLedgerView({ jobs, onJobClick }: PaymentsLedgerViewProps) {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');

  const allRows = useMemo(() => buildLedger(jobs), [jobs]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (direction !== 'all' && r.direction !== direction) return false;
      if (!q) return true;
      return (
        r.jobNo.toLowerCase().includes(q) ||
        r.jobTitle.toLowerCase().includes(q) ||
        r.from.toLowerCase().includes(q) ||
        r.to.toLowerCase().includes(q)
      );
    });
  }, [allRows, search, direction]);

  const totals = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    for (const r of rows) {
      if (r.amount === null) continue;
      if (r.direction === 'in') moneyIn += r.amount;
      else moneyOut += r.amount;
    }
    return { moneyIn, moneyOut, net: moneyIn - moneyOut };
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <div className="text-xs font-medium text-zinc-500 uppercase">Money In</div>
          <div className="text-xl font-semibold text-emerald-700 mt-1">{fmtMoney(totals.moneyIn)}</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <div className="text-xs font-medium text-zinc-500 uppercase">Money Out</div>
          <div className="text-xl font-semibold text-rose-700 mt-1">{fmtMoney(totals.moneyOut)}</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <div className="text-xs font-medium text-zinc-500 uppercase">Net</div>
          <div className={`text-xl font-semibold mt-1 ${totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {fmtMoney(totals.net)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job #, customer, payee…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex rounded-lg border border-zinc-300 overflow-hidden text-sm">
          {(['all', 'in', 'out'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`px-3 py-2 font-medium capitalize ${
                direction === d ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {d === 'all' ? 'All' : d === 'in' ? 'Money In' : 'Money Out'}
            </button>
          ))}
        </div>
        <div className="text-sm text-zinc-500 ml-auto">{rows.length} payments</div>
      </div>

      {/* Ledger table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 uppercase">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                  No payments recorded yet
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-zinc-100 hover:bg-zinc-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={r.date ? 'text-zinc-700' : 'text-zinc-400 italic'}>{fmtDate(r.date)}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onJobClick?.(r.jobId)}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {r.jobNo || '—'}
                  </button>
                  {r.jobTitle && <span className="text-zinc-500 ml-2">{r.jobTitle}</span>}
                </td>
                <td className="px-4 py-3 text-zinc-700">{r.from}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-zinc-700">
                    {r.direction === 'in' ? (
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                    )}
                    {r.to}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                  r.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {r.amount === null ? (
                    <span className="text-zinc-400 italic font-normal">amount not recorded</span>
                  ) : (
                    `${r.direction === 'in' ? '+' : '−'}${fmtMoney(r.amount)}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
