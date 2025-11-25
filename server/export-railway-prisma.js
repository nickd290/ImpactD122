#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function exportData() {
  try {
    console.log('Connecting to Railway database...');

    // Fetch all data
    const entities = await prisma.entity.findMany({
      include: { contacts: true }
    });
    const jobs = await prisma.job.findMany({
      include: {
        lineItems: true,
        specs: true,
        financials: true
      }
    });

    console.log(`Found ${entities.length} entities`);
    console.log(`Found ${jobs.length} jobs`);

    // Generate SQL INSERT statements
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const sqlFile = `${process.env.HOME}/impactd122_production_${timestamp}.sql`;

    let sql = `-- Railway Production Database Dump
-- Generated: ${new Date().toISOString()}

BEGIN;

-- Clear existing data
TRUNCATE TABLE "LineItem", "JobFinancials", "JobSpecs", "Job", "Contact", "Entity" CASCADE;

`;

    // Export Entities
    for (const entity of entities) {
      const values = [
        `'${entity.id}'`,
        `'${entity.name.replace(/'/g, "''")}'`,
        `'${entity.type}'`,
        entity.email ? `'${entity.email.replace(/'/g, "''")}'` : 'NULL',
        entity.phone ? `'${entity.phone.replace(/'/g, "''")}'` : 'NULL',
        entity.address ? `'${entity.address.replace(/'/g, "''")}'` : 'NULL',
        entity.contactPerson ? `'${entity.contactPerson.replace(/'/g, "''")}'` : 'NULL',
        entity.isPartner ? 'true' : 'false',
        entity.lastInvoiceNumber,
        entity.lastPONumber,
        entity.uniqueCode ? `'${entity.uniqueCode}'` : 'NULL',
        `'${entity.createdAt.toISOString()}'`,
        `'${entity.updatedAt.toISOString()}'`
      ];
      sql += `INSERT INTO "Entity" (id, name, type, email, phone, address, "contactPerson", "isPartner", "lastInvoiceNumber", "lastPONumber", "uniqueCode", "createdAt", "updatedAt") VALUES (${values.join(', ')});\n`;
    }

    sql += '\n';

    // Export Contacts
    for (const entity of entities) {
      for (const contact of entity.contacts) {
        const values = [
          `'${contact.id}'`,
          `'${contact.name.replace(/'/g, "''")}'`,
          contact.email ? `'${contact.email.replace(/'/g, "''")}'` : 'NULL',
          contact.phone ? `'${contact.phone.replace(/'/g, "''")}'` : 'NULL',
          contact.isPrimary ? 'true' : 'false',
          `'${entity.id}'`,
          `'${contact.createdAt.toISOString()}'`,
          `'${contact.updatedAt.toISOString()}'`
        ];
        sql += `INSERT INTO "Contact" (id, name, email, phone, "isPrimary", "companyId", "createdAt", "updatedAt") VALUES (${values.join(', ')});\n`;
      }
    }

    sql += '\n';

    // Export Jobs
    for (const job of jobs) {
      const values = [
        `'${job.id}'`,
        `'${job.number}'`,
        `'${job.title.replace(/'/g, "''")}'`,
        `'${job.status}'`,
        `'${job.customerId}'`,
        job.vendorId ? `'${job.vendorId}'` : 'NULL',
        job.customerPONumber ? `'${job.customerPONumber.replace(/'/g, "''")}'` : 'NULL',
        job.vendorPONumber ? `'${job.vendorPONumber.replace(/'/g, "''")}'` : 'NULL',
        job.invoiceNumber ? `'${job.invoiceNumber.replace(/'/g, "''")}'` : 'NULL',
        job.quoteNumber ? `'${job.quoteNumber.replace(/'/g, "''")}'` : 'NULL',
        job.generatedDocuments ? `'${JSON.stringify(job.generatedDocuments).replace(/'/g, "''")}'` : 'NULL',
        job.originalPOUrl ? `'${job.originalPOUrl.replace(/'/g, "''")}'` : 'NULL',
        job.artworkUrl ? `'${job.artworkUrl.replace(/'/g, "''")}'` : 'NULL',
        job.artworkFilename ? `'${job.artworkFilename.replace(/'/g, "''")}'` : 'NULL',
        job.locked ? 'true' : 'false',
        job.isDuplicate ? 'true' : 'false',
        `'${job.createdAt.toISOString()}'`,
        `'${job.updatedAt.toISOString()}'`
      ];
      sql += `INSERT INTO "Job" (id, number, title, status, "customerId", "vendorId", "customerPONumber", "vendorPONumber", "invoiceNumber", "quoteNumber", "generatedDocuments", "originalPOUrl", "artworkUrl", "artworkFilename", locked, "isDuplicate", "createdAt", "updatedAt") VALUES (${values.join(', ')});\n`;
    }

    sql += '\n';

    // Export JobSpecs, LineItems, JobFinancials
    for (const job of jobs) {
      if (job.specs) {
        const s = job.specs;
        const values = [
          `'${s.id}'`,
          `'${job.id}'`,
          s.productType ? `'${s.productType}'` : 'NULL',
          s.colors ? `'${s.colors.replace(/'/g, "''")}'` : 'NULL',
          s.coating ? `'${s.coating.replace(/'/g, "''")}'` : 'NULL',
          s.finishing ? `'${s.finishing.replace(/'/g, "''")}'` : 'NULL',
          s.flatSize ? `'${s.flatSize.replace(/'/g, "''")}'` : 'NULL',
          s.finishedSize ? `'${s.finishedSize.replace(/'/g, "''")}'` : 'NULL',
          s.paperType ? `'${s.paperType.replace(/'/g, "''")}'` : 'NULL',
          s.coverPaperType ? `'${s.coverPaperType.replace(/'/g, "''")}'` : 'NULL',
          s.pageCount || 'NULL',
          s.bindingStyle ? `'${s.bindingStyle.replace(/'/g, "''")}'` : 'NULL',
          s.coverType ? `'${s.coverType}'` : 'NULL',
          `'${s.createdAt.toISOString()}'`,
          `'${s.updatedAt.toISOString()}'`
        ];
        sql += `INSERT INTO "JobSpecs" (id, "jobId", "productType", colors, coating, finishing, "flatSize", "finishedSize", "paperType", "coverPaperType", "pageCount", "bindingStyle", "coverType", "createdAt", "updatedAt") VALUES (${values.join(', ')});\n`;
      }

      for (const item of job.lineItems) {
        const values = [
          `'${item.id}'`,
          `'${job.id}'`,
          `'${item.description.replace(/'/g, "''")}'`,
          item.quantity,
          item.unitCost,
          item.markupPercent || 'NULL',
          item.unitPrice,
          item.sortOrder,
          `'${item.createdAt.toISOString()}'`,
          `'${item.updatedAt.toISOString()}'`
        ];
        sql += `INSERT INTO "LineItem" (id, "jobId", description, quantity, "unitCost", "markupPercent", "unitPrice", "sortOrder", "createdAt", "updatedAt") VALUES (${values.join(', ')});\n`;
      }

      if (job.financials) {
        const f = job.financials;
        const values = [
          `'${f.id}'`,
          `'${job.id}'`,
          f.paperCostCPM || 'NULL',
          f.paperSellCPM || 'NULL',
          f.manufacturingCPM || 'NULL',
          f.jdServicesTotal || 'NULL',
          f.bradfordPaperCost || 'NULL',
          f.paperMarkupAmount || 'NULL',
          f.impactCustomerTotal || 'NULL',
          f.calculatedSpread || 'NULL',
          f.bradfordShareAmount || 'NULL',
          f.consultantFee || 'NULL',
          `'${f.createdAt.toISOString()}'`,
          `'${f.updatedAt.toISOString()}'`
        ];
        sql += `INSERT INTO "JobFinancials" (id, "jobId", "paperCostCPM", "paperSellCPM", "manufacturingCPM", "jdServicesTotal", "bradfordPaperCost", "paperMarkupAmount", "impactCustomerTotal", "calculatedSpread", "bradfordShareAmount", "consultantFee", "createdAt", "updatedAt") VALUES (${values.join(', ')});\n`;
      }
    }

    sql += '\nCOMMIT;\n';

    fs.writeFileSync(sqlFile, sql);
    console.log(`\n✓ Export complete: ${sqlFile}`);
    console.log(`  Size: ${(fs.statSync(sqlFile).size / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

exportData();
