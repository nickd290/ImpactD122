import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupData() {
  console.log('🧹 Running Data Cleanup...\n');

  // 1. Remove all duplicate badges
  const duplicateJobs = await prisma.job.updateMany({
    where: {
      isDuplicate: true
    },
    data: {
      isDuplicate: false
    }
  });
  console.log(`✅ Removed duplicate badges from ${duplicateJobs.count} jobs\n`);

  // 2. Fix jobs without line items by adding a default line item
  const jobsWithoutLineItems = await prisma.job.findMany({
    where: {
      lineItems: {
        none: {}
      }
    },
    select: {
      id: true,
      number: true,
      title: true
    }
  });

  console.log(`🔧 Found ${jobsWithoutLineItems.length} jobs without line items. Adding default line items...\n`);

  for (const job of jobsWithoutLineItems) {
    await prisma.lineItem.create({
      data: {
        jobId: job.id,
        description: job.title,
        quantity: 1,
        unitCost: 0,
        markupPercent: 20,
        unitPrice: 0,
        sortOrder: 0
      }
    });
    console.log(`   ✅ Added default line item to ${job.number}: ${job.title}`);
  }

  console.log(`\n✅ Cleanup Complete!`);
  console.log(`   - Removed ${duplicateJobs.count} duplicate badges`);
  console.log(`   - Fixed ${jobsWithoutLineItems.length} jobs without line items`);

  await prisma.$disconnect();
}

cleanupData().catch((e) => {
  console.error('Error running cleanup:', e);
  process.exit(1);
});
