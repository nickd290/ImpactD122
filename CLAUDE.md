# impact-direct (ImpactD122)

Internal operations dashboard for Impact Direct Printing. Kanban job board, financials, vendor RFQs, email sync, PO management, Bradford margin tracking, and multi-entity payment flows. Production critical — 66+ active jobs. Receives webhooks from impact-portal (customer-facing).

For full business context, see the `/impact-direct` skill.

---

## Stack

- **Client:** Vite 6 + React 19 + TypeScript + React Router 7 + TanStack Query
- **Server:** Express 4 + TypeScript (tsx watch)
- **Database:** PostgreSQL via Prisma 6
- **AI:** Google Generative AI (Gemini) for spec parsing, PO parsing, email generation
- **PDF:** PDFKit + jsPDF (quotes, invoices, vendor POs, statements)
- **Email:** SendGrid (from brandon@impactdirectprinting.com)
- **File Upload:** Multer
- **Package manager:** npm (NOT pnpm — npm workspaces)
- **Ports:** Client 3002, Server 3001
- **Monorepo:** npm workspaces (client/ + server/)

## Commands

```bash
npm run dev           # Client + server concurrently
npm run dev:client    # Vite dev (3002)
npm run dev:server    # Express server (3001)
npm run build         # Build both workspaces
npm run db:push       # Push schema
npm run db:studio     # Prisma Studio
npm run db:seed       # Seed data
```

## Server Routes (17 route files)

### Jobs (`/api/jobs`)
- `GET /` — list all, `GET /:id` — detail, `POST /` — create, `PUT /:id` — update, `DELETE /:id` — delete
- `GET /workflow-view` — Kanban board view
- `GET /production-view` — production board
- `POST /from-email` — n8n webhook creates job from email
- `POST /import` — batch import, `POST /batch-delete` — bulk delete
- `PATCH /:id/status` — update status, `PATCH /:id/workflow-status` — workflow status
- `PATCH /:id/lock` — toggle lock, `PATCH /:id/bradford-ref` — Bradford reference
- `PATCH /:id/payments` — update payments, `POST /batch-payment` — bulk payment
- `PATCH /:id/invoice-sent`, `/:id/customer-paid`, `/:id/vendor-paid`, `/:id/bradford-paid`, `/:id/jd-paid` — payment flow marks
- `POST /:id/send-jd-invoice` — generate + send JD invoice
- `GET /:id/jd-invoice-pdf` — download JD invoice PDF
- `POST /bulk-generate-jd-invoices` — batch JD invoices
- POs: `GET /:jobId/pos`, `POST /:jobId/pos`, `PUT /:jobId/pos/:poId`, `DELETE /:jobId/pos/:poId`
- Files: `GET /:jobId/files`, `POST /:jobId/files`, `DELETE /:jobId/files/:fileId`
- Components: `GET /:id/components`, `POST`, `PUT`, `DELETE`
- Change Orders: `GET /:jobId/change-orders`, `POST`, `PATCH`, `DELETE`, submit/approve/reject
- QC: `GET /:id/readiness`, `PATCH /:id/qc`, `POST /:id/readiness/recalculate`

### Bradford (`/api/bradford`)
- `GET /stats` — Bradford dashboard stats
- `PUT /jobs/:jobId/po` — update PO, `PUT /jobs/:jobId/paper-type` — paper type
- `POST /capture-po` — capture PO from email

### Dashboard (`/api/dashboard`)
- `GET /whats-next` — action items, `PUT /jobs/:jobId/proof-urgency` — set urgency

### Financials (`/api/financials`)
- `GET /summary`, `/by-customer`, `/by-vendor`

### Email (`/api/email`)
- `POST /vendor-customer-po/:jobId`, `/invoice/:jobId`, `/artwork/:jobId`
- `POST /confirmation/:jobId`, `/tracking/:jobId/:shipmentId`
- `POST /po-portal/:jobId/:poId`, `/proof/:jobId`, `/vendor-approval/:jobId`

### Email Sync (`/api/email-sync`)
- `GET /health`, `/needs-review`
- `POST /thread`, `/event`, `/match`, `/link-thread`, `/resolve-review`, `/classify`

