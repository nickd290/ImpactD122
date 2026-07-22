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
import {
  isClientPaid,
  getOpsStage,
  isInvoiced as jobIsInvoiced,
  getPaymentDueDate,
  isPaymentOverdue,
  getDaysPaymentOverdue,
  paymentTermsLabel,
  getPaymentTermsDays,
  moneyStatusBadges,
  needsVendorPay,
  impactProductionPayee,
  isMoneyComplete,
} from '../lib/jobPipeline';
import { JobDetailModal } from './JobDetailModal';

type InvoiceTab = 'all' | 'unpaid' | 'pay_vendor' | 'paid' | 'ready';

interface InvoiceJob {
  id: string;
  jobNo?: string;
  number?: string;
  title?: string;
  status?: string;
  workflowStatus?: string;
  workflowStatusOverride?: string;
  customer?: { id: string; name: string; paymentTermsDays?: number | null };
  customerPONumber?: string;
  partnerPONumber?: string;
  bradfordRefNumber?: string;
  paperSource?: string;
  quantity?: number;
  sellPrice?: number | string;
  invoiceGeneratedAt?: string | null;
  invoiceGeneratedCount?: number;
  invoiceEmailedAt?: string | null;
  invoiceEmailedTo?: string | null;
  invoiceNumber?: string | null;
  customerInvoiceNumber?: string | null;
  customerPaymentDate?: string | null;
  customerPaymentPaid?: boolean;
  customerPaymentAmount?: number | null;
  bradfordPaymentDate?: string | null;
  bradfordPaymentPaid?: boolean;
  jdPaymentDate?: string | null;
  jdPaymentPaid?: boolean;
  paymentTermsDays?: number | null;
  paymentDueDate?: string | null;
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
  return jobIsInvoiced(j);
}

function isReadyToBill(j: InvoiceJob): boolean {
  if (isInvoiced(j)) return false;
  if (j.status === 'CANCELLED') return false;
  // Floor done but no customer invoice on file yet (migration + new)
  if (getOpsStage(j) === 'complete') return true;
  const wf = j.workflowStatus || '';
  return wf === 'SHIPPED' || wf === 'COMPLETED';
}

/** Client paid Impact (not necessarily settled with BGE/JD) */
function isPaid(j: InvoiceJob): boolean {
  return isClientPaid(j);
}

/** Fully complete: client + Impact production payee (BGE or JD) */
function isSettled(j: InvoiceJob): boolean {
  return isMoneyComplete(j);
}

function bgePoOf(j: InvoiceJob): string {
  return j.partnerPONumber || j.bradfordRefNumber || '';
}

interface InvoicesViewProps {
  onRefresh?: () => void;
}

