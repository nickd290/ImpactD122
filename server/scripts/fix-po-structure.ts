/**
 * Fix PO Structure for BRADFORD_JD Jobs
 *
 * This script fixes inconsistent PO structures:
 * 1. Adds missing Impact→Bradford PO for jobs that only have Bradford→JD
 * 2. Fixes POs with NULL target company
 *
 * Run with:
 *   DATABASE_URL="postgresql://..." npx tsx server/scripts/fix-po-structure.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Company IDs (from database)
const COMPANY_IDS = {
  IMPACT_DIRECT: 'impact-direct',
  BRADFORD: 'bradford',
  JD_GRAPHIC: 'jd-graphic',
};

async function fixPOStructure() {
  console.log('Starting PO structure fix...\n');

  // Get all BRADFORD_JD jobs
  const jobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
      routingType: 'BRADFORD_JD',
    },
    include: {
      PurchaseOrder: {
        include: {
          Company_PurchaseOrder_originCompanyIdToCompany: true,
          Company_PurchaseOrder_targetCompanyIdToCompany: true,
        },
      },
    },
  });

  console.log(`Found ${jobs.length} BRADFORD_JD jobs\n`);

  let missingPOsAdded = 0;
  let nullTargetsFixed = 0;
  let errors = 0;

  for (const job of jobs) {
    const pos = job.PurchaseOrder;

    // Check for POs by type
    const impactToBradfordPO = pos.find(
      (po) =>
        po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT &&
        po.targetCompanyId === COMPANY_IDS.BRADFORD
    );
    const bradfordToJDPO = pos.find(
      (po) =>
        po.originCompanyId === COMPANY_IDS.BRADFORD &&
        po.targetCompanyId === COMPANY_IDS.JD_GRAPHIC
    );
    const impactWithNullTarget = pos.find(
      (po) =>
        po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT && !po.targetCompanyId
    );
    const bradfordWithNullTarget = pos.find(
      (po) => po.originCompanyId === COMPANY_IDS.BRADFORD && !po.targetCompanyId
    );

    try {
      // Fix 1: If Impact→Bradford PO is missing but Bradford→JD exists
      if (!impactToBradfordPO && bradfordToJDPO) {
        console.log(`[${job.jobNo}] Adding missing Impact→Bradford PO`);

        await prisma.purchaseOrder.create({
          data: {
            id: randomUUID(),
            jobId: job.id,
            originCompanyId: COMPANY_IDS.IMPACT_DIRECT,
            targetCompanyId: COMPANY_IDS.BRADFORD,
            poNumber: `PO-${job.jobNo}-IB-${Date.now()}`,
            status: 'PENDING',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        missingPOsAdded++;
      }

      // Fix 2: If Impact PO has NULL target, set to Bradford
      if (impactWithNullTarget) {
        console.log(
          `[${job.jobNo}] Fixing Impact PO with NULL target → Bradford`
        );

        await prisma.purchaseOrder.update({
          where: { id: impactWithNullTarget.id },
          data: {
            targetCompanyId: COMPANY_IDS.BRADFORD,
            updatedAt: new Date(),
          },
        });
        nullTargetsFixed++;
      }

      // Fix 3: If Bradford PO has NULL target, set to JD Graphic
      if (bradfordWithNullTarget) {
        console.log(
          `[${job.jobNo}] Fixing Bradford PO with NULL target → JD Graphic`
        );

        await prisma.purchaseOrder.update({
          where: { id: bradfordWithNullTarget.id },
          data: {
            targetCompanyId: COMPANY_IDS.JD_GRAPHIC,
            updatedAt: new Date(),
          },
        });
        nullTargetsFixed++;
      }

      // Fix 4: If Bradford→JD PO is missing but Impact→Bradford exists, add it
      if (!bradfordToJDPO && impactToBradfordPO) {
        console.log(`[${job.jobNo}] Adding missing Bradford→JD PO`);

        await prisma.purchaseOrder.create({
          data: {
            id: randomUUID(),
            jobId: job.id,
            originCompanyId: COMPANY_IDS.BRADFORD,
            targetCompanyId: COMPANY_IDS.JD_GRAPHIC,
            poNumber: `PO-${job.jobNo}-BJ-${Date.now()}`,
            status: 'PENDING',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        missingPOsAdded++;
      }
    } catch (err) {
      console.error(`[${job.jobNo}] ERROR:`, err);
      errors++;
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Jobs processed: ${jobs.length}`);
  console.log(`Missing POs added: ${missingPOsAdded}`);
  console.log(`NULL targets fixed: ${nullTargetsFixed}`);
  console.log(`Errors: ${errors}`);
  console.log('========================================\n');

  // Verify final state
  console.log('Verifying final state...\n');

  const finalCheck = await prisma.$queryRaw`
    SELECT
      oc.name as origin,
      tc.name as target,
      COUNT(*)::int as count
    FROM "PurchaseOrder" po
    LEFT JOIN "Company" oc ON po."originCompanyId" = oc.id
    LEFT JOIN "Company" tc ON po."targetCompanyId" = tc.id
    JOIN "Job" j ON po."jobId" = j.id
    WHERE j."deletedAt" IS NULL
    GROUP BY oc.name, tc.name
    ORDER BY count DESC
  `;

  console.log('PO Distribution After Fix:');
  console.table(finalCheck);

  await prisma.$disconnect();
}

// Run the script
fixPOStructure()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
