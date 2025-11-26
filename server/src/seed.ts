import { prisma } from './utils/prisma';

async function seed() {
  console.log('🌱 Seed script - Production uses existing data');
  console.log('ℹ️  This seed script is disabled for production schema');
  console.log('✅ Database already contains data');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
