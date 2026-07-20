/**
 * Customer invoices board — every generated invoice in one place.
 * Edit sell/CPM/qty via job modal; re-download PDF; mark paid.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Receipt,
  Download,
  DollarSign,
  RefreshCw,
  Filter,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { jobsApi, pdfApi } from '../lib/api';
import { cn } from '../lib/utils';
import { isClientPaid, getOpsStage } from '../lib/jobPipeline';
import { JobDetailModal } from './JobDetailModal';

type InvoiceTab = 'all' | 'unpaid' | 'paid' | 'ready';

interface InvoiceJob {
  id: string;
  jobNo?: string;
  number?: string;
  title?: string;
  status?: string;
  workflowStatus?: string;
  customer?: { id: string; name: string };
  customerPONumber?: string;
  quantity?: number;
  sellPrice?: number | string;
  invoiceGeneratedAt?: string | null;
  invoiceGeneratedCount?: number;
  invoiceEmailedAt?: string | null;
  invoiceEmailedTo?: string | null;
  invoiceNumber?: string | null;
  customerPaymentDate?: string | null;
  customerPaymentPaid?: boolean;
  customerPaymentAmount?: number | null;
  specs?: { quantity?: number };
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

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

function sellOf(j: InvoiceJob): number {
  return Number(j.sellPrice) || 0;
}

function qtyOf(j: InvoiceJob): number {
  return Number(j.quantity) || Number(j.specs?.quantity) || 0;
}

function cpmOf(j: InvoiceJob): number {
  const qty = qtyOf(j);
  const sell = sellOf(j);
  if (qty <= 0 || sell <= 0) return 0;
  return Math.round((sell / qty) * 1000 * 100) / 100;
}

function isInvoiced(j: InvoiceJob): boolean {
  return !!j.invoiceGeneratedAt;
}

function isReadyToBill(j: InvoiceJob): boolean {
  if (isInvoiced(j)) return false;
  if (j.status === 'CANCELLED') return false;
  if (sellOf(j) <= 0) return false;
  // Floor done (or marked shipped/invoiced) but no customer invoice PDF yet
  if (getOpsStage(j) === 'complete') return true;
  const wf = j.workflowStatus || '';
  return wf === 'SHIPPED' || wf === 'INVOICED';
}

function isPaid(j: InvoiceJob): boolean {
  return isClientPaid(j) || j.status === 'PAID';
}

interface InvoicesViewProps {
  onRefresh?: () => void;
}

export function InvoicesView({ onRefresh }: InvoicesViewProps) {
  const [jobs, setJobs] = useState<InvoiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<InvoiceTab>('all');
  const [customerFilter, setCustomerFilter] = useState('');
  const [selectedJob, setSelectedJob] = useState<InvoiceJob | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jobsApi.getAll();
      setJobs(res.jobs || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const invoicedJobs = useMemo(() => jobs.filter(isInvoiced), [jobs]);
  const readyJobs = useMemo(() => jobs.filter(isReadyToBill), [jobs]);

  const counts = useMemo(() => {
    const unpaid = invoicedJobs.filter((j) => !isPaid(j));
    const paid = invoicedJobs.filter(isPaid);
    return {
      all: invoicedJobs.length,
      unpaid: unpaid.length,
      paid: paid.length,
      ready: readyJobs.length,
    };
  }, [invoicedJobs, readyJobs]);

  const totals = useMemo(() => {
    const pool =
      tab === 'ready'
        ? readyJobs
        : invoicedJobs.filter((j) => {
            if (tab === 'unpaid') return !isPaid(j);
            if (tab === 'paid') return isPaid(j);
            return true;
          });
    const amount = pool.reduce((s, j) => s + sellOf(j), 0);
    const unpaidAmt = invoicedJobs.filter((j) => !isPaid(j)).reduce((s, j) => s + sellOf(j), 0);
    const paidAmt = invoicedJobs.filter(isPaid).reduce((s, j) => s + sellOf(j), 0);
    return { amount, unpaidAmt, paidAmt, count: pool.length };
  }, [tab, invoicedJobs, readyJobs]);

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const j of [...invoicedJobs, ...readyJobs]) {
      if (j.customer?.id) map.set(j.customer.id, j.customer.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [invoicedJobs, readyJobs]);

  const rows = useMemo(() => {
    let list: InvoiceJob[] =
      tab === 'ready'
        ? readyJobs
        : invoicedJobs.filter((j) => {
            if (tab === 'unpaid') return !isPaid(j);
            if (tab === 'paid') return isPaid(j);
            return true;
          });

    if (customerFilter) {
      list = list.filter((j) => j.customer?.id === customerFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((j) => {
        const hay = [
          j.jobNo,
          j.number,
          j.invoiceNumber,
          j.title,
          j.customer?.name,
          j.customerPONumber,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return list.sort((a, b) => {
      const da = a.invoiceGeneratedAt || '';
      const db = b.invoiceGeneratedAt || '';
      return db.localeCompare(da);
    });
  }, [tab, invoicedJobs, readyJobs, customerFilter, search]);

  const handleMarkPaid = async (job: InvoiceJob, e: React.MouseEvent) => {
    e.stopPropagation();
    setPayingId(job.id);
    try {
      await jobsApi.markCustomerPaid(job.id);
      await jobsApi.updateStatus(job.id, 'PAID').catch(() => null);
      toast.success(`${job.jobNo || job.number} marked paid`);
      await load();
      onRefresh?.();
    } catch {
      toast.error('Failed to mark paid');
    } finally {
      setPayingId(null);
    }
  };

  const handleOpenPdf = (job: InvoiceJob, e: React.MouseEvent) => {
    e.stopPropagation();
    pdfApi.generateInvoice(job.id);
  };

  const tabs: { id: InvoiceTab; label: string; count: number }[] = [
    { id: 'all', label: 'All invoices', count: counts.all },
    { id: 'unpaid', label: 'Unpaid', count: counts.unpaid },
    { id: 'paid', label: 'Paid', count: counts.paid },
    { id: 'ready', label: 'Ready to bill', count: counts.ready },
  ];

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#C0512A]" />
            <h1 className="text-xl font-semibold text-[#2B3A4A] tracking-tight">Invoices</h1>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Customer invoices — edit price/CPM/qty on a job, then re-download PDF
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Invoices" value={String(counts.all)} sub={money(totals.unpaidAmt + totals.paidAmt)} />
        <Kpi label="Unpaid" value={money(totals.unpaidAmt)} sub={`${counts.unpaid} open`} tone="warn" />
        <Kpi label="Collected" value={money(totals.paidAmt)} sub={`${counts.paid} paid`} tone="good" />
        <Kpi label="Ready to bill" value={String(counts.ready)} sub="not generated yet" tone="muted" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
                tab === t.id
                  ? 'bg-[#2B3A4A] text-white'
                  : 'text-zinc-600 hover:bg-zinc-50'
              )}
            >
              {t.label}
              <span
                className={cn(
                  'ml-1.5 tabular-nums',
                  tab === t.id ? 'text-white/70' : 'text-zinc-400'
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job, customer, PO…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#C0512A]/20"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="pl-8 pr-8 py-1.5 text-sm border border-zinc-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#2B3A4A]/15"
          >
            <option value="">All customers</option>
            {customerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200 sticky top-0 z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                <th className="px-4 py-3">Invoice / Job</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Cust PO</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">CPM</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Loading invoices…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-zinc-400">
                    {tab === 'ready'
                      ? 'No jobs ready to bill right now.'
                      : 'No invoices in this filter.'}
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((job) => {
                  const paid = isPaid(job);
                  const invoiced = isInvoiced(job);
                  const sell = sellOf(job);
                  const qty = qtyOf(job);
                  const cpm = cpmOf(job);
                  const invNo = job.invoiceNumber || job.jobNo || job.number || '—';

                  return (
                    <tr
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className="hover:bg-zinc-50/80 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono font-semibold text-[#2B3A4A]">{invNo}</div>
                        {job.title && (
                          <div className="text-xs text-zinc-500 truncate max-w-[200px]">
                            {job.title}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 tabular-nums">
                        {fmtDate(job.invoiceGeneratedAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-800">
                        {job.customer?.name || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                        {job.customerPONumber || '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                        {qty > 0 ? qty.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                        {cpm > 0 ? money2(cpm) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#2B3A4A]">
                        {sell > 0 ? money(sell) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {!invoiced ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-100">
                            Ready
                          </span>
                        ) : paid ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-100">
                            Paid
                            {job.customerPaymentDate && (
                              <span className="ml-1 font-normal opacity-80">
                                {fmtDate(job.customerPaymentDate)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-100">
                            Unpaid
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {invoiced && (
                            <button
                              type="button"
                              title="Download invoice PDF"
                              onClick={(e) => handleOpenPdf(job, e)}
                              className="p-1.5 rounded-md text-zinc-500 hover:text-[#C0512A] hover:bg-orange-50"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                          {invoiced && !paid && (
                            <button
                              type="button"
                              title="Mark customer paid"
                              disabled={payingId === job.id}
                              onClick={(e) => handleMarkPaid(job, e)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {payingId === job.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <DollarSign className="w-3 h-3" />
                              )}
                              Paid
                            </button>
                          )}
                          {!invoiced && (
                            <button
                              type="button"
                              title="Generate invoice PDF"
                              onClick={(e) => handleOpenPdf(job, e)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-[#C0512A] hover:bg-[#a84422]"
                            >
                              <Receipt className="w-3 h-3" />
                              Invoice
                            </button>
                          )}
                          <button
                            type="button"
                            title="Open job"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedJob(job);
                            }}
                            className="p-1.5 rounded-md text-zinc-400 hover:text-[#2B3A4A] hover:bg-zinc-100"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot className="bg-zinc-50 border-t border-zinc-200">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-right text-xs font-semibold uppercase text-zinc-500">
                    {rows.length} invoice{rows.length === 1 ? '' : 's'} · total
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-[#2B3A4A]">
                    {money(rows.reduce((s, j) => s + sellOf(j), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <JobDetailModal
        job={selectedJob as any}
        isOpen={!!selectedJob}
        onClose={() => {
          setSelectedJob(null);
          load();
          onRefresh?.();
        }}
        onDownloadInvoice={() => selectedJob && pdfApi.generateInvoice(selectedJob.id)}
        onDownloadPO={() => selectedJob && pdfApi.generateVendorPO(selectedJob.id)}
        onDownloadQuote={() => selectedJob && pdfApi.generateQuote(selectedJob.id)}
        onRefresh={() => {
          load();
          onRefresh?.();
        }}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'muted';
}) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-700',
          tone === 'warn' && 'text-[#C0512A]',
          tone === 'muted' && 'text-zinc-600',
          !tone && 'text-[#2B3A4A]'
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default InvoicesView;
