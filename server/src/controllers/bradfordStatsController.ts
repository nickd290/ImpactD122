import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { BRADFORD_SIZE_PRICING } from '../utils/bradfordPricing';

// Calculate job cost from POs - only Impact-origin POs count as our cost
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

// Calculate job revenue from sellPrice
function calculateJobRevenue(job: any): number {
  return Number(job.sellPrice) || 0;
}

// Calculate paper markup from POs - only Impact-origin POs
function calculatePaperMarkup(job: any): number {
  const purchaseOrders = job.PurchaseOrder || [];
  const impactPOs = purchaseOrders.filter((po: any) =>
    po.originCompanyId === 'impact-direct'
  );
  return impactPOs.reduce((sum: number, po: any) => {
    return sum + (Number(po.paperMarkup) || 0);
  }, 0);
}

// Calculate paper cost from POs - only Impact-origin POs
function calculatePaperCost(job: any): number {
  const purchaseOrders = job.PurchaseOrder || [];
  const impactPOs = purchaseOrders.filter((po: any) =>
    po.originCompanyId === 'impact-direct'
  );
  return impactPOs.reduce((sum: number, po: any) => {
    return sum + (Number(po.paperCost) || 0);
  }, 0);
}

// Calculate paper pounds for a job
function calculatePaperPounds(job: any): number {
  const specs = job.specs as any || {};
  const finishedSize = specs.finishedSize || specs.sizeName || job.sizeName;

  if (finishedSize) {
    const pricing = BRADFORD_SIZE_PRICING[finishedSize as keyof typeof BRADFORD_SIZE_PRICING];
    if (pricing) {
      const totalQuantity = job.quantity || 0;
      return (totalQuantity / 1000) * pricing.paperLbsPerM;
    }
  }
  return 0;
}

