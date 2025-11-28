/**
 * Paper Data Population Script
 *
 * This script back-fills paper data for existing jobs with standard sizes.
 * It looks up the size in the Bradford pricing table and populates:
 * - paperWeightPer1000
 * - paperCostCPM
 * - paperCostTotal
 * - paperChargedCPM
 * - paperChargedTotal
 * - paperType
 * - specs JSON with paper details
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/populatePaperData.ts
 */

import { PrismaClient } from '@prisma/client';
import { getSelfMailerPricing, normalizeSize } from '../src/utils/bradfordPricing';
import { calculateTierPricing } from '../src/services/pricingService';
import type { PaperSource } from '../src/services/pricingService';

const prisma = new PrismaClient();

interface PopulationResult {
  jobId: string;
  jobNo: string;
  sizeName: string | null;
  success: boolean;
  error?: string;
  paperData?: {
    paperWeightPer1000: number;
    paperCostCPM: number;
    paperCostTotal: number;
    paperChargedCPM: number;
    paperChargedTotal: number;
  };
}

async function populateJobPaperData(job: any): Promise<PopulationResult> {
  try {
    // Skip if no size name
    if (!job.sizeName) {
      return {
        jobId: job.id,
        jobNo: job.jobNo,
        sizeName: null,
        success: false,
        error: 'No size name set',
      };
    }

    // Try to get pricing for this size
    const pricing = getSelfMailerPricing(job.sizeName);
    if (!pricing) {
      return {
        jobId: job.id,
        jobNo: job.jobNo,
        sizeName: job.sizeName,
        success: false,
        error: `Not a standard size: ${job.sizeName}`,
      };
    }

    // Skip if paper data is already populated
    if (job.paperWeightPer1000 && Number(job.paperWeightPer1000) > 0) {
      return {
        jobId: job.id,
        jobNo: job.jobNo,
        sizeName: job.sizeName,
        success: false,
        error: 'Paper data already populated',
      };
    }

    const quantity = job.quantity || 0;
    const paperSource = (job.paperSource || 'BRADFORD') as PaperSource;

    // Calculate tier pricing to get totals
    let paperCostTotal = 0;
    let paperChargedTotal = 0;

    if (quantity > 0) {
      const tierPricing = calculateTierPricing({
        sizeName: job.sizeName,
        quantity,
        paperSource,
      });
      paperCostTotal = tierPricing.tier1.paperTotal;
      paperChargedTotal = tierPricing.tier2.paperTotal;
    } else {
      // For jobs without quantity, use CPM values
      paperCostTotal = pricing.paperCPM;
      paperChargedTotal = pricing.paperSellCPM;
    }

    // Build updated specs
    const currentSpecs = (job.specs as any) || {};
    const updatedSpecs = {
      ...currentSpecs,
      paperLbsPerM: pricing.paperLbsPerM,
      paperCostPerLb: pricing.paperCostPerLb,
      paperType: 'Bradford 70# Uncoated',
      isStandardSize: true,
    };

    // Update the job
    await prisma.job.update({
      where: { id: job.id },
      data: {
        paperWeightPer1000: pricing.paperLbsPerM,
        paperCostCPM: pricing.paperCPM,
        paperCostTotal,
        paperChargedCPM: pricing.paperSellCPM,
        paperChargedTotal,
        paperType: 'Bradford 70# Uncoated',
        specs: updatedSpecs,
        updatedAt: new Date(),
      },
    });

    return {
      jobId: job.id,
      jobNo: job.jobNo,
      sizeName: job.sizeName,
      success: true,
      paperData: {
        paperWeightPer1000: pricing.paperLbsPerM,
        paperCostCPM: pricing.paperCPM,
        paperCostTotal,
        paperChargedCPM: pricing.paperSellCPM,
        paperChargedTotal,
      },
    };
  } catch (error) {
    return {
      jobId: job.id,
      jobNo: job.jobNo,
      sizeName: job.sizeName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('========================================');
  console.log('Paper Data Population Script');
  console.log('========================================\n');

  // Get all active jobs
  const jobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      jobNo: true,
      sizeName: true,
      quantity: true,
      paperSource: true,
      paperWeightPer1000: true,
      paperCostCPM: true,
      paperCostTotal: true,
      paperChargedCPM: true,
      paperChargedTotal: true,
      specs: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  console.log(`Found ${jobs.length} total jobs\n`);

  // Filter to jobs with sizeName
  const jobsWithSize = jobs.filter(j => j.sizeName);
  console.log(`Jobs with sizeName: ${jobsWithSize.length}`);

  // Filter to jobs with standard sizes
  const standardSizeJobs = jobsWithSize.filter(j => getSelfMailerPricing(j.sizeName!));
  console.log(`Jobs with standard sizes: ${standardSizeJobs.length}`);

  // Filter to jobs that need population
  const needsPopulation = standardSizeJobs.filter(j => !j.paperWeightPer1000 || Number(j.paperWeightPer1000) === 0);
  console.log(`Jobs needing paper data population: ${needsPopulation.length}\n`);

  if (needsPopulation.length === 0) {
    console.log('No jobs need paper data population. All done!');
    return;
  }

  console.log('Processing jobs...\n');

  const results: PopulationResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const job of needsPopulation) {
    const result = await populateJobPaperData(job);
    results.push(result);

    if (result.success) {
      successCount++;
      console.log(`✓ ${result.jobNo} - ${result.sizeName}`);
      if (result.paperData) {
        console.log(`    Weight: ${result.paperData.paperWeightPer1000} lbs/M`);
        console.log(`    Paper Cost: $${result.paperData.paperCostTotal.toFixed(2)}`);
        console.log(`    Paper Charged: $${result.paperData.paperChargedTotal.toFixed(2)}`);
      }
    } else {
      errorCount++;
      console.log(`✗ ${result.jobNo} - ${result.error}`);
    }
  }

  console.log('\n========================================');
  console.log('Population Summary');
  console.log('========================================');
  console.log(`Total processed: ${needsPopulation.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Skipped/Errors: ${errorCount}`);
  console.log('========================================\n');

  // Summary by size
  const successfulBySize = results
    .filter(r => r.success)
    .reduce((acc, r) => {
      const size = r.sizeName || 'Unknown';
      acc[size] = (acc[size] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  if (Object.keys(successfulBySize).length > 0) {
    console.log('Populated by Size:');
    for (const [size, count] of Object.entries(successfulBySize)) {
      console.log(`  ${size}: ${count} jobs`);
    }
  }
}

main()
  .catch((error) => {
    console.error('Population script failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
