# ImpactD122 Rebuild Plan

## Overview

Rebuild the print brokerage system with a simplified architecture while preserving all job data and core functionality.

**Current State:** 30 models, 22 services, 90+ components, 120+ fields in Job model
**Target State:** 8 models, 6 services, ~40 components, 20 fields in Job model

---

## Phase 1: Export Data (Day 1)

### Run Export Script
```bash
cd /home/user/ImpactD122
npx ts-node scripts/export-for-migration.ts
```

This creates `migration-export.json` with:
- All customers and vendors (unified)
- All jobs with simplified status
- All purchase orders
- All file references

### Verify Export
- [ ] Check job count matches expected
- [ ] Spot-check 5-10 jobs for data accuracy
- [ ] Verify customer/vendor names are correct
- [ ] Confirm financial data (sellPrice, costs) are present

---

## Phase 2: New Project Setup (Day 1-2)

### Create New Next.js Project
```bash
npx create-next-app@latest impact-simple --typescript --tailwind --app --src-dir
cd impact-simple

# Add dependencies
npm install prisma @prisma/client
npm install @tanstack/react-query
npm install sonner  # Toast notifications
npm install lucide-react  # Icons
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu  # UI primitives

# Initialize Prisma
npx prisma init
```

### Project Structure
```
impact-simple/
├── prisma/
│   └── schema.prisma        # Simplified schema (8 models)
├── src/
│   ├── app/
│   │   ├── page.tsx         # Dashboard
│   │   ├── jobs/
│   │   │   ├── page.tsx     # Jobs list
│   │   │   └── [id]/page.tsx # Job detail
│   │   ├── customers/page.tsx
│   │   ├── vendors/page.tsx
│   │   └── api/
│   │       ├── jobs/route.ts
│   │       ├── companies/route.ts
│   │       └── files/route.ts
│   ├── components/
│   │   ├── ui/              # Reusable UI (Button, Input, Modal, etc.)
│   │   ├── JobCard.tsx
│   │   ├── JobForm.tsx
│   │   ├── CompanySelect.tsx
│   │   └── StatusBadge.tsx
│   ├── lib/
│   │   ├── prisma.ts        # Prisma client
│   │   ├── pricing.ts       # ALL pricing logic in ONE file
│   │   └── utils.ts         # Formatters, helpers
│   └── types/
│       └── index.ts         # TypeScript types
├── scripts/
│   └── import-migration.ts  # Import from JSON
└── migration-export.json    # Data from old system
```

---

## Phase 3: Simplified Schema (Day 2)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Company {
  id          String      @id @default(cuid())
  type        CompanyType
  name        String
  email       String?
  phone       String?
  address     String?
  isPartner   Boolean     @default(false)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  customerJobs Job[]      @relation("CustomerJobs")
  vendorJobs   Job[]      @relation("VendorJobs")
  purchaseOrders PurchaseOrder[]
}

model Job {
  id            String    @id @default(cuid())
  jobNo         String    @unique
  title         String?

  // Relationships
  customerId    String
  customer      Company   @relation("CustomerJobs", fields: [customerId], references: [id])
  vendorId      String?
  vendor        Company?  @relation("VendorJobs", fields: [vendorId], references: [id])

  // Single status field
  status        JobStatus @default(NEW)

  // Dates
  dueDate       DateTime?
  mailDate      DateTime?
  completedAt   DateTime?

  // Customer reference
  customerPO    String?

  // Flexible specs
  specs         Json?
  notes         String?

  // Financials (calculated, stored for speed)
  sellPrice     Decimal?  @db.Decimal(10, 2)
  totalCost     Decimal?  @db.Decimal(10, 2)
  profit        Decimal?  @db.Decimal(10, 2)

  // Simple pathway
  pathway       Pathway   @default(P1)

  // Timestamps
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  purchaseOrders PurchaseOrder[]
  files          File[]
  activities     Activity[]

  @@index([customerId])
  @@index([vendorId])
  @@index([status])
}

model PurchaseOrder {
  id        String   @id @default(cuid())
  poNumber  String   @unique
  jobId     String
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  vendorId  String
  vendor    Company  @relation(fields: [vendorId], references: [id])

  amount    Decimal? @db.Decimal(10, 2)
  paperCost Decimal? @db.Decimal(10, 2)
  printCost Decimal? @db.Decimal(10, 2)

  status    POStatus @default(PENDING)
  sentAt    DateTime?
  paidAt    DateTime?

  createdAt DateTime @default(now())

  @@index([jobId])
  @@index([vendorId])
}

model File {
  id        String   @id @default(cuid())
  jobId     String
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  kind      FileKind
  fileName  String
  url       String
  size      Int?
  createdAt DateTime @default(now())

  @@index([jobId])
}

