/**
 * Update Bradford PO Numbers from Email Data
 *
 * This script populates the partnerPONumber field on jobs with
 * Bradford's actual PO numbers extracted from emails.
 *
 * Run with:
 *   cd /Users/nicholasdeblasio/impact-direct/server
 *   DATABASE_URL="postgresql://..." npx ts-node scripts/updateBradfordPONumbers.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Bradford PO mappings extracted from emails
const BRADFORD_PO_MAPPINGS: Record<string, string> = {
  // From "Purchase Order X from Bradford Exchange" emails
  'J-2025-642385': '1227440',
  'J-2025-401034': '1227439',
  'J-2025-616333': '1227437',
  'J-2025-522931': '1227436',
  'J-2025-889849': '1227438',
  'J-2025-653930': '1227430',
  'J-2025-619301': '1227431',
  'J-2025-704908': '1227429',
  'J-2025-574827': '1227424',
  'J-2025-121928': '1227428',
  'J-2025-223952': '1227427',
  'J-2025-308885': '1227426',
  'J-2025-496013': '1227425',
  'J-2025-710561': '1227421',
  'J-2025-646183': '1227422',
  'J-2025-314062': '1227419',
  'J-2025-216133': '1227320',
  'J-2025-119173': '1227409',
  'J-2028': '1227876',
  // From "BGE LTD Print Order" emails
  'J-2025-889851': '1227774',
  'J-2025-889852': '1227775',
  'J-2025-889853': '1227776',
  'J-2025-889855': '1227828',
  'J-2025-889859': '1227829',
  'J-2025-889861': '1227828',  // Shares PO with 889855
  'J-2025-889862': '1227809',
};

async function updateBradfordPONumbers() {
  console.log('='.repeat(60));
  console.log('UPDATE BRADFORD PO NUMBERS');
  console.log('='.repeat(60));
  console.log();

  let updated = 0;
  let notFound = 0;
  let alreadySet = 0;
  let errors = 0;

  for (const [jobNo, bradfordPO] of Object.entries(BRADFORD_PO_MAPPINGS)) {
    try {
      // Find the job
      const job = await prisma.job.findFirst({
        where: {
          jobNo,
          deletedAt: null,
        },
        select: {
          id: true,
          jobNo: true,
          partnerPONumber: true,
        },
      });

      if (!job) {
        console.log(`[${jobNo}] ❌ Job not found`);
        notFound++;
        continue;
      }

      if (job.partnerPONumber === bradfordPO) {
        console.log(`[${jobNo}] ✓ Already set to ${bradfordPO}`);
        alreadySet++;
        continue;
      }

      // Update the job
      await prisma.job.update({
        where: { id: job.id },
        data: {
          partnerPONumber: bradfordPO,
          updatedAt: new Date(),
        },
      });

      console.log(`[${jobNo}] ✅ Updated: ${job.partnerPONumber || 'null'} → ${bradfordPO}`);
      updated++;
    } catch (err) {
      console.error(`[${jobNo}] ❌ Error:`, err);
      errors++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Jobs updated: ${updated}`);
  console.log(`Already set: ${alreadySet}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total mappings: ${Object.keys(BRADFORD_PO_MAPPINGS).length}`);

  // Verify: Show BRADFORD_JD jobs still missing Bradford PO
  console.log('\n' + '='.repeat(60));
  console.log('BRADFORD_JD JOBS STILL MISSING BRADFORD PO');
  console.log('='.repeat(60));

  const jobsMissingPO = await prisma.job.findMany({
    where: {
      deletedAt: null,
      routingType: 'BRADFORD_JD',
      OR: [
        { partnerPONumber: null },
        { partnerPONumber: '' },
      ],
    },
    select: {
      jobNo: true,
      title: true,
      createdAt: true,
    },
    orderBy: {
      jobNo: 'asc',
    },
  });

  if (jobsMissingPO.length === 0) {
    console.log('None! All BRADFORD_JD jobs have Bradford PO numbers.');
  } else {
    console.log(`Found ${jobsMissingPO.length} jobs still missing Bradford PO:`);
    for (const job of jobsMissingPO) {
      console.log(`  - ${job.jobNo}: ${job.title || 'No title'}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

// Run the script
updateBradfordPONumbers()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
