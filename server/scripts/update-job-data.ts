/**
 * Update Job Data Script
 *
 * Updates jobs with missing data from email references.
 *
 * Usage:
 *   cd ~/impact-direct/server
 *   DATABASE_URL="postgresql://postgres:ZPixFndtyCnDPRtelwWtEQIgkGEkXRPl@hopper.proxy.rlwy.net:26498/railway" npx tsx scripts/update-job-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Job updates based on email research
// Add your mappings here as you identify them
const JOB_UPDATES: Array<{
  jobNo: string;
  title?: string;
  customerPONumber?: string;
  customerJobNumber?: string;
  description?: string;
  sizeName?: string;
  quantity?: number;
}> = [
  // ============ JJS&A Jobs ============
  {
    jobNo: 'J-2102',
    title: 'NW Limited Offer Postcard',
    customerPONumber: '44517',
    sizeName: '7x5 Flat',
    description: 'NW Limited offer postcard - 4c/4c',
  },
  {
    jobNo: 'J-2129',
    title: 'JJS&A Job',
    customerPONumber: '', // PO 44495 was cancelled
    description: 'Pending identification',
  },
  {
    jobNo: 'J-2128',
    title: 'JJS&A Job',
    description: 'Pending identification',
  },
  {
    jobNo: 'J-2103',
    title: 'JJS&A Job',
    description: 'Pending identification - $5050',
  },

  // ============ Lahlouh Jobs ============
  // Match by amount + date if possible
  {
    jobNo: 'J-2039',
    title: 'Three Z Mailing Job',
    description: 'Mailing job via Three Z vendor',
  },
  {
    jobNo: 'J-2080',
    title: 'Lahlouh Large Job',
    description: 'Large Lahlouh job - $45,847 - needs identification',
  },

  // ============ Ballantine Jobs ============
  {
    jobNo: 'J-2100',
    title: 'Ballantine Job',
    description: 'Large Ballantine job - $28,700 - needs identification',
  },
  {
    jobNo: 'J-2065',
    title: 'Ballantine Job',
    description: 'Ballantine job - $40,255.63 - needs identification',
  },

  // ============ Incremental Media Jobs ============
  // All 11 jobs have the same $2,025 amount - likely recurring jobs
  {
    jobNo: 'J-2078',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
  {
    jobNo: 'J-2077',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
  {
    jobNo: 'J-2076',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
  {
    jobNo: 'J-2075',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
  {
    jobNo: 'J-2074',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
  {
    jobNo: 'J-2073',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
  {
    jobNo: 'J-2072',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
  {
    jobNo: 'J-2071',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
  {
    jobNo: 'J-2070',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
  {
    jobNo: 'J-2069',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
  {
    jobNo: 'J-2068',
    title: 'Incremental Media Recurring',
    description: 'Recurring job - $2,025',
  },
];

async function updateJobs() {
  console.log('========================================');
  console.log('UPDATE JOB DATA FROM EMAIL RESEARCH');
  console.log('========================================\n');

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const jobUpdate of JOB_UPDATES) {
    const job = await prisma.job.findUnique({
      where: { jobNo: jobUpdate.jobNo },
      select: { id: true, jobNo: true, title: true },
    });

    if (!job) {
      console.log(`❌ Not found: ${jobUpdate.jobNo}`);
      notFound++;
      continue;
    }

    // Build update data
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (jobUpdate.title) updateData.title = jobUpdate.title;
    if (jobUpdate.customerPONumber !== undefined) updateData.customerPONumber = jobUpdate.customerPONumber;
    if (jobUpdate.customerJobNumber) updateData.customerJobNumber = jobUpdate.customerJobNumber;
    if (jobUpdate.description) updateData.description = jobUpdate.description;
    if (jobUpdate.sizeName) updateData.sizeName = jobUpdate.sizeName;
    if (jobUpdate.quantity) updateData.quantity = jobUpdate.quantity;

    try {
      await prisma.job.update({
        where: { id: job.id },
        data: updateData,
      });
      console.log(`✅ Updated: ${jobUpdate.jobNo} - ${jobUpdate.title || '(no title)'}`);
      updated++;
    } catch (err: any) {
      console.log(`⚠️ Error updating ${jobUpdate.jobNo}: ${err.message}`);
      skipped++;
    }
  }

  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${skipped}`);
  console.log('========================================\n');
}

async function main() {
  await updateJobs();
  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
