/**
 * Fix STATUS_WORKFLOW_MATCH errors
 * Usage: npm run fix:status-workflow -- --limit=200 --apply
 */

import { PrismaClient, JobStatus, JobWorkflowStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface MismatchJob {
  id: string;
  jobNo: string;
  status: JobStatus;
  workflowStatus: JobWorkflowStatus;
  newWorkflowStatus: JobWorkflowStatus;
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 200;
  const apply = args.includes('--apply');

  console.log(
    `\n🔧 ${apply ? 'APPLYING' : 'DRY-RUN'}: Fix STATUS_WORKFLOW_MATCH\n`
  );

  // Find mismatched jobs
  const jobs = await prisma.job.findMany({
    where: {
      status: JobStatus.PAID,
      workflowStatus: {
        notIn: [JobWorkflowStatus.PAID, JobWorkflowStatus.INVOICED],
      },
    },
    select: {
      id: true,
      jobNo: true,
      status: true,
      workflowStatus: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  if (jobs.length === 0) {
    console.log('✅ No mismatches found. All jobs are consistent.\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${jobs.length} jobs with STATUS_WORKFLOW_MATCH errors:\n`);
  console.log('JobNo        | Old workflowStatus          | New workflowStatus');
  console.log(
    '─────────────|─────────────────────────────|────────────────────'
  );

  const toFix: MismatchJob[] = jobs.map((j) => ({
    ...j,
    newWorkflowStatus: JobWorkflowStatus.PAID, // Fix to PAID
  }));

  for (const job of toFix) {
    const padJobNo = job.jobNo.padEnd(12);
    const padOld = job.workflowStatus.padEnd(27);
    console.log(`${padJobNo} | ${padOld} | ${job.newWorkflowStatus}`);
  }

  console.log('');

  if (apply) {
    let updated = 0;
    for (const job of toFix) {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          workflowStatus: job.newWorkflowStatus,
          updatedAt: new Date(),
        },
      });
      updated++;
    }
    console.log(`✅ Updated ${updated} jobs.\n`);
  } else {
    console.log(
      `ℹ️  Dry-run complete. Run with --apply to update ${toFix.length} jobs.\n`
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
