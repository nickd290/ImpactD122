/**
 * Purchase Order View Model
 *
 * SINGLE SOURCE OF TRUTH for transforming PurchaseOrder records to PDF/Email outputs.
 *
 * This centralizes PO data transformation that was previously scattered across:
 * - pdfController.ts (generatePO, lines 227-290)
 * - emailService.ts (various PO email functions)
 * - jobsController.ts (inline PO transformations)
 */

import {
  COMPANY_IDS,
  getCompanyDisplayName,
  isBradfordToJDPO,
  isImpactToBradfordPO,
  isImpactOriginPO,
} from '../constants';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CompanyViewModel {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
}

export interface POVendorViewModel {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  vendorCode?: string | null;
}

export interface POLineItemViewModel {
  description: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface POSpecsViewModel {
  productType?: string;
  finishedSize?: string;
  paperType?: string;
  colors?: string;
  quantity?: number;
  specialInstructions?: string;
  artworkFilesLink?: string;
  [key: string]: unknown;
}

export interface POViewModel {
  // Identifiers
  id: string;
  poNumber: string;
  jobId: string | null;
  jobNo: string | null;

  // Routing
  originCompanyId: string | null;
  targetCompanyId: string | null;
  targetVendorId: string | null;

  // Origin/Target display
  origin: CompanyViewModel | null;
  target: CompanyViewModel | POVendorViewModel | null;

  // Status
  status: string;

  // Costs
  buyCost: number;
  paperCost: number;
  paperMarkup: number;
  mfgCost: number;
  printCPM: number;

  // Calculated total
  totalAmount: number;

  // Dates
  issuedAt: Date | null;
  emailedAt: Date | null;
  emailedTo: string | null;
  acceptedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;

  // Related job info
  job: {
    id: string;
    jobNo: string;
    title: string;
    quantity: number;
    dueDate: Date | null;
    mailDate: Date | null;
    inHomesDate: Date | null;
    customer: {
      name: string;
      email: string;
    } | null;
  } | null;

  // Content
  description: string | null;
  specialInstructions: string | null;
  artworkFilesLink: string | null;
  specs: POSpecsViewModel;
  lineItems: POLineItemViewModel[];

  // PDF URL
  pdfUrl: string | null;

