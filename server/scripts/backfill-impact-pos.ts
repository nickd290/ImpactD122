/**
 * Backfill Impact→Bradford POs for Existing Jobs
 *
 * This script finds jobs that meet criteria for PO creation but don't have
 * an Impact→Bradford PO, and creates the missing POs.
 *
 * Criteria for PO creation:
 * 1. Quantity > 0
 * 2. Valid standard size (matches pricing table)
 * 3. Sell price > 0
 *
 * Run with:
 *   DATABASE_URL="postgresql://..." npx tsx server/scripts/backfill-impact-pos.ts
 *
 * Add --dry-run flag to preview without making changes:
 *   DATABASE_URL="postgresql://..." npx tsx server/scripts/backfill-impact-pos.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { getSelfMailerPricing } from '../src/utils/bradfordPricing';
import { calculateTierPricing, calculateProfitSplit, PaperSource } from '../src/services/pricingService';

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

interface JobForBackfill {
  id: string;
  number: string | null;
  jobNo: string | null;
  quantity: number | null;
  sizeName: string | null;
  sellPrice: any;
  paperSource: string | null;
  PurchaseOrder: Array<{
    id: string;
    originCompanyId: string | null;
    targetCompanyId: string | null;
  }>;
}

/**
 * Check if a job meets criteria for Impact→Bradford PO creation
 */
function canCreateImpactPO(job: JobForBackfill): { valid: boolean; reason?: string } {
  if (!job.quantity || job.quantity <= 0) {
    return { valid: false, reason: 'Missing or invalid quantity' };
  }
  if (!job.sizeName || !getSelfMailerPricing(job.sizeName)) {
    return { valid: false, reason: 'Invalid or missing standard size' };
  }
  const sellPrice = Number(job.sellPrice) || 0;
  if (sellPrice <= 0) {
    return { valid: false, reason: 'Missing or invalid sell price' };
  }
  return { valid: true };
}

/**
 * Check if job already has an Impact→Bradford PO
 */
function hasImpactPO(job: JobForBackfill): boolean {
  return job.PurchaseOrder.some(
    po => po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford'
  );
}

/**
 * Check if job already has a Bradford→JD PO
 */
function hasBradfordJDPO(job: JobForBackfill): boolean {
  return job.PurchaseOrder.some(
    po => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
  );
}

