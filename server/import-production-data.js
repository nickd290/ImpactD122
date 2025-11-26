#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function importData() {
  try {
    console.log('Loading production export...');
    const exportData = JSON.parse(fs.readFileSync('/Users/nicholasdeblasio/impactd122_production_export.json', 'utf8'));

    console.log(`Found ${exportData.metadata.entityCount} entities and ${exportData.metadata.jobCount} jobs`);
    console.log('\nClearing local database...');

    // Delete all data in correct order (respecting foreign keys)
    await prisma.lineItem.deleteMany({});
    await prisma.jobFinancials.deleteMany({});
    await prisma.jobSpecs.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.contact.deleteMany({});
    await prisma.entity.deleteMany({});

    console.log('✓ Database cleared');

    console.log('\nImporting entities...');
    for (const entity of exportData.entities) {
      const { contacts, ...entityData } = entity;

      // Convert date strings back to Date objects
      entityData.createdAt = new Date(entityData.createdAt);
      entityData.updatedAt = new Date(entityData.updatedAt);

      await prisma.entity.create({
        data: {
          ...entityData,
          contacts: {
            create: contacts.map(c => {
              const { companyId, ...contactData } = c;
              return {
                ...contactData,
                createdAt: new Date(contactData.createdAt),
                updatedAt: new Date(contactData.updatedAt)
              };
            })
          }
        }
      });
    }
    console.log(`✓ Imported ${exportData.entities.length} entities`);

    console.log('\nImporting jobs...');
    for (const job of exportData.jobs) {
      const { lineItems, specs, financials, ...jobData } = job;

      // Convert date strings and handle JSON fields
      jobData.createdAt = new Date(jobData.createdAt);
      jobData.updatedAt = new Date(jobData.updatedAt);

      await prisma.job.create({
        data: {
          ...jobData,
          lineItems: {
            create: lineItems.map(item => {
              const { jobId, ...itemData } = item;
              return {
                ...itemData,
                createdAt: new Date(itemData.createdAt),
                updatedAt: new Date(itemData.updatedAt)
              };
            })
          },
          specs: specs ? {
            create: (() => {
              const { jobId, ...specsData } = specs;
              return {
                ...specsData,
                createdAt: new Date(specsData.createdAt),
                updatedAt: new Date(specsData.updatedAt)
              };
            })()
          } : undefined,
          financials: financials ? {
            create: (() => {
              const { jobId, ...financialsData } = financials;
              return {
                ...financialsData,
                createdAt: new Date(financialsData.createdAt),
                updatedAt: new Date(financialsData.updatedAt)
              };
            })()
          } : undefined
        }
      });
    }
    console.log(`✓ Imported ${exportData.jobs.length} jobs`);

    console.log('\n✅ Import complete!');

    // Verify the import
    const counts = {
      entities: await prisma.entity.count(),
      jobs: await prisma.job.count(),
      contacts: await prisma.contact.count(),
      lineItems: await prisma.lineItem.count()
    };

    console.log('\nFinal counts:');
    console.log(`  Entities: ${counts.entities}`);
    console.log(`  Jobs: ${counts.jobs}`);
    console.log(`  Contacts: ${counts.contacts}`);
    console.log(`  Line Items: ${counts.lineItems}`);

  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importData();
