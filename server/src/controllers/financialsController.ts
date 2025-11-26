import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

// Financial calculation utilities (server-side)
// Using Job-level totals since production schema doesn't have lineItems
function calculateJobCost(job: any): number {
  // Use bradfordTotal + jdTotal as cost basis
  const bradfordTotal = job.bradfordTotal ? Number(job.bradfordTotal) : 0;
  const jdTotal = job.jdTotal ? Number(job.jdTotal) : 0;
  return bradfordTotal + jdTotal;
}

function calculateJobRevenue(job: any): number {
  // Use impactCustomerTotal or customerTotal
  return job.impactCustomerTotal ? Number(job.impactCustomerTotal) :
         job.customerTotal ? Number(job.customerTotal) : 0;
}

/**
 * GET /api/financials/summary
 * Get overall financial summary
 */
export async function getFinancialSummary(req: Request, res: Response) {
  try {
    const jobs = await prisma.job.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        Company: true,
        Vendor: true,
      },
    });

    const totalRevenue = jobs.reduce((sum: number, job: any) => sum + calculateJobRevenue(job), 0);
    const totalCost = jobs.reduce((sum: number, job: any) => sum + calculateJobCost(job), 0);
    const totalProfit = totalRevenue - totalCost;
    const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Outstanding invoices (INVOICED but not PAID)
    const outstandingJobs = jobs.filter((job: any) => job.status === 'INVOICED');
    const outstandingRevenue = outstandingJobs.reduce((sum: number, job: any) => sum + calculateJobRevenue(job), 0);

    // Unpaid vendor costs (not yet PAID)
    const unpaidJobs = jobs.filter((job: any) =>
      ['APPROVED', 'PO_ISSUED', 'IN_PRODUCTION', 'SHIPPED', 'INVOICED'].includes(job.status)
    );
    const unpaidCost = unpaidJobs.reduce((sum: number, job: any) => sum + calculateJobCost(job), 0);

    res.json({
      totalRevenue,
      totalCost,
      totalProfit,
      averageMargin,
      outstandingRevenue,
      outstandingJobCount: outstandingJobs.length,
      unpaidCost,
      unpaidJobCount: unpaidJobs.length,
      totalJobs: jobs.length,
    });
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
}

/**
 * GET /api/financials/by-customer
 * Get financial breakdown by customer
 */
export async function getFinancialsByCustomer(req: Request, res: Response) {
  try {
    const jobs = await prisma.job.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        Company: true,
        Vendor: true,
      },
    });

    const customerMap = new Map<string, any>();

    jobs.forEach((job: any) => {
      if (!job.Company) return;

      const customerId = job.Company.id;
      const customerName = job.Company.name;
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
      customerData.jobs.push({
        id: job.id,
        number: job.jobNo,
        title: job.title || '',
        status: job.status,
        revenue,
        cost,
        profit,
        margin: revenue > 0 ? (profit / revenue) * 100 : 0,
        createdAt: job.createdAt,
      });

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
    const customers = Array.from(customerMap.values()).sort(
      (a, b) => b.outstandingRevenue - a.outstandingRevenue
    );

    res.json(customers);
  } catch (error) {
    console.error('Error fetching financials by customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer financials' });
  }
}

/**
 * GET /api/financials/by-vendor
 * Get financial breakdown by vendor
 */
export async function getFinancialsByVendor(req: Request, res: Response) {
  try {
    const jobs = await prisma.job.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        Company: true,
        Vendor: true,
      },
    });

    const vendorMap = new Map<string, any>();

    jobs.forEach((job: any) => {
      if (!job.Vendor) return;

      const vendorId = job.Vendor.id;
      const vendorName = job.Vendor.name;
      const cost = calculateJobCost(job);
      const revenue = calculateJobRevenue(job);
      const isUnpaid = ['APPROVED', 'PO_ISSUED', 'IN_PRODUCTION', 'SHIPPED', 'INVOICED'].includes(job.status);
      const isPartner = job.Vendor.vendorCode === 'BRADFORD' || job.Vendor.name?.toLowerCase().includes('bradford');

      if (!vendorMap.has(vendorId)) {
        vendorMap.set(vendorId, {
          vendorId,
          vendorName,
          totalCost: 0,
          jobCount: 0,
          unpaidCost: 0,
          unpaidJobCount: 0,
          isPartner,
          jobs: [],
        });
      }

      const vendorData = vendorMap.get(vendorId)!;
      vendorData.totalCost += cost;
      vendorData.jobCount += 1;
      vendorData.jobs.push({
        id: job.id,
        number: job.jobNo,
        title: job.title || '',
        status: job.status,
        cost,
        revenue,
        createdAt: job.createdAt,
        customerName: job.Company?.name || '',
      });

      if (isUnpaid) {
        vendorData.unpaidCost += cost;
        vendorData.unpaidJobCount += 1;
      }
    });

    // Sort by unpaid cost (highest first)
    const vendors = Array.from(vendorMap.values()).sort((a, b) => b.unpaidCost - a.unpaidCost);

    res.json(vendors);
  } catch (error) {
    console.error('Error fetching financials by vendor:', error);
    res.status(500).json({ error: 'Failed to fetch vendor financials' });
  }
}
