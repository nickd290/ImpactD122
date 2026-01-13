# ImpactD122 - Project Instructions

> Read `.claude/ARCHITECTURE.md` for route registry, schemas, and file ownership.

---

## Mandatory: "What I Did" Reporting

After EVERY executed task, output this section:

### What I Did
| Category | Details |
|----------|---------|
| **Files changed** | Full paths to all modified files |
| **Exact edits** | Short summary of changes per file |
| **Commands run** | Shell commands executed |
| **Tests run** | Test commands + pass/fail results |
| **Migrations** | Any Prisma migrations or DB changes |
| **Risks / Follow-ups** | Known issues, TODOs, or things to verify |

**Example:**
```
### What I Did
| Category | Details |
|----------|---------|
| **Files changed** | `server/src/services/workflowService.ts`, `server/src/types/events.ts` |
| **Exact edits** | Added `WorkflowEvent` type, created `emitWorkflowEvent()` function |
| **Commands run** | `npm run build`, `npm test` |
| **Tests run** | `npm test -- --grep workflow` → 12 passed, 0 failed |
| **Migrations** | None |
| **Risks / Follow-ups** | Need to add event listeners in controllers |
```

---

## Safe Edit Zones vs Do-Not-Touch Zones

### SAFE TO EDIT (Add features, refactor freely)
| Path | Notes |
|------|-------|
| `server/src/services/*` | Business logic - add new services here |
| `server/src/controllers/*` | Route handlers - follow existing patterns |
| `server/src/types/*` | TypeScript types - extend as needed |
| `server/src/utils/*` | Helper functions |
| `client/src/components/*` | React components |
| `client/src/lib/api.ts` | API client methods (add new endpoints) |
| `client/src/services/*` | Frontend business logic |

### EDIT WITH CAUTION (Check ARCHITECTURE.md first)
| Path | Risk | Action Required |
|------|------|-----------------|
| `server/src/routes/*.ts` | Route conflicts | Update Route Registry in ARCHITECTURE.md |
| `server/prisma/schema.prisma` | Data model changes | Run `prisma generate`, update Schema Summary |
| `server/src/index.ts` | Server startup | Avoid unless adding middleware |
| `client/src/App.tsx` | Root state | High coupling - prefer child components |

### DO NOT TOUCH (Critical infrastructure)
| Path | Reason |
|------|--------|
| `server/src/services/jobCreationService.ts` | Atomic job creation - use `createJobUnified()` |
| `server/src/services/jobIdService.ts` | ID generation - breaking changes cascade |
| `server/src/services/pathwayService.ts` | P1/P2/P3 routing logic - business critical |
| `server/src/services/emailGuard.ts` | Deduplication - prevents duplicate emails |
| `server/src/middleware/upload.ts` | File upload config - security sensitive |
| `.env*` files | Secrets - never commit |

---

## Workflow Event System (Coming Soon)

When typed events + validator are introduced:
- All workflow status changes MUST emit events
- Validator will enforce valid state transitions
- Event types will live in `server/src/types/events.ts`

---

## Quick Reference

| Task | Rule |
|------|------|
| Create job | Use `createJobUnified()` service |
| Add route | Check Route Registry first, update after |
| Change schema | Run `prisma generate`, update ARCHITECTURE.md |
| Payment flow | Use `mark-*` endpoints, never update fields directly |
| Workflow status | Use `/api/jobs/:id/workflow-status` endpoint |
