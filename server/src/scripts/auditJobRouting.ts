/**
 * Audit Script: Job Routing Analysis
 *
 * READ-ONLY script to analyze jobs in the database and check:
 * - Routing type distribution (BRADFORD_JD vs IMPACT_JD vs THIRD_PARTY_VENDOR)
 * - PO structure correctness
 * - Profit split calculations
 *
 * Usage: npx tsx src/scripts/auditJobRouting.ts
 *
 * This script does NOT:
 * - Send any emails
 * - Modify any data
 * - Trigger any webhooks
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface JobAuditResult {
  jobNo: string;
  jobId: string;
  title: string;
  routingType: string | null;
  status: string;
  sellPrice: number;
  quantity: number;
  sizeName: string | null;

  // PO Analysis
  pos: {
    poNumber: string;
    origin: string | null;
    target: string | null;
    targetVendor: string | null;
    buyCost: number;
    type: string;
  }[];

  // Issues found
  issues: string[];

  // Profit split
  profitSplit: {
    bradfordShare: number;
    impactShare: number;
    grossMargin: number;
  } | null;
}

async function auditJobs(): Promise<void> {
  console.log('🔍 Starting Job Routing Audit (READ-ONLY)\n');
  console.log('='.repeat(60));

  // Fetch all active jobs with their POs and profit splits
  const jobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
    },
    include: {
      PurchaseOrder: true,
      ProfitSplit: true,
      Vendor: true,
      Company: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n📊 Total Jobs: ${jobs.length}\n`);

  // Stats counters
  const stats = {
    byRoutingType: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    withIssues: 0,
    missingPOs: 0,
    missingProfitSplit: 0,
    bradfordJDJobs: [] as JobAuditResult[],
    impactJDJobs: [] as JobAuditResult[],
    thirdPartyJobs: [] as JobAuditResult[],
    unknownRouting: [] as JobAuditResult[],
  };

  const results: JobAuditResult[] = [];

  for (const job of jobs) {
    const issues: string[] = [];
    const routingType = job.routingType || 'BRADFORD_JD'; // Default

    // Count by routing type
    stats.byRoutingType[routingType] = (stats.byRoutingType[routingType] || 0) + 1;
    stats.byStatus[job.status] = (stats.byStatus[job.status] || 0) + 1;

    // Analyze POs
    const pos = (job.PurchaseOrder || []).map((po: any) => {
      let type = 'unknown';

      if (po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford') {
        type = 'impact-bradford';
      } else if (po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic') {
        type = 'bradford-jd';
      } else if (po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'jd-graphic') {
        type = 'impact-jd';
      } else if (po.originCompanyId === 'impact-direct' && po.targetVendorId) {
        type = 'impact-vendor';
      }

      return {
        poNumber: po.poNumber,
        origin: po.originCompanyId,
        target: po.targetCompanyId,
        targetVendor: po.targetVendorId,
        buyCost: Number(po.buyCost) || 0,
        type,
      };
    });

    // Check PO structure based on routing type
    const hasImpactBradford = pos.some(p => p.type === 'impact-bradford');
    const hasBradfordJD = pos.some(p => p.type === 'bradford-jd');
    const hasImpactJD = pos.some(p => p.type === 'impact-jd');
    const hasImpactVendor = pos.some(p => p.type === 'impact-vendor');

    if (routingType === 'BRADFORD_JD') {
      if (!hasImpactBradford && !hasBradfordJD && pos.length === 0) {
        issues.push('Missing POs for BRADFORD_JD routing');
        stats.missingPOs++;
      } else if (!hasImpactBradford) {
        issues.push('Missing Impact→Bradford PO');
      } else if (!hasBradfordJD) {
        issues.push('Missing Bradford→JD PO');
      }
    } else if (routingType === 'IMPACT_JD') {
      if (!hasImpactJD && pos.length === 0) {
        issues.push('Missing Impact→JD PO for IMPACT_JD routing');
        stats.missingPOs++;
      }
      // Check for Bradford referral PO (optional but expected)
      const hasBradfordReferral = pos.some(p =>
        p.type === 'impact-bradford' &&
        (p.poNumber?.includes('-BR-') || p.buyCost < 1000) // Referral fees are usually smaller
      );
      if (!hasBradfordReferral && hasImpactJD) {
        issues.push('Missing Bradford referral fee PO');
      }
    } else if (routingType === 'THIRD_PARTY_VENDOR') {
      if (!hasImpactVendor && pos.length === 0) {
        issues.push('Missing Impact→Vendor PO for THIRD_PARTY_VENDOR routing');
        stats.missingPOs++;
      }
    }

    // Check profit split
    const profitSplit = job.ProfitSplit ? {
      bradfordShare: Number(job.ProfitSplit.bradfordShare) || 0,
      impactShare: Number(job.ProfitSplit.impactShare) || 0,
      grossMargin: Number(job.ProfitSplit.grossMargin) || 0,
    } : null;

    if (!profitSplit && (Number(job.sellPrice) > 0)) {
      issues.push('Missing ProfitSplit record');
      stats.missingProfitSplit++;
    }

    // Validate profit split ratios
    if (profitSplit && profitSplit.grossMargin > 0) {
      const totalShares = profitSplit.bradfordShare + profitSplit.impactShare;
      const bradfordRatio = profitSplit.bradfordShare / profitSplit.grossMargin;
      const impactRatio = profitSplit.impactShare / profitSplit.grossMargin;

      if (routingType === 'BRADFORD_JD') {
        // Should be ~50/50 (with some variance due to paper markup)
        if (bradfordRatio < 0.4 || bradfordRatio > 0.7) {
          issues.push(`Unexpected Bradford share ratio: ${(bradfordRatio * 100).toFixed(1)}% (expected ~50%)`);
        }
      } else if (routingType === 'IMPACT_JD' || routingType === 'THIRD_PARTY_VENDOR') {
        // Should be 35/65
        if (bradfordRatio < 0.3 || bradfordRatio > 0.4) {
          issues.push(`Unexpected Bradford share ratio: ${(bradfordRatio * 100).toFixed(1)}% (expected 35%)`);
        }
        if (impactRatio < 0.6 || impactRatio > 0.7) {
          issues.push(`Unexpected Impact share ratio: ${(impactRatio * 100).toFixed(1)}% (expected 65%)`);
        }
      }
    }

    const result: JobAuditResult = {
      jobNo: job.jobNo,
      jobId: job.id,
      title: job.title || '',
      routingType,
      status: job.status,
      sellPrice: Number(job.sellPrice) || 0,
      quantity: job.quantity || 0,
      sizeName: job.sizeName,
      pos,
      issues,
      profitSplit,
    };

    results.push(result);

    if (issues.length > 0) {
      stats.withIssues++;
    }

    // Categorize by routing type
    if (routingType === 'BRADFORD_JD') {
      stats.bradfordJDJobs.push(result);
    } else if (routingType === 'IMPACT_JD') {
      stats.impactJDJobs.push(result);
    } else if (routingType === 'THIRD_PARTY_VENDOR') {
      stats.thirdPartyJobs.push(result);
    } else {
      stats.unknownRouting.push(result);
    }
  }

  // Print Summary
  console.log('\n📈 ROUTING TYPE DISTRIBUTION');
  console.log('-'.repeat(40));
  for (const [type, count] of Object.entries(stats.byRoutingType)) {
    const pct = ((count / jobs.length) * 100).toFixed(1);
    console.log(`  ${type}: ${count} jobs (${pct}%)`);
  }

  console.log('\n📊 STATUS DISTRIBUTION');
  console.log('-'.repeat(40));
  for (const [status, count] of Object.entries(stats.byStatus)) {
    console.log(`  ${status}: ${count} jobs`);
  }

  console.log('\n⚠️  ISSUES SUMMARY');
  console.log('-'.repeat(40));
  console.log(`  Jobs with issues: ${stats.withIssues}`);
  console.log(`  Missing POs: ${stats.missingPOs}`);
  console.log(`  Missing ProfitSplit: ${stats.missingProfitSplit}`);

  // Print jobs with issues
  const jobsWithIssues = results.filter(r => r.issues.length > 0);
  if (jobsWithIssues.length > 0) {
    console.log('\n🔴 JOBS WITH ISSUES');
    console.log('='.repeat(60));

    for (const job of jobsWithIssues.slice(0, 20)) { // Limit to first 20
      console.log(`\n  ${job.jobNo} - ${job.title.substring(0, 40)}`);
      console.log(`    Routing: ${job.routingType} | Status: ${job.status}`);
      console.log(`    Sell: $${job.sellPrice.toFixed(2)} | Qty: ${job.quantity}`);
      console.log(`    POs: ${job.pos.map(p => p.type).join(', ') || 'none'}`);
      console.log(`    Issues:`);
      for (const issue of job.issues) {
        console.log(`      ❌ ${issue}`);
      }
    }

    if (jobsWithIssues.length > 20) {
      console.log(`\n  ... and ${jobsWithIssues.length - 20} more jobs with issues`);
    }
  }

  // Sample of each routing type
  console.log('\n\n📋 SAMPLE JOBS BY ROUTING TYPE');
  console.log('='.repeat(60));

  if (stats.bradfordJDJobs.length > 0) {
    console.log('\n🟢 BRADFORD_JD (Sample - first 3):');
    for (const job of stats.bradfordJDJobs.slice(0, 3)) {
      console.log(`  ${job.jobNo}: ${job.title.substring(0, 30)} | $${job.sellPrice.toFixed(2)}`);
      console.log(`    POs: ${job.pos.map(p => `${p.type}($${p.buyCost})`).join(', ')}`);
    }
  }

  if (stats.impactJDJobs.length > 0) {
    console.log('\n🔵 IMPACT_JD (Sample - first 3):');
    for (const job of stats.impactJDJobs.slice(0, 3)) {
      console.log(`  ${job.jobNo}: ${job.title.substring(0, 30)} | $${job.sellPrice.toFixed(2)}`);
      console.log(`    POs: ${job.pos.map(p => `${p.type}($${p.buyCost})`).join(', ')}`);
    }
  }

  if (stats.thirdPartyJobs.length > 0) {
    console.log('\n🟡 THIRD_PARTY_VENDOR (Sample - first 3):');
    for (const job of stats.thirdPartyJobs.slice(0, 3)) {
      console.log(`  ${job.jobNo}: ${job.title.substring(0, 30)} | $${job.sellPrice.toFixed(2)}`);
      console.log(`    POs: ${job.pos.map(p => `${p.type}($${p.buyCost})`).join(', ')}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Audit complete (READ-ONLY - no changes made)');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

// Run the audit
auditJobs().catch(async (e) => {
  console.error('❌ Audit failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
