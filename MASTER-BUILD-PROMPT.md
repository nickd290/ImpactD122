# Impact Direct - Complete System Build

## Overview

Build a simple, integrated print brokerage management system with:
1. **Web App** - Next.js for daily operations
2. **Google Sheet** - Backup, quick access, calculations
3. **Sync** - Push/pull data between app and sheet

---

## Part 1: The Business (Know This First)

### What We Do
- Customers order print jobs from us
- We send work to vendors (Bradford or others)
- Vendors print and ship
- We invoice customer, collect payment, pay vendors

### Two Vendor Paths

**Bradford (Partner)**
```
Customer → Impact Direct → Bradford → JD Graphic (prints)
                              ↓
                    50/50 profit split
                    + Bradford gets 18% paper markup
```

**Direct Vendors**
```
Customer → Impact Direct → Any Other Vendor
                              ↓
                    We keep full profit
```

### Multi-Vendor Jobs
One job can have multiple vendors:
- Bradford prints the postcards
- Three Z does the mailing
= 2 vendor assignments on 1 job

---

## Part 2: Web App Build

### Tech Stack
- Next.js 14 (App Router)
- TypeScript
- Prisma + PostgreSQL
- Tailwind CSS + shadcn/ui
- Deploy to Railway or Vercel

### Database Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// === ENUMS ===

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
}

enum AssignmentStatus {
  PENDING
  SENT
  CONFIRMED
  SHIPPED
}

enum FileKind {
  ARTWORK
  DATA_FILE
  PROOF
  CUSTOMER_PO
  INVOICE
}

// === MODELS ===

model Company {
  id        String      @id @default(cuid())
  name      String
  type      CompanyType
  email     String?
  phone     String?
  address   String?
  isPartner Boolean     @default(false)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  jobs        Job[]              @relation("CustomerJobs")
  assignments VendorAssignment[]
}

model Job {
  id         String    @id @default(cuid())
  jobNo      String    @unique
  customerId String
  customer   Company   @relation("CustomerJobs", fields: [customerId], references: [id])

  title      String
  notes      String?
  specs      Json?

  sellPrice  Float
  customerPO String?
  dueDate    DateTime?
  mailDate   DateTime?

  status     JobStatus @default(NEW)

  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  assignments VendorAssignment[]
  files       File[]

  @@index([status])
  @@index([customerId])
}

model VendorAssignment {
  id             String           @id @default(cuid())
  jobId          String
  job            Job              @relation(fields: [jobId], references: [id], onDelete: Cascade)
  vendorId       String
  vendor         Company          @relation(fields: [vendorId], references: [id])

  poNumber       String?
  isBradfordPath Boolean          @default(false)

  // Costs
  totalCost      Float?
  printCost      Float?
  paperCost      Float?
  paperType      String?
  paperLbs       Float?

  // Status tracking
  status         AssignmentStatus @default(PENDING)
  poSentAt       DateTime?
  confirmedAt    DateTime?
  shippedAt      DateTime?

  // Payment tracking
  vendorPaidAt   DateTime?
  vendorPaidAmount Float?

  // Bradford-specific
  jdInvoiceNumber String?

  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

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
  createdAt DateTime @default(now())

  @@index([jobId])
}
```

### Profit Calculation (The Core Logic)

```typescript
// lib/profit.ts

interface VendorAssignment {
  totalCost: number | null;
  paperCost: number | null;
  isBradfordPath: boolean;
}

interface ProfitResult {
  sellPrice: number;
  totalCost: number;
  grossProfit: number;
  bradfordShare: number;
  paperMarkup: number;
  yourProfit: number;
}

