/**
 * Job View Model
 *
 * SINGLE SOURCE OF TRUTH for transforming Job records to PDF/Email/Webhook outputs.
 *
 * This replaces the duplicate transformJobForPDF() functions in:
 * - pdfController.ts (lines 7-65)
 * - emailController.ts (lines 16-69)
 *
 * CRITICAL: Use toJobViewModel() for all job data transformations.
 * DO NOT write inline transformations elsewhere.
 */

import { PAPER_SOURCES, isBradfordVendor } from '../constants';
import {
  calculateJobCost,
  calculateJobRevenue,
  calculateJobPaperMarkup,
  calculateJobProfitSplit,
  PurchaseOrderCost,
} from '../services/jobCostService';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CustomerViewModel {
  id?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
}

export interface VendorViewModel {
  id?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  vendorCode?: string | null;
  isPartner: boolean;
}

export interface LineItemViewModel {
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  total?: number;
}

export interface JobFinancialsViewModel {
  sellPrice: number;
  totalCost: number;
  grossMargin: number;
  paperMarkup: number;
  paperCost: number;
  bradfordShare: number;
  impactShare: number;
  marginPercent: number;
  unitPrice: number;  // per-unit sell price
}

export interface JobSpecsViewModel {
  productType?: string;
  finishedSize?: string;
  flatSize?: string;
  paperType?: string;
  paperWeight?: string;
  colors?: string;
  coating?: string;
  finishing?: string;
  bindingStyle?: string;
  coverType?: string;
  pageCount?: number;
  folds?: string;
  perforations?: string;
  bleed?: string;
  proofType?: string;
  dieCut?: string;
  // Ship-to info
  shipToName?: string;
  shipToAddress?: string;
  shipVia?: string;
  // Instructions
  specialInstructions?: string;
  artworkInstructions?: string;
  packingInstructions?: string;
  labelingInstructions?: string;
  additionalNotes?: string;
  // Links
  artworkUrl?: string;
  artworkFilesLink?: string;
  // Line items (stored in specs JSON)
  lineItems?: LineItemViewModel[];
  // Raw object for any additional fields
  [key: string]: unknown;
}

export interface JobViewModel {
  // Identifiers
  id: string;
  jobNo: string;
  title: string;
  status: string;

  // Reference numbers
  customerPONumber: string;
  vendorPONumber: string;
  invoiceNumber: string;
  quoteNumber: string;

  // Quantities
  quantity: number;
  sizeName: string;

  // Dates
  createdAt: Date;
  dueDate: Date | null;
  mailDate: Date | null;
  inHomesDate: Date | null;

  // Relationships
  customer: CustomerViewModel;
  vendor: VendorViewModel | null;

  // Content
  notes: string;
  description: string;
  specs: JobSpecsViewModel;
  lineItems: LineItemViewModel[];

  // Financials
  financials: JobFinancialsViewModel;

  // Paper source
  paperSource: string;

  // Raw data (for backward compatibility)
  raw?: Record<string, unknown>;
}

// ============================================================================
// INPUT TYPE (from Prisma query)
// ============================================================================

export interface JobWithRelations {
  id: string;
  jobNo: string;
  title?: string | null;
  status: string;
  notes?: string | null;
  description?: string | null;
  quantity?: number | null;
  sizeName?: string | null;
  sellPrice?: number | string | null;
  customerPONumber?: string | null;
  deliveryDate?: Date | null;
  mailDate?: Date | null;
  inHomesDate?: Date | null;
  createdAt: Date;
  paperSource?: string | null;
  jdSuppliesPaper?: boolean | null;
  specs?: Record<string, unknown> | null;
  // Legacy fields for backward compatibility
  impactCustomerTotal?: number | null;
  customerTotal?: number | null;
  jdTotal?: number | null;
  bradfordTotal?: number | null;
  impactMargin?: number | null;
  paperCostCPM?: number | null;
  // Relations
  Company?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
  Vendor?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    vendorCode?: string | null;
    streetAddress?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  PurchaseOrder?: PurchaseOrderCost[];
  ProfitSplit?: {
    sellPrice: number | string | null;
    totalCost: number | string | null;
    grossMargin: number | string | null;
    paperMarkup: number | string | null;
    paperCost: number | string | null;
    bradfordShare: number | string | null;
    impactShare: number | string | null;
    isOverridden?: boolean;
    overrideReason?: string | null;
    calculatedAt?: Date | null;
  } | null;
}

