import express from 'express';
import prisma from '../utils/prisma';
import { requireOwnerHubAuth } from '../middleware/owner-hub-auth';

const router = express.Router();
router.use(requireOwnerHubAuth);

function money(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return '$' + Math.round(n / 1000) + 'k';
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
  return '$' + Math.round(n);
}

router.get('/summary', async (_req, res) => {
  try {
    const now = new Date();

    const [activeJobsAgg, overdueInvoiceCount, unpaidInvoiceAgg, pendingProofsCount] =
      await Promise.all([
        prisma.job.aggregate({
          where: { status: 'ACTIVE' },
          _count: { _all: true },
          _sum: { sellPrice: true },
        }),
        prisma.invoice.count({
          where: { paidAt: null, dueAt: { lt: now } },
        }),
        prisma.invoice.aggregate({
          where: { paidAt: null },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.proof.count({ where: { status: 'PENDING' } }),
      ]);

    const activeCount = activeJobsAgg._count._all;
    const activeAmount = Number(activeJobsAgg._sum.sellPrice ?? 0);
    const unpaidAmount = Number(unpaidInvoiceAgg._sum.amount ?? 0);
    const unpaidCount = unpaidInvoiceAgg._count._all;

    res.json({
      kpis: [
        {
          label: 'Active jobs',
          value: String(activeCount),
          sub: money(activeAmount) + ' in flight',
          href: '/jobs',
        },
        {
          label: 'AR',
          value: money(unpaidAmount),
          sub: `${unpaidCount} unpaid · ${overdueInvoiceCount} overdue`,
          href: '/financials',
        },
        {
          label: 'Proofs',
          value: String(pendingProofsCount),
          sub: 'pending customer',
          href: '/proofs',
        },
      ],
      alertCount: overdueInvoiceCount + pendingProofsCount,
    });
  } catch (err) {
    console.error('[owner/summary] failed:', err);
    res.status(500).json({ error: 'Failed to load Impact Direct summary' });
  }
});

router.get('/actions', async (_req, res) => {
  try {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

    type ActionItem = {
      id: string;
      company: 'impact-direct';
      severity: 'now' | 'today' | 'week';
      title: string;
      subtitle?: string;
      href: string;
      ageMs?: number;
    };

    const items: ActionItem[] = [];

    const [overdueInvoices, stalePendingProofs, stuckJobs] = await Promise.all([
      prisma.invoice.findMany({
        where: { paidAt: null, dueAt: { lt: now } },
        orderBy: { dueAt: 'asc' },
        take: 25,
        include: {
          Company_Invoice_toCompanyIdToCompany: { select: { name: true } },
          Job: { select: { jobNo: true } },
        },
      }),
      prisma.proof.findMany({
        where: { status: 'PENDING', createdAt: { lt: threeDaysAgo } },
        orderBy: { createdAt: 'asc' },
        take: 25,
        include: { Job: { select: { jobNo: true, title: true } } },
      }),
      prisma.job.findMany({
        where: {
          status: 'ACTIVE',
          workflowStatus: {
            in: ['AWAITING_CUSTOMER_RESPONSE', 'AWAITING_PROOF_FROM_VENDOR'],
          },
          updatedAt: { lt: sevenDaysAgo },
        },
        orderBy: { updatedAt: 'asc' },
        take: 25,
        select: {
          id: true,
          jobNo: true,
          title: true,
          workflowStatus: true,
          updatedAt: true,
        },
      }),
    ]);

    for (const inv of overdueInvoices) {
      if (!inv.dueAt) continue;
      const ageMs = now.getTime() - inv.dueAt.getTime();
      const days = ageMs / 86_400_000;
      const customerName =
        inv.Company_Invoice_toCompanyIdToCompany?.name ?? 'Unknown';
      items.push({
        id: `idm-invoice-${inv.id}`,
        company: 'impact-direct',
        severity: days > 30 ? 'now' : days > 7 ? 'today' : 'week',
        title: `Overdue invoice — ${customerName}`,
        subtitle: `${money(Number(inv.amount))} · ${inv.invoiceNo} · ${Math.round(days)}d late${inv.Job?.jobNo ? ' · ' + inv.Job.jobNo : ''}`,
        href: '/financials',
        ageMs,
      });
    }

    for (const p of stalePendingProofs) {
      const ageMs = now.getTime() - p.createdAt.getTime();
      const days = ageMs / 86_400_000;
      items.push({
        id: `idm-proof-${p.id}`,
        company: 'impact-direct',
        severity: days > 7 ? 'now' : 'today',
        title: `Proof pending ${Math.round(days)}d — ${p.Job?.title ?? p.Job?.jobNo ?? 'Unknown job'}`,
        subtitle: `v${p.version} awaiting customer approval`,
        href: '/proofs',
        ageMs,
      });
    }

    for (const j of stuckJobs) {
      const ageMs = now.getTime() - j.updatedAt.getTime();
      const days = ageMs / 86_400_000;
      items.push({
        id: `idm-job-${j.id}`,
        company: 'impact-direct',
        severity: days > 14 ? 'now' : 'today',
        title: `Stuck ${Math.round(days)}d — ${j.title ?? j.jobNo}`,
        subtitle: `Workflow: ${j.workflowStatus.replace(/_/g, ' ').toLowerCase()}`,
        href: '/jobs',
        ageMs,
      });
    }

    res.json({ items });
  } catch (err) {
    console.error('[owner/actions] failed:', err);
    res.status(500).json({ error: 'Failed to load Impact Direct actions' });
  }
});

export default router;
