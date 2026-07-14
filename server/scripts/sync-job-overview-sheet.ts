/**
 * ONE-TIME cleanup: sync Desktop Job Overview xlsx → production jobs.
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/sync-job-overview-sheet.ts
 *   APPLY=1 npx tsx scripts/sync-job-overview-sheet.ts
 *
 * Maps sheet Client Paid / BGE Paid / JD Paid onto:
 *   customerPaymentDate, bradfordPaymentDate, jdPaymentDate,
 *   workflowStatus COMPLETED when client paid (optional complete flag),
 *   status PAID when client paid AND fully settled OR when client paid + mark complete.
 *
 * Matching order per sheet row:
 *   1. jobNo exact (sheet Job #)
 *   2. jobNo with/without J- prefix
 *   3. CRM ref in title [CRM J-xxxx]
 *   4. customerPONumber / partnerPONumber / sheet BGE PO
 *   5. fuzzy: customer name + title token
 */
import path from 'path';
import fs from 'fs';
import { PrismaClient, JobStatus, JobWorkflowStatus } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const SHEET_PATH =
  process.env.SHEET_PATH ||
  path.join(
    process.env.HOME || '',
    'Desktop',
    'Impact Direct - Job Overview (2) (1).xlsx'
  );

const APPLY = process.env.APPLY === '1';
const DRY = !APPLY;

type SheetRow = {
  sheetJob: string;
  client: string;
  title: string;
  inv: number;
  bgePo: string;
  clientPaid: boolean;
  bgePaid: boolean;
  jdPaid: boolean;
  evidence: string;
  paidDate: Date | null;
  crmRefs: string[];
  rowNum: number;
};

function yes(v: unknown): boolean {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .startsWith('y');
}

function parseSheet(filePath: string): SheetRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sheet not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  // Header row 5 (1-indexed) = index 4
  const rows: SheetRow[] = [];
  for (let i = 5; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[1]) continue;
    // Skip totals footer
    const a = String(r[0] ?? '');
    if (a.toLowerCase().includes('total') || a.toLowerCase().includes('sum')) continue;

    const title = String(r[3] ?? '');
    const crmRefs = [
      ...title.matchAll(/J-\d{4}-\d+|J-\d{4}\b|J-\d+/gi),
    ].map((m) => m[0]);

    const paidDateRaw = r[20];
    let paidDate: Date | null = null;
    if (paidDateRaw instanceof Date) paidDate = paidDateRaw;
    else if (paidDateRaw) {
      const d = new Date(paidDateRaw);
      if (!isNaN(d.getTime())) paidDate = d;
    }

    rows.push({
      sheetJob: String(r[1]).trim(),
      client: String(r[2] ?? '').trim(),
      title,
      inv: Number(r[9]) || 0,
      bgePo: r[10] != null ? String(r[10]).replace(/\.0$/, '') : '',
      clientPaid: yes(r[18]),
      bgePaid: yes(r[23]),
      jdPaid: yes(r[22]),
      evidence: String(r[19] ?? ''),
      paidDate,
      crmRefs,
      rowNum: i + 1,
    });
  }
  return rows;
}