// ============================================================================
// TRANSFORMATION FUNCTIONS
// ============================================================================

/**
 * Transform a Job record to JobViewModel
 *
 * This is the SINGLE transformation function for all job output contexts.
 */
export function toJobViewModel(job: JobWithRelations): JobViewModel {
  const quantity = job.quantity || 0;

  // Calculate revenue - use consistent priority: sellPrice > impactCustomerTotal > customerTotal
  const sellPrice = calculateJobRevenue(job.sellPrice ?? null) ||
                    Number(job.impactCustomerTotal) ||
                    Number(job.customerTotal) ||
                    0;

  const unitPrice = quantity > 0 ? round2(sellPrice / quantity) : 0;

  // Get paper source with fallback logic
  const paperSource = job.paperSource ||
                      (job.jdSuppliesPaper === true ? PAPER_SOURCES.VENDOR : PAPER_SOURCES.BRADFORD);

  // Build customer view model
  const customer = toCustomerViewModel(job.Company);

  // Build vendor view model
  const vendor = job.Vendor ? toVendorViewModel(job.Vendor) : null;

  // Parse specs JSON
  const specs = parseSpecs(job.specs);

  // Build line items - prefer stored lineItems, fall back to job-level data
  const lineItems = buildLineItems(job, specs, quantity, unitPrice);

  // Calculate financials using the unified cost service
  const financials = buildFinancials(job, sellPrice, unitPrice);

  return {
    id: job.id,
    jobNo: job.jobNo,
    title: job.title || '',
    status: job.status,
    customerPONumber: job.customerPONumber || '',
    vendorPONumber: job.jobNo, // PO number we send TO vendor (not customer's PO)
    invoiceNumber: job.jobNo,
    quoteNumber: job.jobNo,
    quantity,
    sizeName: job.sizeName || '',
    createdAt: job.createdAt,
    dueDate: job.deliveryDate || null,
    mailDate: job.mailDate || null,
    inHomesDate: job.inHomesDate || null,
    customer,
    vendor,
    notes: job.notes || '',
    description: job.description || '',
    specs,
    lineItems,
    financials,
    paperSource,
  };
}

/**
 * Transform Company to CustomerViewModel
 */
export function toCustomerViewModel(company: JobWithRelations['Company']): CustomerViewModel {
  if (!company) {
    return {
      name: 'N/A',
      email: '',
      phone: '',
      address: '',
      contactPerson: '',
    };
  }

  return {
    id: company.id,
    name: company.name,
    email: company.email || '',
    phone: company.phone || '',
    address: company.address || '',
    contactPerson: '',
  };
}

/**
 * Transform Vendor to VendorViewModel
 */
export function toVendorViewModel(vendor: NonNullable<JobWithRelations['Vendor']>): VendorViewModel {
  const addressParts = [
    vendor.streetAddress,
    vendor.city,
    vendor.state,
    vendor.zip,
  ].filter(Boolean);

  return {
    id: vendor.id,
    name: vendor.name,
    email: vendor.email || '',
    phone: vendor.phone || '',
    address: addressParts.join(', '),
    contactPerson: '',
    vendorCode: vendor.vendorCode,
    isPartner: isBradfordVendor(vendor),
  };
}

/**
 * Parse specs JSON safely
 */
function parseSpecs(specs: Record<string, unknown> | null | undefined): JobSpecsViewModel {
  if (!specs || typeof specs !== 'object') {
    return {};
  }
  return specs as JobSpecsViewModel;
}

