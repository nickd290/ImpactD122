// Shared financial utilities
// Consolidates duplicate code from FinancialsView, BradfordStatsView, AccountingDashboardView

export interface JobFinancials {
  sellPrice: number;
  totalCost: number;
  spread: number;
  paperMarkup: number;
  bradfordTotal: number;
  impactTotal: number;
  marginPercent: number;
}

/**
 * Format currency for display
 * Replaces 4 duplicate implementations across views
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format number with commas
 */
export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format weight in lbs
 */
export function formatWeight(lbs: number): string {
  return `${formatNumber(lbs, 1)} lbs`;
}

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Calculate job financials with Bradford profit split
 * Consolidates logic from FinancialsView.getJobFinancials and AccountingDashboardView.calculateProfitBreakdown
 *
 * Priority:
 * 1. Use job.profit object if available (from backend ProfitSplit)
 * 2. Fall back to CPM calculation from PurchaseOrders
 * 3. Ultimate fallback: sum PO buyCosts
 */
export function getJobFinancials(job: any): JobFinancials {
  const profit = job.profit || {};

  // If we have valid profit data from backend ProfitSplit, use it
  if (profit.totalCost && profit.totalCost > 0) {
    const sellPrice = profit.sellPrice || Number(job.sellPrice) || 0;
    return {
      sellPrice,
      totalCost: profit.totalCost || 0,
      spread: profit.spread || 0,
      paperMarkup: profit.paperMarkup || 0,
      bradfordTotal: profit.bradfordTotal || 0,
      impactTotal: profit.impactTotal || 0,
      marginPercent: sellPrice > 0 ? ((profit.spread || 0) / sellPrice) * 100 : 0,
    };
  }

  // Fallback: Calculate from CPM data (same logic as JobDetailModal Pricing tab)
  const impactToBradfordPO = (job.purchaseOrders || []).find(
    (po: any) => po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford'
  );
  const bradfordToJDPO = (job.purchaseOrders || []).find(
    (po: any) => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
  );

  const paperCPM = impactToBradfordPO?.paperCPM || 0;
  const printCPM = bradfordToJDPO?.printCPM || 0;
  const qty = job.quantity || 0;
  const sellPrice = profit.sellPrice || Number(job.sellPrice) || 0;

  // Require BOTH paperCPM AND printCPM for CPM calculation
  const hasCPMData = paperCPM > 0 && printCPM > 0;

  let totalCost: number;
  let paperMarkup: number;

  if (hasCPMData && qty > 0) {
    // Use CPM-based calculation
    const paperCost = paperCPM * (qty / 1000);
    paperMarkup = paperCost * 0.18;
    const mfgCost = printCPM * (qty / 1000);
    totalCost = paperCost + paperMarkup + mfgCost;
  } else {
    // Ultimate fallback: sum PO buyCosts - only Impact→Bradford POs (not Bradford→JD reference POs)
    const impactPOs = (job.purchaseOrders || [])
      .filter((po: any) => po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford');
    totalCost = impactPOs.reduce((sum: number, po: any) => sum + (Number(po.buyCost) || 0), 0);
    // Use stored paperMarkup from PO, not dynamic 18% calculation
    paperMarkup = impactPOs.reduce((sum: number, po: any) => sum + (Number(po.paperMarkup) || 0), 0);
  }

  const spread = sellPrice - totalCost;
  const spreadShare = spread / 2;

  return {
    sellPrice,
    totalCost,
    spread,
    paperMarkup,
    // Bradford gets their half plus paper markup (they handle paper)
    bradfordTotal: spreadShare + paperMarkup,
    // Impact gets just their half
    impactTotal: spreadShare,
    marginPercent: sellPrice > 0 ? (spread / sellPrice) * 100 : 0,
  };
}

/**
 * Calculate totals for a list of jobs
 */
export function calculateJobTotals(jobs: any[]): {
  sellPrice: number;
  totalCost: number;
  spread: number;
  bradfordTotal: number;
  impactTotal: number;
  jobCount: number;
} {
  return jobs.reduce((acc, job) => {
    const fin = getJobFinancials(job);
    return {
      sellPrice: acc.sellPrice + fin.sellPrice,
      totalCost: acc.totalCost + fin.totalCost,
      spread: acc.spread + fin.spread,
      bradfordTotal: acc.bradfordTotal + fin.bradfordTotal,
      impactTotal: acc.impactTotal + fin.impactTotal,
      jobCount: acc.jobCount + 1,
    };
  }, { sellPrice: 0, totalCost: 0, spread: 0, bradfordTotal: 0, impactTotal: 0, jobCount: 0 });
}

/**
 * Calculate cash position from jobs
 * Used by FinancialsView for payment tracking
 */
export function calculateCashPosition(jobs: any[]): {
  received: number;
  paidBradford: number;
  paidVendors: number;
  owedBradford: number;
  jobsReceived: number;
  jobsPaidBradford: number;
  jobsPaidVendors: number;
  jobsOwedBradford: number;
} {
  return jobs.reduce((acc, job) => {
    const fin = getJobFinancials(job);
    const customerPaid = job.customerPaymentDate
      ? (Number(job.customerPaymentAmount) || Number(job.sellPrice) || 0)
      : 0;
    const bradfordPaid = job.bradfordPaymentDate
      ? (Number(job.bradfordPaymentAmount) || 0)
      : 0;
    const vendorPaid = job.vendorPaymentDate
      ? (Number(job.vendorPaymentAmount) || 0)
      : 0;
    // Owed to Bradford: customer paid us, but we haven't paid Bradford yet
    const owedBradford = (job.customerPaymentDate && !job.bradfordPaymentDate)
      ? fin.bradfordTotal
      : 0;

    return {
      received: acc.received + customerPaid,
      paidBradford: acc.paidBradford + bradfordPaid,
      paidVendors: acc.paidVendors + vendorPaid,
      owedBradford: acc.owedBradford + owedBradford,
      jobsReceived: acc.jobsReceived + (job.customerPaymentDate ? 1 : 0),
      jobsPaidBradford: acc.jobsPaidBradford + (job.bradfordPaymentDate ? 1 : 0),
      jobsPaidVendors: acc.jobsPaidVendors + (job.vendorPaymentDate ? 1 : 0),
      jobsOwedBradford: acc.jobsOwedBradford + ((job.customerPaymentDate && !job.bradfordPaymentDate) ? 1 : 0),
    };
  }, {
    received: 0,
    paidBradford: 0,
    paidVendors: 0,
    owedBradford: 0,
    jobsReceived: 0,
    jobsPaidBradford: 0,
    jobsPaidVendors: 0,
    jobsOwedBradford: 0
  });
}
