/**
 * Clean Import Jobs from Spreadsheet
 *
 * Deletes all J-1xxx jobs (duplicates) and imports 66 jobs with correct J-2xxx numbers.
 *
 * Run with:
 *   cd ~/impact-direct/server
 *   DATABASE_URL="postgresql://postgres:ZPixFndtyCnDPRtelwWtEQIgkGEkXRPl@hopper.proxy.rlwy.net:26498/railway" npx tsx scripts/clean-import-jobs.ts
 *
 * Add --dry-run to preview changes without executing
 */

import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// Customer name -> Company ID mapping
const CUSTOMER_MAP: Record<string, string> = {
  'JJS&A Inc.': 'cmictx5gx0001jpt4vtue59ip',
  'JJS&A': 'cmictx5gx0001jpt4vtue59ip',
  'Ballantine': 'cmictx5gv0000jpt4vlbyploc',
  'Lahlouh': 'cmictx5gy0003jpt4ygslooyc',
  'EPrint Group': 'cmictx5gz0004jpt4k3e514iu',
  'EPrint': 'cmictx5gz0004jpt4k3e514iu',
  // Will be created during import:
  'Freedom Press LLC': 'will-create-freedom-press',
  'Freedom Press': 'will-create-freedom-press',
  'Incremental Media': 'will-create-incremental-media',
  'Tab Service Company': 'will-create-tab-service',
  'Tab Service': 'will-create-tab-service',
};

interface SpreadsheetRow {
  'Job #'?: string;
  Customer?: string;
  'Bradford PO'?: string;
  'Total Billed'?: number | string;
  'Bradford Costs'?: number | string;
  'Bradford profit share'?: number | string;
  'JD Invoice #'?: string;
  Paid?: string;
}

function parseDecimal(value: number | string | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  // Remove $ and commas
  const cleaned = value.toString().replace(/[$,]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

async function createMissingCompanies(): Promise<Record<string, string>> {
  const newCompanies: Record<string, string> = {};

  const missingCompanies = [
    { name: 'Freedom Press LLC', type: 'CUSTOMER' },
    { name: 'Incremental Media', type: 'CUSTOMER' },
    { name: 'Tab Service Company', type: 'CUSTOMER' },
  ];

  for (const company of missingCompanies) {
    // Check if already exists
    const existing = await prisma.company.findFirst({
      where: { name: { contains: company.name.split(' ')[0] }, type: company.type },
    });

    if (existing) {
      console.log(`  ✓ Found existing: ${company.name} -> ${existing.id}`);
      newCompanies[company.name] = existing.id;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would create: ${company.name}`);
      newCompanies[company.name] = `new-${company.name.toLowerCase().replace(/\s+/g, '-')}`;
      continue;
    }

    const created = await prisma.company.create({
      data: {
        id: `comp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: company.name,
        type: company.type,
        updatedAt: new Date(),
      },
    });
    console.log(`  ✨ Created: ${company.name} -> ${created.id}`);
    newCompanies[company.name] = created.id;
  }

  return newCompanies;
}