model Activity {
  id        String   @id @default(cuid())
  jobId     String
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  action    String
  details   Json?
  userId    String?
  createdAt DateTime @default(now())

  @@index([jobId])
  @@index([createdAt])
}

// Enums
enum CompanyType {
  CUSTOMER
  VENDOR
}

enum JobStatus {
  NEW
  PO_SENT
  IN_PRODUCTION
  SHIPPED
  INVOICED
  PAID
  CANCELLED
}

enum Pathway {
  P1  // Bradford partner (50/50 split)
  P2  // Direct vendor (65/35 split)
}

enum POStatus {
  PENDING
  SENT
  CONFIRMED
  PAID
}

enum FileKind {
  ARTWORK
  DATA_FILE
  CUSTOMER_PO
  PROOF
  INVOICE
  OTHER
}
```

---

## Phase 4: Core Services (Day 2-3)

### Single Pricing Service
```typescript
// src/lib/pricing.ts

interface PricingInput {
  sellPrice: number;
  totalCost: number;
  pathway: 'P1' | 'P2';
  paperCost?: number;
}

interface PricingResult {
  grossMargin: number;
  impactProfit: number;
  partnerProfit: number;  // Bradford's share (P1 only)
}

export function calculatePricing(input: PricingInput): PricingResult {
  const { sellPrice, totalCost, pathway, paperCost = 0 } = input;
  const grossMargin = sellPrice - totalCost;

  if (pathway === 'P1') {
    // Bradford partnership: 50/50 split + 18% paper markup
    const paperMarkup = paperCost * 0.18;
    const spreadAfterPaper = grossMargin - paperMarkup;
    const impactProfit = spreadAfterPaper * 0.5;
    const partnerProfit = (spreadAfterPaper * 0.5) + paperMarkup;

    return { grossMargin, impactProfit, partnerProfit };
  } else {
    // Direct vendor: 65/35 split
    return {
      grossMargin,
      impactProfit: grossMargin * 0.65,
      partnerProfit: grossMargin * 0.35,
    };
  }
}
```

### Simple API Routes
```typescript
// src/app/api/jobs/route.ts

