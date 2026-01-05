/**
 * Job Readiness Service
 *
 * Calculates job readiness status based on QC flags.
 * Determines if a job has all required information before PO can be sent to vendor.
 */

import { PrismaClient, Job, JobComponent, ReadinessStatus, QcArtworkStatus, QcDataFilesStatus, QcMailingStatus, QcSuppliedMaterialsStatus, QcVersionsStatus } from '@prisma/client';

const prisma = new PrismaClient();

type JobWithComponents = Job & {
  JobComponent?: JobComponent[];
};

interface ReadinessResult {
  status: ReadinessStatus;
  blockers: string[];
  warnings: string[];
}

/**
 * Calculate readiness status for a job based on QC flags and components
 */
export function calculateReadiness(job: JobWithComponents): ReadinessResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // If PO already sent, status is SENT
  if (job.readinessStatus === 'SENT') {
    return { status: 'SENT', blockers: [], warnings: [] };
  }

  // Check artwork status
  if (job.qcArtwork === 'PENDING') {
    blockers.push('Artwork not received');
  }

  // Check if this is a mailing job
  const isMailing = isMailingJob(job);

  if (isMailing) {
    // Mailing jobs need additional checks
    if (!job.mailDate) {
      blockers.push('Mail date not set');
    }

    if (!job.matchType) {
      warnings.push('Match type not specified (2-WAY/3-WAY)');
    }

    if (job.qcDataFiles === 'PENDING') {
      blockers.push('Data files not received');
    }

    if (job.qcMailing === 'INCOMPLETE') {
      blockers.push('Mailing information incomplete');
    }
  }

  // Check supplied materials (if applicable)
  if (job.qcSuppliedMaterials === 'PENDING') {
    blockers.push('Supplied materials not received');
  }

  // Check versions (if applicable)
  if (job.qcVersions === 'INCOMPLETE') {
    warnings.push('Version details incomplete');
  }

  // Check components
  if (job.JobComponent && job.JobComponent.length > 0) {
    for (const component of job.JobComponent) {
      if (component.artworkStatus === 'PENDING') {
        blockers.push(`${component.name}: Artwork pending`);
      }
      if (component.materialStatus === 'PENDING') {
        blockers.push(`${component.name}: Material pending`);
      }
      if (component.materialStatus === 'IN_TRANSIT') {
        warnings.push(`${component.name}: Material in transit`);
      }
    }
  }

  const status: ReadinessStatus = blockers.length > 0 ? 'INCOMPLETE' : 'READY';

  return { status, blockers, warnings };
}

/**
 * Determine if a job is a mailing job based on various signals
 */
export function isMailingJob(job: Job): boolean {
  // Check explicit mailing vendor
  if (job.mailingVendorId) return true;

  // Check match type
  if (job.matchType) return true;

  // Check mail dates
  if (job.mailDate || job.inHomesDate) return true;

  // Check specs for mailing signals
  const specs = job.specs as Record<string, unknown> | null;
  if (specs) {
    if (specs.mailing && typeof specs.mailing === 'object') {
      const mailing = specs.mailing as Record<string, unknown>;
      if (mailing.isDirectMail) return true;
      if (mailing.mailDate || mailing.inHomesDate) return true;
      if (mailing.dropLocation || mailing.mailClass) return true;
    }

    if (specs.timeline && typeof specs.timeline === 'object') {
      const timeline = specs.timeline as Record<string, unknown>;
      if (timeline.mailDate || timeline.inHomesDate) return true;
    }

    if (specs.matchType) return true;
  }

  // Check notes for mailing keywords
  if (job.notes) {
    const mailingKeywords = /mail date|in-homes|in homes|usps|presort|drop date|mailing date|standard mail|first class mail/i;
    if (mailingKeywords.test(job.notes)) return true;
  }

  return false;
}

/**
 * Determine if a job has multiple versions
 */
export function hasMultipleVersions(job: Job): boolean {
  const specs = job.specs as Record<string, unknown> | null;
  if (!specs) return false;

  if (specs.versions && Array.isArray(specs.versions) && specs.versions.length > 1) {
    return true;
  }

  return false;
}

/**
 * Set initial QC flags based on job data
 */
export function determineInitialQcFlags(job: Job, specs: Record<string, unknown> | null): {
  qcArtwork: QcArtworkStatus;
  qcDataFiles: QcDataFilesStatus;
  qcMailing: QcMailingStatus;
  qcSuppliedMaterials: QcSuppliedMaterialsStatus;
  qcVersions: QcVersionsStatus;
} {
  // Artwork: Check if we have file links
  let qcArtwork: QcArtworkStatus = 'PENDING';
  if (specs?.artworkUrl || specs?.additionalLinks || job.artOverride) {
    qcArtwork = 'RECEIVED';
  }

  // Data files: Check based on job type
  let qcDataFiles: QcDataFilesStatus = 'NA';
  const isMailing = isMailingJob(job);
  if (isMailing) {
    if (job.dataIncludedWithArtwork) {
      qcDataFiles = 'IN_ARTWORK';
    } else if (job.dataOverride === 'SENT') {
      qcDataFiles = 'SEPARATE_FILE';
    } else if (job.dataOverride === 'NA') {
      qcDataFiles = 'NA';
    } else {
      qcDataFiles = 'PENDING';
    }
  }

  // Mailing: Check if mailing info is complete
  let qcMailing: QcMailingStatus = 'NA';
  if (isMailing) {
    if (job.mailDate && job.matchType) {
      qcMailing = 'COMPLETE';
    } else {
      qcMailing = 'INCOMPLETE';
    }
  }

  // Supplied materials: Check for components from Lahlouh/third party
  let qcSuppliedMaterials: QcSuppliedMaterialsStatus = 'NA';
  if (specs?.components && Array.isArray(specs.components)) {
    // If there are components that aren't from JD, we need to track materials
    qcSuppliedMaterials = 'PENDING';
  }

  // Versions: Check if multiple versions
  let qcVersions: QcVersionsStatus = 'NA';
  if (hasMultipleVersions(job)) {
    if (specs?.versions && Array.isArray(specs.versions) && specs.versions.length > 0) {
      // Check if versions have required info
      const versionsComplete = specs.versions.every((v: unknown) => {
        const version = v as Record<string, unknown>;
        return version.name && version.quantity;
      });
      qcVersions = versionsComplete ? 'COMPLETE' : 'INCOMPLETE';
    } else {
      qcVersions = 'INCOMPLETE';
    }
  }

  return {
    qcArtwork,
    qcDataFiles,
    qcMailing,
    qcSuppliedMaterials,
    qcVersions,
  };
}

/**
 * Update job readiness status and recalculate
 */
export async function updateJobReadiness(jobId: string): Promise<ReadinessResult> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { JobComponent: true },
  });

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const result = calculateReadiness(job);

  // Update job with new status
  await prisma.job.update({
    where: { id: jobId },
    data: {
      readinessStatus: result.status,
      readinessCalculatedAt: new Date(),
    },
  });

  return result;
}

/**
 * Mark job as PO sent
 */
export async function markJobAsSent(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      readinessStatus: 'SENT',
      readinessCalculatedAt: new Date(),
    },
  });
}

/**
 * Get readiness summary for a job
 */
export async function getReadinessSummary(jobId: string): Promise<ReadinessResult & { job: JobWithComponents }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { JobComponent: true },
  });

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const result = calculateReadiness(job);

  return { ...result, job };
}
