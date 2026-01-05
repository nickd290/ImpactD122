/**
 * Sprint 3 Verification Script (CORRECTED)
 *
 * Run with: npx ts-node scripts/verify-sprint3.ts
 *
 * Tests the CORRECTED executionId behavior:
 * - executionId is NOT assigned at PO creation
 * - executionId is assigned at FINALIZATION time (before send)
 * - For P3 jobs, ALL vendor POs get the SAME vendorCount suffix
 *
 * Tests:
 * 1. P2 Job: Finalized PO has executionId ending in .1
 * 2. P3 Job: BOTH finalized POs have executionId ending in .2 (same vendorCount)
 * 3. Immutability: executionId does NOT change on re-finalization
 */

import { PrismaClient, Pathway, RoutingType } from '@prisma/client';
import { generateBaseJobId } from '../src/services/jobIdService';
import {
  createImpactVendorPO,
  finalizeVendorPOExecutionId,
  finalizeAllVendorPOsForJob,
} from '../src/services/poService';
import { TEST_IDS } from '../src/constants/companies';

const prisma = new PrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function cleanup(jobIds: string[]): Promise<void> {
  for (const jobId of jobIds) {
    await prisma.purchaseOrder.deleteMany({ where: { jobId } });
    await prisma.job.deleteMany({ where: { id: jobId } });
  }
}