import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const jobs = await prisma.job.findMany({
    include: {
      customer: true,
      vendor: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(jobs);
}

export async function POST(req: Request) {
  const data = await req.json();
  const job = await prisma.job.create({
    data: {
      jobNo: await generateJobNo(),
      ...data,
    },
    include: { customer: true, vendor: true },
  });
  return NextResponse.json(job);
}

async function generateJobNo(): Promise<string> {
  const count = await prisma.job.count();
  return `J-${(count + 1).toString().padStart(4, '0')}`;
}
```

---

## Phase 5: Import Migration Data (Day 3)

```typescript
// scripts/import-migration.ts

import { PrismaClient } from '@prisma/client';
import migrationData from '../migration-export.json';

const prisma = new PrismaClient();

async function importData() {
  console.log('Starting import...\n');

  // 1. Import Companies
  console.log('Importing companies...');
  for (const company of migrationData.companies) {
    await prisma.company.upsert({
      where: { id: company.id },
      update: {},
      create: {
        id: company.id,
        type: company.type as 'CUSTOMER' | 'VENDOR',
        name: company.name,
        email: company.email,
        phone: company.phone,
        address: company.address,
        isPartner: company.isPartner || false,
      },
    });
  }
  console.log(`  Imported ${migrationData.companies.length} companies`);

  // 2. Import Jobs
  console.log('Importing jobs...');
  for (const job of migrationData.jobs) {
    await prisma.job.upsert({
      where: { id: job.id },
      update: {},
      create: {
        id: job.id,
        jobNo: job.jobNo,
        title: job.title,
        customerId: job.customerId,
        vendorId: job.vendorId,
        status: job.newStatus as any,
        dueDate: job.dueDate ? new Date(job.dueDate) : null,
        mailDate: job.mailDate ? new Date(job.mailDate) : null,
        completedAt: job.completedAt ? new Date(job.completedAt) : null,
        customerPO: job.customerPO,
        specs: job.specs,
        notes: job.notes,
        sellPrice: job.sellPrice,
        totalCost: job.totalCost,
        profit: job.profit,
        pathway: job.pathway as 'P1' | 'P2',
        createdAt: new Date(job.createdAt),
      },
    });
  }
  console.log(`  Imported ${migrationData.jobs.length} jobs`);

  // 3. Import Purchase Orders
  console.log('Importing purchase orders...');
  for (const po of migrationData.purchaseOrders) {
    await prisma.purchaseOrder.upsert({
      where: { id: po.id },
      update: {},
      create: {
        id: po.id,
        poNumber: po.poNumber,
        jobId: po.jobId,
        vendorId: po.vendorId,
        amount: po.amount,
        paperCost: po.paperCost,
        printCost: po.printCost,
        status: mapPOStatus(po.status),
        sentAt: po.sentAt ? new Date(po.sentAt) : null,
      },
    });
  }
  console.log(`  Imported ${migrationData.purchaseOrders.length} POs`);

  // 4. Import Files (references only - actual files stay in S3)
  console.log('Importing file references...');
  for (const file of migrationData.files) {
    await prisma.file.upsert({
      where: { id: file.id },
      update: {},
      create: {
        id: file.id,
        jobId: file.jobId,
        kind: file.kind as any,
        fileName: file.fileName,
        url: file.objectKey, // S3 key becomes URL
        size: file.size,
      },
    });
  }
  console.log(`  Imported ${migrationData.files.length} files`);

  console.log('\nImport complete!');
}

function mapPOStatus(oldStatus: string): 'PENDING' | 'SENT' | 'CONFIRMED' | 'PAID' {
  switch (oldStatus) {
    case 'ACCEPTED':
    case 'IN_PROGRESS':
      return 'CONFIRMED';
    case 'COMPLETED':
      return 'PAID';
    default:
      return 'PENDING';
  }
}

importData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## Phase 6: Build UI (Day 3-5)

### Core Pages Needed
1. **Dashboard** - Job counts by status, recent jobs
2. **Jobs List** - Filter by status, search, click to detail
3. **Job Detail** - Edit job, view/add files, change status
4. **Customers** - List, add, edit
5. **Vendors** - List, add, edit

### Component Hierarchy
```
App
├── Dashboard
│   ├── StatCard (x4: New, In Progress, Shipped, Paid)
│   └── RecentJobsList
├── JobsPage
│   ├── JobFilters
│   ├── JobTable
│   │   └── JobRow (click → JobDetail)
│   └── CreateJobButton → JobForm modal
├── JobDetailPage
│   ├── JobHeader (jobNo, title, status badge)
│   ├── JobInfoCard (customer, vendor, dates)
│   ├── JobFinancialsCard (sell, cost, profit)
│   ├── JobFilesCard (upload, list)
│   └── JobActivityFeed
└── CompaniesPage
    ├── CompanyTable
    └── CompanyForm modal
```

---

## Phase 7: Deploy & Cutover (Day 5-6)

### Deploy New System
```bash
# Push to new repo
git init
git add .
git commit -m "Initial simplified system"
git remote add origin <new-repo-url>
git push -u origin main

# Deploy to Railway/Vercel
# Connect new database
# Run migration: npx prisma migrate deploy
# Run import: npx ts-node scripts/import-migration.ts
```

### Cutover Checklist
- [ ] Export final data from old system
- [ ] Import to new system
- [ ] Verify job counts match
- [ ] Spot-check 10 jobs for accuracy
- [ ] Test creating a new job
- [ ] Test updating job status
- [ ] Test file upload
- [ ] Update DNS/Railway to point to new system
- [ ] Keep old system running (read-only) for 1 week

---

## What You Lose (Intentionally)

| Feature | Status |
|---------|--------|
| Email relay system | Removed - use regular email |
| AI spec parsing | Removed - can add later if needed |
| Campaign/recurring jobs | Removed |
| RFQ system | Removed |
| Paper inventory tracking | Removed |
| Complex workflow states | Simplified to 7 statuses |
| QC override flags | Removed - just update status |
| Gmail thread sync | Removed |
| Multi-component P3 jobs | Simplified to P1/P2 only |

## What You Keep

| Feature | Status |
|---------|--------|
| All job data | Migrated |
| Customer & vendor records | Migrated |
| Purchase orders | Migrated |
| File references | Migrated (files stay in S3) |
| Pricing logic | Simplified to one function |
| Job workflow | Simplified to 7 clear statuses |
| Profit split (50/50 and 65/35) | Preserved |

---

## Timeline Summary

| Day | Task |
|-----|------|
| 1 | Export data, verify, setup new project |
| 2 | Schema, Prisma setup, core API routes |
| 3 | Import data, verify migration |
| 3-4 | Build Dashboard, Jobs list |
| 4-5 | Build Job detail, Company pages |
| 5-6 | Deploy, test, cutover |
| 7+ | Run parallel, then decommission old |

---

## Questions Before Starting

1. **File storage** - Keep using same S3 bucket? Or migrate files too?
2. **Authentication** - Need user accounts? Or single-user for now?
3. **PDF generation** - Need quotes/invoices as PDFs? Or just data?
4. **Hosted vs Self-hosted** - Railway, Vercel, or something else?
