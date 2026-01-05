/**
 * Sprint 1 Verification Script
 *
 * Run with: npx ts-node scripts/verify-sprint1.ts
 *
 * Tests:
 * 1. P1 Job Creation (BRADFORD_JD routing)
 * 2. P2 Job Creation (THIRD_PARTY_VENDOR + single vendor)
 * 3. Concurrency Test (10 parallel creates)
 */

import { PrismaClient, Pathway, RoutingType } from '@prisma/client';
import { determinePathway } from '../src/services/pathwayService';
import { generateBaseJobId, getTypeCode } from '../src/services/jobIdService';
import { TEST_IDS } from '../src/constants/companies';

const prisma = new PrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function testP1JobCreation(): Promise<void> {
  console.log('\n🧪 TEST A: P1 Job Creation (BRADFORD_JD)');
  console.log('-'.repeat(50));

  try {
    // Use transaction to match actual createJob flow
    const job = await prisma.$transaction(async (tx) => {
      const { baseJobId, masterSeq, jobTypeCode } = await generateBaseJobId({}, tx);
      const pathway = determinePathway({ routingType: RoutingType.BRADFORD_JD });

      console.log(`  Generated: baseJobId=${baseJobId}, pathway=${pathway}`);

      return tx.job.create({
        data: {
          id: `test-p1-${Date.now()}`,
          jobNo: `TEST-P1-${Date.now()}`,
          customerId: TEST_IDS.CUSTOMER_ID,
          title: 'Sprint 1 Verification - P1 Test',
          sellPrice: 500,
          quantity: 1000,
          routingType: RoutingType.BRADFORD_JD,
          pathway,
          baseJobId,
          masterSeq,
          jobTypeCode,
          vendorCount: 0,
          status: 'ACTIVE',
          specs: {},
          updatedAt: new Date(),
        },
      });
    });

    // Verify
    const passed =
      job.pathway === Pathway.P1 &&
      job.baseJobId !== null &&
      job.baseJobId.match(/^[A-Z]+\d*-\d+$/) !== null;

    results.push({
      name: 'P1 Job Creation',
      passed,
      details: `pathway=${job.pathway}, baseJobId=${job.baseJobId}, masterSeq=${job.masterSeq}`,
    });

    console.log(`  ✅ Job created: ${job.jobNo}`);
    console.log(`  📍 Pathway: ${job.pathway} (expected: P1)`);
    console.log(`  🆔 BaseJobId: ${job.baseJobId}`);
    console.log(`  Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  } catch (error: any) {
    results.push({ name: 'P1 Job Creation', passed: false, details: error.message });
    console.log(`  ❌ ERROR: ${error.message}`);
  }
}

async function testP2JobCreation(): Promise<void> {
  console.log('\n🧪 TEST B: P2 Job Creation (THIRD_PARTY_VENDOR)');
  console.log('-'.repeat(50));

  try {
    const job = await prisma.$transaction(async (tx) => {
      const { baseJobId, masterSeq, jobTypeCode } = await generateBaseJobId({}, tx);
      const pathway = determinePathway({
        routingType: RoutingType.THIRD_PARTY_VENDOR,
        vendorId: TEST_IDS.VENDOR_ID,
      });

      console.log(`  Generated: baseJobId=${baseJobId}, pathway=${pathway}`);

      return tx.job.create({
        data: {
          id: `test-p2-${Date.now()}`,
          jobNo: `TEST-P2-${Date.now()}`,
          customerId: TEST_IDS.CUSTOMER_ID,
          vendorId: TEST_IDS.VENDOR_ID,
          title: 'Sprint 1 Verification - P2 Test',
          sellPrice: 500,
          quantity: 1000,
          routingType: RoutingType.THIRD_PARTY_VENDOR,
          pathway,
          baseJobId,
          masterSeq,
          jobTypeCode,
          vendorCount: 1,
          status: 'ACTIVE',
          specs: {},
          updatedAt: new Date(),
        },
      });
    });

    const passed =
      job.pathway === Pathway.P2 &&
      job.baseJobId !== null &&
      job.vendorCount === 1;

    results.push({
      name: 'P2 Job Creation',
      passed,
      details: `pathway=${job.pathway}, baseJobId=${job.baseJobId}, vendorCount=${job.vendorCount}`,
    });

    console.log(`  ✅ Job created: ${job.jobNo}`);
    console.log(`  📍 Pathway: ${job.pathway} (expected: P2)`);
    console.log(`  🆔 BaseJobId: ${job.baseJobId}`);
    console.log(`  👥 VendorCount: ${job.vendorCount} (expected: 1)`);
    console.log(`  Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  } catch (error: any) {
    results.push({ name: 'P2 Job Creation', passed: false, details: error.message });
    console.log(`  ❌ ERROR: ${error.message}`);
  }
}

async function testConcurrency(): Promise<void> {
  console.log('\n🧪 TEST D: Concurrency (10 parallel creates)');
  console.log('-'.repeat(50));

  const startSeq = await prisma.masterSequence
    .findUnique({ where: { id: 'master-seq' } })
    .then((r) => r?.currentValue || 3000);

  console.log(`  Starting sequence: ${startSeq}`);

  try {
    // Create 10 jobs in parallel
    const promises = Array.from({ length: 10 }, async (_, i) => {
      return prisma.$transaction(async (tx) => {
        const { baseJobId, masterSeq, jobTypeCode } = await generateBaseJobId({}, tx);
        return tx.job.create({
          data: {
            id: `test-concurrent-${Date.now()}-${i}`,
            jobNo: `TEST-CONC-${Date.now()}-${i}`,
            customerId: TEST_IDS.CUSTOMER_ID,
            title: `Concurrency Test ${i + 1}`,
            sellPrice: 100,
            quantity: 500,
            routingType: RoutingType.BRADFORD_JD,
            pathway: Pathway.P1,
            baseJobId,
            masterSeq,
            jobTypeCode,
            vendorCount: 0,
            status: 'ACTIVE',
            specs: {},
            updatedAt: new Date(),
          },
        });
      });
    });

    const jobs = await Promise.all(promises);

    // Check for duplicates
    const sequences = jobs.map((j) => j.masterSeq).filter((s) => s !== null) as number[];
    const uniqueSequences = new Set(sequences);
    const hasDuplicates = sequences.length !== uniqueSequences.size;

    // Check for monotonic increase (within the batch)
    const sorted = [...sequences].sort((a, b) => a - b);
    const isSequential = sorted.every((seq, i) => {
      if (i === 0) return true;
      return seq === sorted[i - 1] + 1;
    });

    console.log(`  Created ${jobs.length} jobs`);
    console.log(`  Sequences: ${sorted.join(', ')}`);
    console.log(`  Has duplicates: ${hasDuplicates ? '❌ YES' : '✅ NO'}`);
    console.log(`  Is sequential: ${isSequential ? '✅ YES' : '⚠️ NO (gaps exist)'}`);

    const passed = !hasDuplicates;
    results.push({
      name: 'Concurrency Test',
      passed,
      details: `sequences=${sorted.join(',')}, duplicates=${hasDuplicates}`,
    });

    console.log(`  Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  } catch (error: any) {
    results.push({ name: 'Concurrency Test', passed: false, details: error.message });
    console.log(`  ❌ ERROR: ${error.message}`);
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🔬 SPRINT 1 VERIFICATION');
  console.log('='.repeat(60));

  await testP1JobCreation();
  await testP2JobCreation();
  await testConcurrency();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  results.forEach((r) => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}: ${r.details}`);
  });

  console.log(`\nTotal: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n⚠️  SPRINT 1 VERIFICATION FAILED - Fix issues before proceeding to Sprint 2');
    process.exit(1);
  } else {
    console.log('\n🎉 SPRINT 1 VERIFICATION PASSED - Ready for Sprint 2!');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
