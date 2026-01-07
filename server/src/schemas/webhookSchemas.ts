import { z } from 'zod';

// ============================================
// PORTAL JOB WEBHOOK SCHEMA
// ============================================

const shippingAddressSchema = z.object({
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
}).optional();

const portalJobSpecsSchema = z.object({
  // Common fields
  source: z.string().optional(),
  externalJobNo: z.string().optional(),

  // Inventory Release App specific fields
  releaseId: z.string().optional(),
  partNumber: z.string().optional(),
  partDescription: z.string().optional(),
  pallets: z.number().optional(),
  boxes: z.number().optional(),
  totalUnits: z.number().optional(),
  unitsPerBox: z.number().optional(),
  boxesPerSkid: z.number().optional(),
  shippingLocation: z.string().optional(),
  shippingAddress: shippingAddressSchema,
  ticketNumber: z.string().optional(),
  batchNumber: z.string().optional(),
  manufactureDate: z.string().optional(),
  shipVia: z.string().optional(),
  freightTerms: z.string().optional(),
  sellPrice: z.number().optional(),

  // Cost basis and vendor info
  costBasisPerUnit: z.number().optional(),
  buyCost: z.number().optional(),
  vendorName: z.string().optional(),
  paperSource: z.enum(['BRADFORD', 'VENDOR', 'CUSTOMER']).optional(),

  // PDFs for ThreeZ email (base64 encoded)
  packingSlipPdf: z.string().optional(),
  boxLabelsPdf: z.string().optional(),
}).passthrough(); // Allow additional fields

const portalFileSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  kind: z.string(),
  size: z.number().optional().default(0),
  downloadUrl: z.string(),
});

export const portalJobPayloadSchema = z.object({
  jobNo: z.string().min(1, 'jobNo is required'),
  title: z.string().optional(),
  companyId: z.string().optional(),
  companyName: z.string().min(1, 'companyName is required'),
  customerPONumber: z.string().optional(),
  sizeName: z.string().optional(),
  quantity: z.number().optional(),
  specs: portalJobSpecsSchema.optional(),
  status: z.string().optional(),
  deliveryDate: z.string().optional(),
  createdAt: z.string().optional(),
  externalJobId: z.string().min(1, 'externalJobId is required'),
  files: z.array(portalFileSchema).optional(),
  artworkUrl: z.string().nullable().optional(),
  dataFileUrl: z.string().nullable().optional(),
});

export type PortalJobPayload = z.infer<typeof portalJobPayloadSchema>;

// ============================================
// CAMPAIGN WEBHOOK SCHEMA
// ============================================

const campaignDropSchema = z.object({
  mailDate: z.string(),
  uploadDeadline: z.string(),
  status: z.string(),
});

const campaignSpecsSchema = z.object({
  productType: z.string().optional(),
  paperStock: z.string().optional(),
  printColors: z.string().optional(),
}).passthrough().nullable().optional();

export const portalCampaignPayloadSchema = z.object({
  externalCampaignId: z.string().min(1, 'externalCampaignId is required'),
  name: z.string().min(1, 'name is required'),
  companyId: z.string(),
  companyName: z.string().min(1, 'companyName is required'),
  sizeName: z.string(),
  quantity: z.number().positive(),
  pricePerM: z.number().nonnegative(),
  specs: campaignSpecsSchema,
  customerPONumber: z.string().nullable().optional(),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  mailDay: z.number().min(0).max(6),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  drops: z.array(campaignDropSchema),
});

export type PortalCampaignPayload = z.infer<typeof portalCampaignPayloadSchema>;

// ============================================
// EMAIL-TO-JOB WEBHOOK SCHEMA
// ============================================

const emailAttachmentSchema = z.object({
  filename: z.string(),
  content: z.string(), // Base64 encoded
  mimeType: z.string(),
});

export const emailToJobPayloadSchema = z.object({
  from: z.string().min(1, 'from is required'),
  subject: z.string().optional().default(''),
  textBody: z.string().optional().default(''),
  htmlBody: z.string().optional(),
  attachments: z.array(emailAttachmentSchema).optional(),
  forwardedBy: z.string().optional(),
}).refine(
  (data) => data.textBody || data.htmlBody,
  { message: 'Either textBody or htmlBody is required' }
);

export type EmailToJobPayload = z.infer<typeof emailToJobPayloadSchema>;

// ============================================
// LINK JOB WEBHOOK SCHEMA
// ============================================

export const linkJobPayloadSchema = z.object({
  jobId: z.string().optional(),
  jobNo: z.string().optional(),
  externalJobId: z.string().min(1, 'externalJobId is required'),
}).refine(
  (data) => data.jobId || data.jobNo,
  { message: 'Either jobId or jobNo is required' }
);

export type LinkJobPayload = z.infer<typeof linkJobPayloadSchema>;

// ============================================
// VALIDATION HELPER
// ============================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Array<{ field: string; message: string }>;
}

export function validatePayload<T>(
  schema: z.ZodSchema<T>,
  payload: unknown
): ValidationResult<T> {
  const result = schema.safeParse(payload);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
  }));

  return { success: false, errors };
}
