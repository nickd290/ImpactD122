// Financial calculation utilities

export interface Job {
  id: string;
  number: string;
  title: string;
  status: string;
  customer: { id: string; name: string; isPartner?: boolean };
  vendor: { id: string; name: string; isPartner?: boolean };
  lineItems: LineItem[];
  createdAt: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  markupPercent: number;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageMargin: number;
}

export interface CustomerFinancial {
  customerId: string;
  customerName: string;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageMargin: number;
  jobCount: number;
  outstandingRevenue: number; // INVOICED not PAID
  outstandingJobCount: number;
  jobs: Job[];
}

export interface VendorFinancial {
  vendorId: string;
  vendorName: string;
  totalCost: number;
  jobCount: number;
  unpaidCost: number; // Jobs not yet marked as PAID
  unpaidJobCount: number;
  isPartner?: boolean;
  jobs: Job[];
}

/**
 * Calculate total cost for a job (sum of all line item costs)
 */
export function calculateJobCost(job: Job): number {
  if (!job.lineItems || job.lineItems.length === 0) return 0;

  return job.lineItems.reduce((sum, item) => {
    return sum + (item.quantity * item.unitCost);
  }, 0);
}

/**
 * Calculate total revenue for a job (sum of all line item prices)
 */
export function calculateJobRevenue(job: Job): number {
  if (!job.lineItems || job.lineItems.length === 0) return 0;

  return job.lineItems.reduce((sum, item) => {
    return sum + (item.quantity * item.unitPrice);
  }, 0);
}

/**
 * Calculate profit for a job (revenue - cost)
 */
export function calculateJobProfit(job: Job): number {
  const revenue = calculateJobRevenue(job);
  const cost = calculateJobCost(job);
  return revenue - cost;
}

/**
 * Calculate margin percentage for a job ((profit / revenue) * 100)
 */
export function calculateJobMargin(job: Job): number {
  const revenue = calculateJobRevenue(job);
  if (revenue === 0) return 0;

  const profit = calculateJobProfit(job);
  return (profit / revenue) * 100;
}

/**
 * Calculate overall financial summary for all jobs
 */
export function calculateOverallFinancials(jobs: Job[]): FinancialSummary {
  const totalRevenue = jobs.reduce((sum, job) => sum + calculateJobRevenue(job), 0);
  const totalCost = jobs.reduce((sum, job) => sum + calculateJobCost(job), 0);
  const totalProfit = totalRevenue - totalCost;
  const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return {
    totalRevenue,
    totalCost,
    totalProfit,
    averageMargin,
  };
}

/**
 * Get outstanding invoices grouped by customer
 */
export function getOutstandingByCustomer(jobs: Job[]): CustomerFinancial[] {
  const customerMap = new Map<string, CustomerFinancial>();

  jobs.forEach(job => {
    if (!job.customer) return;

    const customerId = job.customer.id;
    const customerName = job.customer.name;
    const revenue = calculateJobRevenue(job);
    const cost = calculateJobCost(job);
    const profit = revenue - cost;
    const isOutstanding = job.status === 'INVOICED';

    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customerId,
        customerName,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        averageMargin: 0,
        jobCount: 0,
        outstandingRevenue: 0,
        outstandingJobCount: 0,
        jobs: [],
      });
    }

    const customerData = customerMap.get(customerId)!;
    customerData.totalRevenue += revenue;
    customerData.totalCost += cost;
    customerData.totalProfit += profit;
    customerData.jobCount += 1;
    customerData.jobs.push(job);

    if (isOutstanding) {
      customerData.outstandingRevenue += revenue;
      customerData.outstandingJobCount += 1;
    }
  });

  // Calculate average margin for each customer
  customerMap.forEach(customerData => {
    customerData.averageMargin =
      customerData.totalRevenue > 0
        ? (customerData.totalProfit / customerData.totalRevenue) * 100
        : 0;
  });

  // Sort by outstanding revenue (highest first)
  return Array.from(customerMap.values()).sort((a, b) => b.outstandingRevenue - a.outstandingRevenue);
}

/**
 * Get unpaid jobs grouped by vendor
 */
export function getOutstandingByVendor(jobs: Job[]): VendorFinancial[] {
  const vendorMap = new Map<string, VendorFinancial>();

  jobs.forEach(job => {
    if (!job.vendor) return;

    const vendorId = job.vendor.id;
    const vendorName = job.vendor.name;
    const cost = calculateJobCost(job);
    const isUnpaid = ['APPROVED', 'PO_ISSUED', 'IN_PRODUCTION', 'SHIPPED', 'INVOICED'].includes(job.status);

    if (!vendorMap.has(vendorId)) {
      vendorMap.set(vendorId, {
        vendorId,
        vendorName,
        totalCost: 0,
        jobCount: 0,
        unpaidCost: 0,
        unpaidJobCount: 0,
        isPartner: job.vendor.isPartner || false,
        jobs: [],
      });
    }

    const vendorData = vendorMap.get(vendorId)!;
    vendorData.totalCost += cost;
    vendorData.jobCount += 1;
    vendorData.jobs.push(job);

    if (isUnpaid) {
      vendorData.unpaidCost += cost;
      vendorData.unpaidJobCount += 1;
    }
  });

  // Sort by unpaid cost (highest first)
  return Array.from(vendorMap.values()).sort((a, b) => b.unpaidCost - a.unpaidCost);
}

/**
 * Get Bradford/JD financial breakdown
 */
export function getBradfordFinancials(jobs: Job[]): {
  bradfordOwesJD: number;
  jdOwesBradford: number;
  netPosition: number;
  bradfordJobs: Job[];
} {
  const bradfordJobs = jobs.filter(job => job.vendor?.isPartner);

  let bradfordOwesJD = 0; // Jobs where Bradford is the vendor and we haven't been paid
  let jdOwesBradford = 0; // Jobs where Bradford is the vendor and we need to pay them

  bradfordJobs.forEach(job => {
    const revenue = calculateJobRevenue(job);
    const cost = calculateJobCost(job);

    // Bradford owes us (we sent them work, they owe us for it)
    if (job.status === 'INVOICED') {
      bradfordOwesJD += revenue;
    }

    // We owe Bradford (they did work for us, we need to pay them)
    if (['APPROVED', 'PO_ISSUED', 'IN_PRODUCTION', 'SHIPPED', 'INVOICED'].includes(job.status)) {
      jdOwesBradford += cost;
    }
  });

  const netPosition = bradfordOwesJD - jdOwesBradford;

  return {
    bradfordOwesJD,
    jdOwesBradford,
    netPosition,
    bradfordJobs,
  };
}

/**
 * Format currency for display
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
 * Format percentage for display
 */
export function formatPercentage(percentage: number): string {
  return `${percentage.toFixed(1)}%`;
}