### Vendor RFQ (`/api/rfq`)
- Full CRUD: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`
- `POST /:id/send`, `/:id/quotes`, `/:id/award/:vendorId`, `/:id/convert-to-job`
- Public: `GET /quote/:rfqId/:token`, `POST /quote/:rfqId/:token`

### Portal (`/api/portal`)
- `POST /jobs/:jobId/portal` — create portal access
- `GET /portal/:token` — access portal, `GET /portal/:token/po` — download PO
- `POST /portal/:token/confirm`, `/status`, `/upload`

### Other Routes
- **Communications** (`/api/communications`) — email threads, internal notes, inbound webhook
- **PDF** (`/api/pdf`) — quote, invoice, vendor-po, purchase-order, customer-statement
- **Files** (`/api/files`) — upload/download
- **Entities** (`/api/entities`) — company CRUD
- **Paper Inventory** (`/api/paper-inventory`) — Three Z paper tracking
- **AI** (`/api/ai`) — parse-specs, parse-po, generate-email
- **Webhooks** (`/api/webhooks`) — receive jobs/campaigns from impact-portal
- **Export** (`/api/export`) — data export (API key required)

## Data Model (Key Models)

Job, Company, Invoice (CUSTOMER/VENDOR/INTER_COMPANY types), Payment, RFQ, VendorQuote, PurchaseOrder, EmailCommunication, EmailThread, ProofRequest, ProofApproval, MailingList, MailingRecord, PaperInventoryItem, ChangeOrder, JobComponent, CampaignDrop

### Job Statuses
`NEW_JOB → ARTWORK_REQUESTED → DATA_REQUESTED → IN_PRODUCTION → PRINTED → AWAITING_SHIPMENT → SHIPPED → IN_MAIL → DELIVERED → COMPLETED → PAID → ARCHIVED`

### Workflow Statuses
`NEW → ACTIVE → COMPLETE → DEFERRED → ON_HOLD → ARCHIVED → WITHDRAWN`

## Environment Variables

DATABASE_URL, GEMINI_API_KEY, PORT, NODE_ENV, SENDGRID_API_KEY

## Safe Edit Zones

| Path | Notes |
|------|-------|
| `server/src/services/*` | Business logic — add new services here |
| `server/src/controllers/*` | Route handlers — follow existing patterns |
| `server/src/types/*` | TypeScript types — extend as needed |
| `client/src/components/*` | React components |
| `client/src/lib/api.ts` | API client methods |

## Do Not Touch

| Path | Reason |
|------|--------|
| `server/src/services/jobCreationService.ts` | Atomic job creation — use `createJobUnified()` |
| `server/src/services/jobIdService.ts` | ID generation — breaking changes cascade |
| `server/src/services/pathwayService.ts` | P1/P2/P3 routing logic — business critical |
| `server/src/services/emailGuard.ts` | Dedup — prevents duplicate emails |
| `server/src/middleware/upload.ts` | File upload config — security sensitive |

## Hard Rules

1. **npm only** — NOT pnpm. npm workspaces monorepo.
2. **Use `createJobUnified()`** to create jobs — never insert directly.
3. **Payment flow uses `mark-*` endpoints** — never update payment fields directly.
4. **Workflow status via `/api/jobs/:id/workflow-status`** — not direct PATCH.
5. **Port 3001 shared** with menucraft and threez-app — don't run simultaneously.
6. **SendGrid from address** is brandon@impactdirectprinting.com.
7. **Webhook integration with impact-portal** — don't change webhook secret or endpoint without updating both sides.
8. **P0 production app** — deployed on Railway. Don't break it.

## Current State

### Working
- Kanban board with 66+ active jobs
- Bradford margin tracking and PO capture
- Email sync and threading
- Vendor RFQ workflow
- JD invoice generation and sending
- Payment flow (customer → Impact → Bradford/JD/Quad Fold)

### Recent Focus
- UX redesign: ActionItemsView, BlockingIssueCard, sidebar reorganization
- Email parser updating 39 J-2xxx job titles
- Job pipeline board restoration
