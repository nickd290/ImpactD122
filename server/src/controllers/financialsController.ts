import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

/**
 * Calculate cost from POs - only Impact-origin POs count as our cost
 */
function calculateJobCost(job: any): number {
  const purchaseOrders = job.PurchaseOrder || [];
  // Filter to only Impact-origin POs (Impact → any vendor counts as our cost)
  const impactPOs = purchaseOrders.filter((po: any) =>
    po.originCompanyId === 'impact-direct'
  );
  return impactPOs.reduce((sum: number, po: any) => {
    return sum + (Number(po.buyCost) || 0);
  }, 0);
}

/**
 * Calculate revenue from sellPrice
 */
function calculateJobRevenue(job: any): number {
  return Number(job.sellPrice) || 0;
}

/**
 * Calculate Bradford paper markup from POs - only Impact-origin POs
 */
function calculatePaperMarkup(job: any): number {
  const purchaseOrders = job.PurchaseOrder || [];
  const impactPOs = purchaseOrders.filter((po: any) =>
    po.originCompanyId === 'impact-direct'
  );
  return impactPOs.reduce((sum: number, po: any) => {
    return sum + (Number(po.paperMarkup) || 0);
  }, 0);
}

/**
 * NEW: Calculate profit split (Bradford 50% + paper markup, Impact 50%)
 */
function calculateProfitSplit(job: any) {
  const revenue = calculateJobRevenue(job);
  const cost = calculateJobCost(job);
  const spread = revenue - cost;
  const paperMarkup = calculatePaperMarkup(job);

  // 50/50 split on the spread
  const bradfordSpreadShare = spread * 0.5;
  const impactSpreadShare = spread * 0.5;

  // Bradford Total = Paper Markup + 50% of Spread
  const bradfordTotal = paperMarkup + bradfordSpreadShare;
  const impactTotal = impactSpreadShare;

  return {
    spread,
    paperMarkup,
    bradfordSpreadShare,
    impactSpreadShare,
    bradfordTotal,
    impactTotal
  };
}

/**
 * GET /api/financials/summary
 * Get overall financial summary with Bradford/Impact split
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
        PurchaseOrder: true, // Include POs for new model calculations
      },
    });

    const totalRevenue = jobs.reduce((sum: number, job: any) => sum + calculateJobRevenue(job), 0);
    const totalCost = jobs.reduce((sum: number, job: any) => sum + calculateJobCost(job), 0);
    const totalProfit = totalRevenue - totalCost;
    const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // NEW: Calculate Bradford/Impact split totals
    let totalBradfordShare = 0;
    let totalImpactShare = 0;
    let totalPaperMarkup = 0;

    jobs.forEach((job: any) => {
      const split = calculateProfitSplit(job);
      totalBradfordShare += split.bradfordTotal;
      totalImpactShare += split.impactTotal;
      totalPaperMarkup += split.paperMarkup;
    });

    // Active jobs (not yet paid)
    const activeJobs = jobs.filter((job: any) => job.status === 'ACTIVE');
    const activeRevenue = activeJobs.reduce((sum: number, job: any) => sum + calculateJobRevenue(job), 0);

    // Unpaid vendor costs (ACTIVE jobs)
    const unpaidCost = activeJobs.reduce((sum: number, job: any) => sum + calculateJobCost(job), 0);

    res.json({
      totalRevenue,
      totalCost,
      totalProfit,
      averageMargin,
      // Bradford/Impact split
      totalBradfordShare,
      totalImpactShare,
      totalPaperMarkup,
      // Active (unpaid) jobs
      activeRevenue,
      activeJobCount: activeJobs.length,
      unpaidCost,
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
        PurchaseOrder: true, // Include POs for new model calculations
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
      const isActive = job.status === 'ACTIVE';

      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          customerId,
          customerName,
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          averageMargin: 0,
          jobCount: 0,
          activeRevenue: 0,
          activeJobCount: 0,
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

      if (isActive) {
        customerData.activeRevenue += revenue;
        customerData.activeJobCount += 1;
      }
    });

    // Calculate average margin for each customer
    customerMap.forEach(customerData => {
      customerData.averageMargin =
        customerData.totalRevenue > 0
          ? (customerData.totalProfit / customerData.totalRevenue) * 100
          : 0;
    });

    // Sort by active revenue (highest first)
    const customers = Array.from(customerMap.values()).sort(
      (a, b) => b.activeRevenue - a.activeRevenue
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
        PurchaseOrder: true, // Include POs for new model calculations
      },
    });

    const vendorMap = new Map<string, any>();

    jobs.forEach((job: any) => {
      if (!job.Vendor) return;

      const vendorId = job.Vendor.id;
      const vendorName = job.Vendor.name;
      const cost = calculateJobCost(job);
      const revenue = calculateJobRevenue(job);
      const isUnpaid = job.status === 'ACTIVE';
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
