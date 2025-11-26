/**
 * Data Repair Script
 *
 * Clears all incorrect isDuplicate flags from jobs.
 * Run with: DATABASE_URL="..." npx tsx scripts/repair-job-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting data repair...\n');

  // 1. Clear all isDuplicate flags
  console.log('Clearing isDuplicate flags...');
  const duplicatesBefore = await prisma.job.count({
    where: { isDuplicate: true }
  });
  console.log(`  Found ${duplicatesBefore} jobs marked as duplicate`);

  if (duplicatesBefore > 0) {
    const result = await prisma.job.updateMany({
      where: { isDuplicate: true },
      data: { isDuplicate: false }
    });
    console.log(`  Cleared isDuplicate flag on ${result.count} jobs`);
  } else {
    console.log('  No duplicate flags to clear');
  }

  // 2. Summary of jobs with quantity = 1 (informational only)
  console.log('\n--- Jobs with quantity = 1 (for reference) ---');
  const jobsWithQty1 = await prisma.job.findMany({
    where: {
      lineItems: {
        some: {
          quantity: 1
        }
      }
    },
    select: {
      number: true,
      title: true,
      lineItems: {
        select: { quantity: true }
      }
    },
    take: 20
  });

  jobsWithQty1.forEach(job => {
    const totalQty = job.lineItems.reduce((sum, item) => sum + item.quantity, 0);
    console.log(`  ${job.number}: qty=${totalQty} - ${job.title.substring(0, 40)}`);
  });

  console.log('\nData repair complete!');
}

main()
  .catch((e) => {
    console.error('Error during repair:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
