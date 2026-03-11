# ImpactD122 - Status

> Last updated: 2026-01-20

## Current Goal
Kanban board populated with 66 active jobs ready for workflow processing.

## Recent Changes
- **Email Parser & Job Data Update (2026-01-21)**:
  - Built email parser script (`scripts/parse-job-emails.ts`) for Lahlouh/JJS&A/Ballantine emails
  - Created job reference JSON (`scripts/email-job-reference.json`) with extracted email data
  - Created job update script (`scripts/update-job-data.ts`) for batch updates
  - Updated 39 J-2xxx jobs with titles (19 identified, 20 placeholder)
  - Confirmed mapping: J-2102 = PO 44517 (NW Limited Offer Postcard)
  - All jobs now have titles for Kanban display
- **Kanban Restore (2026-01-20)**:
  - Reverted 66 jobs from PAID back to ACTIVE/NEW_JOB status
  - Jobs now appear in Kanban board for workflow processing
  - SQL: `UPDATE "Job" SET status='ACTIVE', "workflowStatus"='NEW_JOB' WHERE "jobNo" LIKE 'J-2%'`
  - All jobs start at NEW_JOB stage - move to appropriate workflow stage as needed
- **Kanban Archive (2026-01-20)** _(reverted)_:
  - Previously archived 66 historical imported jobs to PAID status
  - This left Kanban empty - reverted above
- **UX Redesign (2026-01-15)**:
  - Created `ActionItemsView.tsx` - unified inbox for overdue jobs, missing files, pending communications
  - Created `BlockingIssueCard.tsx` - prominent blocking issue display at top of job modal
  - Reorganized `Sidebar.tsx` - grouped nav into Inbox/Jobs/Entities/Analytics sections
  - Updated `JobBoardView.tsx` - removed "Last edited", added workflow stage display
  - Updated `index.css` - increased metric font weights, added pulse animation for urgent items
  - Integrated blocking issues into `JobDetailModal.tsx`
  - Added action items count to sidebar badge
- Created `.claude/ARCHITECTURE.md` with full route registry
- Documented 100+ API endpoints
- Documented pathway system (P1/P2/P3)
- Documented 4-step payment flow for Bradford

## Known Issues

### Resolved
- ~~Historical imports showing in Kanban~~ → Jobs restored to ACTIVE, now in workflow
- ~~Empty Kanban board~~ → 66 jobs now visible at NEW_JOB stage

### Resolved by UX Redesign
- ~~UI Complexity: Hard to find things~~ → Action Items inbox consolidates blockers
- ~~Workflow Visibility: Need clearer status~~ → Blocking issue card at top of modal
- ~~Status Badges: Need color coding~~ → Red/yellow/green tinting on job cards

### Remaining
- Financials vs Jobs tab split (not implemented - may not be needed now)
- Meeting Mode toggle (not implemented - Action Items view serves this purpose)

## Sprint/Focus
- Process 66 jobs through workflow stages
- Move jobs from NEW_JOB to appropriate stages based on actual status
- Test UX redesign changes with real workflow

## Active Projects
| Slot | Project | Status |
|------|---------|--------|
| P1 | ImpactD122 | Kanban restored, 66 jobs active |
| P2 | impact-customer-portal | Debugging job creation |

## Next Session
1. Review jobs and move to appropriate workflow stages (ARTWORK_REQUESTED, IN_PRODUCTION, etc.)
2. Test Action Items view with production data
3. Verify blocking issue detection logic works correctly
