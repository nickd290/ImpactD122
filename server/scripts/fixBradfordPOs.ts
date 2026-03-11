/**
 * Fix Bradford PO Data Gaps
 *
 * This script fixes incorrect or missing PurchaseOrder records for BRADFORD_JD jobs:
 *
 * Problem:
 * - Some BRADFORD_JD jobs have vendor POs (targetVendorId pointing to ThreeZ) instead of company POs
 * - Some jobs are missing Impact→Bradford and/or Bradford→JD POs entirely
 *
 * Solution:
 * 1. Delete any vendor POs on BRADFORD_JD jobs (incorrect structure)
 * 2. Create missing Impact→Bradford POs with proper pricing
 * 3. Create missing Bradford→JD POs with proper pricing
 *
 * Expected PO structure for BRADFORD_JD jobs:
 * - PO-{jobNo}-IB-*: Impact→Bradford (tracks what Impact pays Bradford)
 * - PO-{jobNo}-BJ-*: Bradford→JD (tracks internal Bradford costs)
 *
 * Run with:
 *   cd /Users/nicholasdeblasio/impact-direct/server
 *   DATABASE_URL="postgresql://..." npx ts-node scripts/fixBradfordPOs.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Company IDs
const COMPANY_IDS = {
  IMPACT_DIRECT: 'impact-direct',
  BRADFORD: 'bradford',
  JD_GRAPHIC: 'jd-graphic',
};

// Self-Mailer Pricing Table (from bradfordPricing.ts)
const SELF_MAILER_PRICING: Record<string, {
  printCPM: number;
  paperCPM: number;
  paperSellCPM: number;
  bradfordPrintCPM: number;
  bradfordTotalCPM: number;
}> = {
  '7 1/4 x 16 3/8': {
    printCPM: 34.74,
    paperCPM: 15.46,
    paperSellCPM: 18.55,
    bradfordPrintCPM: 49.01,
    bradfordTotalCPM: 67.56,
  },
  '8 1/2 x 17 1/2': {
    printCPM: 38.41,
    paperCPM: 20.36,
    paperSellCPM: 24.43,
    bradfordPrintCPM: 56.57,
    bradfordTotalCPM: 81.00,
  },
  '9 3/4 x 22 1/8': {
    printCPM: 49.18,
    paperCPM: 35.76,
    paperSellCPM: 42.91,
    bradfordPrintCPM: 64.00,
    bradfordTotalCPM: 106.91,
  },
  '9 3/4 x 26': {
    printCPM: 49.18,
    paperCPM: 36.91,
    paperSellCPM: 48.60,
    bradfordPrintCPM: 64.00,
    bradfordTotalCPM: 112.60,
  },
  '6 x 9': {
    printCPM: 10.00,
    paperCPM: 13.60,
    paperSellCPM: 16.32,
    bradfordPrintCPM: 18.38,
    bradfordTotalCPM: 34.70,
  },
  '6 x 11': {
    printCPM: 10.00,
    paperCPM: 15.90,
    paperSellCPM: 19.08,
    bradfordPrintCPM: 18.38,
    bradfordTotalCPM: 37.46,
  },
};

// Normalize size string to standard format
function normalizeSize(size: string): string {
  if (!size) return '';

  let normalized = size.trim().replace(/\s*x\s*/gi, ' x ');
  const parts = normalized.split(' x ');
  if (parts.length !== 2) return size;

  const dim1 = decimalToFraction(parts[0].trim());
  const dim2 = decimalToFraction(parts[1].trim());

  const val1 = parseDimension(parts[0].trim());
  const val2 = parseDimension(parts[1].trim());

  if (val1 <= val2) {
    return `${dim1} x ${dim2}`;
  } else {
    return `${dim2} x ${dim1}`;
  }
}

function decimalToFraction(dim: string): string {
  if (dim.includes('/')) return dim;

  const num = parseFloat(dim);
  if (isNaN(num)) return dim;

  const whole = Math.floor(num);
  const decimal = num - whole;

  const fractions: { [key: number]: string } = {
    0.125: '1/8',
    0.25: '1/4',
    0.375: '3/8',
    0.5: '1/2',
    0.625: '5/8',
    0.75: '3/4',
    0.875: '7/8',
  };

  for (const [dec, frac] of Object.entries(fractions)) {
    if (Math.abs(decimal - parseFloat(dec)) < 0.01) {
      return whole > 0 ? `${whole} ${frac}` : frac;
    }
  }

  return dim;
}

function parseDimension(dim: string): number {
  const fractionMatch = dim.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const whole = parseInt(fractionMatch[1]);
    const numerator = parseInt(fractionMatch[2]);
    const denominator = parseInt(fractionMatch[3]);
    return whole + numerator / denominator;
  }

  const pureFractionMatch = dim.match(/^(\d+)\/(\d+)$/);
  if (pureFractionMatch) {
    const numerator = parseInt(pureFractionMatch[1]);
    const denominator = parseInt(pureFractionMatch[2]);
    return numerator / denominator;
  }

  return parseFloat(dim) || 0;
}

