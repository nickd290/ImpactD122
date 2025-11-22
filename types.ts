
export enum EntityType {
  CUSTOMER = 'CUSTOMER',
  VENDOR = 'VENDOR'
}

export interface Contact {
  id: string;
  name: string;
  role?: string;
  email: string;
  phone: string;
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  additionalContacts?: Contact[];
  isPartner?: boolean; // True for Bradford
  notes?: string;
}

export enum JobStatus {
  DRAFT = 'DRAFT',
  QUOTED = 'QUOTED',
  APPROVED = 'APPROVED',
  PO_ISSUED = 'PO_ISSUED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  SHIPPED = 'SHIPPED',
  INVOICED = 'INVOICED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED'
}

export type ProductType = 'BOOK' | 'FLAT' | 'FOLDED' | 'OTHER';

export interface JobSpecs {
  productType: ProductType;
  
  // Common
  colors?: string;
  coating?: string;
  finishing?: string;
  
  // Sizes
  flatSize?: string;
  finishedSize?: string; // Folded size for folded items, trim for books

  // Paper
  paperType?: string; // Text stock or main stock
  
  // Book Specifics
  pageCount?: number;
  bindingStyle?: string; // Saddle Stitch, Perfect, etc.
  coverType?: 'SELF' | 'PLUS';
  coverPaperType?: string;
}

export interface JobFinancials {
  // Partner (Bradford) Logic
  paperCostCPM?: number;    // Actual cost of paper (e.g., $15)
  paperSellCPM?: number;    // Marked up paper price to Job (e.g., $18)
  paperUsage?: string;      // e.g. "12,000 sheets 25x38"
  manufacturingCPM?: number;// Mfg cost / PO to JD (e.g., $10)
  
  // Standard Logic
  consultantFee?: number;   // Flat fee deduction for Bradford on non-partner jobs
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitCost: number; // Cost from vendor (Calculated for Partners)
  markupPercent: number;
  unitPrice: number; // Price to customer
}

export interface Job {
  id: string;
  number: string; // J-1001
  title: string;
  customerId: string;
  vendorId: string; // Could be Bradford, Third Party
  bradfordRefNumber?: string; // Internal Reference / PO to JD

  // Documents
  customerPONumber?: string; // External PO Number
  originalPOUrl?: string; // Base64 or URL of uploaded PO
  vendorPONumber?: string; // Internal PO sent to Vendor
  invoiceNumber?: string; // Internal Invoice sent to Customer
  
  // Logistics
  artworkUrl?: string; // Link to artwork files
  artworkFilename?: string;

  status: JobStatus;
  locked?: boolean; // If true, job is read-only until unlocked

  dateCreated: number;
  dueDate?: number;
  items: LineItem[];
  notes: string;
  
  // Specs for AI parsing
  specs: JobSpecs;
  
  // Financials
  financials?: JobFinancials;
}

// UI Types
export type View = 'DASHBOARD' | 'QUOTES' | 'JOBS' | 'CUSTOMERS' | 'VENDORS' | 'PARTNER_STATS';

export interface DashboardStats {
  revenue: number;
  activeJobs: number;
  pendingQuotes: number;
}
