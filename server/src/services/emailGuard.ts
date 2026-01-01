/**
 * Email Guard Service
 * Prevents duplicate emails by checking recent send history
 * and providing a centralized deduplication layer.
 */

import { prisma } from '../utils/prisma';

// Email types for tracking
export type EmailType =
  | 'VENDOR_PO'           // Vendor PO with portal link
  | 'VENDOR_PO_THREEZ'    // ThreeZ-specific PO email
  | 'THREAD_INIT_CUSTOMER' // Customer thread initialization
  | 'THREAD_INIT_VENDOR'   // Vendor thread initialization
  | 'PROOF_TO_CUSTOMER'    // Proof sent to customer
  | 'ARTWORK_TO_VENDOR'    // Artwork notification to vendor
  | 'CUSTOMER_CONFIRM'     // Customer order confirmation
  | 'SHIPMENT_TRACKING'    // Shipment tracking notification
  | 'INVOICE'              // Invoice email
  | 'JD_INVOICE'           // JD Invoice to Bradford
  | 'RFQ'                  // RFQ to vendor
  | 'VENDOR_APPROVAL';     // Vendor approval notification

// Default cooldown periods (in minutes)
const COOLDOWN_MINUTES: Record<EmailType, number> = {
  'VENDOR_PO': 5,
  'VENDOR_PO_THREEZ': 5,
  'THREAD_INIT_CUSTOMER': 60,  // Only init thread once per hour
  'THREAD_INIT_VENDOR': 60,
  'PROOF_TO_CUSTOMER': 2,      // Allow quick resends for proofs
  'ARTWORK_TO_VENDOR': 5,
  'CUSTOMER_CONFIRM': 30,
  'SHIPMENT_TRACKING': 5,
  'INVOICE': 5,
  'JD_INVOICE': 30,
  'RFQ': 5,
  'VENDOR_APPROVAL': 10,
};

export interface CanSendResult {
  canSend: boolean;
  reason?: string;
  lastSentAt?: Date;
}

export interface EmailLogEntry {
  jobId: string;
  emailType: EmailType;
  sentTo: string;
  success: boolean;
  messageId?: string;
  skipped?: boolean;
  error?: string;
}

/**
 * Check if an email can be sent (not a duplicate)
 * @param jobId - Job ID
 * @param emailType - Type of email
 * @param recipientEmail - Optional: check for specific recipient
 * @param customCooldownMinutes - Override default cooldown
 */
export async function canSendEmail(
  jobId: string,
  emailType: EmailType,
  recipientEmail?: string,
  customCooldownMinutes?: number
): Promise<CanSendResult> {
  const cooldownMinutes = customCooldownMinutes ?? COOLDOWN_MINUTES[emailType] ?? 5;
  const cooldownDate = new Date(Date.now() - cooldownMinutes * 60 * 1000);

  try {
    // Find recent successful sends of this email type for this job
    const recentSend = await prisma.emailLog.findFirst({
      where: {
        jobId,
        emailType,
        success: true,
        skipped: false,
        sentAt: { gte: cooldownDate },
        // Optionally filter by recipient
        ...(recipientEmail ? { sentTo: recipientEmail } : {}),
      },
      orderBy: { sentAt: 'desc' },
    });

    if (recentSend) {
      return {
        canSend: false,
        reason: `${emailType} already sent ${Math.round((Date.now() - recentSend.sentAt.getTime()) / 1000 / 60)} minutes ago`,
        lastSentAt: recentSend.sentAt,
      };
    }

    return { canSend: true };
  } catch (error) {
    // If DB check fails, allow send (fail open) but log warning
    console.warn(`⚠️ Email guard check failed for ${emailType}:`, error);
    return { canSend: true, reason: 'Guard check failed, allowing send' };
  }
}

/**
 * Record an email send attempt
 */
export async function logEmailSend(entry: EmailLogEntry): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        jobId: entry.jobId,
        emailType: entry.emailType,
        sentTo: entry.sentTo,
        success: entry.success,
        messageId: entry.messageId,
        skipped: entry.skipped ?? false,
        error: entry.error,
      },
    });
  } catch (error) {
    // Log but don't fail the email send if logging fails
    console.error('❌ Failed to log email send:', error);
  }
}

/**
 * Log a skipped email (dedup prevented)
 */
export async function logEmailSkipped(
  jobId: string,
  emailType: EmailType,
  sentTo: string,
  reason: string
): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        jobId,
        emailType,
        sentTo,
        success: false,
        skipped: true,
        error: reason,
      },
    });
    console.log(`⏭️ Skipped ${emailType} for job ${jobId}: ${reason}`);
  } catch (error) {
    console.error('❌ Failed to log skipped email:', error);
  }
}

/**
 * Wrapper to guard and execute an email send function
 * @param jobId - Job ID
 * @param emailType - Type of email
 * @param recipientEmail - Recipient email address
 * @param sendFn - The actual email send function
 * @returns Result with skipped flag if dedup prevented send
 */
export async function guardedEmailSend<T extends { success: boolean; emailedAt?: Date }>(
  jobId: string,
  emailType: EmailType,
  recipientEmail: string,
  sendFn: () => Promise<T>
): Promise<T & { skipped?: boolean }> {
  // Check if we can send
  const canSend = await canSendEmail(jobId, emailType, recipientEmail);

  if (!canSend.canSend) {
    await logEmailSkipped(jobId, emailType, recipientEmail, canSend.reason || 'Duplicate detected');
    return { success: true, skipped: true } as T & { skipped: true };
  }

  try {
    // Execute the send
    const result = await sendFn();

    // Log the send
    await logEmailSend({
      jobId,
      emailType,
      sentTo: recipientEmail,
      success: result.success,
    });

    return result;
  } catch (error: any) {
    // Log the failed attempt
    await logEmailSend({
      jobId,
      emailType,
      sentTo: recipientEmail,
      success: false,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get email history for a job
 */
export async function getEmailHistory(jobId: string, limit = 50) {
  return prisma.emailLog.findMany({
    where: { jobId },
    orderBy: { sentAt: 'desc' },
    take: limit,
  });
}

/**
 * Check if a specific email type was ever sent successfully for a job
 */
export async function wasEmailEverSent(jobId: string, emailType: EmailType): Promise<boolean> {
  const sent = await prisma.emailLog.findFirst({
    where: {
      jobId,
      emailType,
      success: true,
      skipped: false,
    },
  });
  return !!sent;
}
