/**
 * Financial Migration Script
 *
 * This script migrates existing jobs to the new pricing model:
 * 1. Sets paperSource based on jdSuppliesPaper field
 * 2. Creates ProfitSplit records for all jobs with correct 50/50 calculations
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/migrateFinancials.ts
 */

import { PrismaClient } from '@prisma/client';
import { calculateProfitSplit, PAPER_MARKUP_PERCENT } from '../src/services/pricingService';

const prisma = new PrismaClient();

interface MigrationResult {
  jobId: string;
  jobNo: string;
  success: boolean;
  error?: string;
  paperSource?: string;
  profitSplit?: {
    sellPrice: number;
    totalCost: number;
    paperMarkup: number;
    bradfordShare: number;
    impactShare: number;
  };
}

async function migrateJob(job: any): Promise<MigrationResult> {
  try {
    // Determine paper source from legacy field
    let paperSource: 'BRADFORD' | 'VENDOR' | 'CUSTOMER' = 'BRADFORD';
    if (job.jdSuppliesPaper) {
      paperSource = 'VENDOR';
    }

    // Calculate sell price (use sellPrice, impactCustomerTotal, or customerTotal)
    const sellPrice = Number(job.sellPrice) ||
                      Number(job.impactCustomerTotal) ||
                      Number(job.customerTotal) || 0;

    // Calculate total cost from POs or legacy fields
    let totalCost = 0;
    let paperCost = 0;
    let paperMarkup = 0;

    if (job.PurchaseOrder && job.PurchaseOrder.length > 0) {
      // New model: sum from POs
      for (const po of job.PurchaseOrder) {
        totalCost += Number(po.buyCost) || Number(po.vendorAmount) || 0;
        if (po.paperCost) {
          paperCost += Number(po.paperCost);
        }
        if (po.paperMarkup) {
          paperMarkup += Number(po.paperMarkup);
        }
      }
    } else {
      // Legacy fallback: use job fields
      const bradfordTotal = Number(job.bradfordTotal) || 0;
      const jdTotal = Number(job.jdTotal) || 0;
      const paperCostTotal = Number(job.paperCostTotal) || 0;
      const paperChargedTotal = Number(job.paperChargedTotal) || 0;

      totalCost = bradfordTotal + jdTotal;
      paperCost = paperCostTotal;

      // Calculate paper markup if Bradford supplies paper
      if (paperSource === 'BRADFORD' && paperCostTotal > 0) {
        // If we have paperChargedTotal, use the difference
        if (paperChargedTotal > paperCostTotal) {
          paperMarkup = paperChargedTotal - paperCostTotal;
        } else {
          // Otherwise calculate 18%
          paperMarkup = paperCostTotal * PAPER_MARKUP_PERCENT;
        }
      }

      // Also try bradfordPaperMargin
      if (job.bradfordPaperMargin && Number(job.bradfordPaperMargin) > 0) {
        paperMarkup = Number(job.bradfordPaperMargin);
      }
    }

    // Calculate profit split using our service
    const split = calculateProfitSplit({
      sellPrice,
      totalCost,
      paperMarkup,
    });

    // Update job with paperSource
    await prisma.job.update({
      where: { id: job.id },
      data: {
        paperSource,
        updatedAt: new Date(),
      },
    });

    // Create or update ProfitSplit record
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

    return {
      jobId: job.id,
      jobNo: job.jobNo,
      success: true,
      paperSource,
      profitSplit: {
        sellPrice,
        totalCost,
        paperMarkup,
        bradfordShare: split.bradfordTotal,
        impactShare: split.impactTotal,
      },
    };
  } catch (error) {
    return {
      jobId: job.id,
      jobNo: job.jobNo,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('========================================');
  console.log('Financial Migration Script');
  console.log('========================================\n');

  // Get all jobs with their POs
  const jobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
    },
    include: {
      PurchaseOrder: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  console.log(`Found ${jobs.length} jobs to migrate\n`);

  const results: MigrationResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const job of jobs) {
    const result = await migrateJob(job);
    results.push(result);

    if (result.success) {
      successCount++;
      console.log(`✓ ${result.jobNo} - paperSource: ${result.paperSource}`);
      if (result.profitSplit) {
        console.log(`    Sell: $${result.profitSplit.sellPrice.toFixed(2)}, ` +
                    `Cost: $${result.profitSplit.totalCost.toFixed(2)}, ` +
                    `Paper Markup: $${result.profitSplit.paperMarkup.toFixed(2)}`);
        console.log(`    Bradford: $${result.profitSplit.bradfordShare.toFixed(2)}, ` +
                    `Impact: $${result.profitSplit.impactShare.toFixed(2)}`);
      }
    } else {
      errorCount++;
      console.log(`✗ ${result.jobNo} - ERROR: ${result.error}`);
    }
  }

  console.log('\n========================================');
  console.log('Migration Summary');
  console.log('========================================');
  console.log(`Total jobs: ${jobs.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log('========================================\n');

  // Print any errors
  if (errorCount > 0) {
    console.log('Failed jobs:');
    for (const result of results.filter(r => !r.success)) {
      console.log(`  - ${result.jobNo}: ${result.error}`);
    }
  }

  // Print summary statistics
  const profitSplits = results.filter(r => r.success && r.profitSplit);
  if (profitSplits.length > 0) {
    const totalSellPrice = profitSplits.reduce((sum, r) => sum + (r.profitSplit?.sellPrice || 0), 0);
    const totalBradfordShare = profitSplits.reduce((sum, r) => sum + (r.profitSplit?.bradfordShare || 0), 0);
    const totalImpactShare = profitSplits.reduce((sum, r) => sum + (r.profitSplit?.impactShare || 0), 0);

    console.log('\nAggregate Totals:');
    console.log(`  Total Sell Price: $${totalSellPrice.toFixed(2)}`);
    console.log(`  Total Bradford Share: $${totalBradfordShare.toFixed(2)}`);
    console.log(`  Total Impact Share: $${totalImpactShare.toFixed(2)}`);
  }

  // Count by paper source
  const byPaperSource = {
    BRADFORD: results.filter(r => r.paperSource === 'BRADFORD').length,
    VENDOR: results.filter(r => r.paperSource === 'VENDOR').length,
    CUSTOMER: results.filter(r => r.paperSource === 'CUSTOMER').length,
  };

  console.log('\nJobs by Paper Source:');
  console.log(`  BRADFORD (Bradford supplies): ${byPaperSource.BRADFORD}`);
  console.log(`  VENDOR (JD supplies): ${byPaperSource.VENDOR}`);
  console.log(`  CUSTOMER (Customer supplies): ${byPaperSource.CUSTOMER}`);
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