function getSelfMailerPricing(size: string) {
  const normalized = normalizeSize(size);
  return SELF_MAILER_PRICING[normalized] || null;
}

// Stats tracking
interface Stats {
  jobsProcessed: number;
  vendorPOsDeleted: number;
  impactBradfordPOsCreated: number;
  bradfordJDPOsCreated: number;
  jobsSkipped: number;
  errors: string[];
}

async function fixBradfordPOs() {
  console.log('='.repeat(60));
  console.log('FIX BRADFORD PO DATA GAPS');
  console.log('='.repeat(60));
  console.log();

  const stats: Stats = {
    jobsProcessed: 0,
    vendorPOsDeleted: 0,
    impactBradfordPOsCreated: 0,
    bradfordJDPOsCreated: 0,
    jobsSkipped: 0,
    errors: [],
  };

  // Step 1: Get all BRADFORD_JD jobs
  const jobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
      routingType: 'BRADFORD_JD',
    },
    include: {
      PurchaseOrder: true,
    },
    orderBy: {
      jobNo: 'asc',
    },
  });

  console.log(`Found ${jobs.length} BRADFORD_JD jobs\n`);

  // Pre-audit: Show current state
  console.log('PRE-FIX AUDIT');
  console.log('-'.repeat(40));

  const vendorPOCount = jobs.reduce((sum, j) =>
    sum + j.PurchaseOrder.filter(po => po.targetVendorId).length, 0);
  const impactBradfordCount = jobs.reduce((sum, j) =>
    sum + j.PurchaseOrder.filter(po =>
      po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT &&
      po.targetCompanyId === COMPANY_IDS.BRADFORD
    ).length, 0);
  const bradfordJDCount = jobs.reduce((sum, j) =>
    sum + j.PurchaseOrder.filter(po =>
      po.originCompanyId === COMPANY_IDS.BRADFORD &&
      po.targetCompanyId === COMPANY_IDS.JD_GRAPHIC
    ).length, 0);
  const jobsWithNoPOs = jobs.filter(j => j.PurchaseOrder.length === 0).length;

  console.log(`  Vendor POs (incorrect): ${vendorPOCount}`);
  console.log(`  Impact→Bradford POs: ${impactBradfordCount}`);
  console.log(`  Bradford→JD POs: ${bradfordJDCount}`);
  console.log(`  Jobs with no POs: ${jobsWithNoPOs}`);
  console.log();

  // Step 2: Process each job
  for (const job of jobs) {
    stats.jobsProcessed++;
    const pos = job.PurchaseOrder;

    console.log(`\n[${job.jobNo}] Processing...`);
    console.log(`  Size: ${job.sizeName || 'null'}, Qty: ${job.quantity}`);

    // Get pricing data
    const pricing = job.sizeName ? getSelfMailerPricing(job.sizeName) : null;
    const quantity = job.quantity || 0;
    const quantityInThousands = quantity / 1000;

    if (!pricing && !job.sellPrice) {
      console.log(`  ⚠️  No pricing data and no sellPrice - skipping PO creation`);
      stats.jobsSkipped++;
      continue;
    }

    // Step 2a: Delete vendor POs (incorrect structure)
    const vendorPOs = pos.filter(po => po.targetVendorId !== null);
    if (vendorPOs.length > 0) {
      console.log(`  Deleting ${vendorPOs.length} incorrect vendor PO(s)...`);
      for (const vpo of vendorPOs) {
        await prisma.purchaseOrder.delete({
          where: { id: vpo.id },
        });
        stats.vendorPOsDeleted++;
        console.log(`    - Deleted: ${vpo.poNumber}`);
      }
    }

    // Step 2b: Check for existing Impact→Bradford PO
    const hasImpactBradford = pos.some(po =>
      po.originCompanyId === COMPANY_IDS.IMPACT_DIRECT &&
      po.targetCompanyId === COMPANY_IDS.BRADFORD
    );

    // Step 2c: Check for existing Bradford→JD PO
    const hasBradfordJD = pos.some(po =>
      po.originCompanyId === COMPANY_IDS.BRADFORD &&
      po.targetCompanyId === COMPANY_IDS.JD_GRAPHIC
    );

    // Calculate costs
    let totalCost = 0;
    let paperCost = 0;
    let paperMarkup = 0;
    let printCost = 0;
    let printCPMRate = 0;
    let paperSellCPMRate = 0;

    if (pricing && quantity > 0) {
      // Use pricing table
      totalCost = Math.round(pricing.bradfordTotalCPM * quantityInThousands * 100) / 100;
      paperCost = Math.round(pricing.paperSellCPM * quantityInThousands * 100) / 100;
      paperMarkup = Math.round((pricing.paperSellCPM - pricing.paperCPM) * quantityInThousands * 100) / 100;
      printCost = Math.round(pricing.printCPM * quantityInThousands * 100) / 100;
      printCPMRate = pricing.printCPM;
      paperSellCPMRate = pricing.paperSellCPM;
    } else if (job.sellPrice) {
      // Fallback: estimate from sellPrice
      // Assume typical margin of ~30%
      const sellPriceNum = Number(job.sellPrice);
      totalCost = Math.round(sellPriceNum * 0.7 * 100) / 100;
      printCost = Math.round(totalCost * 0.6 * 100) / 100;
      paperCost = Math.round(totalCost * 0.4 * 100) / 100;
    }

    const timestamp = Date.now();

    // Step 2d: Create missing Impact→Bradford PO
    if (!hasImpactBradford) {
      try {
        await prisma.purchaseOrder.create({
          data: {
            id: randomUUID(),
            jobId: job.id,
            originCompanyId: COMPANY_IDS.IMPACT_DIRECT,
            targetCompanyId: COMPANY_IDS.BRADFORD,
            poNumber: `PO-${job.jobNo}-IB-${timestamp}`,
            description: `Impact to Bradford - ${job.sizeName || 'Custom'} x ${quantity}`,
            buyCost: totalCost,
            paperCost: paperCost,
            paperMarkup: paperMarkup,
            printCPM: printCPMRate,
            paperCPM: paperSellCPMRate,
            status: 'PENDING',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        stats.impactBradfordPOsCreated++;
        console.log(`  ✅ Created Impact→Bradford PO: buyCost=$${totalCost}, paper=$${paperCost}`);
      } catch (err) {
        const errMsg = `[${job.jobNo}] Failed to create Impact→Bradford PO: ${err}`;
        console.error(`  ❌ ${errMsg}`);
        stats.errors.push(errMsg);
      }
    } else {
      console.log(`  ✓ Impact→Bradford PO exists`);
    }

    // Step 2e: Create missing Bradford→JD PO
    if (!hasBradfordJD) {
      try {
        await prisma.purchaseOrder.create({
          data: {
            id: randomUUID(),
            jobId: job.id,
            originCompanyId: COMPANY_IDS.BRADFORD,
            targetCompanyId: COMPANY_IDS.JD_GRAPHIC,
            poNumber: `PO-${job.jobNo}-BJ-${timestamp}`,
            description: `Bradford to JD - ${job.sizeName || 'Custom'} x ${quantity}`,
            buyCost: printCost > 0 ? printCost : null,
            mfgCost: printCost > 0 ? printCost : null,
            printCPM: printCPMRate,
            status: 'PENDING',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        stats.bradfordJDPOsCreated++;
        console.log(`  ✅ Created Bradford→JD PO: printCost=$${printCost}`);
      } catch (err) {
        const errMsg = `[${job.jobNo}] Failed to create Bradford→JD PO: ${err}`;
        console.error(`  ❌ ${errMsg}`);
        stats.errors.push(errMsg);
      }
    } else {
      console.log(`  ✓ Bradford→JD PO exists`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Jobs processed: ${stats.jobsProcessed}`);
  console.log(`Jobs skipped (no pricing): ${stats.jobsSkipped}`);
  console.log(`Vendor POs deleted: ${stats.vendorPOsDeleted}`);
  console.log(`Impact→Bradford POs created: ${stats.impactBradfordPOsCreated}`);
  console.log(`Bradford→JD POs created: ${stats.bradfordJDPOsCreated}`);
  console.log(`Errors: ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    stats.errors.forEach(e => console.log(`  - ${e}`));
  }

  // Verification queries
  console.log('\n' + '='.repeat(60));
  console.log('POST-FIX VERIFICATION');
  console.log('='.repeat(60));

  // Query 1: Bradford→JD POs count
  const bradfordJDPOs = await prisma.purchaseOrder.count({
    where: {
      originCompanyId: COMPANY_IDS.BRADFORD,
      targetCompanyId: COMPANY_IDS.JD_GRAPHIC,
    },
  });
  console.log(`\nBradford→JD POs: ${bradfordJDPOs}`);

  // Query 2: Impact→Bradford POs count
  const impactBradfordPOs = await prisma.purchaseOrder.count({
    where: {
      originCompanyId: COMPANY_IDS.IMPACT_DIRECT,
      targetCompanyId: COMPANY_IDS.BRADFORD,
    },
  });
  console.log(`Impact→Bradford POs: ${impactBradfordPOs}`);

  // Query 3: BRADFORD_JD jobs without any POs
  const jobsWithoutPOs = await prisma.job.count({
    where: {
      deletedAt: null,
      routingType: 'BRADFORD_JD',
      PurchaseOrder: {
        none: {},
      },
    },
  });
  console.log(`BRADFORD_JD jobs without POs: ${jobsWithoutPOs}`);

  // Query 4: Vendor POs on BRADFORD_JD jobs
  const vendorPOsOnBradford = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*)::int as count
    FROM "PurchaseOrder" po
    JOIN "Job" j ON j.id = po."jobId"
    WHERE j."routingType" = 'BRADFORD_JD'
      AND j."deletedAt" IS NULL
      AND po."targetVendorId" IS NOT NULL
  `;
  console.log(`Vendor POs on BRADFORD_JD jobs: ${vendorPOsOnBradford[0]?.count || 0}`);

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

// Run the script
fixBradfordPOs()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
