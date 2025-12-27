import { prisma } from './utils/prisma';

/**
 * Phase 3 Seed Script
 *
 * 1. Creates/updates internal company records (Impact Direct, Bradford, JD Graphic)
 * 2. Migrates legacy jdSuppliesPaper → paperSource
 */
async function seed() {
  console.log('🌱 Starting Phase 3 Schema Improvements...\n');

  // ============================================================================
  // STEP 1: Seed Internal Company Records
  // ============================================================================
  console.log('📦 Step 1: Seeding internal company records...');

  const internalCompanies = [
    {
      id: 'impact-direct',
      name: 'Impact Direct',
      email: 'brandon@impactdirectprinting.com',
      type: 'INTERNAL',
    },
    {
      id: 'bradford',
      name: 'Bradford Direct',
      email: 'steve.gustafson@bgeltd.com',
      type: 'INTERNAL',
    },
    {
      id: 'jd-graphic',
      name: 'JD Graphic',
      email: 'nick@jdgraphic.com',
      type: 'INTERNAL',
    },
  ];

  for (const company of internalCompanies) {
    const result = await prisma.company.upsert({
      where: { id: company.id },
      update: {
        name: company.name,
        email: company.email,
        type: company.type,
      },
      create: {
        id: company.id,
        name: company.name,
        email: company.email,
        type: company.type,
        updatedAt: new Date(),
      },
    });
    console.log(`   ✅ ${result.name} (${result.id})`);
  }

  // ============================================================================
  // STEP 2: Migrate jdSuppliesPaper → paperSource
  // ============================================================================
  console.log('\n📋 Step 2: Migrating jdSuppliesPaper → paperSource...');

  // Count jobs needing migration
  const jobsWithJdSuppliesPaperTrue = await prisma.job.count({
    where: { jdSuppliesPaper: true },
  });

  const jobsWithJdSuppliesPaperFalse = await prisma.job.count({
    where: {
      jdSuppliesPaper: false,
      paperSource: 'BRADFORD', // Only update those still on default
    },
  });

  console.log(`   Found ${jobsWithJdSuppliesPaperTrue} jobs with jdSuppliesPaper=true`);
  console.log(`   Found ${jobsWithJdSuppliesPaperFalse} jobs with jdSuppliesPaper=false`);

  // Migrate jdSuppliesPaper=true → paperSource=VENDOR
  if (jobsWithJdSuppliesPaperTrue > 0) {
    const vendorResult = await prisma.job.updateMany({
      where: { jdSuppliesPaper: true },
      data: { paperSource: 'VENDOR' },
    });
    console.log(`   ✅ Updated ${vendorResult.count} jobs to paperSource=VENDOR`);
  }

  // Ensure jdSuppliesPaper=false → paperSource=BRADFORD (should already be default)
  // This is mainly for verification
  const bradfordResult = await prisma.job.updateMany({
    where: { jdSuppliesPaper: false },
    data: { paperSource: 'BRADFORD' },
  });
  console.log(`   ✅ Confirmed ${bradfordResult.count} jobs have paperSource=BRADFORD`);

  // ============================================================================
  // VERIFICATION
  // ============================================================================
  console.log('\n🔍 Verification...');

  // Check companies exist
  const companies = await prisma.company.findMany({
    where: { id: { in: ['impact-direct', 'bradford', 'jd-graphic'] } },
    select: { id: true, name: true },
  });
  console.log(`   ✅ Internal companies: ${companies.map(c => c.name).join(', ')}`);

  // Check paperSource distribution
  const paperSourceStats = await prisma.job.groupBy({
    by: ['paperSource'],
    _count: { id: true },
  });
  console.log('   📊 Paper source distribution:');
  for (const stat of paperSourceStats) {
    console.log(`      - ${stat.paperSource}: ${stat._count.id} jobs`);
  }

  console.log('\n✅ Phase 3 seed complete!');
  console.log('   Next step: Remove jdSuppliesPaper from schema.prisma');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