async function testP2ExecutionId(): Promise<string | null> {
  console.log('\n🧪 TEST 1: P2 Single Vendor - Finalization Flow');
  console.log('-'.repeat(50));

  let jobId: string | null = null;

  try {
    // Create job with baseJobId
    const job = await prisma.$transaction(async (tx) => {
      const { baseJobId, masterSeq, jobTypeCode } = await generateBaseJobId({}, tx);

      return tx.job.create({
        data: {
          id: `test-p2-${Date.now()}`,
          jobNo: `TEST-P2-${Date.now()}`,
          customerId: TEST_IDS.CUSTOMER_ID,
          title: 'Sprint 3 - P2 Finalization Test',
          sellPrice: 500,
          quantity: 1000,
          routingType: RoutingType.THIRD_PARTY_VENDOR,
          pathway: Pathway.P2,
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

    jobId = job.id;
    console.log(`  ✅ Created job: ${job.jobNo}`);
    console.log(`  📍 baseJobId: ${job.baseJobId}`);

    // Create vendor PO (should NOT have executionId yet)
    const po = await createImpactVendorPO(jobId, TEST_IDS.VENDOR_ID, {
      buyCost: 250,
      description: 'P2 Test PO',
    });

    console.log(`  📄 Created PO: ${po.poNumber}`);
    console.log(`  🆔 executionId at creation: ${po.executionId ?? '(null - CORRECT)'}`);

    // Verify NO executionId at creation
    if (po.executionId !== null) {
      results.push({
        name: 'P2 executionId',
        passed: false,
        details: `ERROR: executionId should be null at creation, got ${po.executionId}`,
      });
      console.log(`  ❌ FAILED: executionId should be null at creation`);
      return jobId;
    }

    // Now finalize the PO (simulates "Send PO" action)
    console.log(`  📤 Finalizing PO...`);
    const finalizedPO = await finalizeVendorPOExecutionId(po.id);

    console.log(`  🆔 executionId after finalization: ${finalizedPO.executionId}`);

    // Verify executionId format after finalization
    const passed =
      finalizedPO.executionId !== null &&
      finalizedPO.executionId.includes(job.baseJobId!) &&
      finalizedPO.executionId.endsWith('.1');

    results.push({
      name: 'P2 executionId',
      passed,
      details: `executionId=${finalizedPO.executionId}, expected ending=.1`,
    });

    console.log(`  Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    return jobId;
  } catch (error: any) {
    results.push({ name: 'P2 executionId', passed: false, details: error.message });
    console.log(`  ❌ ERROR: ${error.message}`);
    return jobId;
  }
}

async function testP3ExecutionId(): Promise<string | null> {
  console.log('\n🧪 TEST 2: P3 Multi-Vendor - BOTH POs get .2 suffix');
  console.log('-'.repeat(50));

  let jobId: string | null = null;

  try {
    // Ensure second vendor has a vendorCode
    const vendor2 = await prisma.vendor.findUnique({
      where: { id: TEST_IDS.VENDOR_ID_2 },
      select: { vendorCode: true, name: true },
    });

    if (!vendor2?.vendorCode) {
      console.log(`  ⚙️  Adding vendorCode to "${vendor2?.name || 'Unknown'}"...`);
      await prisma.vendor.update({
        where: { id: TEST_IDS.VENDOR_ID_2 },
        data: { vendorCode: 'IMI001' },
      });
    }

    // Create job with baseJobId
    const job = await prisma.$transaction(async (tx) => {
      const { baseJobId, masterSeq, jobTypeCode } = await generateBaseJobId({}, tx);

      return tx.job.create({
        data: {
          id: `test-p3-${Date.now()}`,
          jobNo: `TEST-P3-${Date.now()}`,
          customerId: TEST_IDS.CUSTOMER_ID,
          title: 'Sprint 3 - P3 Finalization Test',
          sellPrice: 1000,
          quantity: 2000,
          routingType: RoutingType.THIRD_PARTY_VENDOR,
          pathway: Pathway.P3,
          baseJobId,
          masterSeq,
          jobTypeCode,
          vendorCount: 2,
          status: 'ACTIVE',
          specs: {},
          updatedAt: new Date(),
        },
      });
    });

    jobId = job.id;
    console.log(`  ✅ Created job: ${job.jobNo}`);
    console.log(`  📍 baseJobId: ${job.baseJobId}`);

    // Create BOTH vendor POs first (neither should have executionId)
    const po1 = await createImpactVendorPO(jobId, TEST_IDS.VENDOR_ID, {
      buyCost: 300,
      description: 'P3 Test PO - Vendor 1',
    });

    const po2 = await createImpactVendorPO(jobId, TEST_IDS.VENDOR_ID_2, {
      buyCost: 400,
      description: 'P3 Test PO - Vendor 2',
    });

    console.log(`  📄 Created PO 1: ${po1.poNumber}`);
    console.log(`  🆔 PO 1 executionId at creation: ${po1.executionId ?? '(null - CORRECT)'}`);
    console.log(`  📄 Created PO 2: ${po2.poNumber}`);
    console.log(`  🆔 PO 2 executionId at creation: ${po2.executionId ?? '(null - CORRECT)'}`);

    // Verify NO executionId at creation for both
    if (po1.executionId !== null || po2.executionId !== null) {
      results.push({
        name: 'P3 multi-vendor executionId',
        passed: false,
        details: `ERROR: executionId should be null at creation`,
      });
      console.log(`  ❌ FAILED: executionId should be null at creation`);
      return jobId;
    }

    // Now finalize ALL vendor POs at once (simulates "Finalize Vendor Set")
    console.log(`  📤 Finalizing ALL vendor POs...`);
    const finalizedPOs = await finalizeAllVendorPOsForJob(jobId);

    // Find our POs in the results
    const finalizedPO1 = finalizedPOs.find((p) => p.id === po1.id);
    const finalizedPO2 = finalizedPOs.find((p) => p.id === po2.id);

    console.log(`  🆔 PO 1 executionId after finalization: ${finalizedPO1?.executionId}`);
    console.log(`  🆔 PO 2 executionId after finalization: ${finalizedPO2?.executionId}`);

    // CRITICAL: Both POs must end in .2 (total vendor count = 2)
    const passed = Boolean(
      finalizedPO1?.executionId &&
      finalizedPO2?.executionId &&
      finalizedPO1.executionId.includes(job.baseJobId!) &&
      finalizedPO2.executionId.includes(job.baseJobId!) &&
      finalizedPO1.executionId.endsWith('.2') && // BOTH end in .2
      finalizedPO2.executionId.endsWith('.2')    // BOTH end in .2
    );

    results.push({
      name: 'P3 multi-vendor executionId',
      passed,
      details: `po1=${finalizedPO1?.executionId}, po2=${finalizedPO2?.executionId}, BOTH must end in .2`,
    });

    console.log(`  Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    if (!passed) {
      console.log(`  ⚠️  Expected: BOTH POs should end in .2 (vendorCount=2)`);
    }
    return jobId;
  } catch (error: any) {
    results.push({ name: 'P3 multi-vendor executionId', passed: false, details: error.message });
    console.log(`  ❌ ERROR: ${error.message}`);
    return jobId;
  }
}

async function testExecutionIdImmutability(): Promise<string | null> {
  console.log('\n🧪 TEST 3: executionId Immutability (re-finalization returns same value)');
  console.log('-'.repeat(50));

  let jobId: string | null = null;

  try {
    // Create job
    const job = await prisma.$transaction(async (tx) => {
      const { baseJobId, masterSeq, jobTypeCode } = await generateBaseJobId({}, tx);

      return tx.job.create({
        data: {
          id: `test-immut-${Date.now()}`,
          jobNo: `TEST-IMMUT-${Date.now()}`,
          customerId: TEST_IDS.CUSTOMER_ID,
          title: 'Sprint 3 - Immutability Test',
          sellPrice: 500,
          quantity: 1000,
          routingType: RoutingType.THIRD_PARTY_VENDOR,
          pathway: Pathway.P2,
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

    jobId = job.id;
    console.log(`  ✅ Created job: ${job.jobNo}`);

    // Create PO
    const po = await createImpactVendorPO(jobId, TEST_IDS.VENDOR_ID, {
      buyCost: 100,
      description: 'Immutability Test PO',
    });

    console.log(`  📄 Created PO (no executionId yet)`);

    // Finalize first time
    const finalized1 = await finalizeVendorPOExecutionId(po.id);
    const originalExecutionId = finalized1.executionId;
    console.log(`  📤 First finalization: ${originalExecutionId}`);

    // Try to finalize again (should return same value, not regenerate)
    const finalized2 = await finalizeVendorPOExecutionId(po.id);
    console.log(`  📤 Second finalization: ${finalized2.executionId}`);

    // Also test that direct PO update doesn't change executionId
    const updatedPO = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        buyCost: 200,
        description: 'Updated description',
        updatedAt: new Date(),
      },
    });
    console.log(`  📝 After PO update: ${updatedPO.executionId}`);

    // Verify executionId NEVER changed
    const passed =
      originalExecutionId === finalized2.executionId &&
      originalExecutionId === updatedPO.executionId;

    results.push({
      name: 'executionId immutability',
      passed,
      details: `original=${originalExecutionId}, re-finalize=${finalized2.executionId}, after-update=${updatedPO.executionId}`,
    });

    console.log(`  Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    return jobId;
  } catch (error: any) {
    results.push({ name: 'executionId immutability', passed: false, details: error.message });
    console.log(`  ❌ ERROR: ${error.message}`);
    return jobId;
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🔬 SPRINT 3 VERIFICATION - Execution ID System (CORRECTED)');
  console.log('='.repeat(60));
  console.log('\nKey change: executionId assigned at FINALIZATION, not creation');
  console.log('P3 rule: ALL vendor POs get SAME vendorCount suffix');

  const jobIds: string[] = [];

  // Run tests
  const job1 = await testP2ExecutionId();
  if (job1) jobIds.push(job1);

  const job2 = await testP3ExecutionId();
  if (job2) jobIds.push(job2);

  const job3 = await testExecutionIdImmutability();
  if (job3) jobIds.push(job3);

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

  // Cleanup
  console.log('\n🧹 Cleaning up test data...');
  await cleanup(jobIds);
  console.log('  ✅ Test data cleaned up');

  if (failed > 0) {
    console.log('\n⚠️  SPRINT 3 VERIFICATION FAILED - Fix issues before proceeding');
    process.exit(1);
  } else {
    console.log('\n🎉 SPRINT 3 VERIFICATION PASSED - executionId finalization working correctly!');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
