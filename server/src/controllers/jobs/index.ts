/**
 * Jobs Controllers Index
 *
 * This module re-exports all job-related controllers for backward compatibility.
 * The controllers have been split into focused files:
 *
 * - jobsHelpers.ts: Shared utility functions (transformJob, calculateProfit, etc.)
 * - jobsCrudController.ts: CRUD operations (getAllJobs, getJob, createJob, etc.)
 * - jobsPOController.ts: Purchase Order operations (getJobPOs, createJobPO, etc.)
 * - jobsPaymentController.ts: Payment tracking (updatePayments, markCustomerPaid, etc.)
 *
 * Usage:
 * import { getAllJobs, createJob, createJobPO } from './controllers/jobs';
 */

// Re-export helpers
export * from './jobsHelpers';

// Re-export controllers
export * from './jobsCrudController';
export * from './jobsPOController';
export * from './jobsPaymentController';
