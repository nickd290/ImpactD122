export interface BradfordPaperUsage {
  sheets: number;
  pounds: number;
}

export interface BradfordProblematicJob {
  id: string;
  number: string;
  title: string;
  issue: string;
}

export interface BradfordStats {
  // Volume metrics
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  inProductionJobs: number;
  jobsByStatus: Record<string, number>;
  jobsByProductType: Record<string, number>;

  // Financial metrics
  totalRevenue: number;
  totalBradfordProfit: number;
  totalImpactProfit: number;
  totalSpread: number;
  averageSpread: number;
  totalJDCosts: number;
  averageJDCost: number;
  averageJobValue: number;
  totalLineItems: number;

  // Paper usage metrics
  totalPaperSheets: number;
  totalPaperPounds: number;
  paperUsageBySize: Record<string, BradfordPaperUsage>;

  // Warnings
  jobsWithNegativeSpread: number;
  jobsMissingRefNumber: number;
  jobsWhereBradfordProfitExceedsImpact: number;
  problematicJobs: BradfordProblematicJob[];
}