  // Type flags for routing logic
  isBradfordToJD: boolean;
  isImpactToBradford: boolean;
  isImpactOrigin: boolean;
}

// ============================================================================
// INPUT TYPE (from Prisma query)
// ============================================================================

export interface POWithRelations {
  id: string;
  poNumber: string;
  originCompanyId: string | null;
  targetCompanyId: string | null;
  targetVendorId: string | null;
  jobId: string | null;
  status: string;
  buyCost?: number | string | null;
  paperCost?: number | string | null;
  paperMarkup?: number | string | null;
  mfgCost?: number | string | null;
  printCPM?: number | string | null;
  description?: string | null;
  specialInstructions?: string | null;
  artworkFilesLink?: string | null;
  pdfUrl?: string | null;
  issuedAt?: Date | null;
  emailedAt?: Date | null;
  emailedTo?: string | null;
  acceptedAt?: Date | null;
  paidAt?: Date | null;
  createdAt: Date;
  // Relations
  Job?: {
    id: string;
    jobNo: string;
    title?: string | null;
    quantity?: number | null;
    deliveryDate?: Date | null;
    mailDate?: Date | null;
    inHomesDate?: Date | null;
    specs?: Record<string, unknown> | null;
    Company?: {
      id: string;
      name: string;
      email?: string | null;
    } | null;
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
}

// ============================================================================
// TRANSFORMATION FUNCTIONS
// ============================================================================

/**
 * Transform a PurchaseOrder record to POViewModel
 */
export function toPOViewModel(po: POWithRelations): POViewModel {
  const buyCost = Number(po.buyCost) || 0;
  const paperCost = Number(po.paperCost) || 0;
  const paperMarkup = Number(po.paperMarkup) || 0;
  const mfgCost = Number(po.mfgCost) || 0;
  const printCPM = Number(po.printCPM) || 0;

  // Calculate total amount based on PO type
  const totalAmount = calculatePOTotal(po);

  // Build origin company view
  const origin = buildOriginCompany(po.originCompanyId);

  // Build target (company or vendor)
  const target = buildTarget(po);

  // Build job info
  const job = po.Job ? buildJobInfo(po.Job) : null;

  // Parse specs from job
  const specs = (po.Job?.specs as POSpecsViewModel) || {};

  // Build line items
  const lineItems = buildPOLineItems(po, totalAmount);

  return {
    id: po.id,
    poNumber: po.poNumber,
    jobId: po.jobId,
    jobNo: po.Job?.jobNo || null,
    originCompanyId: po.originCompanyId,
    targetCompanyId: po.targetCompanyId,
    targetVendorId: po.targetVendorId,
    origin,
    target,
    status: po.status,
    buyCost,
    paperCost,
    paperMarkup,
    mfgCost,
    printCPM,
    totalAmount,
    issuedAt: po.issuedAt || null,
    emailedAt: po.emailedAt || null,
    emailedTo: po.emailedTo || null,
    acceptedAt: po.acceptedAt || null,
    paidAt: po.paidAt || null,
    createdAt: po.createdAt,
    job,
    description: po.description || null,
    specialInstructions: po.specialInstructions || specs.specialInstructions || null,
    artworkFilesLink: po.artworkFilesLink || specs.artworkFilesLink || null,
    specs,
    lineItems,
    pdfUrl: po.pdfUrl || null,
    isBradfordToJD: isBradfordToJDPO(po),
    isImpactToBradford: isImpactToBradfordPO(po),
    isImpactOrigin: isImpactOriginPO(po),
  };
}

/**
 * Calculate PO total based on type
 *
 * For Bradford→JD POs: Use mfgCost + paperCost or fallback to CPM calculation
 * For other POs: Use buyCost directly
 */
export function calculatePOTotal(po: POWithRelations): number {
  const buyCost = Number(po.buyCost) || 0;
  const mfgCost = Number(po.mfgCost) || 0;
  const paperCost = Number(po.paperCost) || 0;
  const printCPM = Number(po.printCPM) || 0;
  const quantity = po.Job?.quantity || 0;

  // For Bradford→JD POs, calculate from component costs
  if (isBradfordToJDPO(po)) {
    if (mfgCost > 0 || paperCost > 0) {
      return round2(mfgCost + paperCost);
    }
    // Fallback to CPM calculation
    if (printCPM > 0 && quantity > 0) {
      return round2(printCPM * (quantity / 1000));
    }
  }

  // For other POs, use buyCost
  return round2(buyCost);
}

/**
 * Build origin company view model
 */
function buildOriginCompany(originCompanyId: string | null): CompanyViewModel | null {
  if (!originCompanyId) return null;

  // Known internal companies
  const internalCompanies: Record<string, CompanyViewModel> = {
    [COMPANY_IDS.IMPACT_DIRECT]: {
      id: COMPANY_IDS.IMPACT_DIRECT,
      name: 'Impact Direct',
      email: 'brandon@impactdirectprinting.com',
    },
    [COMPANY_IDS.BRADFORD]: {
      id: COMPANY_IDS.BRADFORD,
      name: 'Bradford Direct',
      email: 'steve.gustafson@bgeltd.com',
    },
    [COMPANY_IDS.JD_GRAPHIC]: {
      id: COMPANY_IDS.JD_GRAPHIC,
      name: 'JD Graphic',
      email: 'production@jdgraphic.com',
    },
  };

  return internalCompanies[originCompanyId] || {
    id: originCompanyId,
    name: getCompanyDisplayName(originCompanyId),
    email: '',
  };
}

/**
 * Build target company or vendor view model
 */
function buildTarget(po: POWithRelations): CompanyViewModel | POVendorViewModel | null {
  // If targeting a vendor
  if (po.Vendor) {
    const addressParts = [
      po.Vendor.streetAddress,
      po.Vendor.city,
      po.Vendor.state,
      po.Vendor.zip,
    ].filter(Boolean);

    return {
      id: po.Vendor.id,
      name: po.Vendor.name,
      email: po.Vendor.email || '',
      phone: po.Vendor.phone || '',
      address: addressParts.join(', '),
      vendorCode: po.Vendor.vendorCode,
    };
  }

  // If targeting a known company
  if (po.targetCompanyId) {
    return buildOriginCompany(po.targetCompanyId);
  }

  return null;
}

/**
 * Build job info for PO
 */
function buildJobInfo(job: NonNullable<POWithRelations['Job']>) {
  return {
    id: job.id,
    jobNo: job.jobNo,
    title: job.title || '',
    quantity: job.quantity || 0,
    dueDate: job.deliveryDate || null,
    mailDate: job.mailDate || null,
    inHomesDate: job.inHomesDate || null,
    customer: job.Company ? {
      name: job.Company.name,
      email: job.Company.email || '',
    } : null,
  };
}

/**
 * Build line items for PO
 */
function buildPOLineItems(po: POWithRelations, totalAmount: number): POLineItemViewModel[] {
  const quantity = po.Job?.quantity || 0;
  const title = po.Job?.title || 'Print Job';

  if (quantity === 0 && totalAmount === 0) {
    return [];
  }

  // For Bradford→JD POs, show component breakdown
  if (isBradfordToJDPO(po)) {
    const items: POLineItemViewModel[] = [];
    const mfgCost = Number(po.mfgCost) || 0;
    const paperCost = Number(po.paperCost) || 0;

    if (mfgCost > 0) {
      items.push({
        description: 'Manufacturing / Print',
        quantity,
        unitCost: quantity > 0 ? round2(mfgCost / quantity) : 0,
        total: mfgCost,
      });
    }

    if (paperCost > 0) {
      items.push({
        description: 'Paper Cost',
        quantity: 1,
        unitCost: paperCost,
        total: paperCost,
      });
    }

    if (items.length > 0) {
      return items;
    }
  }

  // Default: single line item
  return [{
    description: title,
    quantity,
    unitCost: quantity > 0 ? round2(totalAmount / quantity) : totalAmount,
    total: totalAmount,
  }];
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ============================================================================
// INDEX EXPORT
// ============================================================================

export * from './jobViewModel';
