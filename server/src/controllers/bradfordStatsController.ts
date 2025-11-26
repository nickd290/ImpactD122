import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { BRADFORD_SIZE_PRICING } from '../utils/bradfordPricing';

// Get comprehensive Bradford statistics
export const getBradfordStats = async (req: Request, res: Response) => {
  try {
    // Fetch all Bradford jobs (where vendor.isPartner = true)
    const bradfordJobs = await prisma.job.findMany({
      where: {
        vendor: {
          isPartner: true,
        },
      },
      include: {
        customer: true,
        vendor: true,
        lineItems: true,
        specs: true,
        financials: true,
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

      // Count by product type
      const productType = job.specs?.productType || 'OTHER';
      if (!stats.jobsByProductType[productType]) {
        stats.jobsByProductType[productType] = 0;
      }
      stats.jobsByProductType[productType]++;

      // Calculate revenue (sum of line items)
      const jobRevenue = job.lineItems.reduce(
        (sum: number, item: any) => sum + (item.quantity * item.unitPrice),
        0
      );
      stats.totalRevenue += jobRevenue;
      stats.totalLineItems += job.lineItems.length;

      // Process financials if available
      if (job.financials) {
        const fin = job.financials;

        // Calculate Bradford profit (paper markup + 50% of spread)
        const bradfordProfit = (fin.paperMarkupAmount || 0) + (fin.bradfordShareAmount || 0);
        stats.totalBradfordProfit += bradfordProfit;

        // Calculate spread
        const spread = fin.calculatedSpread || 0;
        stats.totalSpread += spread;

        // Impact profit = spread - Bradford's share
        const impactProfit = spread - (fin.bradfordShareAmount || 0);
        stats.totalImpactProfit += impactProfit;

        // JD costs
        stats.totalJDCosts += fin.jdServicesTotal || 0;

        // Check for warnings
        if (spread < 0) {
          stats.jobsWithNegativeSpread++;
          stats.problematicJobs.push({
            id: job.id,
            number: job.number,
            title: job.title,
            issue: `Negative spread: $${spread.toFixed(2)}`,
          });
        }

        if (bradfordProfit > impactProfit && impactProfit > 0) {
          stats.jobsWhereBradfordProfitExceedsImpact++;
          stats.problematicJobs.push({
            id: job.id,
            number: job.number,
            title: job.title,
            issue: `Bradford profit ($${bradfordProfit.toFixed(2)}) > Impact profit ($${impactProfit.toFixed(2)})`,
          });
        }
      }

      // Check for missing Bradford reference number
      if (!job.bradfordRefNumber || job.bradfordRefNumber.trim() === '') {
        stats.jobsMissingRefNumber++;
      }

      // Calculate paper usage
      if (job.specs?.finishedSize) {
        const size = job.specs.finishedSize;
        const pricing = BRADFORD_SIZE_PRICING[size as keyof typeof BRADFORD_SIZE_PRICING];

        if (pricing) {
          // Get total quantity from line items
          const totalQuantity = job.lineItems.reduce(
            (sum: number, item: any) => sum + item.quantity,
            0
          );

          // Calculate sheets (quantity is already in pieces)
          const sheets = totalQuantity;

          // Calculate pounds using paperLbsPerM (pounds per thousand)
          const pounds = (sheets / 1000) * pricing.paperLbsPerM;

          // Add to totals
          stats.totalPaperSheets += sheets;
          stats.totalPaperPounds += pounds;

          // Add to size breakdown
          if (!stats.paperUsageBySize[size]) {
            stats.paperUsageBySize[size] = { sheets: 0, pounds: 0 };
          }
          stats.paperUsageBySize[size].sheets += sheets;
          stats.paperUsageBySize[size].pounds += pounds;
        }
      }
    });

    // Calculate averages
    if (stats.totalJobs > 0) {
      stats.averageSpread = stats.totalSpread / stats.totalJobs;
      stats.averageJobValue = stats.totalRevenue / stats.totalJobs;
    }

    const jobsWithFinancials = bradfordJobs.filter(j => j.financials?.jdServicesTotal).length;
    if (jobsWithFinancials > 0) {
      stats.averageJDCost = stats.totalJDCosts / jobsWithFinancials;
    }

    res.json(stats);
  } catch (error) {
    console.error('Bradford stats error:', error);
    res.status(500).json({ error: 'Failed to fetch Bradford statistics' });
  }
};