function normalizeJobNo(s: string): string {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function jobNoVariants(s: string): string[] {
  const n = normalizeJobNo(s);
  const out = new Set<string>([n, s.trim()]);
  if (n.startsWith('J-')) out.add(n.slice(2));
  else out.add(`J-${n}`);
  // strip leading zeros on numeric
  if (/^\d+$/.test(n)) out.add(String(parseInt(n, 10)));
  // IDP-JD-J-3001 / IDP-JD-M-3015 / JD-M-3013 → J-3001 / M-3015 / M-3013
  const idp = n.match(/^(?:IDP-)?JD-(J-\d+|M-\d+|\d+)$/i);
  if (idp) {
    const core = idp[1].toUpperCase();
    out.add(core);
    if (/^\d+$/.test(core)) out.add(`J-${core}`);
  }
  const jdM = n.match(/^JD-(M-\d+)$/i);
  if (jdM) out.add(jdM[1].toUpperCase());
  // bare 2025-xxxxx bill ids stay as-is (matched via CRM/BGE)
  return [...out];
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE (writes DB) ===' : '=== DRY RUN (no writes) ===');
  console.log('Sheet:', SHEET_PATH);

  const sheetRows = parseSheet(SHEET_PATH);
  console.log(`Sheet data rows: ${sheetRows.length}`);

  const jobs = await prisma.job.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      jobNo: true,
      title: true,
      status: true,
      customerId: true,
      customerPONumber: true,
      sellPrice: true,
      customerPaymentDate: true,
      customerPaymentAmount: true,
      bradfordPaymentDate: true,
      bradfordPaymentPaid: true,
      bradfordPaymentAmount: true,
      jdPaymentDate: true,
      jdPaymentPaid: true,
      jdPaymentAmount: true,
      workflowStatus: true,
      workflowStatusOverride: true,
      partnerPONumber: true,
      Company: { select: { id: true, name: true } },
    },
  });
  console.log(`DB jobs: ${jobs.length}`);

  // Indexes
  const byJobNo = new Map<string, typeof jobs>();
  for (const j of jobs) {
    for (const v of jobNoVariants(j.jobNo)) {
      const k = normalizeJobNo(v);
      if (!byJobNo.has(k)) byJobNo.set(k, []);
      byJobNo.get(k)!.push(j);
    }
  }
  const byBradford = new Map<string, typeof jobs[0]>();
  for (const j of jobs) {
    if (j.partnerPONumber) byBradford.set(String(j.partnerPONumber).trim(), j);
  }
  const byPo = new Map<string, typeof jobs[0]>();
  for (const j of jobs) {
    if (j.customerPONumber) byPo.set(String(j.customerPONumber).trim().toUpperCase(), j);
  }

  type Match = {
    sheet: SheetRow;
    job: (typeof jobs)[0];
    how: string;
  };
  const matched: Match[] = [];
  const unmatched: SheetRow[] = [];
  const multi: { sheet: SheetRow; count: number }[] = [];

  for (const row of sheetRows) {
    let found: (typeof jobs)[0] | null = null;
    let how = '';

    // 1) jobNo variants
    for (const v of jobNoVariants(row.sheetJob)) {
      const list = byJobNo.get(normalizeJobNo(v));
      if (list?.length === 1) {
        found = list[0];
        how = `jobNo:${v}`;
        break;
      }
      if (list && list.length > 1) {
        // prefer customer name match
        const cn = row.client.toLowerCase();
        const prefer = list.filter((j) =>
          (j.Company?.name || '').toLowerCase().includes(cn.slice(0, 6))
        );
        if (prefer.length === 1) {
          found = prefer[0];
          how = `jobNo+customer:${v}`;
          break;
        }
        multi.push({ sheet: row, count: list.length });
      }
    }

    // 2) CRM refs from title
    if (!found) {
      for (const ref of row.crmRefs) {
        const list = byJobNo.get(normalizeJobNo(ref));
        if (list?.length === 1) {
          found = list[0];
          how = `crm:${ref}`;
          break;
        }
      }
    }

    // 3) Bradford PO
    if (!found && row.bgePo) {
      const j = byBradford.get(row.bgePo);
      if (j) {
        found = j;
        how = `bgePo:${row.bgePo}`;
      }
    }

    // 4) customer PO exact in title/order fields — skip

    if (found) matched.push({ sheet: row, job: found, how });
    else unmatched.push(row);
  }

  // Dedup: one DB job may match multiple sheet rows — last wins, log
  const byJobId = new Map<string, Match>();
  const dupSheet: string[] = [];
  for (const m of matched) {
    if (byJobId.has(m.job.id)) {
      dupSheet.push(`${m.job.jobNo} <- ${m.sheet.sheetJob} (was ${byJobId.get(m.job.id)!.sheet.sheetJob})`);
    }
    byJobId.set(m.job.id, m);
  }

  console.log(`\nMatched unique jobs: ${byJobId.size}`);
  console.log(`Unmatched sheet rows: ${unmatched.length}`);
  console.log(`Multi-match collisions: ${multi.length}`);
  if (dupSheet.length) console.log(`Sheet rows mapping same job: ${dupSheet.length}`);

  const plan: {
    jobNo: string;
    how: string;
    clientPaid: boolean;
    bgePaid: boolean;
    jdPaid: boolean;
    changes: string[];
  }[] = [];

  let wouldUpdate = 0;
  const now = new Date();
  // Use a fixed "sheet sync" date when paid but no date
  const defaultPaidAt = new Date('2026-07-01T12:00:00.000Z');

  for (const m of byJobId.values()) {
    const { job, sheet, how } = m;
    const changes: string[] = [];
    const data: Record<string, unknown> = { updatedAt: now };

    // Client paid
    if (sheet.clientPaid) {
      if (!job.customerPaymentDate) {
        data.customerPaymentDate = sheet.paidDate || defaultPaidAt;
        changes.push('customerPaymentDate');
      }
      if (job.customerPaymentAmount == null && sheet.inv > 0) {
        data.customerPaymentAmount = sheet.inv;
        changes.push('customerPaymentAmount');
      }
      // Sell price fill if empty
      if ((job.sellPrice == null || Number(job.sellPrice) === 0) && sheet.inv > 0) {
        data.sellPrice = sheet.inv;
        changes.push('sellPrice');
      }
    }

    // BGE / Bradford paid
    if (sheet.bgePaid) {
      if (!job.bradfordPaymentDate) {
        data.bradfordPaymentDate = defaultPaidAt;
        data.bradfordPaymentPaid = true;
        changes.push('bradfordPaymentDate');
      }
      if (sheet.bgePo && !job.partnerPONumber) {
        data.partnerPONumber = sheet.bgePo;
        changes.push('partnerPONumber');
      }
    }

    // JD paid
    if (sheet.jdPaid) {
      if (!job.jdPaymentDate) {
        data.jdPaymentDate = defaultPaidAt;
        data.jdPaymentPaid = true;
        changes.push('jdPaymentDate');
      }
    }

    // Completion cleanup (sheet = one-shot truth):
    // - Client paid → production at least COMPLETED/INVOICED (not stuck NEW/ACTIVE workflow)
    // - Client + BGE + JD all paid → status PAID
    // - Client paid but BGE/JD open → keep status ACTIVE so Pay BGE/JD queue still works
    if (sheet.clientPaid) {
      const bgeDone = sheet.bgePaid || !!job.bradfordPaymentDate || !!data.bradfordPaymentDate;
      const jdDone = sheet.jdPaid || !!job.jdPaymentDate || !!data.jdPaymentDate;
      const terminalWf = ['COMPLETED', 'PAID', 'INVOICED', 'CANCELLED'];
      if (!terminalWf.includes(job.workflowStatus || '')) {
        data.workflowStatus = JobWorkflowStatus.COMPLETED;
        data.workflowStatusOverride = JobWorkflowStatus.COMPLETED;
        changes.push('workflowStatus=COMPLETED');
      }
      if (bgeDone && jdDone) {
        if (job.status !== 'PAID') {
          data.status = JobStatus.PAID;
          changes.push('status=PAID');
        }
        if (job.workflowStatus !== 'PAID') {
          data.workflowStatus = JobWorkflowStatus.PAID;
          data.workflowStatusOverride = JobWorkflowStatus.PAID;
          changes.push('workflowStatus=PAID');
        }
      }
    }

    if (changes.length) {
      wouldUpdate++;
      plan.push({
        jobNo: job.jobNo,
        how,
        clientPaid: sheet.clientPaid,
        bgePaid: sheet.bgePaid,
        jdPaid: sheet.jdPaid,
        changes,
      });

      if (APPLY) {
        await prisma.job.update({
          where: { id: job.id },
          data: data as any,
        });
      }
    }
  }

  console.log(`\nJobs to update: ${wouldUpdate}`);
  console.log('\nSample plan (first 25):');
  for (const p of plan.slice(0, 25)) {
    console.log(
      `  ${p.jobNo} [${p.how}] C=${p.clientPaid ? 'Y' : 'N'} BGE=${p.bgePaid ? 'Y' : 'N'} JD=${p.jdPaid ? 'Y' : 'N'} → ${p.changes.join(', ')}`
    );
  }

  if (unmatched.length) {
    console.log(`\nUnmatched sheet jobs (${unmatched.length}):`);
    for (const u of unmatched.slice(0, 30)) {
      console.log(`  row ${u.rowNum} ${u.sheetJob} | ${u.client} | $${u.inv} | C=${u.clientPaid} BGE=${u.bgePaid} JD=${u.jdPaid}`);
    }
    if (unmatched.length > 30) console.log(`  ... +${unmatched.length - 30} more`);
  }

  // Write report
  const reportPath = path.join(__dirname, `sync-job-overview-report-${Date.now()}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        mode: APPLY ? 'APPLY' : 'DRY_RUN',
        sheet: SHEET_PATH,
        matched: byJobId.size,
        wouldUpdate,
        unmatched: unmatched.map((u) => ({
          job: u.sheetJob,
          client: u.client,
          inv: u.inv,
          clientPaid: u.clientPaid,
        })),
        plan,
      },
      null,
      2
    )
  );
  console.log(`\nReport: ${reportPath}`);

  if (DRY) {
    console.log('\nDry run only. Re-run with APPLY=1 to write.');
  } else {
    console.log(`\nApplied updates to ${wouldUpdate} jobs.`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
