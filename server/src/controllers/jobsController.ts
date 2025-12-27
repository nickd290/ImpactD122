/**
 * Jobs Controller (Re-export Module)
 *
 * This file maintains backward compatibility for existing imports.
 * The actual implementations have been split into focused controllers:
 *
 * - jobs/jobsHelpers.ts: Shared utility functions
 * - jobs/jobsCrudController.ts: CRUD operations (getAllJobs, getJob, createJob, etc.)
 * - jobs/jobsPOController.ts: Purchase Order operations (getJobPOs, createJobPO, etc.)
 * - jobs/jobsPaymentController.ts: Payment tracking (updatePayments, markCustomerPaid, etc.)
 *
 * Usage:
 * - Existing: import { getAllJobs } from '../controllers/jobsController';
 * - New: import { getAllJobs } from '../controllers/jobs';
 *
 * Both import styles work identically.
 */

// Re-export everything from the split controllers
export * from './jobs';
