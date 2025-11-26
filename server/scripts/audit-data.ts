import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditData() {
  console.log('🔍 Running Data Audit...\n');

  // Get total job count
  const totalJobs = await prisma.job.count();
  console.log(`📊 Total Jobs: ${totalJobs}`);

  // Jobs without line items
  const jobsWithoutLineItems = await prisma.job.findMany({
    where: {
      lineItems: {
        none: {}
      }
    },
    select: {
      id: true,
      number: true,
      title: true,
      customer: { select: { name: true } }
    }
  });
  console.log(`\n⚠️  Jobs WITHOUT Line Items: ${jobsWithoutLineItems.length}`);
  if (jobsWithoutLineItems.length > 0) {
    jobsWithoutLineItems.forEach(job => {
      console.log(`   - ${job.number}: ${job.title} (Customer: ${job.customer?.name})`);
    });
  }

  // Bradford jobs without financials
  const bradfordJobsWithoutFinancials = await prisma.job.findMany({
    where: {
      vendor: {
        isPartner: true
      },
      financials: null
    },
    select: {
      id: true,
      number: true,
      title: true,
      vendor: { select: { name: true } }
    }
  });
  console.log(`\n⚠️  Bradford Jobs WITHOUT Financials: ${bradfordJobsWithoutFinancials.length}`);
  if (bradfordJobsWithoutFinancials.length > 0) {
    bradfordJobsWithoutFinancials.forEach(job => {
      console.log(`   - ${job.number}: ${job.title} (Vendor: ${job.vendor?.name})`);
    });
  }

  // Jobs with zero pricing
  const jobsWithZeroPricing = await prisma.job.findMany({
    where: {
      lineItems: {
        some: {
          OR: [
            { unitPrice: 0 },
            { unitCost: 0 }
          ]
        }
      }
    },
    select: {
      id: true,
      number: true,
      title: true,
      lineItems: {
        where: {
          OR: [
            { unitPrice: 0 },
            { unitCost: 0 }
          ]
        },
        select: {
          description: true,
          unitCost: true,
          unitPrice: true
        }
      }
    }
  });
  console.log(`\n⚠️  Jobs with Zero Pricing: ${jobsWithZeroPricing.length}`);
  if (jobsWithZeroPricing.length > 0) {
    jobsWithZeroPricing.forEach(job => {
      console.log(`   - ${job.number}: ${job.title}`);
      job.lineItems.forEach(item => {
        console.log(`     • ${item.description}: Cost=$${item.unitCost}, Price=$${item.unitPrice}`);
      });
    });
  }

  // Jobs marked as duplicates
  const duplicateJobs = await prisma.job.findMany({
    where: {
      isDuplicate: true
    },
    select: {
      id: true,
      number: true,
      title: true,
      customerPONumber: true,
      customer: { select: { name: true } }
    }
  });
  console.log(`\n🔄 Jobs Marked as Duplicates: ${duplicateJobs.length}`);
  if (duplicateJobs.length > 0) {
    duplicateJobs.forEach(job => {
      console.log(`   - ${job.number}: ${job.title} (Customer: ${job.customer?.name}, PO: ${job.customerPONumber || 'N/A'})`);
    });
  }

  // Jobs without specs
  const jobsWithoutSpecs = await prisma.job.findMany({
    where: {
      specs: null
    },
    select: {
      id: true,
      number: true,
      title: true
    }
  });
  console.log(`\n⚠️  Jobs WITHOUT Specs: ${jobsWithoutSpecs.length}`);
  if (jobsWithoutSpecs.length > 0) {
    jobsWithoutSpecs.forEach(job => {
      console.log(`   - ${job.number}: ${job.title}`);
    });
  }

  // Summary
  console.log(`\n\n📋 Summary:`);
  console.log(`   Total Jobs: ${totalJobs}`);
  console.log(`   ⚠️  Incomplete Jobs: ${jobsWithoutLineItems.length + bradfordJobsWithoutFinancials.length + jobsWithZeroPricing.length + jobsWithoutSpecs.length}`);
  console.log(`   ✅ Complete Jobs: ${totalJobs - (jobsWithoutLineItems.length + bradfordJobsWithoutFinancials.length + jobsWithZeroPricing.length + jobsWithoutSpecs.length)}`);
  console.log(`   🔄 Duplicates: ${duplicateJobs.length}`);

  await prisma.$disconnect();
}

auditData().catch((e) => {
  console.error('Error running audit:', e);
  process.exit(1);
});
