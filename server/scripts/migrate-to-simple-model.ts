/**
 * Migration Script: Convert to Simplified Brokerage Model
 *
 * This script:
 * 1. Populates sellPrice on Jobs from existing impactCustomerTotal/customerTotal
 * 2. Creates PurchaseOrders with buyCost from existing Bradford fields
 * 3. Preserves all existing data while setting up the new simplified model
 *
 * Run with: DATABASE_URL="postgresql://..." npx tsx scripts/migrate-to-simple-model.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationStats {
  jobsProcessed: number;
  jobsWithSellPrice: number;
  posCreated: number;
  posUpdated: number;
  errors: string[];
}

async function generatePONumber(): Promise<string> {
  const lastPO = await prisma.purchaseOrder.findFirst({
    where: {
      poNumber: {
        startsWith: 'PO-'
      }
    },
    orderBy: {
      poNumber: 'desc'
    }
  });

  if (lastPO?.poNumber) {
    const match = lastPO.poNumber.match(/PO-(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1]) + 1;
      return `PO-${nextNum.toString().padStart(4, '0')}`;
    }
  }
  return 'PO-0001';
}

async function migrateJobs(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    jobsProcessed: 0,
    jobsWithSellPrice: 0,
    posCreated: 0,
    posUpdated: 0,
    errors: []
  };

  console.log('Starting migration to simplified brokerage model...\n');

  // Get all jobs with their existing POs and vendor
  const jobs = await prisma.job.findMany({
    where: { deletedAt: null },
    include: {
      Vendor: true,
      PurchaseOrder: true
    }
  });

  console.log(`Found ${jobs.length} jobs to process\n`);

  for (const job of jobs) {
    try {
      stats.jobsProcessed++;

      // 1. Set sellPrice from existing customer total fields
      const sellPrice = job.impactCustomerTotal || job.customerTotal || null;

      if (sellPrice && !job.sellPrice) {
        await prisma.job.update({
          where: { id: job.id },
          data: { sellPrice }
        });
        stats.jobsWithSellPrice++;
        console.log(`[${job.jobNo}] Set sellPrice: $${sellPrice}`);
      }

      // 2. Calculate vendor cost from Bradford fields
      const bradfordTotal = Number(job.bradfordTotal) || 0;
      const jdTotal = Number(job.jdTotal) || 0;
      const paperMarkup = Number(job.bradfordPaperMargin) || 0; // This is the 18% markup
      const paperCost = Number(job.paperCostTotal) || 0;

      // Total buy cost = what we pay Bradford (includes JD pass-through and paper with markup)
      const totalBuyCost = bradfordTotal + jdTotal;

      // 3. Check if job has a vendor and existing POs
      if (job.vendorId && totalBuyCost > 0) {
        // Check if there's already a PO for this job
        const existingPO = job.PurchaseOrder.find(po => po.jobId === job.id);

        if (existingPO) {
          // Update existing PO with new simplified fields if not already set
          if (!existingPO.buyCost) {
            await prisma.purchaseOrder.update({
              where: { id: existingPO.id },
              data: {
                buyCost: totalBuyCost,
                description: 'Migrated from legacy data',
                paperCost: paperCost > 0 ? paperCost : null,
                paperMarkup: paperMarkup > 0 ? paperMarkup : null,
                mfgCost: jdTotal > 0 ? jdTotal : null,
              }
            });
            stats.posUpdated++;
            console.log(`[${job.jobNo}] Updated PO with buyCost: $${totalBuyCost}`);
          }
        } else {
          // Create new PO with simplified fields
          const poNumber = await generatePONumber();

          // Determine status based on job status
          let poStatus: 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'PAID' = 'PENDING';
          if (job.status === 'COMPLETED') poStatus = 'COMPLETED';
          else if (job.status === 'IN_PRODUCTION') poStatus = 'IN_PROGRESS';

          // Get Impact company ID (origin company for PO)
          const impactCompany = await prisma.company.findFirst({
            where: {
              OR: [
                { name: { contains: 'Impact' } },
                { type: 'broker' }
              ]
            }
          });

          if (impactCompany) {
            await prisma.purchaseOrder.create({
              data: {
                id: crypto.randomUUID(),
                poNumber,
                jobId: job.id,
                originCompanyId: impactCompany.id,
                targetVendorId: job.vendorId,
                buyCost: totalBuyCost,
                description: 'Migrated from legacy Bradford data',
                paperCost: paperCost > 0 ? paperCost : null,
                paperMarkup: paperMarkup > 0 ? paperMarkup : null,
                mfgCost: jdTotal > 0 ? jdTotal : null,
                status: poStatus,
                originalAmount: totalBuyCost,
                vendorAmount: totalBuyCost,
                marginAmount: 0,
                updatedAt: new Date()
              }
            });
            stats.posCreated++;
            console.log(`[${job.jobNo}] Created PO ${poNumber} with buyCost: $${totalBuyCost}`);
          }
        }
      }

      // Log progress every 10 jobs
      if (stats.jobsProcessed % 10 === 0) {
        console.log(`\nProgress: ${stats.jobsProcessed}/${jobs.length} jobs processed\n`);
      }

    } catch (error) {
      const errorMsg = `Error processing job ${job.jobNo}: ${error}`;
      stats.errors.push(errorMsg);
      console.error(errorMsg);
    }
  }

  return stats;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Migration: Simplified Brokerage Model');
  console.log('='.repeat(60));
  console.log('');

  try {
    const stats = await migrateJobs();

    console.log('\n' + '='.repeat(60));
    console.log('Migration Complete!');
    console.log('='.repeat(60));
    console.log(`Jobs processed:     ${stats.jobsProcessed}`);
    console.log(`Jobs with sellPrice: ${stats.jobsWithSellPrice}`);
    console.log(`POs created:        ${stats.posCreated}`);
    console.log(`POs updated:        ${stats.posUpdated}`);

    if (stats.errors.length > 0) {
      console.log(`\nErrors (${stats.errors.length}):`);
      stats.errors.forEach(e => console.log(`  - ${e}`));
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
