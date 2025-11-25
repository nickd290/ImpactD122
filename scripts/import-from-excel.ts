import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function importFromExcel() {
  try {
    console.log('📖 Reading Excel file...');
    const workbook = XLSX.readFile('/Users/nicholasdeblasio/Desktop/printing-workflow-export.xlsx');

    // Read Jobs sheet
    const jobsSheet = workbook.Sheets['Jobs'];
    const jobsData = XLSX.utils.sheet_to_json(jobsSheet);
    console.log(`✅ Found ${jobsData.length} jobs in Excel file`);

    // Read Companies sheet for entity mapping
    const companiesSheet = workbook.Sheets['Companies'];
    const companiesData = XLSX.utils.sheet_to_json(companiesSheet);
    console.log(`✅ Found ${companiesData.length} companies in Excel file`);

    // Create entity mapping
    const entityMap = new Map<string, string>();
    const customerNames = new Set<string>();
    const vendorNames = new Set<string>();

    // Extract unique customer and vendor names from jobs
    for (const job of jobsData as any[]) {
      if (job.customerName) customerNames.add(job.customerName);
      if (job.vendorName) vendorNames.add(job.vendorName);
    }

    console.log(`\n📊 Found ${customerNames.size} unique customers and ${vendorNames.size} unique vendors`);

    // Get existing entities from database
    const existingCustomers = await prisma.entity.findMany({
      where: { type: 'CUSTOMER' }
    });

    const existingVendors = await prisma.entity.findMany({
      where: { type: 'VENDOR' }
    });

    console.log(`\n🗄️  Existing in database: ${existingCustomers.length} customers, ${existingVendors.length} vendors`);

    // Create or match entities
    console.log('\n🔄 Creating/matching entities...');

    // Create or find a default "No Vendor" entity for jobs without vendors
    let defaultVendor = await prisma.entity.findFirst({
      where: { name: 'No Vendor', type: 'VENDOR' }
    });

    if (!defaultVendor) {
      defaultVendor = await prisma.entity.create({
        data: {
          type: 'VENDOR',
          name: 'No Vendor',
          contactPerson: '',
          email: '',
          phone: '',
          address: '',
          notes: 'Default vendor for jobs without assigned vendor',
        }
      });
      console.log(`  ✨ Created default vendor: No Vendor`);
    }

    for (const customerName of customerNames) {
      // Check if exists
      let entity = existingCustomers.find(e => e.name.toLowerCase() === customerName.toLowerCase());

      if (!entity) {
        // Find in companies sheet
        const companyData = (companiesData as any[]).find(
          (c: any) => c.name === customerName && c.type === 'customer'
        );

        // Create new entity
        entity = await prisma.entity.create({
          data: {
            type: 'CUSTOMER',
            name: customerName,
            contactPerson: '',
            email: companyData?.email || '',
            phone: companyData?.phone || '',
            address: companyData?.address || '',
            notes: '',
          }
        });
        console.log(`  ✨ Created customer: ${customerName}`);
      } else {
        console.log(`  ✓ Found existing customer: ${customerName}`);
      }

      entityMap.set(`customer-${customerName}`, entity.id);
    }

    for (const vendorName of vendorNames) {
      if (!vendorName) continue;

      // Check if exists
      let entity = existingVendors.find(e => e.name.toLowerCase() === vendorName.toLowerCase());

      if (!entity) {
        // Find in companies sheet
        const companyData = (companiesData as any[]).find(
          (c: any) => c.name === vendorName && c.type === 'manufacturer'
        );

        // Create new entity
        entity = await prisma.entity.create({
          data: {
            type: 'VENDOR',
            name: vendorName,
            contactPerson: '',
            email: companyData?.email || '',
            phone: companyData?.phone || '',
            address: companyData?.address || '',
            notes: '',
          }
        });
        console.log(`  ✨ Created vendor: ${vendorName}`);
      } else {
        console.log(`  ✓ Found existing vendor: ${vendorName}`);
      }

      entityMap.set(`vendor-${vendorName}`, entity.id);
    }

    // Import jobs
    console.log('\n📝 Importing jobs...');
    let imported = 0;
    let skipped = 0;

    for (const jobData of jobsData as any[]) {
      try {
        const customerId = entityMap.get(`customer-${jobData.customerName}`);
        const vendorId = jobData.vendorName ? entityMap.get(`vendor-${jobData.vendorName}`) : defaultVendor.id;

        if (!customerId) {
          console.log(`  ⚠️  Skipping job "${jobData.title}" - no customer found`);
          skipped++;
          continue;
        }

        // Map status to valid JobStatus values
        let status = jobData.status || 'DRAFT';
        // Map from old system to new system
        if (status === 'COMPLETED') status = 'PAID';
        if (status === 'DELIVERED') status = 'SHIPPED';
        if (status === 'PENDING') status = 'DRAFT';
        if (status === 'READY_FOR_PROOF') status = 'QUOTED';
        if (status === 'PROOF_APPROVED') status = 'APPROVED';
        if (status === 'IN_PROGRESS') status = 'IN_PRODUCTION';

        // Ensure status is valid, default to DRAFT if not
        const validStatuses = ['DRAFT', 'QUOTED', 'APPROVED', 'PO_ISSUED', 'IN_PRODUCTION', 'SHIPPED', 'INVOICED', 'PAID', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
          status = 'DRAFT';
        }

        // Calculate pricing
        const quantity = parseFloat(jobData.quantity || '1');
        const customerTotal = parseFloat(jobData.customerTotal || '0');
        const bradfordTotal = parseFloat(jobData.bradfordTotal || '0');

        const unitCost = quantity > 0 ? bradfordTotal / quantity : 0;
        const unitPrice = quantity > 0 ? customerTotal / quantity : 0;
        const markupPercent = unitCost > 0 ? ((unitPrice - unitCost) / unitCost) * 100 : 20;

        // Generate job number
        const lastJob = await prisma.job.findFirst({
          orderBy: { number: 'desc' },
        });

        let jobNumber = 'J-1001';
        if (lastJob) {
          const lastNumber = parseInt(lastJob.number.split('-')[1]);
          jobNumber = `J-${(lastNumber + 1).toString().padStart(4, '0')}`;
        }

        // Create line item description
        const lineItemDescription = [
          jobData.sizeName || '',
          jobData.paperType || '',
          jobData.description ? `- ${(jobData.description as string).substring(0, 100)}` : ''
        ].filter(Boolean).join(' ') || 'Print Service';

        // Use connect instead of just IDs
        const jobCreateData: any = {
          title: jobData.title || jobData.jobNo || 'Imported Job',
          number: jobNumber,
          status: status as any,
          notes: [
            jobData.description || '',
            jobData.specs || '',
            `Original Job #: ${jobData.jobNo || 'N/A'}`
          ].filter(Boolean).join('\n\n'),
          customerPONumber: jobData.customerPONumber || '',
          dueDate: jobData.deliveryDate || jobData.mailDate ? new Date(jobData.deliveryDate || jobData.mailDate) : null,
          customer: {
            connect: { id: customerId }
          },
          lineItems: {
            create: [{
              description: lineItemDescription,
              quantity: quantity,
              unitCost: unitCost,
              markupPercent: Math.round(markupPercent * 100) / 100,
              unitPrice: unitPrice,
              sortOrder: 0,
            }]
          }
        };

        // Only add vendor if we have one
        if (vendorId) {
          jobCreateData.vendor = {
            connect: { id: vendorId }
          };
        }

        // Create job
        await prisma.job.create({
          data: jobCreateData
        });

        imported++;
        console.log(`  ✅ Imported: ${jobData.title || jobData.jobNo} (${jobNumber})`);
      } catch (error: any) {
        console.error(`  ❌ Error importing job "${jobData.title}":`, error.message);
        skipped++;
      }
    }

    console.log('\n✨ Import Complete!');
    console.log(`   Imported: ${imported} jobs`);
    console.log(`   Skipped: ${skipped} jobs`);

  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

importFromExcel();
