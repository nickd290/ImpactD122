import { useMemo } from 'react';
import {
  JobFinancials,
  getJobFinancials,
  calculateJobTotals,
  calculateCashPosition,
} from '../utils/financials';
import {
  isJobCompleted,
  isJobIncoming,
  isJobOutgoing,
  getPaymentStep,
  isPaperUsed,
} from '../utils/jobStatus';

/**
 * Memoized financial calculations for a single job
 * Prevents recalculation on every render
 */
export function useJobFinancials(job: any): JobFinancials {
  return useMemo(() => {
    if (!job) {
      return {
        sellPrice: 0,
        totalCost: 0,
        spread: 0,
        paperMarkup: 0,
        bradfordTotal: 0,
        impactTotal: 0,
        marginPercent: 0,
      };
    }
    return getJobFinancials(job);
  }, [
    job?.id,
    job?.sellPrice,
    job?.profit?.totalCost,
    job?.profit?.spread,
    job?.profit?.paperMarkup,
    job?.purchaseOrders?.length,
    job?.quantity,
  ]);
}

/**
 * Memoized aggregate totals for a list of jobs
 */
export function useJobTotals(jobs: any[]) {
  return useMemo(() => {
    if (!jobs || jobs.length === 0) {
      return {
        sellPrice: 0,
        totalCost: 0,
        spread: 0,
        bradfordTotal: 0,
        impactTotal: 0,
        jobCount: 0,
      };
    }
    return calculateJobTotals(jobs);
  }, [jobs]);
}

/**
 * Memoized cash position calculations
 */
export function useCashPosition(jobs: any[]) {
  return useMemo(() => {
    if (!jobs || jobs.length === 0) {
      return {
        received: 0,
        paidBradford: 0,
        paidVendors: 0,
        owedBradford: 0,
        jobsReceived: 0,
        jobsPaidBradford: 0,
        jobsPaidVendors: 0,
        jobsOwedBradford: 0,
      };
    }
    return calculateCashPosition(jobs);
  }, [jobs]);
}

/**
 * Memoized job categorization for dashboard views
 * Categorizes jobs by payment status for Partner/Cash Flow tabs
 */
export function useJobCategories(jobs: any[], fullJobs?: Map<string, any>) {
  return useMemo(() => {
    const completed: any[] = [];
    const incoming: any[] = [];
    const outgoing: any[] = [];
    const pending: any[] = [];

    jobs.forEach(job => {
      const fullJob = fullJobs?.get(job.id);

      if (isJobCompleted(job, fullJob)) {
        completed.push(job);
      } else if (isJobIncoming(job, fullJob)) {
        incoming.push(job);
      } else if (isJobOutgoing(job, fullJob)) {
        outgoing.push(job);
      } else {
        pending.push(job);
      }
    });

    return { completed, incoming, outgoing, pending };
  }, [jobs, fullJobs]);
}

/**
 * Memoized paper inventory categorization
 * Groups jobs by paper usage status
 */
export function usePaperInventory(jobs: any[], fullJobs?: Map<string, any>) {
  return useMemo(() => {
    const used: any[] = [];
    const active: any[] = [];

    jobs.forEach(job => {
      const fullJob = fullJobs?.get(job.id);

      if (isPaperUsed(job, fullJob)) {
        used.push(job);
      } else {
        active.push(job);
      }
    });

    return { used, active };
  }, [jobs, fullJobs]);
}

/**
 * Memoized payment step summary
 * Returns count of jobs at each payment step
 */
export function usePaymentStepSummary(jobs: any[]) {
  return useMemo(() => {
    const summary = {
      awaitingPayment: 0,
      customerPaid: 0,
      bradfordPaid: 0,
      complete: 0,
    };

    jobs.forEach(job => {
      const step = getPaymentStep(job);
      switch (step) {
        case 1:
          summary.awaitingPayment++;
          break;
        case 2:
          summary.customerPaid++;
          break;
        case 3:
          summary.bradfordPaid++;
          break;
        case 4:
          summary.complete++;
          break;
      }
    });

    return summary;
  }, [jobs]);
}

/**
 * Combined hook for financial dashboard
 * Provides all calculations needed for the unified financials view
 */
export function useFinancialsDashboard(jobs: any[], fullJobs?: Map<string, any>) {
  const totals = useJobTotals(jobs);
  const cashPosition = useCashPosition(jobs);
  const categories = useJobCategories(jobs, fullJobs);
  const paymentSummary = usePaymentStepSummary(jobs);

  return useMemo(() => ({
    totals,
    cashPosition,
    categories,
    paymentSummary,
    jobCount: jobs.length,
  }), [totals, cashPosition, categories, paymentSummary, jobs.length]);
}
