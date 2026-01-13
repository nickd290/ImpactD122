# ImpactD122 - Architecture

> **CRITICAL**: Read this file before ANY code changes. Update route registry after adding/modifying routes.

## Project Structure

```
ImpactD122/
├── client/                 # React frontend (Vite)
│   ├── src/components/    # 52 UI components
│   ├── src/lib/           # API clients
│   └── src/services/      # Business logic
├── server/                 # Express backend
│   ├── src/controllers/   # 18 controllers
│   ├── src/routes/        # 14 route files
│   ├── src/services/      # 20+ business services
│   └── prisma/            # Database schema
└── package.json           # Workspace root
```

---

## Route Registry

### Jobs API (`/api/jobs`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/jobs | jobsController | List all jobs |
| GET | /api/jobs/workflow-view | jobsController | Filtered workflow view |
| GET | /api/jobs/:id | jobsController | Get single job |
| POST | /api/jobs | jobsController | Create job |
| PUT | /api/jobs/:id | jobsController | Update job |
| DELETE | /api/jobs/:id | jobsController | Delete job |
| PATCH | /api/jobs/:id/status | jobsController | Update status |
| PATCH | /api/jobs/:id/lock | jobsController | Toggle lock |
| PATCH | /api/jobs/:id/workflow-status | jobsController | Manual workflow override |
| PATCH | /api/jobs/:id/qc-overrides | jobsQcController | QC override flags |
| GET | /api/jobs/:id/readiness | jobsQcController | Check readiness |
| PATCH | /api/jobs/:id/readiness | jobsQcController | Update QC flags |
| POST | /api/jobs/:id/recalculate-readiness | jobsQcController | Force recalc |

### Jobs - PO Management
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| POST | /api/jobs/:id/po | jobsPOController | Create PO |
| GET | /api/jobs/:id/pos | jobsPOController | List POs |
| PUT | /api/jobs/:id/po/:poId | jobsPOController | Update PO |
| DELETE | /api/jobs/:id/po/:poId | jobsPOController | Delete PO |

### Jobs - Payment Tracking
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| PUT | /api/jobs/:id/payments | jobsPaymentController | Update payments |
| POST | /api/jobs/:id/mark-invoice-sent | jobsPaymentController | Mark invoice sent |
| POST | /api/jobs/:id/mark-customer-paid | jobsPaymentController | Customer → Impact |
| POST | /api/jobs/:id/mark-vendor-paid | jobsPaymentController | Impact → Vendor |
| POST | /api/jobs/:id/mark-bradford-paid | jobsPaymentController | Impact → Bradford (P1) |
| POST | /api/jobs/:id/send-jd-invoice | jobsPaymentController | Send JD invoice |
| POST | /api/jobs/:id/download-jd-invoice | jobsPaymentController | Download JD PDF |
| POST | /api/jobs/:id/mark-jd-paid | jobsPaymentController | Mark JD paid |
| POST | /api/jobs/bulk-generate-jd-invoices | jobsPaymentController | Bulk invoices |

### Jobs - Components
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/jobs/:id/components | jobsController | Get components |
| POST | /api/jobs/:id/components | jobsController | Add component |
| PUT | /api/jobs/:id/components/:compId | jobsController | Update component |
| DELETE | /api/jobs/:id/components/:compId | jobsController | Delete component |

### Jobs - Change Orders
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/jobs/:id/change-orders | changeOrderController | List change orders |
| POST | /api/jobs/:id/change-orders | changeOrderController | Create change order |
| GET | /api/jobs/:id/change-orders/:coId | changeOrderController | Get change order |
| PUT | /api/jobs/:id/change-orders/:coId | changeOrderController | Update change order |
| DELETE | /api/jobs/:id/change-orders/:coId | changeOrderController | Delete change order |
| POST | /api/jobs/:id/change-orders/:coId/submit | changeOrderController | Submit for approval |
| POST | /api/jobs/:id/change-orders/:coId/approve | changeOrderController | Approve |
| POST | /api/jobs/:id/change-orders/:coId/reject | changeOrderController | Reject |

### Jobs - Tasks
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| POST | /api/jobs/:id/active-task | jobsController | Set active task |
| POST | /api/jobs/:id/complete-task | jobsController | Complete task |

### Jobs - Import/Export
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| POST | /api/jobs/from-email | jobsController | Email webhook → job |
| POST | /api/jobs/detect-mailing-type | jobsController | Preview mailing detection |
| POST | /api/jobs/import | jobsController | Excel batch import |
| POST | /api/jobs/batch-delete | jobsController | Bulk delete |
| POST | /api/jobs/bulk-update-paper-source | jobsController | Bulk paper update |