// Get comprehensive Bradford statistics
// Bradford gets a cut of ALL jobs:
// - Bradford vendor jobs: 50/50 split + paper markup to Bradford
// - Non-Bradford vendor jobs: 35% Bradford / 65% Impact
export const getBradfordStats = async (req: Request, res: Response) => {
  try {
    // Fetch ALL jobs - Bradford gets a share of everything
    const allJobs = await prisma.job.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        Company: true,
        Vendor: true,
        PurchaseOrder: true,
        ProfitSplit: true,
      },
    });

    // Initialize stats object
    const stats = {
      // Volume metrics
      totalJobs: allJobs.length,
      activeJobs: 0,
      paidJobs: 0,
      jobsByStatus: {} as Record<string, number>,
      jobsByProductType: {} as Record<string, number>,

      // Financial metrics
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
      totalBradfordShare: 0,
      totalImpactShare: 0,
      totalPaperMarkup: 0,
      averageJobValue: 0,

      // Paid/Unpaid breakdown
      paidRevenue: 0,
      unpaidRevenue: 0,
      paidBradfordShare: 0,
      unpaidBradfordShare: 0,
      paidImpactShare: 0,
      unpaidImpactShare: 0,

      // Paper usage metrics
      totalPaperSheets: 0,
      totalPaperPounds: 0,
      paperUsageBySize: {} as Record<string, { sheets: number; pounds: number }>,

      // Warnings
      jobsWithNegativeMargin: 0,
      jobsMissingRefNumber: 0,
      problematicJobs: [] as Array<{ id: string; number: string; title: string; issue: string }>,

      // Individual job details for table display
      jobs: [] as Array<{
        id: string;
        jobNo: string;
        title: string;
        bradfordRef: string;
        status: string;
        sizeName: string;
        quantity: number;
        paperPounds: number;
        sellPrice: number;
        totalCost: number;
        spread: number;
        paperCost: number;
        paperMarkup: number;
        bradfordShare: number;
        impactShare: number;
        marginPercent: number;
        customerName: string;
      }>,
    };

    // Process each job
    allJobs.forEach((job: any) => {
      // Check if this is a Bradford vendor job
      const isBradfordVendor =
        job.Vendor?.vendorCode?.toUpperCase() === 'BRADFORD' ||
        job.Vendor?.name?.toLowerCase().includes('bradford');

      // Count by status
      if (!stats.jobsByStatus[job.status]) {
        stats.jobsByStatus[job.status] = 0;
      }
      stats.jobsByStatus[job.status]++;

      // Count active/paid
      if (job.status === 'ACTIVE') {
        stats.activeJobs++;
      }
      if (job.status === 'PAID') {
        stats.paidJobs++;
      }

      // Count by product type (from specs JSON)
      const specs = job.specs as any || {};
      const productType = specs.productType || 'OTHER';
      if (!stats.jobsByProductType[productType]) {
        stats.jobsByProductType[productType] = 0;
      }
      stats.jobsByProductType[productType]++;

      // Calculate financials based on vendor type
      let revenue: number;
      let cost: number;
      let spread: number;
      let paperMarkup: number;
      let bradfordShare: number;
      let impactShare: number;

      if (isBradfordVendor) {
        // Bradford vendor: Use ProfitSplit when available, else 50/50 + paper markup
        const profitSplit = job.ProfitSplit;
        if (profitSplit && Number(profitSplit.totalCost) > 0) {
          // Use ProfitSplit values (same as Jobs/Financials tabs)
          revenue = Number(profitSplit.sellPrice) || Number(job.sellPrice) || 0;
          cost = Number(profitSplit.totalCost);
          spread = Number(profitSplit.grossMargin) || (revenue - cost);
          paperMarkup = Number(profitSplit.paperMarkup) || 0;
          bradfordShare = Number(profitSplit.bradfordShare) || 0;
          impactShare = Number(profitSplit.impactShare) || 0;
        } else {
          // Fallback to PO-based calculation
          revenue = calculateJobRevenue(job);
          cost = calculateJobCost(job);
          spread = revenue - cost;
          paperMarkup = calculatePaperMarkup(job);
          // 50/50 split + paper markup to Bradford
          bradfordShare = paperMarkup + (spread * 0.5);
          impactShare = spread * 0.5;
        }
      } else {
        // Non-Bradford vendor (ThreeZ, etc.): 35%/65% split, no paper markup
        revenue = Number(job.sellPrice) || 0;
        cost = calculateJobCost(job);
        spread = revenue - cost;
        paperMarkup = 0; // No paper markup for non-Bradford jobs
        bradfordShare = spread * 0.35;
        impactShare = spread * 0.65;
      }

      stats.totalRevenue += revenue;
      stats.totalCost += cost;
      stats.totalProfit += spread;
      stats.totalBradfordShare += bradfordShare;
      stats.totalImpactShare += impactShare;
      stats.totalPaperMarkup += paperMarkup;

      // Track if job is paid
      const isPaid = job.status === 'PAID';

      // Track revenue by paid/unpaid
      if (isPaid) {
        stats.paidRevenue += revenue;
        stats.paidBradfordShare += bradfordShare;
        stats.paidImpactShare += impactShare;
      } else {
        stats.unpaidRevenue += revenue;
        stats.unpaidBradfordShare += bradfordShare;
        stats.unpaidImpactShare += impactShare;
      }

      // Check for warnings
      if (spread < 0) {
        stats.jobsWithNegativeMargin++;
        stats.problematicJobs.push({
          id: job.id,
          number: job.jobNo,
          title: job.title || '',
          issue: `Negative margin: $${spread.toFixed(2)}`,
        });
      }

      // Find the Bradford → JD PO (this is the reference Bradford uses internally)
      const bradfordJDPO = (job.PurchaseOrder || []).find(
        (po: any) => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
      );

      // Check for missing Bradford reference number (only for Bradford vendor jobs)
      if (isBradfordVendor && (!bradfordJDPO?.poNumber || bradfordJDPO.poNumber.trim() === '')) {
        stats.jobsMissingRefNumber++;
      }

      // Calculate paper usage (only for Bradford vendor jobs)
      const finishedSize = specs.finishedSize || specs.sizeName || job.sizeName;
      let jobPaperPounds = 0;
      let paperCost = 0;

      if (isBradfordVendor && finishedSize) {
        const pricing = BRADFORD_SIZE_PRICING[finishedSize as keyof typeof BRADFORD_SIZE_PRICING];

        if (pricing) {
          // Get total quantity from job
          const totalQuantity = job.quantity || 0;

          // Calculate sheets (quantity is already in pieces)
          const sheets = totalQuantity;

          // Calculate pounds using paperLbsPerM (pounds per thousand)
          const pounds = (sheets / 1000) * pricing.paperLbsPerM;
          jobPaperPounds = pounds;

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

        // Only calculate paper cost for Bradford jobs
        paperCost = calculatePaperCost(job);
      }

      // Add job to jobs array with calculated fields
      const marginPercent = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;

      stats.jobs.push({
        id: job.id,
        jobNo: job.jobNo,
        title: job.title || '',
        bradfordRef: bradfordJDPO?.poNumber || '',
        status: job.status,
        sizeName: finishedSize || '',
        quantity: job.quantity || 0,
        paperPounds: Math.round(jobPaperPounds * 100) / 100,
        sellPrice: Math.round(revenue * 100) / 100,
        totalCost: Math.round(cost * 100) / 100,
        spread: Math.round(spread * 100) / 100,
        paperCost: Math.round(paperCost * 100) / 100,
        paperMarkup: Math.round(paperMarkup * 100) / 100,
        bradfordShare: Math.round(bradfordShare * 100) / 100,
        impactShare: Math.round(impactShare * 100) / 100,
        marginPercent: Math.round(marginPercent * 100) / 100,
        customerName: job.Company?.name || '',
      });
    });

    // Calculate averages
    if (stats.totalJobs > 0) {
      stats.averageJobValue = stats.totalRevenue / stats.totalJobs;
    }

    res.json(stats);
  } catch (error) {
    console.error('Bradford stats error:', error);
    res.status(500).json({ error: 'Failed to fetch Bradford statistics' });
  }
};

