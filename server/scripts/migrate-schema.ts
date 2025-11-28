/**
 * Schema Migration Script
 *
 * This script:
 * 1. Migrates JobStatus: PENDING/IN_PRODUCTION/READY_FOR_PROOF/PROOF_APPROVED → ACTIVE, COMPLETED → PAID
 * 2. Migrates PO buyCost from vendorAmount where buyCost is null
 *
 * Run with: DATABASE_URL="postgresql://nicholasdeblasio@localhost:5432/impactd122" npx tsx server/scripts/migrate-schema.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting schema migration...\n');

  // Step 1: Backup current state
  console.log('=== Current State ===');
  const jobsByStatus = await prisma.$queryRaw`
    SELECT status, COUNT(*)::int as count
    FROM "Job"
    WHERE "deletedAt" IS NULL
    GROUP BY status
    ORDER BY status
  `;
  console.log('Jobs by status:', jobsByStatus);

  const poStats = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int as total,
      COUNT("buyCost")::int as has_buycost,
      COUNT("vendorAmount")::int as has_vendor_amount
    FROM "PurchaseOrder"
  `;
  console.log('PO stats:', poStats);

  // Step 2: Migrate PO buyCost from vendorAmount
  console.log('\n=== Migrating PO buyCost ===');
  const posToMigrate = await prisma.purchaseOrder.findMany({
    where: {
      buyCost: null,
      vendorAmount: { not: 0 }
    },
    select: { id: true, poNumber: true, vendorAmount: true }
  });

  console.log(`Found ${posToMigrate.length} POs to migrate buyCost from vendorAmount`);

  for (const po of posToMigrate) {
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { buyCost: po.vendorAmount }
    });
    console.log(`  Migrated PO ${po.poNumber || po.id}: vendorAmount ${po.vendorAmount} → buyCost`);
  }

  // Step 3: Migrate Job statuses
  // NOTE: This part needs to be run via raw SQL because we're changing enum values
  // The actual enum migration happens in the schema change
  console.log('\n=== Status Migration Preview ===');
  console.log('Current status mapping:');
  console.log('  PENDING → ACTIVE');
  console.log('  IN_PRODUCTION → ACTIVE');
  console.log('  READY_FOR_PROOF → ACTIVE');
  console.log('  PROOF_APPROVED → ACTIVE');
  console.log('  COMPLETED → PAID');
  console.log('  CANCELLED → CANCELLED');

  // Verify job financial fields are populated
  console.log('\n=== Financial Field Verification ===');
  const jobsWithoutSellPrice = await prisma.job.count({
    where: {
      deletedAt: null,
      sellPrice: null
    }
  });

  if (jobsWithoutSellPrice > 0) {
    console.log(`WARNING: ${jobsWithoutSellPrice} jobs have no sellPrice!`);
    const jobsMissing = await prisma.job.findMany({
      where: { deletedAt: null, sellPrice: null },
      select: { id: true, jobNo: true, customerTotal: true }
    });
    console.log('Jobs missing sellPrice:');
    for (const job of jobsMissing) {
      console.log(`  ${job.jobNo}: customerTotal = ${job.customerTotal}`);
    }
  } else {
    console.log('All jobs have sellPrice populated - ready for migration');
  }

  console.log('\n=== Migration Complete ===');
  console.log('Next steps:');
  console.log('1. Update schema.prisma to change JobStatus enum');
  console.log('2. Run: npx prisma db push');
  console.log('3. Update server and client code to use new statuses');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