### Webhooks API (`/api/webhooks`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/webhooks/health | webhooksController | Health check |
| POST | /api/webhooks/jobs | webhooksController | Receive from customer portal |
| POST | /api/webhooks/campaigns | webhooksController | Receive campaigns |
| POST | /api/webhooks/email-to-job | webhooksController | n8n email → job |
| POST | /api/webhooks/link-job | webhooksController | Link external ID |

### Entities API (`/api/entities`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/entities/companies | entitiesController | List companies |
| GET | /api/entities/companies/:id | entitiesController | Get company |
| POST | /api/entities/companies | entitiesController | Create company |
| PUT | /api/entities/companies/:id | entitiesController | Update company |
| DELETE | /api/entities/companies/:id | entitiesController | Delete company |
| GET | /api/entities/vendors | entitiesController | List vendors |
| GET | /api/entities/vendors/:id | entitiesController | Get vendor |
| POST | /api/entities/vendors | entitiesController | Create vendor |
| PUT | /api/entities/vendors/:id | entitiesController | Update vendor |

### AI API (`/api/ai`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| POST | /api/ai/parse-spec | aiController | Parse job specs (OpenAI) |
| POST | /api/ai/parse-po | aiController | Parse PO PDF (Gemini) |
| POST | /api/ai/generate-email | aiController | Generate email draft |

### PDF API (`/api/pdf`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| POST | /api/pdf/quote | pdfController | Generate quote PDF |
| POST | /api/pdf/invoice | pdfController | Generate invoice PDF |
| POST | /api/pdf/po | pdfController | Generate PO PDF |

### Financials API (`/api/financials`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/financials/summary | financialsController | Financial summary |
| GET | /api/financials/payments | financialsController | Payment report |
| GET | /api/financials/revenue | financialsController | Revenue report |

### Email API (`/api/email`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| POST | /api/email/send | emailController | Send email |
| POST | /api/email/draft | emailController | Save draft |
| GET | /api/email/templates | emailController | List templates |

### Communications API (`/api/communications`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/communications | communicationController | List relay emails |
| GET | /api/communications/:id | communicationController | Get communication |
| POST | /api/communications/:id/reply | communicationController | Reply to email |
| POST | /api/communications/:id/forward | communicationController | Forward email |

### Vendor RFQ API (`/api/vendor-rfqs`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/vendor-rfqs | vendorRfqController | List RFQs |
| GET | /api/vendor-rfqs/:id | vendorRfqController | Get RFQ |
| POST | /api/vendor-rfqs | vendorRfqController | Create RFQ |
| PUT | /api/vendor-rfqs/:id | vendorRfqController | Update RFQ |
| POST | /api/vendor-rfqs/:id/send | vendorRfqController | Send to vendors |
| POST | /api/vendor-rfqs/:id/quotes | vendorRfqController | Add quote |
| POST | /api/vendor-rfqs/:id/select-vendor | vendorRfqController | Select vendor |
| POST | /api/vendor-rfqs/:id/convert | vendorRfqController | Convert to job |

### Portal API (`/api/portal`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/portal/:token | portalController | Get portal data |
| POST | /api/portal/:token/upload | portalController | Upload file |
| POST | /api/portal/:token/confirm | portalController | Confirm receipt |
| POST | /api/portal/create | portalController | Create portal |

### Files API (`/api/files`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/files | filesController | List files |
| GET | /api/files/:id | filesController | Get file |
| POST | /api/files/upload | filesController | Upload file |
| DELETE | /api/files/:id | filesController | Delete file |
| GET | /api/files/:id/download | filesController | Download file |
| POST | /api/files/:id/share | filesController | Create share link |

### Bradford API (`/api/bradford`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/bradford/stats | bradfordStatsController | Partner stats |
| GET | /api/bradford/jobs | bradfordStatsController | Partner jobs |
| GET | /api/bradford/paper | bradfordStatsController | Paper usage |

### Paper Inventory API (`/api/paper-inventory`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/paper-inventory | paperInventoryController | List inventory |
| POST | /api/paper-inventory | paperInventoryController | Add stock |
| PUT | /api/paper-inventory/:id | paperInventoryController | Update stock |
| DELETE | /api/paper-inventory/:id | paperInventoryController | Remove stock |
| POST | /api/paper-inventory/transaction | paperInventoryController | Record transaction |

### Export API (`/api/export`)
| Method | Path | Controller | Description |
|--------|------|------------|-------------|
| GET | /api/export/jobs | exportController | Export jobs CSV |
| GET | /api/export/invoices | exportController | Export invoices |
| GET | /api/export/payments | exportController | Export payments |

