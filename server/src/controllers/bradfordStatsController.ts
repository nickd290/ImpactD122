import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { BRADFORD_SIZE_PRICING } from '../utils/bradfordPricing';

// Get comprehensive Bradford statistics
export const getBradfordStats = async (req: Request, res: Response) => {
  try {
    // Fetch all Bradford jobs (where vendor is Bradford - check vendorCode or name)
    const bradfordJobs = await prisma.job.findMany({
      where: {
        deletedAt: null,
        Vendor: {
          OR: [
            { vendorCode: 'BRADFORD' },
            { name: { contains: 'Bradford', mode: 'insensitive' } },
          ],
        },
      },
      include: {
        Company: true,
        Vendor: true,
      },
    });

    // Initialize stats object
    const stats = {
      // Volume metrics
      totalJobs: bradfordJobs.length,
      activeJobs: 0,
      completedJobs: 0,
      inProductionJobs: 0,
      jobsByStatus: {} as Record<string, number>,
      jobsByProductType: {} as Record<string, number>,

      // Financial metrics
      totalRevenue: 0,
      totalBradfordProfit: 0,
      totalImpactProfit: 0,
      totalSpread: 0,
      averageSpread: 0,
      totalJDCosts: 0,
      averageJDCost: 0,
      averageJobValue: 0,
      totalLineItems: 0,

      // Paid/Unpaid breakdown
      paidRevenue: 0,
      unpaidRevenue: 0,
      paidBradfordProfit: 0,
      unpaidBradfordProfit: 0,
      paidImpactProfit: 0,
      unpaidImpactProfit: 0,
      paidJDCosts: 0,
      unpaidJDCosts: 0,

      // Paper usage metrics
      totalPaperSheets: 0,
      totalPaperPounds: 0,
      paperUsageBySize: {} as Record<string, { sheets: number; pounds: number }>,

      // Warnings
      jobsWithNegativeSpread: 0,
      jobsMissingRefNumber: 0,
      jobsWhereBradfordProfitExceedsImpact: 0,
      problematicJobs: [] as Array<{ id: string; number: string; title: string; issue: string }>,
    };

    // Process each job
    bradfordJobs.forEach((job: any) => {
      // Count by status
      if (!stats.jobsByStatus[job.status]) {
        stats.jobsByStatus[job.status] = 0;
      }
      stats.jobsByStatus[job.status]++;

      // Count active/completed/in production
      if (job.status !== 'PAID' && job.status !== 'CANCELLED') {
        stats.activeJobs++;
      }
      if (job.status === 'PAID') {
        stats.completedJobs++;
      }
      if (job.status === 'IN_PRODUCTION') {
        stats.inProductionJobs++;
      }

      // Count by product type (from specs JSON)
      const specs = job.specs as any || {};
      const productType = specs.productType || 'OTHER';
      if (!stats.jobsByProductType[productType]) {
        stats.jobsByProductType[productType] = 0;
      }
      stats.jobsByProductType[productType]++;

      // Calculate revenue from customerTotal (or impactCustomerTotal)
      const jobRevenue = job.impactCustomerTotal ? Number(job.impactCustomerTotal) :
                         job.customerTotal ? Number(job.customerTotal) : 0;
      stats.totalRevenue += jobRevenue;
      stats.totalLineItems += job.quantity ? 1 : 0;

      // Track if job is paid
      const isPaid = job.status === 'PAID';

      // Track revenue by paid/unpaid
      if (isPaid) {
        stats.paidRevenue += jobRevenue;
      } else {
        stats.unpaidRevenue += jobRevenue;
      }

      // Process financials from flat fields on Job
      const jdTotal = job.jdTotal ? Number(job.jdTotal) : 0;
      const bradfordTotal = job.bradfordTotal ? Number(job.bradfordTotal) : 0;
      const impactMargin = job.impactMargin ? Number(job.impactMargin) : 0;
      const bradfordCut = job.bradfordCut ? Number(job.bradfordCut) : 0;
      const bradfordTotalMargin = job.bradfordTotalMargin ? Number(job.bradfordTotalMargin) : 0;

      // Calculate Bradford profit (paper markup + their share of spread)
      const bradfordProfit = impactMargin + bradfordTotalMargin;
      stats.totalBradfordProfit += bradfordProfit;

      // Calculate spread
      const spread = bradfordCut;
      stats.totalSpread += spread;

      // Impact profit = spread - Bradford's share
      const impactProfit = spread - bradfordTotalMargin;
      stats.totalImpactProfit += impactProfit;

      // JD costs
      stats.totalJDCosts += jdTotal;

      // Track by paid/unpaid status
      if (isPaid) {
        stats.paidBradfordProfit += bradfordProfit;
        stats.paidImpactProfit += impactProfit;
        stats.paidJDCosts += jdTotal;
      } else {
        stats.unpaidBradfordProfit += bradfordProfit;
        stats.unpaidImpactProfit += impactProfit;
        stats.unpaidJDCosts += jdTotal;
      }

      // Check for warnings
      if (spread < 0) {
        stats.jobsWithNegativeSpread++;
        stats.problematicJobs.push({
          id: job.id,
          number: job.jobNo,
          title: job.title || '',
          issue: `Negative spread: $${spread.toFixed(2)}`,
        });
      }

      if (bradfordProfit > impactProfit && impactProfit > 0) {
        stats.jobsWhereBradfordProfitExceedsImpact++;
        stats.problematicJobs.push({
          id: job.id,
          number: job.jobNo,
          title: job.title || '',
          issue: `Bradford profit ($${bradfordProfit.toFixed(2)}) > Impact profit ($${impactProfit.toFixed(2)})`,
        });
      }

      // Check for missing Bradford reference number (using customerPONumber as workaround)
      if (!job.customerPONumber || job.customerPONumber.trim() === '') {
        stats.jobsMissingRefNumber++;
      }

      // Calculate paper usage
      const finishedSize = specs.finishedSize || specs.sizeName;
      if (finishedSize) {
        const pricing = BRADFORD_SIZE_PRICING[finishedSize as keyof typeof BRADFORD_SIZE_PRICING];

        if (pricing) {
          // Get total quantity from job
          const totalQuantity = job.quantity || 0;

          // Calculate sheets (quantity is already in pieces)
          const sheets = totalQuantity;

          // Calculate pounds using paperLbsPerM (pounds per thousand)
          const pounds = (sheets / 1000) * pricing.paperLbsPerM;

          // Add to totals
          stats.totalPaperSheets += sheets;
          stats.totalPaperPounds += pounds;

          // Add to size breakdown
          if (!stats.paperUsageBySize[finishedSize]) {
            stats.paperUsageBySize[finishedSize] = { sheets: 0, pounds: 0 };
          }
          stats.paperUsageBySize[finishedSize].sheets += sheets;
          stats.paperUsageBySize[finishedSize].pounds += pounds;
        }
      }
    });

    // Calculate averages
    if (stats.totalJobs > 0) {
      stats.averageSpread = stats.totalSpread / stats.totalJobs;
      stats.averageJobValue = stats.totalRevenue / stats.totalJobs;
    }

    const jobsWithJDCosts = bradfordJobs.filter(j => j.jdTotal && Number(j.jdTotal) > 0).length;
    if (jobsWithJDCosts > 0) {
      stats.averageJDCost = stats.totalJDCosts / jobsWithJDCosts;
    }

    res.json(stats);
  } catch (error) {
    console.error('Bradford stats error:', error);
    res.status(500).json({ error: 'Failed to fetch Bradford statistics' });
  }
};
