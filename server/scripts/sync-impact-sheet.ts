/**
 * Sync IMPACT SHEET (Job Overview) → production jobs.
 *
 * Source: https://docs.google.com/spreadsheets/d/1m9I08je8pxO5YlDIr3z55HI5qzKjAxEQkQkYs3bUYKE
 *
 * Usage:
 *   # 1) Export sheet to JSON:
 *   gws sheets +read --spreadsheet "1m9I08je8pxO5YlDIr3z55HI5qzKjAxEQkQkYs3bUYKE" \
 *     --range "'Job Overview'!A5:Y90" --format json > /tmp/impact-overview-raw.txt
 *
 *   SHEET_JSON=/tmp/impact-overview-raw.txt npx tsx scripts/sync-impact-sheet.ts
 *   APPLY=1 SHEET_JSON=... npx tsx scripts/sync-impact-sheet.ts
 *
 * Prefer update existing jobs. Does NOT create new jobs.
 * Reports: only-on-sheet, only-in-app (target customers).
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient, JobStatus, JobWorkflowStatus } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
const SHEET_JSON = process.env.SHEET_JSON || '/tmp/impact-overview-raw.txt';
const defaultPaidAt = new Date('2026-07-01T12:00:00.000Z');

const TARGET = ['ballantine', 'incremental', 'jjs'];

type SheetRow = {
  group: string;
  sheetJob: string;
  client: string;
  title: string;
  customerPO: string;
  bgePO: string;
  inv: number;
  bgeAmt: number;
  jdAmt: number;
  clientPaid: boolean;
  jdPaid: boolean;
  bgePaid: boolean;
  evidence: string;
  paidDate: Date | null;
  crmRefs: string[];
};

function yes(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s.startsWith('y');
}

function money(v: unknown): number {
  if (v == null || v === '' || v === '-') return 0;
  const n = parseFloat(String(v).replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseMoneyDate(v: unknown): Date | null {
  if (!v || v === '-') return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function normalizeJobNo(s: string): string {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, '');
}

function jobNoVariants(s: string): string[] {
  const n = normalizeJobNo(s);
  const out = new Set<string>([n, s.trim()]);
  if (n.startsWith('J-')) out.add(n.slice(2));
  else if (/^\d+$/.test(n) || /^2025-/.test(n) || /^M-/.test(n)) out.add(n.startsWith('J-') ? n : n);
  if (!n.startsWith('J-') && !n.startsWith('M-') && /^[A-Z]?-?\d/.test(n)) {
    out.add(`J-${n}`);
  }
  const idp = n.match(/^(?:IDP-)?JD-(J-\d+|M-\d+|\d+)$/i);
  if (idp) {
    const core = idp[1].toUpperCase();
    out.add(core);
    if (/^\d+$/.test(core)) out.add(`J-${core}`);
  }
  const jdM = n.match(/^JD-(M-\d+)$/i);
  if (jdM) out.add(jdM[1].toUpperCase());
  if (/^\d+$/.test(n)) out.add(String(parseInt(n, 10)));
  return [...out];
}

function isTargetCustomer(group: string, client: string): boolean {
  const s = `${group} ${client}`.toLowerCase();
  return TARGET.some((t) => s.includes(t));
}

function loadSheet(filePath: string): SheetRow[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const data = JSON.parse(text.slice(start, end + 1));
  const values: any[][] = data.values || [];
  const rows: SheetRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i] || [];
    while (r.length < 25) r.push('');
    const group = String(r[0] || '');
    const sheetJob = String(r[1] || '').trim();
    if (!sheetJob) continue;
    if (group === 'TOTALS' || group.startsWith('NOTES') || group.startsWith('•')) continue;

    const title = String(r[3] || '');
    const crmRefs = [...title.matchAll(/J-\d{4}-\d+|J-\d{4}\b|J-\d+|M-\d+/gi)].map((m) => m[0]);

    rows.push({
      group,
      sheetJob,
      client: String(r[2] || ''),
      title,
      customerPO: String(r[7] || '').trim().replace(/^-$/, ''),
      bgePO: String(r[10] || '')
        .trim()
        .replace(/\.0$/, '')
        .replace(/^-$/, ''),
      inv: money(r[9]),
      bgeAmt: money(r[11]),
      jdAmt: money(r[13]),
      clientPaid: yes(r[18]),
      jdPaid: yes(r[22]),
      bgePaid: yes(r[23]),
      evidence: String(r[19] || ''),
      paidDate: parseMoneyDate(r[20]),
      crmRefs,
    });
  }
  return rows;
}

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN ===');
  console.log('Sheet JSON:', SHEET_JSON);

  const sheetRows = loadSheet(SHEET_JSON);
  console.log(`Sheet jobs: ${sheetRows.length}`);
  const targetSheet = sheetRows.filter((r) => isTargetCustomer(r.group, r.client));
  console.log(`Target (JJSA/Ballantine/Incremental): ${targetSheet.length}`);

  const jobs = await prisma.job.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      jobNo: true,
      title: true,
      status: true,
      customerId: true,
      customerPONumber: true,
      partnerPONumber: true,
      sellPrice: true,
      customerPaymentDate: true,
      customerPaymentAmount: true,
      bradfordPaymentDate: true,
      bradfordPaymentPaid: true,
      bradfordPaymentAmount: true,
      jdPaymentDate: true,
      jdPaymentPaid: true,
      jdPaymentAmount: true,
      paperSource: true,
      workflowStatus: true,
      Company: { select: { id: true, name: true } },
    },
  });
  console.log(`DB jobs: ${jobs.length}`);

  type J = (typeof jobs)[0];
  const byJobNo = new Map<string, J[]>();
  for (const j of jobs) {
    for (const v of jobNoVariants(j.jobNo)) {
      const k = normalizeJobNo(v);
      if (!byJobNo.has(k)) byJobNo.set(k, []);
      byJobNo.get(k)!.push(j);
    }
  }
  const byBge = new Map<string, J>();
  for (const j of jobs) {
    if (j.partnerPONumber) byBge.set(String(j.partnerPONumber).trim(), j);
  }
  const byCustPo = new Map<string, J>();
  for (const j of jobs) {
    if (j.customerPONumber) byCustPo.set(String(j.customerPONumber).trim().toUpperCase(), j);
  }

  type Match = { sheet: SheetRow; job: J; how: string };
  const matched: Match[] = [];
  const onlySheet: SheetRow[] = [];

  for (const row of sheetRows) {
    let found: J | null = null;
    let how = '';

    for (const v of jobNoVariants(row.sheetJob)) {
      const list = byJobNo.get(normalizeJobNo(v));
      if (!list?.length) continue;
      if (list.length === 1) {
        found = list[0];
        how = `jobNo:${v}`;
        break;
      }
      const cn = row.client.toLowerCase().slice(0, 5);
      const prefer = list.filter((j) => (j.Company?.name || '').toLowerCase().includes(cn));
      if (prefer.length === 1) {
        found = prefer[0];
        how = `jobNo+cust:${v}`;
        break;
      }
    }

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

    if (!found && row.bgePO) {
      const j = byBge.get(row.bgePO);
      if (j) {
        found = j;
        how = `bgePO:${row.bgePO}`;
      }
    }

    if (!found && row.customerPO) {
      const j = byCustPo.get(row.customerPO.toUpperCase());
      if (j) {
        found = j;
        how = `custPO:${row.customerPO}`;
      }
    }

    if (found) matched.push({ sheet: row, job: found, how });
    else onlySheet.push(row);
  }

  // dedupe by job id — last sheet row wins
  const byId = new Map<string, Match>();
  for (const m of matched) byId.set(m.job.id, m);

  // DB jobs for target customers not on sheet
  const matchedIds = new Set(byId.keys());
  const onlyApp = jobs.filter((j) => {
    if (matchedIds.has(j.id)) return false;
    const name = (j.Company?.name || '').toLowerCase();
    return TARGET.some((t) => name.includes(t));
  });

  const plan: { jobNo: string; how: string; changes: string[] }[] = [];
  let updated = 0;

  for (const m of byId.values()) {
    const { job, sheet, how } = m;
    const data: Record<string, unknown> = { updatedAt: new Date() };
    const changes: string[] = [];

    // Customer PO
    if (sheet.customerPO && sheet.customerPO !== (job.customerPONumber || '')) {
      data.customerPONumber = sheet.customerPO;
      changes.push(`custPO→${sheet.customerPO}`);
    }

    // BGE / Bradford PO
    if (sheet.bgePO && sheet.bgePO !== (job.partnerPONumber || '')) {
      data.partnerPONumber = sheet.bgePO;
      changes.push(`bgePO→${sheet.bgePO}`);
    }

    // Sell price if missing/zero
    if (sheet.inv > 0 && (!job.sellPrice || Number(job.sellPrice) === 0)) {
      data.sellPrice = sheet.inv;
      changes.push(`sell→${sheet.inv}`);
    }

    // Client paid
    if (sheet.clientPaid) {
      if (!job.customerPaymentDate) {
        data.customerPaymentDate = sheet.paidDate || defaultPaidAt;
        changes.push('clientPaid');
      }
      if (job.customerPaymentAmount == null && sheet.inv > 0) {
        data.customerPaymentAmount = sheet.inv;
        changes.push('clientAmt');
      }
    }

    // BGE paid (Impact production payee for Bradford paper)
    if (sheet.bgePaid) {
      if (!job.bradfordPaymentDate) {
        data.bradfordPaymentDate = defaultPaidAt;
        data.bradfordPaymentPaid = true;
        changes.push('bgePaid');
      }
      if (sheet.bgeAmt > 0 && job.bradfordPaymentAmount == null) {
        data.bradfordPaymentAmount = sheet.bgeAmt;
        changes.push('bgeAmt');
      }
    }

    // JD paid (Impact production payee for JD paper, or tracked)
    if (sheet.jdPaid) {
      if (!job.jdPaymentDate) {
        data.jdPaymentDate = defaultPaidAt;
        data.jdPaymentPaid = true;
        changes.push('jdPaid');
      }
      if (sheet.jdAmt > 0 && job.jdPaymentAmount == null) {
        data.jdPaymentAmount = sheet.jdAmt;
        changes.push('jdAmt');
      }
    }

    // Infer paper route from who got paid
    if (sheet.bgePaid && !sheet.jdPaid && job.paperSource !== 'BRADFORD') {
      // don't force if already set to VENDOR
      if (!job.paperSource || job.paperSource === 'BRADFORD') {
        /* keep */
      }
    }
    if (sheet.jdPaid && !sheet.bgePaid && !job.paperSource) {
      data.paperSource = 'VENDOR';
      changes.push('paperSource=VENDOR');
    }

    // Status: Impact production paid (BGE for Bradford, JD for JD paper)
    const impactPaid =
      (sheet.bgePaid || !!job.bradfordPaymentDate || !!data.bradfordPaymentDate) ||
      (sheet.jdPaid || !!job.jdPaymentDate || !!data.jdPaymentDate);
    if (sheet.clientPaid && impactPaid) {
      // Prefer BGE for Bradford route completion
      const prodDone = sheet.bgePaid || sheet.jdPaid;
      if (prodDone && job.status === 'ACTIVE') {
        // keep ACTIVE if still need the exclusive payee? if either paid, mark settled-ish
        if ((sheet.bgePaid || sheet.jdPaid) && job.status !== 'PAID') {
          // only set PAID if production payee done per exclusive rule
          const bgeDone = sheet.bgePaid || !!job.bradfordPaymentDate || !!data.bradfordPaymentDate;
          const jdDone = sheet.jdPaid || !!job.jdPaymentDate || !!data.jdPaymentDate;
          if (bgeDone || jdDone) {
            data.status = JobStatus.PAID;
            data.workflowStatus = JobWorkflowStatus.PAID;
            data.workflowStatusOverride = JobWorkflowStatus.PAID;
            changes.push('status=PAID');
          }
        }
      }
    } else if (sheet.clientPaid && !impactPaid) {
      // client paid, Impact still owes — leave ACTIVE for Work list
      if (
        job.workflowStatus !== 'COMPLETED' &&
        job.workflowStatus !== 'PAID' &&
        job.workflowStatus !== 'INVOICED'
      ) {
        data.workflowStatus = JobWorkflowStatus.COMPLETED;
        data.workflowStatusOverride = JobWorkflowStatus.COMPLETED;
        changes.push('wf=COMPLETED');
      }
    }

    if (changes.length) {
      plan.push({ jobNo: job.jobNo, how, changes });
      if (APPLY) {
        await prisma.job.update({ where: { id: job.id }, data: data as any });
        updated++;
      }
    }
  }

  console.log(`\nMatched unique jobs: ${byId.size}`);
  console.log(`Jobs with field updates: ${plan.length}${APPLY ? ` (applied ${updated})` : ''}`);
  console.log('\nSample updates (30):');
  for (const p of plan.slice(0, 30)) {
    console.log(`  ${p.jobNo} [${p.how}] ${p.changes.join(', ')}`);
  }

  const onlySheetTarget = onlySheet.filter((r) => isTargetCustomer(r.group, r.client));
  const onlySheetOther = onlySheet.filter((r) => !isTargetCustomer(r.group, r.client));

  console.log(`\n--- Only on SHEET (no DB match) total ${onlySheet.length} ---`);
  console.log(`  Target customers: ${onlySheetTarget.length}`);
  for (const r of onlySheetTarget) {
    console.log(
      `  ${r.sheetJob} | ${r.group}/${r.client} | custPO=${r.customerPO || '—'} bgePO=${r.bgePO || '—'} | C=${r.clientPaid ? 'Y' : 'N'} BGE=${r.bgePaid ? 'Y' : 'N'} JD=${r.jdPaid ? 'Y' : 'N'} | $${r.inv}`
    );
  }
  if (onlySheetOther.length) {
    console.log(`  Other (postage etc): ${onlySheetOther.length}`);
    for (const r of onlySheetOther.slice(0, 15)) {
      console.log(`  ${r.sheetJob} | ${r.group} | $${r.inv}`);
    }
  }

  console.log(`\n--- Only in APP (target customers, no sheet match) ${onlyApp.length} ---`);
  for (const j of onlyApp) {
    console.log(
      `  ${j.jobNo} | ${j.Company?.name} | custPO=${j.customerPONumber || '—'} bgePO=${j.partnerPONumber || '—'} | C=${j.customerPaymentDate ? 'Y' : 'N'} BGE=${j.bradfordPaymentDate ? 'Y' : 'N'} JD=${j.jdPaymentDate ? 'Y' : 'N'} | $${Number(j.sellPrice) || 0}`
    );
  }

  const report = {
    mode: APPLY ? 'APPLY' : 'DRY',
    matched: byId.size,
    updates: plan.length,
    onlySheetTarget,
    onlySheetOther: onlySheetOther.map((r) => ({ job: r.sheetJob, group: r.group, inv: r.inv })),
    onlyApp: onlyApp.map((j) => ({
      jobNo: j.jobNo,
      customer: j.Company?.name,
      sell: Number(j.sellPrice) || 0,
    })),
    plan,
  };
  const outPath = path.join(__dirname, `sync-impact-sheet-report-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  if (!APPLY) console.log('\nRe-run APPLY=1 to write.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