---

## Job Workflow Status State Machine

```
NEW_JOB
    ↓
AWAITING_PROOF_FROM_VENDOR
    ↓
PROOF_SENT_TO_CUSTOMER
    ↓
AWAITING_PROOF_APPROVAL ←→ CHANGES_REQUESTED
    ↓
PROOF_APPROVED
    ↓
IN_PRODUCTION
    ↓
SHIPPED
    ↓
INVOICED
    ↓
PAID
```

**Note:** `JobStatus` (ACTIVE/PAID/CANCELLED) is different from `JobWorkflowStatus`.

---

## Pathway System

| Pathway | Vendor Type | Profit Split | Special Rules |
|---------|-------------|--------------|---------------|
| P1 | Bradford Partner | 50/50 | 18% paper markup, 4-step payment |
| P2 | Single Vendor | 65/35 | Standard flow |
| P3 | Multi-Vendor | Per component | ExecutionID tracking |

### P1 Payment Flow (4 steps)
1. Customer → Impact (mark-customer-paid)
2. Impact → Vendor (mark-vendor-paid)
3. Impact → Bradford 50% (mark-bradford-paid)
4. Bradford → JD Invoice (send-jd-invoice, mark-jd-paid)

---

## Schema Summary

### Core Models
| Model | Purpose | Key Fields |
|-------|---------|------------|
| Job | Main job entity | baseJobId, jobTypeCode, pathway, workflowStatus |
| Company | Customers/partners | type (CUSTOMER/VENDOR/PARTNER) |
| Vendor | Vendor profiles | isInternal (Bradford flag) |
| PurchaseOrder | Vendor POs | executionId (P3 tracking) |
| Invoice | Customer invoices | status, amount, dueDate |

### Workflow Models
| Model | Purpose |
|-------|---------|
| JobStatusHistory | Audit trail |
| ChangeOrder | Change management (DRAFT→APPROVED) |
| JobComponent | Multi-component jobs (P3) |
| JobCommunication | Email relay system |

### Integration Models
| Model | Purpose |
|-------|---------|
| Campaign | Recurring mailings from portal |
| CampaignDrop | Individual mail drops |
| WebhookEvent | Idempotency tracking |
| EmailLog | Deduplication |

### Enums
- **JobStatus**: ACTIVE, PAID, CANCELLED
- **JobWorkflowStatus**: NEW_JOB, AWAITING_PROOF_FROM_VENDOR, PROOF_SENT_TO_CUSTOMER, AWAITING_PROOF_APPROVAL, CHANGES_REQUESTED, PROOF_APPROVED, IN_PRODUCTION, SHIPPED, INVOICED, PAID
- **Pathway**: P1, P2, P3
- **RoutingType**: BRADFORD_JD, THIRD_PARTY_VENDOR
- **MailFormat**: SELF_MAILER, POSTCARD, ENVELOPE

---

## File Ownership

| Domain | Files |
|--------|-------|
| Jobs | `server/src/routes/jobs.ts`, `server/src/controllers/jobs*.ts` |
| Webhooks | `server/src/routes/webhooks.ts`, `server/src/controllers/webhooksController.ts` |
| Entities | `server/src/routes/entities.ts` |
| AI | `server/src/routes/ai.ts`, `server/src/services/openaiService.ts`, `server/src/services/geminiService.ts` |
| Email | `server/src/routes/email.ts`, `server/src/services/emailService.ts` |
| PDF | `server/src/routes/pdf.ts`, `server/src/services/pdfService.ts` |

---

## Key Services

| Service | Purpose |
|---------|---------|
| `jobCreationService.ts` | **ALWAYS USE** - Atomic job creation |
| `jobIdService.ts` | Generate baseJobId, typeCode |
| `pathwayService.ts` | Determine P1/P2/P3 |
| `readinessService.ts` | Calculate QC readiness |
| `emailGuard.ts` | Prevent duplicate emails |

---

## Integration: Customer Portal → ImpactD122

**Webhook:** `POST /api/webhooks/jobs`
- Receives jobs from impact-customer-portal
- Validates `x-webhook-secret` header
- Creates job via `createJobUnified()`
- Links via `externalJobId`

---

## Rules for Claude

1. **Job creation**: ALWAYS use `createJobUnified()` service
2. **Before adding a route**: Check this registry first
3. **After adding a route**: Update this file immediately
4. **Never duplicate endpoints** for same functionality
5. **Workflow status changes**: Use `/api/jobs/:id/workflow-status`
6. **Payment updates**: Use the mark-* endpoints
