/**
 * Bulk job validation script
 * Usage: npm run validate:jobs -- --limit=25
 */

import { PrismaClient } from '@prisma/client';
import { validateJob, ValidationResult } from '../domain/jobValidation';

const prisma = new PrismaClient();

async function main() {
  // Parse --limit arg (default 25)
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 25;

  console.log(`\n🔍 Validating ${limit} most recent jobs...\n`);

  // Get recent jobs
  const jobs = await prisma.job.findMany({
    select: { id: true, jobNo: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  console.log(`Found ${jobs.length} jobs to validate.\n`);

  // Run validations
  const results: ValidationResult[] = [];
  for (const job of jobs) {
    results.push(await validateJob(prisma, job.id));
  }

  // Aggregate by violation code
  const summary: Record<
    string,
    { count: number; severity: string; samples: string[] }
  > = {};
  let errorCount = 0;
  let warnCount = 0;

  for (const result of results) {
    for (const violation of result.violations) {
      if (!summary[violation.code]) {
        summary[violation.code] = {
          count: 0,
          severity: violation.severity,
          samples: [],
        };
      }
      summary[violation.code].count++;
      if (summary[violation.code].samples.length < 3) {
        // Get jobNo for readability
        const job = jobs.find((j) => j.id === result.jobId);
        summary[violation.code].samples.push(job?.jobNo || result.jobId);
      }
      if (violation.severity === 'ERROR') errorCount++;
      else warnCount++;
    }
  }

  // Print summary table
  console.log(
    '═══════════════════════════════════════════════════════════════'
  );
  console.log('VIOLATION SUMMARY');
  console.log(
    '═══════════════════════════════════════════════════════════════'
  );
  console.log('Code                          | Sev   | Count | Sample Jobs');
  console.log(
    '──────────────────────────────|───────|───────|─────────────────'
  );

  const codes = Object.keys(summary).sort(
    (a, b) => summary[b].count - summary[a].count
  );

  if (codes.length === 0) {
    console.log('(No violations found)');
  } else {
    for (const code of codes) {
      const s = summary[code];
      const padCode = code.padEnd(30);
      const padSev = s.severity.padEnd(5);
      const padCount = String(s.count).padStart(5);
      console.log(
        `${padCode}| ${padSev} | ${padCount} | ${s.samples.slice(0, 2).join(', ')}`
      );
    }
  }

  console.log(
    '═══════════════════════════════════════════════════════════════'
  );
  console.log(
    `Total: ${results.length} jobs | ${errorCount} ERRORs | ${warnCount} WARNs`
  );
  console.log(`OK: ${results.filter((r) => r.ok).length} jobs passed all checks`);
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  await prisma.$disconnect();

  // Exit non-zero only for ERRORs
  if (errorCount > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
