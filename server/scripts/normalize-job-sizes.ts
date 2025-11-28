/**
 * Normalize Job Sizes Migration Script
 *
 * This script normalizes all job sizeName values to standard format:
 * - Converts decimals to fractions (9.75 → "9 3/4")
 * - Normalizes spacing (8.5x11 → "8 1/2 x 11")
 * - Flips dimensions if needed (26 x 9.75 → "9 3/4 x 26")
 *
 * Run with:
 *   DATABASE_URL="postgresql://nicholasdeblasio@localhost:5432/impactd122" npx tsx server/scripts/normalize-job-sizes.ts
 */

import { PrismaClient } from '@prisma/client';
import { normalizeSize } from '../src/utils/bradfordPricing';

const prisma = new PrismaClient();

async function normalizeJobSizes() {
  console.log('Starting job size normalization...\n');

  // Get all jobs with sizeName
  const jobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
      sizeName: { not: null },
    },
    select: {
      id: true,
      jobNo: true,
      sizeName: true,
    },
  });

  console.log(`Found ${jobs.length} jobs with sizes\n`);

  let updated = 0;
  let unchanged = 0;
  const changes: Array<{ jobNo: string; before: string; after: string }> = [];

  for (const job of jobs) {
    const original = job.sizeName || '';
    const normalized = normalizeSize(original);

    if (original !== normalized) {
      // Update the job
      await prisma.job.update({
        where: { id: job.id },
        data: {
          sizeName: normalized,
          updatedAt: new Date(),
        },
      });

      changes.push({
        jobNo: job.jobNo,
        before: original,
        after: normalized,
      });
      updated++;
    } else {
      unchanged++;
    }
  }

  // Summary
  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Total jobs: ${jobs.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log('========================================\n');

  if (changes.length > 0) {
    console.log('Changes Made:');
    console.table(changes);
  }

  // Verify final state
  console.log('\nFinal Size Distribution:');
  const finalDistribution = await prisma.$queryRaw`
    SELECT "sizeName", COUNT(*)::int as count
    FROM "Job"
    WHERE "deletedAt" IS NULL AND "sizeName" IS NOT NULL
    GROUP BY "sizeName"
    ORDER BY count DESC
  `;
  console.table(finalDistribution);

  await prisma.$disconnect();
}

// Run the script
normalizeJobSizes()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
