// Shared types for job form tabs

export type RoutingType = 'BRADFORD_JD' | 'THIRD_PARTY_VENDOR';
export type JobType = 'single' | 'multipart';

export interface JobFormData {
  title: string;
  customerId: string;
  vendorId: string;
  status: string;
  notes: string;
  customerPONumber: string;
  bradfordRefNumber: string;
  dueDate: string;
  jdSuppliesPaper: boolean;
  paperInventoryId: string;
  routingType: RoutingType;
  jobType: JobType;
  dataIncludedWithArtwork: boolean;
}

export interface Specs {
  productType: string;
  paperType: string;
  paperWeight: string;
  colors: string;
  coating: string;
  finishing: string;
  flatSize: string;
  finishedSize: string;
  pageCount: string;
  bindingStyle: string;
  coverType: string;
  coverPaperType: string;
  paperLbs: string;
  folds: string;
  perforations: string;
  dieCut: string;
  bleed: string;
  proofType: string;
  shipToName: string;
  shipToAddress: string;
  shipVia: string;
  specialInstructions: string;
  artworkInstructions: string;
  packingInstructions: string;
  labelingInstructions: string;
  additionalNotes: string;
  artworkUrl: string;
  artworkToFollow: boolean;
  versions: any[];
  languageBreakdown: any[];
  totalVersionQuantity: number;
  timeline: Record<string, any>;
  mailing: Record<string, any>;
  responsibilities: { vendorTasks: string[]; customerTasks: string[] };
  specialHandling: Record<string, any>;
  paymentTerms: string;
  fob: string;
  accountNumber: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitCost: number;
  markupPercent: number;
  unitPrice: number;
}

export interface BradfordFinancials {
  impactCustomerTotal: number;
  jdServicesTotal: number;
  bradfordPaperCost: number;
  paperMarkupAmount: number;
}

export interface Customer {
  id: string;
  name: string;
}

export interface Vendor {
  id: string;
  name: string;
  isPartner?: boolean;
}

export type JobFormTab = 'basics' | 'specs' | 'pricing' | 'files' | 'mailing';

// Mailing-specific types for Lahlouh → Three Z flow
export interface MailingVersion {
  version: string;
  quantity: number;
  phone?: string;
}

export interface MailingComponent {
  name: string;
  supplier: 'JD' | 'LAHLOUH' | 'THREE_Z' | string;
  specs?: string;
}

export interface MailingData {
  mailingVendorId?: string;
  mailingVendorJobNo?: string;
  mailingVendorPOSent?: string;
  mailingVendorPOSentTo?: string;
  matchType?: '2-WAY' | '3-WAY';
  versions?: MailingVersion[];
  components?: MailingComponent[];
  mailDate?: string;
  inHomesDate?: string;
}
