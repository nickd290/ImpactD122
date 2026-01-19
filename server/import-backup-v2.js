#!/usr/bin/env node

/**
 * Import backup data from Nov 25, 2025 export
 * Maps old schema (Entity, LineItem, JobSpecs) to current schema (Company, Vendor, Job)
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function importData() {
  try {
    console.log('Loading production export...');
    const exportData = JSON.parse(fs.readFileSync('/Users/nicholasdeblasio/impactd122_production_export.json', 'utf8'));

    console.log(`Found ${exportData.metadata.entityCount} entities and ${exportData.metadata.jobCount} jobs`);
    console.log('\nClearing existing data...');

    // Delete in correct order (respecting foreign keys)
    await prisma.jobActivity.deleteMany({});
    await prisma.shipment.deleteMany({});
    await prisma.purchaseOrder.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.vendor.deleteMany({});
    await prisma.company.deleteMany({});

    console.log('Database cleared');

    // Track entity ID to company/vendor ID mapping
    const entityToCompany = new Map();
    const entityToVendor = new Map();

    console.log('\nImporting entities as Companies and Vendors...');

    for (const entity of exportData.entities) {
      const isVendor = entity.type === 'VENDOR';
      const isCustomer = entity.type === 'CUSTOMER';

      if (isVendor) {
        // Create as Vendor
        const vendor = await prisma.vendor.create({
          data: {
            id: entity.id,
            name: entity.name,
            email: entity.email || null,
            phone: entity.phone || null,
            isActive: true,
            isPartner: entity.isPartner || false,
            isInternal: entity.name.toLowerCase().includes('bradford') || entity.name.toLowerCase().includes('jd'),
            streetAddress: entity.address || null,
            createdAt: new Date(entity.createdAt),
            updatedAt: new Date(entity.updatedAt),
          }
        });
        entityToVendor.set(entity.id, vendor.id);
        console.log(`  Created Vendor: ${entity.name}`);
      }

      if (isCustomer || isVendor) {
        // Create as Company (all entities need a company record for job relations)
        const company = await prisma.company.create({
          data: {
            id: isCustomer ? entity.id : `comp-${entity.id}`,
            name: entity.name,
            type: entity.type,
            email: entity.email || null,
            phone: entity.phone || null,
            address: entity.address || null,
            createdAt: new Date(entity.createdAt),
            updatedAt: new Date(entity.updatedAt),
          }
        });
        entityToCompany.set(entity.id, company.id);
        if (isCustomer) {
          console.log(`  Created Company (Customer): ${entity.name}`);
        }
      }
    }

    console.log(`\nImported ${exportData.entities.length} entities`);

    console.log('\nImporting jobs...');
    let jobsImported = 0;
    let jobsSkipped = 0;

    for (const job of exportData.jobs) {
      try {
        // Get the customer company ID
        const customerId = entityToCompany.get(job.customerId);
        if (!customerId) {
          console.log(`  Skipping job ${job.number}: Customer not found`);
          jobsSkipped++;
          continue;
        }

        // Get vendor ID if exists
        const vendorId = job.vendorId ? entityToVendor.get(job.vendorId) : null;

        // Map old status to new status
        let status = 'ACTIVE';
        if (job.status === 'PAID' || job.status === 'COMPLETED') {
          status = 'PAID';
        } else if (job.status === 'CANCELLED') {
          status = 'CANCELLED';
        }

        // Build specs JSON from old specs object
        const specs = {};
        if (job.specs) {
          specs.productType = job.specs.productType || null;
          specs.colors = job.specs.colors || null;
          specs.coating = job.specs.coating || null;
          specs.finishing = job.specs.finishing || null;
          specs.flatSize = job.specs.flatSize || null;
          specs.finishedSize = job.specs.finishedSize || null;
          specs.paperType = job.specs.paperType || null;
          specs.pageCount = job.specs.pageCount || null;
          specs.bindingStyle = job.specs.bindingStyle || null;
        }

        // Calculate sellPrice from lineItems if available
        let sellPrice = null;
        if (job.lineItems && job.lineItems.length > 0) {
          sellPrice = job.lineItems.reduce((total, item) => {
            return total + (item.quantity * item.unitPrice);
          }, 0);
        }

        // Create job
        await prisma.job.create({
          data: {
            id: job.id,
            jobNo: job.number,
            title: job.title || null,
            description: job.notes || null,
            customerId: customerId,
            vendorId: vendorId,
            status: status,
            workflowStatus: 'NEW_JOB',
            specs: specs,
            sellPrice: sellPrice,
            customerPONumber: job.customerPONumber || null,
            deliveryDate: job.dueDate ? new Date(job.dueDate) : null,
            createdAt: new Date(job.createdAt),
            updatedAt: new Date(job.updatedAt),
          }
        });

        jobsImported++;
        console.log(`  Imported job: ${job.number} - ${job.title?.substring(0, 40) || 'No title'}...`);
      } catch (jobError) {
        console.error(`  Error importing job ${job.number}:`, jobError.message);
        jobsSkipped++;
      }
    }

    console.log(`\nImport complete!`);
    console.log(`  Jobs imported: ${jobsImported}`);
    console.log(`  Jobs skipped: ${jobsSkipped}`);

    // Verify counts
    const counts = {
      companies: await prisma.company.count(),
      vendors: await prisma.vendor.count(),
      jobs: await prisma.job.count(),
    };

    console.log('\nFinal counts:');
    console.log(`  Companies: ${counts.companies}`);
    console.log(`  Vendors: ${counts.vendors}`);
    console.log(`  Jobs: ${counts.jobs}`);

  } catch (error) {
    console.error('\nImport failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importData();
