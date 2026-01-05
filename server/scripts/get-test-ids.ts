/**
 * Get Test IDs Script
 *
 * Run with: npx ts-node scripts/get-test-ids.ts
 *
 * This queries the database to find valid customer and vendor IDs
 * for use in pathway verification tests.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n📋 Finding Test IDs for Pathway Verification\n');
  console.log('='.repeat(60));

  // Get customers
  const customers = await prisma.company.findMany({
    where: { type: 'CUSTOMER' },
    take: 5,
    select: { id: true, name: true },
  });

  console.log('\n🏢 CUSTOMERS (pick one for CUSTOMER_ID):');
  if (customers.length === 0) {
    console.log('  ❌ No customers found!');
  } else {
    customers.forEach((c) => {
      console.log(`  ${c.id}  →  ${c.name}`);
    });
  }

  // Get active vendors
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    take: 5,
    select: { id: true, name: true, vendorCode: true },
  });

  console.log('\n🏭 VENDORS (pick two for VENDOR_ID and VENDOR_ID_2):');
  if (vendors.length === 0) {
    console.log('  ❌ No active vendors found!');
  } else {
    vendors.forEach((v) => {
      console.log(`  ${v.id}  →  ${v.name} (code: ${v.vendorCode || 'none'})`);
    });
  }

  // Check MasterSequence status
  const masterSeq = await prisma.masterSequence.findUnique({
    where: { id: 'master-seq' },
  });

  console.log('\n🔢 MASTER SEQUENCE STATUS:');
  if (masterSeq) {
    console.log(`  Current value: ${masterSeq.currentValue}`);
    console.log(`  Next job will get: FJ-${masterSeq.currentValue + 1} (or similar type code)`);
  } else {
    console.log('  Not initialized yet - first job will get FJ-3001');
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📝 Copy one of each ID above to:');
  console.log('   server/src/constants/companies.ts → TEST_IDS\n');

  await prisma.$disconnect();
}

main().catch(console.error);