export function calculateProfit(
  sellPrice: number,
  assignments: VendorAssignment[]
): ProfitResult {
  // Sum all vendor costs
  const totalCost = assignments.reduce(
    (sum, a) => sum + (a.totalCost || 0),
    0
  );

  // Gross profit before any splits
  const grossProfit = sellPrice - totalCost;

  // Check for Bradford assignments
  const bradfordAssignments = assignments.filter((a) => a.isBradfordPath);
  const hasBradford = bradfordAssignments.length > 0;

  if (hasBradford) {
    // Paper markup: Bradford gets 18% on paper costs
    const paperMarkup = bradfordAssignments.reduce(
      (sum, a) => sum + (a.paperCost || 0) * 0.18,
      0
    );

    // 50/50 split on profit
    const bradfordShare = grossProfit * 0.5 + paperMarkup;
    const yourProfit = grossProfit * 0.5;

    return {
      sellPrice,
      totalCost,
      grossProfit,
      bradfordShare,
      paperMarkup,
      yourProfit,
    };
  } else {
    // Direct vendor - keep full profit
    return {
      sellPrice,
      totalCost,
      grossProfit,
      bradfordShare: 0,
      paperMarkup: 0,
      yourProfit: grossProfit,
    };
  }
}
```

### Pages to Build

1. **Dashboard** (`/`)
   - Job counts by status
   - Recent jobs list
   - Quick stats (total revenue, profit this month)

2. **Jobs** (`/jobs`)
   - List all jobs with filters (status, search)
   - Click row → Job detail

3. **Job Detail** (`/jobs/[id]`)
   - Edit job info (title, customer, dates, sell price)
   - Vendor assignments section (add/edit/remove)
   - Files section (link to existing URLs)
   - Profit breakdown panel
   - Status change buttons

4. **Customers** (`/customers`)
   - List, add, edit, delete

5. **Vendors** (`/vendors`)
   - List, add, edit, delete
   - Show "Partner" badge for Bradford

### API Routes

```
GET    /api/jobs           - List jobs (filter by status)
POST   /api/jobs           - Create job
GET    /api/jobs/[id]      - Get job with assignments + files
PUT    /api/jobs/[id]      - Update job
DELETE /api/jobs/[id]      - Delete job

POST   /api/jobs/[id]/assignments     - Add vendor assignment
PUT    /api/assignments/[id]          - Update assignment
DELETE /api/assignments/[id]          - Remove assignment

GET    /api/companies                 - List companies (filter by type)
POST   /api/companies                 - Create company
PUT    /api/companies/[id]            - Update company
DELETE /api/companies/[id]            - Delete company

POST   /api/jobs/[id]/files           - Add file reference
DELETE /api/files/[id]                - Remove file
```

---

## Part 3: Google Sheet Integration

### Sheet Structure

**Tab: JOBS**
| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Job # | Customer | Title | Status | Due Date | Customer PO | Sell Price | Vendor 1 | V1 Cost | V1 Paper | V1 Bradford? | V1 Paid? | Vendor 2 | V2 Cost | V2 Paper | V2 Bradford? | V2 Paid? |

**Calculated Columns (add to right):**
| R | S | T | U |
|---|---|---|---|
| Total Cost | Gross Profit | Bradford Share | Your Profit |

**Formulas:**
```
R2 (Total Cost):      =I2+N2
S2 (Gross Profit):    =G2-R2
T2 (Bradford Share):  =IF(K2,S2*0.5+J2*0.18,0)+IF(P2,S2*0.5+O2*0.18,0)
U2 (Your Profit):     =S2-T2
```

**Tab: CUSTOMERS**
| Name | Email | Phone | Address |

**Tab: VENDORS**
| Name | Email | Phone | Is Partner | Notes |

**Tab: DASHBOARD**
```
Status Counts:
New:           =COUNTIF(JOBS!D:D,"New")
PO Sent:       =COUNTIF(JOBS!D:D,"PO Sent")
In Production: =COUNTIF(JOBS!D:D,"In Production")
Shipped:       =COUNTIF(JOBS!D:D,"Shipped")
Invoiced:      =COUNTIF(JOBS!D:D,"Invoiced")
Paid:          =COUNTIF(JOBS!D:D,"Paid")

Totals:
Revenue:       =SUM(JOBS!G:G)
Costs:         =SUM(JOBS!R:R)
Your Profit:   =SUM(JOBS!U:U)
```

### Sync Between App and Sheet

**Option A: Manual Export/Import**
- App has "Export to CSV" button
- Download and paste into Google Sheet
- Good for weekly backups

**Option B: Google Sheets API Integration**
- App connects to Google Sheets API
- "Sync to Sheet" button pushes current data
- "Pull from Sheet" imports updates
- Requires Google API credentials

**Recommended: Start with Option A, add Option B later**

### Export Endpoint (for sync)

```typescript
// app/api/export/route.ts

