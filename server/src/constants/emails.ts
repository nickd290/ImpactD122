/**
 * Email Configuration Constants
 *
 * CRITICAL: All email addresses should be configured via environment variables.
 * These constants provide fallback defaults and centralize email configuration.
 *
 * Environment variables should be set in .env:
 * - SENDGRID_FROM_EMAIL
 * - EMAIL_VENDOR_PO_CC
 * - EMAIL_ARTWORK_CC (comma-separated)
 * - EMAIL_BRADFORD_INVOICE
 * - EMAIL_JD_INVOICE_CC
 * - EMAIL_THREEZ (comma-separated)
 * - EMAIL_ADMIN_NOTIFICATION
 */

// ============================================================================
// DEFAULT EMAIL ADDRESSES (used when env vars not set)
// ============================================================================

const DEFAULTS = {
  FROM_EMAIL: 'brandon@impactdirectprinting.com',
  VENDOR_PO_CC: 'nick@jdgraphic.com',
  ARTWORK_CC: ['brandon@impactdirectprinting.com', 'nick@jdgraphic.com', 'devin@jdgraphic.com'],
  BRADFORD_INVOICE: 'steve.gustafson@bgeltd.com',
  JD_INVOICE_CC: 'nick@jdgraphic.com',
  THREEZ_EMAILS: ['jkoester@threez.com', 'dmeinhart@threez.com'],
  THREEZ_CC: 'nick@jdgraphic.com',
  ADMIN_NOTIFICATION: 'brandon@impactdirectprinting.com',
  JD_NOTIFICATION_CC: 'nick@jdgraphic.com',
  JD_PRODUCTION: 'production@jdgraphic.com',
  PHONE: '844-467-2280',
  PHONE_ALT: '(330) 963-0970',
} as const;

// ============================================================================
// ENVIRONMENT-AWARE GETTERS
// ============================================================================

/**
 * Get the FROM email address for outgoing emails
 */
export function getFromEmail(): string {
  return process.env.SENDGRID_FROM_EMAIL || DEFAULTS.FROM_EMAIL;
}

/**
 * Get CC email for vendor PO emails
 */
export function getVendorPoCcEmail(): string {
  return process.env.EMAIL_VENDOR_PO_CC || DEFAULTS.VENDOR_PO_CC;
}

/**
 * Get CC emails for artwork notifications
 */
export function getArtworkCcEmails(): string[] {
  const envValue = process.env.EMAIL_ARTWORK_CC;
  if (envValue) {
    return envValue.split(',').map(e => e.trim());
  }
  return [...DEFAULTS.ARTWORK_CC];
}

/**
 * Get Bradford invoice recipient email
 */
export function getBradfordInvoiceEmail(): string {
  return process.env.EMAIL_BRADFORD_INVOICE || DEFAULTS.BRADFORD_INVOICE;
}

/**
 * Get JD invoice CC email
 */
export function getJdInvoiceCcEmail(): string {
  return process.env.EMAIL_JD_INVOICE_CC || DEFAULTS.JD_INVOICE_CC;
}

/**
 * Get ThreeZ notification emails
 */
export function getThreeZEmails(): string[] {
  const envValue = process.env.EMAIL_THREEZ;
  if (envValue) {
    return envValue.split(',').map(e => e.trim());
  }
  return [...DEFAULTS.THREEZ_EMAILS];
}

/**
 * Get ThreeZ CC email
 */
export function getThreeZCcEmail(): string {
  return process.env.EMAIL_THREEZ_CC || DEFAULTS.THREEZ_CC;
}

/**
 * Get admin notification email
 */
export function getAdminNotificationEmail(): string {
  return process.env.ADMIN_NOTIFICATION_EMAIL || DEFAULTS.ADMIN_NOTIFICATION;
}

/**
 * Get JD notification CC email
 */
export function getJdNotificationCcEmail(): string {
  return process.env.EMAIL_JD_NOTIFICATION_CC || DEFAULTS.JD_NOTIFICATION_CC;
}

/**
 * Get JD production email
 */
export function getJdProductionEmail(): string {
  return process.env.EMAIL_JD_PRODUCTION || DEFAULTS.JD_PRODUCTION;
}

// ============================================================================
// PDF/EMAIL FOOTER CONTENT
// ============================================================================

/**
 * Get contact info for PDF/email footers
 */
export function getContactInfo(): { email: string; phone: string } {
  return {
    email: process.env.EMAIL_CONTACT || DEFAULTS.FROM_EMAIL,
    phone: process.env.PHONE_CONTACT || DEFAULTS.PHONE,
  };
}

/**
 * Get footer text for PDFs
 */
export function getPdfFooterText(): string {
  const { email, phone } = getContactInfo();
  return `${email} | ${phone}`;
}

/**
 * Get questions contact text for PDFs
 */
export function getQuestionsContactText(): string {
  const { email, phone } = getContactInfo();
  return `Questions? Contact Brandon at ${phone} or ${email}`;
}

// ============================================================================
// EMAIL SIGNATURE BLOCKS
// ============================================================================

export interface EmailSignature {
  name: string;
  title: string;
  company: string;
  email: string;
}

/**
 * Get email signature for Impact Direct emails
 */
export function getImpactSignature(): EmailSignature {
  return {
    name: 'Brandon Ferris',
    title: '',
    company: 'Impact Direct Printing',
    email: getFromEmail(),
  };
}

/**
 * Get email signature for JD Graphic emails
 */
export function getJdSignature(): EmailSignature {
  return {
    name: 'Nick',
    title: '',
    company: 'JD Graphic / Impact Direct Team',
    email: process.env.EMAIL_JD_CONTACT || 'nick@jdgraphic.com',
  };
}

/**
 * Get signature text for AI-generated emails
 */
export function getAiEmailSignature(isJdContext: boolean): string {
  const sig = isJdContext ? getJdSignature() : getImpactSignature();
  return `${sig.name}\n${sig.company}\n${sig.email}`;
}

// ============================================================================
// HTML EMAIL FOOTER
// ============================================================================

/**
 * Generate HTML footer for emails
 */
export function getEmailHtmlFooter(): string {
  const { email, phone } = getContactInfo();
  return `
        <p style="font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 10px; margin-top: 20px;">
          ${email}
        </p>
  `;
}

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================

/**
 * @deprecated Use getVendorPoCcEmail() instead
 */
export const VENDOR_PO_CC_EMAIL = DEFAULTS.VENDOR_PO_CC;

/**
 * @deprecated Use getArtworkCcEmails() instead
 */
export const ARTWORK_CC_EMAILS = DEFAULTS.ARTWORK_CC;

/**
 * @deprecated Use getBradfordInvoiceEmail() instead
 */
export const BRADFORD_INVOICE_EMAIL = DEFAULTS.BRADFORD_INVOICE;

/**
 * @deprecated Use getJdInvoiceCcEmail() instead
 */
export const JD_INVOICE_CC_EMAIL = DEFAULTS.JD_INVOICE_CC;

/**
 * @deprecated Use getThreeZEmails() instead
 */
export const THREEZ_EMAILS = DEFAULTS.THREEZ_EMAILS;

/**
 * @deprecated Use getThreeZCcEmail() instead
 */
export const THREEZ_CC_EMAIL = DEFAULTS.THREEZ_CC;

/**
 * @deprecated Use getAdminNotificationEmail() instead
 */
export const ADMIN_NOTIFICATION_EMAIL = DEFAULTS.ADMIN_NOTIFICATION;

/**
 * @deprecated Use getJdNotificationCcEmail() instead
 */
export const JD_NOTIFICATION_CC = DEFAULTS.JD_NOTIFICATION_CC;