/**
 * Build line items from job data
 */
function buildLineItems(
  job: JobWithRelations,
  specs: JobSpecsViewModel,
  quantity: number,
  unitPrice: number
): LineItemViewModel[] {
  // Prefer stored lineItems from specs
  if (specs.lineItems && Array.isArray(specs.lineItems) && specs.lineItems.length > 0) {
    return specs.lineItems.map(item => ({
      description: item.description || '',
      quantity: Number(item.quantity) || 0,
      unitCost: Number(item.unitCost) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      total: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    }));
  }

  // Fall back to job-level data
  if (quantity > 0) {
    const unitCost = Number(job.paperCostCPM) || 0;
    return [{
      description: job.title || 'Print Job',
      quantity,
      unitCost,
      unitPrice,
      total: quantity * unitPrice,
    }];
  }

  return [];
}

/**
 * Build financials view model using unified cost service
 */
function buildFinancials(
  job: JobWithRelations,
  sellPrice: number,
  unitPrice: number
): JobFinancialsViewModel {
  const purchaseOrders = job.PurchaseOrder || [];

  // Use unified cost calculation
  const totalCost = calculateJobCost(purchaseOrders);
  const paperMarkup = calculateJobPaperMarkup(purchaseOrders);

  // Use cached ProfitSplit if available
  if (job.ProfitSplit) {
    const ps = job.ProfitSplit;
    return {
      sellPrice,
      totalCost: Number(ps.totalCost) || totalCost,
      grossMargin: Number(ps.grossMargin) || (sellPrice - totalCost),
      paperMarkup: Number(ps.paperMarkup) || paperMarkup,
      paperCost: Number(ps.paperCost) || 0,
      bradfordShare: Number(ps.bradfordShare) || 0,
      impactShare: Number(ps.impactShare) || 0,
      marginPercent: sellPrice > 0 ? round2((Number(ps.grossMargin) || 0) / sellPrice * 100) : 0,
      unitPrice,
    };
  }

  // Calculate on-the-fly
  const grossMargin = sellPrice - totalCost;
  const bradfordShare = round2(grossMargin * 0.5 + paperMarkup);
  const impactShare = round2(grossMargin * 0.5);
  const marginPercent = sellPrice > 0 ? round2(grossMargin / sellPrice * 100) : 0;

  return {
    sellPrice,
    totalCost,
    grossMargin: round2(grossMargin),
    paperMarkup,
    paperCost: 0, // Would need to calculate from POs
    bradfordShare,
    impactShare,
    marginPercent,
    unitPrice,
  };
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

/**
 * @deprecated Use toJobViewModel() instead.
 * This maintains backward compatibility during migration.
 */
export function transformJobForPDF(job: JobWithRelations): Record<string, unknown> {
  const vm = toJobViewModel(job);

  // Return in the legacy format expected by existing PDF/email services
  return {
    id: vm.id,
    number: vm.jobNo,
    title: vm.title,
    status: vm.status,
    notes: vm.notes,
    quantity: vm.quantity,
    sizeName: vm.sizeName,
    customerPONumber: vm.customerPONumber,
    vendorPONumber: vm.vendorPONumber,
    invoiceNumber: vm.invoiceNumber,
    quoteNumber: vm.quoteNumber,
    dueDate: vm.dueDate,
    createdAt: vm.createdAt,
    sellPrice: vm.financials.sellPrice,
    mailDate: vm.mailDate,
    inHomesDate: vm.inHomesDate,
    description: vm.description,
    customer: vm.customer,
    vendor: vm.vendor,
    specs: vm.specs,
    lineItems: vm.lineItems,
    financials: {
      impactCustomerTotal: vm.financials.sellPrice,
      jdServicesTotal: 0, // Legacy field
      bradfordPaperCost: vm.financials.paperCost,
      paperMarkupAmount: vm.financials.paperMarkup,
    },
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
