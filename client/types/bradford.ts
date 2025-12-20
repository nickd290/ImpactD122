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

// Individual job with calculated Bradford metrics
export interface BradfordJob {
  id: string;
  jobNo: string;
  title: string;
  bradfordRef: string;
  status: string;
  sizeName: string;
  quantity: number;
  paperPounds: number;
  paperTypeKey: string | null;
  bradfordPaperType: string | null;
  paperTypeOptions: string[] | null;
  sellPrice: number;
  totalCost: number;
  spread: number;
  paperCost: number;
  paperMarkup: number;
  bradfordShare: number;
  impactShare: number;
  marginPercent: number;
  customerName: string;
}

export interface BradfordStats {
  // Volume metrics
  totalJobs: number;
  activeJobs: number;
  paidJobs: number;
  jobsByStatus: Record<string, number>;
  jobsByProductType: Record<string, number>;

  // Financial metrics
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalBradfordShare: number;
  totalImpactShare: number;
  totalPaperMarkup: number;
  averageJobValue: number;

  // Paid/Unpaid breakdown
  paidRevenue: number;
  unpaidRevenue: number;
  paidBradfordShare: number;
  unpaidBradfordShare: number;
  paidImpactShare: number;
  unpaidImpactShare: number;

  // Paper usage metrics
  totalPaperSheets: number;
  totalPaperPounds: number;
  paperUsageBySize: Record<string, BradfordPaperUsage>;
  paperByType: Record<string, { used: number; expected: number }>;

  // Warnings
  jobsWithNegativeMargin: number;
  jobsMissingRefNumber: number;
  problematicJobs: BradfordProblematicJob[];

  // Individual job details for table display
  jobs: BradfordJob[];
}