// Capture Bradford PO from email subject (Zapier integration)
// Accepts either:
// - { subject: "BGE LTD Print Order PO# 1227880 J-2045" }
// - { bradfordPO: "1227880", jobNo: "J-2045" }
export const captureBradfordPOFromEmail = async (req: Request, res: Response) => {
  try {
    let bradfordPO: string | undefined;
    let jobNo: string | undefined;

    // Option 1: Parse from subject line
    if (req.body.subject) {
      const match = req.body.subject.match(/BGE\s+LTD\s+Print\s+Order\s+PO#\s*(\d+)\s+J-?(\d+)/i);
      if (match) {
        bradfordPO = match[1];
        jobNo = match[2];
      }
    }

    // Option 2: Direct values provided
    if (req.body.bradfordPO) bradfordPO = req.body.bradfordPO;
    if (req.body.jobNo) jobNo = req.body.jobNo?.replace(/^J-?/i, ''); // Normalize

    if (!bradfordPO || !jobNo) {
      return res.status(400).json({
        error: 'Could not extract Bradford PO and Job number',
        hint: 'Send { subject: "BGE LTD Print Order PO# 1227880 J-2045" } or { bradfordPO: "1227880", jobNo: "2045" }'
      });
    }

    // Find job - try multiple formats
    let job = await prisma.job.findUnique({ where: { jobNo } });
    if (!job) {
      job = await prisma.job.findUnique({ where: { jobNo: `J-${jobNo}` } });
    }
    if (!job) {
      job = await prisma.job.findUnique({ where: { jobNo: `${jobNo}` } });
    }

    if (!job) {
      return res.status(404).json({
        error: `Job not found: ${jobNo}`,
        tried: [jobNo, `J-${jobNo}`]
      });
    }

    // Update job's partnerPONumber
    const oldValue = job.partnerPONumber;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        partnerPONumber: bradfordPO,
        updatedAt: new Date()
      }
    });

    console.log('✅ Bradford PO captured via API:', {
      jobNo: job.jobNo,
      bradfordPO,
      previousValue: oldValue || '(none)'
    });

    return res.json({
      success: true,
      jobNo: job.jobNo,
      bradfordPO,
      previousValue: oldValue || null
    });
  } catch (error) {
    console.error('Capture Bradford PO error:', error);
    res.status(500).json({ error: 'Failed to capture Bradford PO' });
  }
};

// Update Bradford PO number for a job
export const updateBradfordPO = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { poNumber } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    // Find the Bradford → JD PO for this job
    const existingPO = await prisma.purchaseOrder.findFirst({
      where: {
        jobId,
        originCompanyId: 'bradford',
        targetCompanyId: 'jd-graphic',
      },
    });

    if (existingPO) {
      // Update existing PO
      const updatedPO = await prisma.purchaseOrder.update({
        where: { id: existingPO.id },
        data: { poNumber: poNumber || '' },
      });
      return res.json({ success: true, poNumber: updatedPO.poNumber });
    } else {
      // Create new Bradford → JD PO if it doesn't exist
      const newPO = await prisma.purchaseOrder.create({
        data: {
          id: crypto.randomUUID(),
          jobId,
          originCompanyId: 'bradford',
          targetCompanyId: 'jd-graphic',
          poNumber: poNumber || '',
          buyCost: 0,
          paperCost: 0,
          paperMarkup: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return res.json({ success: true, poNumber: newPO.poNumber });
    }
  } catch (error) {
    console.error('Update Bradford PO error:', error);
    res.status(500).json({ error: 'Failed to update Bradford PO number' });
  }
};
