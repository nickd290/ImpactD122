/**
 * Recalculate All ProfitSplits
 *
 * This script recalculates ProfitSplit records for ALL jobs based on their
 * current sellPrice and PO costs.
 *
 * Run with:
 *   DATABASE_URL="postgresql://..." npx tsx server/scripts/recalculate-profit-splits.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function recalculateAllProfitSplits() {
  console.log('Starting ProfitSplit recalculation...\n');

  // 1. Fetch all non-deleted jobs with their PurchaseOrders
  const jobs = await prisma.job.findMany({
    where: { deletedAt: null },
    include: { PurchaseOrder: true },
  });

  console.log(`Found ${jobs.length} jobs to process\n`);

  let created = 0;
  let updated = 0;
  let errors = 0;

  // 2. For each job, calculate and upsert ProfitSplit
  for (const job of jobs) {
    try {
      const sellPrice = Number(job.sellPrice) || 0;

      // Sum costs from all POs
      const totalCost = job.PurchaseOrder.reduce(
        (sum, po) => sum + (Number(po.buyCost) || 0),
        0
      );
      const paperCost = job.PurchaseOrder.reduce(
        (sum, po) => sum + (Number(po.paperCost) || 0),
        0
      );
      const paperMarkup = job.PurchaseOrder.reduce(
        (sum, po) => sum + (Number(po.paperMarkup) || 0),
        0
      );

      // Calculate profit split (50/50 split + paper markup to Bradford)
      const grossMargin = sellPrice - totalCost;
      const bradfordShare = paperMarkup + (grossMargin * 0.5);
      const impactShare = grossMargin * 0.5;

      // Check if ProfitSplit already exists
      const existing = await prisma.profitSplit.findUnique({
        where: { jobId: job.id },
      });

      // Upsert ProfitSplit record
      await prisma.profitSplit.upsert({
        where: { jobId: job.id },
        create: {
          jobId: job.id,
          sellPrice,
          totalCost,
          paperCost,
          paperMarkup,
          grossMargin,
          bradfordShare,
          impactShare,
          calculatedAt: new Date(),
        },
        update: {
          sellPrice,
          totalCost,
          paperCost,
          paperMarkup,
          grossMargin,
          bradfordShare,
          impactShare,
          calculatedAt: new Date(),
        },
      });

      if (existing) {
        updated++;
      } else {
        created++;
      }

      // Log progress
      console.log(
        `[${job.jobNo}] sellPrice: $${sellPrice.toFixed(2)}, ` +
        `totalCost: $${totalCost.toFixed(2)}, ` +
        `grossMargin: $${grossMargin.toFixed(2)}, ` +
        `bradford: $${bradfordShare.toFixed(2)}, ` +
        `impact: $${impactShare.toFixed(2)} ` +
        `(${existing ? 'updated' : 'created'})`
      );
    } catch (err) {
      errors++;
      console.error(`[${job.jobNo}] ERROR:`, err);
    }
  }

  // 3. Print summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Total jobs processed: ${jobs.length}`);
  console.log(`ProfitSplits created: ${created}`);
  console.log(`ProfitSplits updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log('========================================\n');

  await prisma.$disconnect();
}

// Run the script
recalculateAllProfitSplits()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
