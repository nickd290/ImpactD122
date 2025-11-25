import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  const totalJobs = await prisma.job.count();
  console.log(`\n✅ Total jobs in database: ${totalJobs}`);

  const jobs = await prisma.job.findMany({
    include: {
      customer: true,
      vendor: true,
      lineItems: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('\n📋 Most recent 5 jobs:');
  jobs.forEach(j => {
    console.log(`  • ${j.number}: ${j.title}`);
    console.log(`    Customer: ${j.customer.name}`);
    console.log(`    Vendor: ${j.vendor.name}`);
    console.log(`    Status: ${j.status}`);
    console.log(`    Line Items: ${j.lineItems.length}`);
    console.log('');
  });

  await prisma.$disconnect();
}

verify();