async function deleteOldJobs(): Promise<number> {
  // Find all J-1xxx jobs
  const oldJobs = await prisma.job.findMany({
    where: {
      jobNo: { startsWith: 'J-1' },
    },
    select: { id: true, jobNo: true },
  });

  console.log(`\n📋 Found ${oldJobs.length} J-1xxx jobs to delete`);

  if (oldJobs.length === 0) return 0;

  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would delete: ${oldJobs.map(j => j.jobNo).join(', ')}`);
    return oldJobs.length;
  }

  // Delete cascade will handle ProfitSplit, etc.
  for (const job of oldJobs) {
    await prisma.job.delete({ where: { id: job.id } });
    console.log(`  🗑️  Deleted: ${job.jobNo}`);
  }

  return oldJobs.length;
}

async function importJobs(newCompanyIds: Record<string, string>) {
  console.log('\n📖 Reading Excel file...');
  const workbook = XLSX.readFile('/Users/nicholasdeblasio/Downloads/Untitled spreadsheet (7).xlsx');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<SpreadsheetRow>(sheet);

  console.log(`✅ Found ${rows.length} rows in spreadsheet`);

  // Build final customer map with new IDs
  const finalCustomerMap = { ...CUSTOMER_MAP };
  for (const [name, id] of Object.entries(newCompanyIds)) {
    finalCustomerMap[name] = id;
    // Also add variations
    if (name === 'Freedom Press LLC') {
      finalCustomerMap['Freedom Press'] = id;
    }
    if (name === 'Tab Service Company') {
      finalCustomerMap['Tab Service'] = id;
    }
  }

  let imported = 0;
  let skipped = 0;
  let maxJobSeq = 0;

  for (const row of rows) {
    const jobNo = row['Job #'];

    // Skip rows without job numbers
    if (!jobNo || !jobNo.toString().startsWith('J-')) {
      skipped++;
      continue;
    }

    // Extract sequence number for MasterSequence update
    const seqMatch = jobNo.match(/J-(\d+)/);
    if (seqMatch) {
      const seq = parseInt(seqMatch[1], 10);
      if (seq > maxJobSeq) maxJobSeq = seq;
    }

    const customerName = row.Customer?.toString().trim();
    if (!customerName) {
      console.log(`  ⚠️ Skipping ${jobNo}: no customer`);
      skipped++;
      continue;
    }

    // Look up customer ID
    const customerId = finalCustomerMap[customerName];
    if (!customerId || customerId.startsWith('will-create')) {
      console.log(`  ⚠️ Skipping ${jobNo}: unknown customer "${customerName}"`);
      skipped++;
      continue;
    }

    // Parse financial data
    const sellPrice = parseDecimal(row['Total Billed']);
    const bradfordBuyCost = parseDecimal(row['Bradford Costs']);
    const bradfordShare = parseDecimal(row['Bradford profit share']);
    const jdInvoiceNumber = row['JD Invoice #']?.toString().trim() || null;
    const partnerPONumber = row['Bradford PO']?.toString().trim() || null;
    const jdPaymentPaid = row.Paid?.toString().toLowerCase() === 'paid';

    // Calculate profit split
    const grossMargin = sellPrice - bradfordBuyCost;
    const impactShare = grossMargin - bradfordShare;

    if (DRY_RUN) {
      console.log(
        `  [DRY-RUN] Would import: ${jobNo} | ${customerName} | ` +
        `$${sellPrice.toFixed(2)} | Bradford: $${bradfordShare.toFixed(2)} | ` +
        `Impact: $${impactShare.toFixed(2)}`
      );
      imported++;
      continue;
    }

    try {
      // Check if job already exists
      const existing = await prisma.job.findUnique({ where: { jobNo } });
      if (existing) {
        console.log(`  ⚠️ Skipping ${jobNo}: already exists`);
        skipped++;
        continue;
      }

      // Create job
      const job = await prisma.job.create({
        data: {
          id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          jobNo,
          customerId,
          status: 'ACTIVE',
          workflowStatus: 'INVOICED',
          specs: {},
          sellPrice,
          bradfordBuyCost,
          partnerPONumber,
          jdInvoiceNumber,
          jdPaymentPaid,
          updatedAt: new Date(),
        },
      });

      // Create ProfitSplit
      await prisma.profitSplit.create({
        data: {
          jobId: job.id,
          sellPrice,
          totalCost: bradfordBuyCost,
          paperCost: 0,
          paperMarkup: 0,
          grossMargin,
          bradfordShare,
          impactShare,
          calculatedAt: new Date(),
        },
      });

      console.log(
        `  ✅ Imported: ${jobNo} | ${customerName} | $${sellPrice.toFixed(2)}`
      );
      imported++;
    } catch (err: any) {
      console.error(`  ❌ Error importing ${jobNo}:`, err.message);
      skipped++;
    }
  }

  return { imported, skipped, maxJobSeq };
}

async function updateMasterSequence(maxSeq: number) {
  const nextValue = maxSeq + 1;

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would update MasterSequence to ${nextValue}`);
    return;
  }

  await prisma.masterSequence.upsert({
    where: { id: 'master-seq' },
    create: { id: 'master-seq', currentValue: nextValue },
    update: { currentValue: nextValue },
  });
  console.log(`\n✅ Updated MasterSequence to ${nextValue}`);
}

async function main() {
  console.log('========================================');
  console.log('CLEAN IMPORT JOBS');
  console.log(DRY_RUN ? '🔍 DRY RUN MODE - No changes will be made' : '🚀 LIVE MODE');
  console.log('========================================\n');

  // 1. Create missing companies
  console.log('📋 Step 1: Creating missing companies...');
  const newCompanyIds = await createMissingCompanies();

  // 2. Delete old J-1xxx jobs
  console.log('\n📋 Step 2: Deleting old J-1xxx jobs...');
  const deleted = await deleteOldJobs();

  // 3. Import jobs from spreadsheet
  console.log('\n📋 Step 3: Importing jobs from spreadsheet...');
  const { imported, skipped, maxJobSeq } = await importJobs(newCompanyIds);

  // 4. Update MasterSequence
  console.log('\n📋 Step 4: Updating MasterSequence...');
  await updateMasterSequence(maxJobSeq);

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Jobs deleted (J-1xxx): ${deleted}`);
  console.log(`Jobs imported: ${imported}`);
  console.log(`Rows skipped: ${skipped}`);
  console.log(`MasterSequence set to: ${maxJobSeq + 1}`);
  console.log('========================================\n');

  await prisma.$disconnect();
}

main()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