async function backfillImpactPOs() {
  console.log('='.repeat(60));
  console.log('Backfill Impact→Bradford POs for Existing Jobs');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}\n`);

  // Fetch all non-deleted jobs with their POs
  const jobs = await prisma.job.findMany({
    where: { deletedAt: null },
    include: { PurchaseOrder: true },
  }) as JobForBackfill[];

  console.log(`Found ${jobs.length} total jobs\n`);

  // Categorize jobs
  const qualifyingJobs: JobForBackfill[] = [];
  const alreadyHasPO: JobForBackfill[] = [];
  const doesNotQualify: Array<{ job: JobForBackfill; reason: string }> = [];

  for (const job of jobs) {
    const validation = canCreateImpactPO(job);
    const hasPO = hasImpactPO(job);

    if (hasPO) {
      alreadyHasPO.push(job);
    } else if (validation.valid) {
      qualifyingJobs.push(job);
    } else {
      doesNotQualify.push({ job, reason: validation.reason || 'Unknown' });
    }
  }

  console.log('Job Analysis:');
  console.log(`  - Already have Impact→Bradford PO: ${alreadyHasPO.length}`);
  console.log(`  - Qualify for PO creation: ${qualifyingJobs.length}`);
  console.log(`  - Do not qualify: ${doesNotQualify.length}`);
  console.log('');

  // Show breakdown of why jobs don't qualify
  if (doesNotQualify.length > 0) {
    const reasonCounts: Record<string, number> = {};
    for (const { reason } of doesNotQualify) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
    console.log('Jobs not qualifying breakdown:');
    for (const [reason, count] of Object.entries(reasonCounts)) {
      console.log(`  - ${reason}: ${count}`);
    }
    console.log('');
  }

  if (qualifyingJobs.length === 0) {
    console.log('No jobs need PO backfill. Exiting.');
    await prisma.$disconnect();
    return;
  }

  console.log('-'.repeat(60));
  console.log('Creating POs for qualifying jobs...\n');

  let created = 0;
  let errors = 0;

  for (const job of qualifyingJobs) {
    const jobNo = job.number || job.jobNo || job.id;
    const sellPrice = Number(job.sellPrice) || 0;

    try {
      // Calculate tier pricing
      const tierPricing = calculateTierPricing({
        sizeName: job.sizeName!,
        quantity: job.quantity!,
        paperSource: (job.paperSource || 'BRADFORD') as PaperSource,
      });

      const totalCost = tierPricing.tier2.totalCost;
      const paperCost = tierPricing.tier1.paperTotal;
      const paperMarkup = tierPricing.tier2.paperMarkup;
      const mfgCost = totalCost - paperMarkup - paperCost;
      const timestamp = Date.now();

      console.log(`[${jobNo}] size: ${job.sizeName}, qty: ${job.quantity}, sell: $${sellPrice.toFixed(2)}`);
      console.log(`         totalCost: $${totalCost.toFixed(2)}, paper: $${paperCost.toFixed(2)}, markup: $${paperMarkup.toFixed(2)}, mfg: $${mfgCost.toFixed(2)}`);

      if (!isDryRun) {
        // Create Impact→Bradford PO
        await prisma.purchaseOrder.create({
          data: {
            id: randomUUID(),
            jobId: job.id,
            originCompanyId: 'impact-direct',
            targetCompanyId: 'bradford',
            poNumber: `PO-${jobNo}-IB-${timestamp}`,
            description: 'Impact to Bradford',
            buyCost: totalCost,
            paperCost: paperCost,
            paperMarkup: paperMarkup,
            status: 'PENDING',
            updatedAt: new Date(),
          },
        });

        // Only create Bradford→JD PO if one doesn't already exist
        const hasBJPO = hasBradfordJDPO(job);
        if (!hasBJPO) {
          await prisma.purchaseOrder.create({
            data: {
              id: randomUUID(),
              jobId: job.id,
              originCompanyId: 'bradford',
              targetCompanyId: 'jd-graphic',
              poNumber: `PO-${jobNo}-BJ-${timestamp}`,
              description: 'Bradford to JD',
              buyCost: mfgCost > 0 ? mfgCost : null,
              mfgCost: mfgCost > 0 ? mfgCost : null,
              status: 'PENDING',
              updatedAt: new Date(),
            },
          });
        }

        // Update ProfitSplit record
        const split = calculateProfitSplit({
          sellPrice,
          totalCost,
          paperMarkup,
        });

        await prisma.profitSplit.upsert({
          where: { jobId: job.id },
          create: {
            jobId: job.id,
            sellPrice,
            totalCost,
            paperCost,
            paperMarkup,
            grossMargin: split.grossMargin,
            bradfordShare: split.bradfordTotal,
            impactShare: split.impactTotal,
            calculatedAt: new Date(),
          },
          update: {
            sellPrice,
            totalCost,
            paperCost,
            paperMarkup,
            grossMargin: split.grossMargin,
            bradfordShare: split.bradfordTotal,
            impactShare: split.impactTotal,
            calculatedAt: new Date(),
          },
        });

        console.log(`         -> Created 2 POs + ProfitSplit`);
      } else {
        console.log(`         -> [DRY RUN] Would create 2 POs + ProfitSplit`);
      }

      created++;
    } catch (err) {
      errors++;
      console.error(`[${jobNo}] ERROR:`, err);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total jobs analyzed: ${jobs.length}`);
  console.log(`Jobs already with Impact→Bradford PO: ${alreadyHasPO.length}`);
  console.log(`Jobs not qualifying: ${doesNotQualify.length}`);
  console.log(`Jobs ${isDryRun ? 'that would get' : 'that got'} POs created: ${created}`);
  console.log(`Errors: ${errors}`);
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log('\nThis was a DRY RUN. No changes were made.');
    console.log('Remove --dry-run flag to apply changes.');
  }

  await prisma.$disconnect();
}

// Run the script
backfillImpactPOs()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