export function InvoicesView({ onRefresh }: InvoicesViewProps) {
  const [jobs, setJobs] = useState<InvoiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<InvoiceTab>('unpaid');
  const [customerFilter, setCustomerFilter] = useState('');
  const [selectedJob, setSelectedJob] = useState<InvoiceJob | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<InvoiceJob | null>(null);
  const [invNo, setInvNo] = useState('');
  const [invDate, setInvDate] = useState('');
  const [invSaving, setInvSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await jobsApi.getAll();
      setJobs(res.jobs || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load invoices');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const invoicedJobs = useMemo(() => jobs.filter(isInvoiced), [jobs]);
  const readyJobs = useMemo(() => jobs.filter(isReadyToBill), [jobs]);

  const counts = useMemo(() => {
    const unpaid = invoicedJobs.filter((j) => !isPaid(j));
    const pay_vendor = invoicedJobs.filter((j) => needsVendorPay(j));
    const paid = invoicedJobs.filter(isSettled);
    return {
      all: invoicedJobs.length,
      unpaid: unpaid.length,
      pay_vendor: pay_vendor.length,
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
            if (tab === 'pay_vendor') return needsVendorPay(j);
            if (tab === 'paid') return isSettled(j);
            return true;
          });
    const amount = pool.reduce((s, j) => s + sellOf(j), 0);
    const unpaidAmt = invoicedJobs.filter((j) => !isPaid(j)).reduce((s, j) => s + sellOf(j), 0);
    const paidAmt = invoicedJobs.filter(isSettled).reduce((s, j) => s + sellOf(j), 0);
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
            if (tab === 'pay_vendor') return needsVendorPay(j);
            if (tab === 'paid') return isSettled(j);
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
          j.customerInvoiceNumber,
          j.title,
          j.customer?.name,
          j.customerPONumber,
          j.partnerPONumber,
          j.bradfordRefNumber,
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
      toast.success(`${job.jobNo || job.number} client paid — next: pay BGE or JD`);
      await load(true);
      onRefresh?.();
    } catch {
      toast.error('Failed to mark paid');
    } finally {
      setPayingId(null);
    }
  };

  const handleMarkProductionPaid = async (
    job: InvoiceJob,
    e: React.MouseEvent,
    who: 'bradford' | 'jd'
  ) => {
    e.stopPropagation();
    setPayingId(`${job.id}-${who}`);
    try {
      if (who === 'bradford') {
        await jobsApi.markBradfordPaid(job.id, { sendInvoice: false });
        toast.success('Marked BGE paid');
      } else {
        await jobsApi.markJDPaid(job.id);
        toast.success('Marked JD paid');
      }
      await load(true);
      onRefresh?.();
    } catch {
      toast.error('Failed to mark production paid');
    } finally {
      setPayingId(null);
    }
  };

  const openMarkInvoiced = (job: InvoiceJob, e: React.MouseEvent) => {
    e.stopPropagation();
    setInvoiceModal(job);
    setInvNo(job.customerInvoiceNumber || job.invoiceNumber || '');
    setInvDate(
      job.invoiceGeneratedAt
        ? new Date(job.invoiceGeneratedAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
  };

  const saveMarkInvoiced = async () => {
    if (!invoiceModal) return;
    const no = invNo.trim();
    if (!no) {
      toast.error('Invoice number required');
      return;
    }
    setInvSaving(true);
    try {
      await jobsApi.markInvoiced(invoiceModal.id, {
        invoiceNumber: no,
        invoicedAt: invDate || undefined,
      });
      toast.success(`Invoiced ${no} — unpaid`);
      setInvoiceModal(null);
      await load();
      onRefresh?.();
    } catch {
      toast.error('Failed to mark invoiced');
    } finally {
      setInvSaving(false);
    }
  };

  const handleOpenPdf = (job: InvoiceJob, e: React.MouseEvent) => {
    e.stopPropagation();
    pdfApi.generateInvoice(job.id);
  };

  const tabs: { id: InvoiceTab; label: string; count: number }[] = [
    { id: 'unpaid', label: 'Unpaid (client)', count: counts.unpaid },
    { id: 'pay_vendor', label: 'Client paid → pay BGE/JD', count: counts.pay_vendor },
    { id: 'paid', label: 'Complete', count: counts.paid },
    { id: 'all', label: 'All invoices', count: counts.all },
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
            Customer invoices — mark invoiced / client paid / still owe BGE or JD
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
        <Kpi label="Unpaid client" value={money(totals.unpaidAmt)} sub={`${counts.unpaid} open`} tone="warn" />
        <Kpi label="Need pay BGE/JD" value={String(counts.pay_vendor)} sub="client paid us" tone="warn" />
        <Kpi label="Complete" value={money(totals.paidAmt)} sub={`${counts.paid} both paid`} tone="good" />
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
                <th className="px-3 py-3">Invoice / Job</th>
                <th className="px-3 py-3">Inv date</th>
                <th className="px-3 py-3">Pay due</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Cust PO</th>
                <th className="px-3 py-3">BGE PO</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3">Money</th>
                <th className="px-3 py-3 text-right">Actions</th>
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
                      ? 'No jobs ready to bill — mark complete first, then Mark invoiced.'
                      : tab === 'pay_vendor'
                        ? 'No client-paid jobs still owing BGE/JD.'
                        : 'No invoices in this filter. Use Ready to bill → Mark invoiced.'}
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((job) => {
                  const paid = isPaid(job);
                  const needPay = needsVendorPay(job);
                  const payee = impactProductionPayee(job);
                  const invoiced = isInvoiced(job);
                  const sell = sellOf(job);
                  const displayInv =
                    job.customerInvoiceNumber || job.invoiceNumber || job.jobNo || job.number || '—';
                  const payDue = getPaymentDueDate(job);
                  const payOverdue = isPaymentOverdue(job);
                  const daysOver = getDaysPaymentOverdue(job);
                  const terms = paymentTermsLabel(getPaymentTermsDays(job));
                  const badges = moneyStatusBadges(job);
                  const bgePo = bgePoOf(job);

                  return (
                    <tr
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className={cn(
                        'hover:bg-zinc-50/80 cursor-pointer transition-colors',
                        needPay && 'bg-orange-50/40',
                        payOverdue && !needPay && 'bg-red-50/40'
                      )}
                    >
                      <td className="px-3 py-3">
                        <div className="font-mono font-semibold text-[#2B3A4A]">{displayInv}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {job.jobNo || job.number}
                        </div>
                        {job.title && (
                          <div className="text-xs text-zinc-500 truncate max-w-[160px]">
                            {job.title}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-zinc-600 tabular-nums text-xs">
                        {fmtDate(job.invoiceGeneratedAt)}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-xs">
                        {payDue ? (
                          <div>
                            <span className={cn(payOverdue ? 'text-red-600 font-semibold' : 'text-zinc-600')}>
                              {fmtDate(payDue.toISOString())}
                            </span>
                            <div className="text-[10px] text-zinc-400">{terms}</div>
                            {payOverdue && daysOver != null && (
                              <div className="text-[10px] font-semibold text-red-600">{daysOver}d overdue</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-medium text-zinc-800 text-sm max-w-[120px] truncate">
                        {job.customer?.name || '—'}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-zinc-700">
                        {job.customerPONumber || '—'}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-zinc-700">
                        {bgePo || '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-[#2B3A4A]">
                        {sell > 0 ? money(sell) : '—'}
                      </td>
                      <td className="px-3 py-3">
                        {!invoiced ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200">
                            Ready
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-1">
                              {badges.map((b) => (
                                <span
                                  key={b.text}
                                  className={cn(
                                    'inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border',
                                    b.tone === 'paid' && 'bg-emerald-50 text-emerald-800 border-emerald-200',
                                    b.tone === 'good' && 'bg-emerald-100 text-emerald-900 border-emerald-300',
                                    b.tone === 'action' && 'bg-orange-100 text-[#C0512A] border-orange-300',
                                    b.tone === 'warn' && 'bg-amber-50 text-amber-800 border-amber-200',
                                    b.tone === 'muted' && 'bg-zinc-100 text-zinc-500 border-zinc-200'
                                  )}
                                >
                                  {b.text}
                                </span>
                              ))}
                            </div>
                            {needPay && (
                              <div className="text-[10px] font-semibold text-[#C0512A]">
                                Client paid — still owe {payee}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
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
                              Client paid
                            </button>
                          )}
                          {invoiced && needPay && payee === 'BGE' && (
                            <button
                              type="button"
                              title="Impact paid BGE"
                              disabled={payingId === `${job.id}-bradford`}
                              onClick={(e) => handleMarkProductionPaid(job, e, 'bradford')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
                            >
                              Mark BGE paid
                            </button>
                          )}
                          {invoiced && needPay && payee === 'JD' && (
                            <button
                              type="button"
                              title="Impact paid JD"
                              disabled={payingId === `${job.id}-jd`}
                              onClick={(e) => handleMarkProductionPaid(job, e, 'jd')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-white bg-[#2B3A4A] hover:bg-[#1f2a36] disabled:opacity-50"
                            >
                              Mark JD paid
                            </button>
                          )}
                          {!invoiced && (
                            <>
                              <button
                                type="button"
                                title="Record old-system invoice # + date"
                                onClick={(e) => openMarkInvoiced(job, e)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-[#2B3A4A] hover:bg-[#1f2a36]"
                              >
                                <Receipt className="w-3 h-3" />
                                Mark invoiced
                              </button>
                              <button
                                type="button"
                                title="Generate invoice PDF"
                                onClick={(e) => handleOpenPdf(job, e)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-[#C0512A] border border-[#C0512A]/40 hover:bg-orange-50"
                              >
                                PDF
                              </button>
                            </>
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
                  <td colSpan={6} className="px-3 py-3 text-right text-xs font-semibold uppercase text-zinc-500">
                    {rows.length} row{rows.length === 1 ? '' : 's'} · total
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-[#2B3A4A]">
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

      {invoiceModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40"
          onClick={() => !invSaving && setInvoiceModal(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-zinc-200 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#2B3A4A]">Mark invoiced</h3>
            <p className="text-xs text-zinc-500 mt-1">
              {invoiceModal.jobNo || invoiceModal.number} — old-system invoice # + date. Stays{' '}
              <strong>unpaid</strong>.
            </p>
            <label className="block mt-4">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Invoice number
              </span>
              <input
                autoFocus
                value={invNo}
                onChange={(e) => setInvNo(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
              />
            </label>
            <label className="block mt-3">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Invoice date
              </span>
              <input
                type="date"
                value={invDate}
                onChange={(e) => setInvDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={invSaving}
                onClick={() => setInvoiceModal(null)}
                className="px-3 py-1.5 text-sm text-zinc-600 rounded-lg hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={invSaving}
                onClick={saveMarkInvoiced}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-[#2B3A4A] rounded-lg disabled:opacity-50"
              >
                {invSaving ? 'Saving…' : 'Save invoiced'}
              </button>
            </div>
          </div>
        </div>
      )}
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