import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const jobs = await prisma.job.findMany({
    include: {
      customer: true,
      assignments: {
        include: { vendor: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Transform to flat CSV-friendly format
  const rows = jobs.map(job => {
    const a1 = job.assignments[0];
    const a2 = job.assignments[1];

    return {
      jobNo: job.jobNo,
      customer: job.customer.name,
      title: job.title,
      status: job.status,
      dueDate: job.dueDate?.toISOString().split('T')[0] || '',
      customerPO: job.customerPO || '',
      sellPrice: job.sellPrice,
      vendor1: a1?.vendor.name || '',
      v1Cost: a1?.totalCost || '',
      v1Paper: a1?.paperCost || '',
      v1Bradford: a1?.isBradfordPath ? 'Yes' : '',
      v1Paid: a1?.vendorPaidAt ? 'Yes' : '',
      vendor2: a2?.vendor.name || '',
      v2Cost: a2?.totalCost || '',
      v2Paper: a2?.paperCost || '',
      v2Bradford: a2?.isBradfordPath ? 'Yes' : '',
      v2Paid: a2?.vendorPaidAt ? 'Yes' : '',
    };
  });

  // Return as JSON (can convert to CSV on frontend)
  return NextResponse.json(rows);
}
```

---

## Part 4: Migration from Old System

### Step 1: Export Old Data
Run in old ImpactD122 folder:
```bash
npx ts-node scripts/export-for-migration.ts
```
Creates `migration-export.json`

### Step 2: Import to New System
```typescript
// scripts/import-migration.ts

import { PrismaClient } from '@prisma/client';
import data from '../migration-export.json';

const prisma = new PrismaClient();

async function importData() {
  console.log('Importing companies...');
  for (const company of data.companies) {
    await prisma.company.upsert({
      where: { id: company.id },
      update: {},
      create: {
        id: company.id,
        name: company.name,
        type: company.type as 'CUSTOMER' | 'VENDOR',
        email: company.email,
        phone: company.phone,
        address: company.address,
        isPartner: company.isPartner || false,
      },
    });
  }

  console.log('Importing jobs...');
  for (const job of data.jobs) {
    await prisma.job.upsert({
      where: { id: job.id },
      update: {},
      create: {
        id: job.id,
        jobNo: job.jobNo,
        customerId: job.customerId,
        title: job.title || 'Untitled',
        notes: job.notes,
        specs: job.specs,
        sellPrice: job.sellPrice || 0,
        customerPO: job.customerPO,
        dueDate: job.dueDate ? new Date(job.dueDate) : null,
        status: mapStatus(job.newStatus),
        createdAt: new Date(job.createdAt),
      },
    });
  }

  console.log('Importing vendor assignments...');
  for (const po of data.purchaseOrders) {
    const job = data.jobs.find(j => j.id === po.jobId);
    const vendor = data.companies.find(c => c.id === po.vendorId);

    await prisma.vendorAssignment.create({
      data: {
        jobId: po.jobId,
        vendorId: po.vendorId,
        poNumber: po.poNumber,
        isBradfordPath: vendor?.isPartner || false,
        totalCost: po.amount,
        paperCost: po.paperCost,
        printCost: po.printCost,
        status: mapPOStatus(po.status),
      },
    });
  }

  console.log('Done!');
}

function mapStatus(s: string): 'NEW' | 'PO_SENT' | 'IN_PRODUCTION' | 'SHIPPED' | 'INVOICED' | 'PAID' {
  const map: Record<string, any> = {
    'NEW': 'NEW',
    'PO_SENT': 'PO_SENT',
    'IN_PRODUCTION': 'IN_PRODUCTION',
    'SHIPPED': 'SHIPPED',
    'INVOICED': 'INVOICED',
    'PAID': 'PAID',
  };
  return map[s] || 'NEW';
}

function mapPOStatus(s: string): 'PENDING' | 'SENT' | 'CONFIRMED' | 'SHIPPED' {
  if (s === 'ACCEPTED' || s === 'IN_PROGRESS') return 'CONFIRMED';
  if (s === 'COMPLETED') return 'SHIPPED';
  return 'PENDING';
}

importData().finally(() => prisma.$disconnect());
```

### Step 3: Import to Google Sheet
1. Export from new app: `GET /api/export`
2. Copy JSON to Google Sheet (or use CSV download)
3. Formulas auto-calculate profit

---

## Part 5: Build Order (Step by Step)

### Week 1: Foundation
- [ ] Create Next.js project with Prisma
- [ ] Set up database schema
- [ ] Create seed data (Bradford + test vendors + 10 sample jobs)
- [ ] Build profit calculation function with tests
- [ ] Basic API routes (CRUD for companies, jobs, assignments)

### Week 2: Core UI
- [ ] Dashboard page (status counts, recent jobs)
- [ ] Jobs list page (table with filters)
- [ ] Job detail page (edit form, assignments, profit display)
- [ ] Companies pages (customers + vendors)

### Week 3: Integration
- [ ] Export endpoint for Google Sheet sync
- [ ] Create Google Sheet template with formulas
- [ ] Import migration data from old system
- [ ] Test with real data

### Week 4: Polish
- [ ] File references (link existing S3 URLs)
- [ ] Status change workflow
- [ ] Vendor payment tracking
- [ ] Deploy to Railway

---

## Quick Start Commands

```bash
# Create project
npx create-next-app@latest impact-direct --typescript --tailwind --app --src-dir
cd impact-direct

# Add dependencies
npm install prisma @prisma/client
npm install @tanstack/react-query sonner lucide-react

# Setup shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input label table dialog select badge card tabs textarea

# Initialize database
npx prisma init
# Paste schema, then:
npx prisma migrate dev --name init
npx prisma db seed

# Run
npm run dev
```

---

## Google Sheet Template Setup

1. Create new Google Sheet named "Impact Direct Tracker"
2. Create tabs: JOBS, CUSTOMERS, VENDORS, DASHBOARD
3. In JOBS tab, add headers (row 1):
   ```
   Job # | Customer | Title | Status | Due Date | Customer PO | Sell Price | Vendor 1 | V1 Cost | V1 Paper | V1 Bradford? | V1 Paid? | Vendor 2 | V2 Cost | V2 Paper | V2 Bradford? | V2 Paid? | Total Cost | Gross Profit | Bradford Share | Your Profit
   ```
4. Add formulas in row 2, columns R-U:
   - R2: `=I2+N2`
   - S2: `=G2-R2`
   - T2: `=IF(K2="Yes",S2*0.5+J2*0.18,0)+IF(P2="Yes",S2*0.5+O2*0.18,0)`
   - U2: `=S2-T2`
5. Add data validation for Status column (D):
   - New, PO Sent, In Production, Shipped, Invoiced, Paid
6. Copy formulas down as you add rows

---

## What You Get

| Component | Purpose |
|-----------|---------|
| **Web App** | Daily operations - create jobs, track status, manage vendors |
| **Google Sheet** | Backup, quick calculations, accessible anywhere, offline capable |
| **Export/Sync** | Keep both in sync, never lose data |
| **Profit Logic** | Automatic Bradford split + paper markup calculation |
| **Simple Status** | 6 clear statuses instead of 15+ workflow states |

---

## Success Criteria

- [ ] Can create a job and assign vendors
- [ ] Bradford jobs show 50/50 split + paper markup
- [ ] Direct vendor jobs show full profit
- [ ] Can export to Google Sheet
- [ ] Sheet formulas match app calculations
- [ ] Old data successfully migrated
- [ ] App deployed and accessible

---

## Files in This Repo

- `MASTER-BUILD-PROMPT.md` - This file (the complete build guide)
- `REBUILD-PLAN.md` - Detailed rebuild phases
- `scripts/export-for-migration.ts` - Export data from old system
- `migration-export.json` - Exported data (after running script)
