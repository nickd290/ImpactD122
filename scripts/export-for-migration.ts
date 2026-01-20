/**
 * Export script for migration to simplified system
 * Run with: npx ts-node scripts/export-for-migration.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface MigrationExport {
  exportedAt: string;
  counts: {
    jobs: number;
    customers: number;
    vendors: number;
    purchaseOrders: number;
    files: number;
  };
  companies: any[];
  jobs: any[];
  purchaseOrders: any[];
  files: any[];
}

async function exportData() {
  console.log('Starting data export for migration...\n');

  // 1. Export Companies (Customers + Vendors)
  console.log('Exporting companies...');
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      email: true,
      phone: true,
      address: true,
      createdAt: true,
    }
  });

  // Also get Vendors (separate table in current schema)
  const vendors = await prisma.vendor.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      isPartner: true,
      createdAt: true,
    }
  });

  // Merge into unified company list
  const allCompanies = [
    ...companies.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type === 'CUSTOMER' ? 'CUSTOMER' : 'VENDOR',
      email: c.email,
      phone: c.phone,
      address: c.address,
      isPartner: false,
      createdAt: c.createdAt,
    })),
    ...vendors.map(v => ({
      id: v.id,
      name: v.name,
      type: 'VENDOR',
      email: v.email,
      phone: v.phone,
      address: v.address,
      isPartner: v.isPartner || false,
      createdAt: v.createdAt,
    }))
  ];

  console.log(`  Found ${companies.length} customers, ${vendors.length} vendors`);

  // 2. Export Jobs (simplified)
  console.log('Exporting jobs...');
  const jobs = await prisma.job.findMany({
    where: { deletedAt: null },
    include: {
      Company: true,
      Vendor: true,
      PurchaseOrder: {
        include: { Vendor: true }
      },
      ProfitSplit: true,
      File: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  const simplifiedJobs = jobs.map(job => ({
    // IDs
    id: job.id,
    jobNo: job.jobNo,

    // Core info
    title: job.title,
    customerId: job.customerId,
    customerName: job.Company?.name,
    vendorId: job.vendorId,
    vendorName: job.Vendor?.name,

    // Status mapping
    oldStatus: job.status,
    oldWorkflowStatus: job.workflowStatus,
    newStatus: mapStatus(job.status, job.workflowStatus),

    // Dates
    dueDate: job.deliveryDate,
    mailDate: job.mailDate,
    completedAt: job.completedAt,
    createdAt: job.createdAt,

    // Customer reference
    customerPO: job.customerPONumber,

    // Specs (keep as-is)
    specs: job.specs,
    notes: job.notes,

    // Financials
    sellPrice: job.sellPrice ? Number(job.sellPrice) : null,
    totalCost: calculateTotalCost(job),
    profit: job.ProfitSplit ? Number(job.ProfitSplit.impactProfit) : null,

    // Pathway
    pathway: job.pathway || (job.routingType === 'BRADFORD_JD' ? 'P1' : 'P2'),

    // Payment status
    customerPaid: !!job.customerPaymentDate,
    vendorPaid: !!job.vendorPaymentDate,

    // File counts
    fileCount: job.File?.length || 0,
    poCount: job.PurchaseOrder?.length || 0,
  }));

  console.log(`  Found ${jobs.length} jobs`);

  // 3. Export Purchase Orders
  console.log('Exporting purchase orders...');
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    include: { Vendor: true }
  });

  const simplifiedPOs = purchaseOrders.map(po => ({
    id: po.id,
    poNumber: po.poNumber,
    jobId: po.jobId,
    vendorId: po.vendorId,
    vendorName: po.Vendor?.name,

    // Costs
    amount: po.totalCost ? Number(po.totalCost) : null,
    paperCost: po.paperCost ? Number(po.paperCost) : null,
    printCost: po.printCost ? Number(po.printCost) : null,

    // Status
    status: po.status,
    sentAt: po.emailedAt,
    createdAt: po.createdAt,
  }));

  console.log(`  Found ${purchaseOrders.length} purchase orders`);

  // 4. Export Files
  console.log('Exporting files...');
  const files = await prisma.file.findMany({
    where: { jobId: { not: null } }
  });

  const simplifiedFiles = files.map(f => ({
    id: f.id,
    jobId: f.jobId,
    kind: f.kind,
    fileName: f.fileName,
    objectKey: f.objectKey,
    mimeType: f.mimeType,
    size: f.size,
    createdAt: f.createdAt,
  }));

  console.log(`  Found ${files.length} files`);

  // Build export object
  const exportData: MigrationExport = {
    exportedAt: new Date().toISOString(),
    counts: {
      jobs: simplifiedJobs.length,
      customers: companies.length,
      vendors: vendors.length,
      purchaseOrders: simplifiedPOs.length,
      files: simplifiedFiles.length,
    },
    companies: allCompanies,
    jobs: simplifiedJobs,
    purchaseOrders: simplifiedPOs,
    files: simplifiedFiles,
  };

  // Write to file
  const outputPath = './migration-export.json';
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

  console.log('\n========================================');
  console.log('Export complete!');
  console.log('========================================');
  console.log(`Output: ${outputPath}`);
  console.log(`\nSummary:`);
  console.log(`  - ${exportData.counts.customers} customers`);
  console.log(`  - ${exportData.counts.vendors} vendors`);
  console.log(`  - ${exportData.counts.jobs} jobs`);
  console.log(`  - ${exportData.counts.purchaseOrders} purchase orders`);
  console.log(`  - ${exportData.counts.files} files`);
  console.log('\nNext step: Use this JSON to import into the new simplified system.');
}

// Map old status fields to new unified status
function mapStatus(oldStatus: string, workflowStatus: string): string {
  if (oldStatus === 'PAID') return 'PAID';
  if (oldStatus === 'CANCELLED') return 'CANCELLED';

  // Map workflow status
  switch (workflowStatus) {
    case 'NEW_JOB':
      return 'NEW';
    case 'AWAITING_PROOF_FROM_VENDOR':
    case 'PROOF_RECEIVED':
    case 'PROOF_SENT_TO_CUSTOMER':
    case 'AWAITING_PROOF_APPROVAL':
    case 'APPROVED_PENDING_VENDOR':
      return 'PO_SENT';
    case 'IN_PRODUCTION':
      return 'IN_PRODUCTION';
    case 'SHIPPED':
    case 'COMPLETED':
      return 'SHIPPED';
    case 'INVOICED':
      return 'INVOICED';
    default:
      return 'NEW';
  }
}

// Calculate total cost from POs
function calculateTotalCost(job: any): number | null {
  if (!job.PurchaseOrder || job.PurchaseOrder.length === 0) {
    return null;
  }

  return job.PurchaseOrder.reduce((sum: number, po: any) => {
    return sum + (po.totalCost ? Number(po.totalCost) : 0);
  }, 0);
}

exportData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
