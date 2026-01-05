/**
 * Component Suggestion Service
 *
 * Suggests default components based on job type and specifications.
 * Used by UI to pre-populate component list when creating/editing jobs.
 *
 * Flow:
 * 1. User sets jobMetaType + mailFormat (or jobType for non-mailing)
 * 2. Service returns suggested components with defaults
 * 3. UI shows suggestions, user confirms/edits before saving
 * 4. User can add/remove/modify components before job creation
 */

import {
  JobMetaType,
  MailFormat,
  JobType,
  ComponentType,
  ComponentOwner,
  ComponentStatus,
} from '@prisma/client';

// Input for component suggestion
export interface ComponentSuggestionInput {
  jobMetaType?: JobMetaType | null;
  mailFormat?: MailFormat | null;
  jobType?: JobType | null;
  envelopeComponents?: number | null;
  hasSamples?: boolean;
  hasData?: boolean;
  hasVersions?: boolean;
}

// Output structure for suggested component
export interface SuggestedComponent {
  type: ComponentType;
  name: string;
  description?: string;
  owner: ComponentOwner;
  artworkRequired: boolean;
  dataRequired: boolean;
  sortOrder: number;
}

/**
 * Get suggested components based on job specifications.
 *
 * Rules:
 * - All jobs get PRINT + PROOF (core workflow)
 * - Mailing jobs add DATA + MAILING
 * - Envelope mailings add FINISHING (insertion/assembly)
 * - Jobs with samples flag add SAMPLES
 * - Jobs with data flag add DATA (if not already mailing)
 * - All jobs get SHIPPING (final delivery)
 *
 * @param job - Job data for suggestion derivation
 * @returns Array of suggested components
 */
export function getSuggestedComponents(job: ComponentSuggestionInput): SuggestedComponent[] {
  const suggestions: SuggestedComponent[] = [];
  let sortOrder = 0;

  // All jobs get PRINT (primary production)
  suggestions.push({
    type: ComponentType.PRINT,
    name: 'Print Production',
    description: 'Primary print production',
    owner: ComponentOwner.INTERNAL,
    artworkRequired: true,
    dataRequired: false,
    sortOrder: sortOrder++,
  });

  // MAILING jobs get DATA processing
  if (job.jobMetaType === JobMetaType.MAILING) {
    suggestions.push({
      type: ComponentType.DATA,
      name: 'Data Processing',
      description: 'Mailing list processing and CASS certification',
      owner: ComponentOwner.INTERNAL,
      artworkRequired: false,
      dataRequired: true,
      sortOrder: sortOrder++,
    });
  }

  // Non-mailing jobs with explicit data flag also get DATA
  if (job.jobMetaType !== JobMetaType.MAILING && job.hasData) {
    suggestions.push({
      type: ComponentType.DATA,
      name: 'Variable Data',
      description: 'Variable data processing',
      owner: ComponentOwner.INTERNAL,
      artworkRequired: false,
      dataRequired: true,
      sortOrder: sortOrder++,
    });
  }

  // Envelope mailings need FINISHING for insertion/assembly
  if (job.mailFormat === MailFormat.ENVELOPE) {
    const componentCount = job.envelopeComponents || 1;
    suggestions.push({
      type: ComponentType.FINISHING,
      name: 'Insertion/Assembly',
      description: `Insert ${componentCount} component${componentCount > 1 ? 's' : ''} into envelope`,
      owner: ComponentOwner.INTERNAL,
      artworkRequired: false,
      dataRequired: false,
      sortOrder: sortOrder++,
    });
  }

  // Non-mailing folded/booklet jobs may need BINDERY
  if (job.jobMetaType === JobMetaType.JOB || !job.jobMetaType) {
    if (job.jobType === JobType.FOLDED) {
      suggestions.push({
        type: ComponentType.BINDERY,
        name: 'Folding',
        description: 'Folding operation',
        owner: ComponentOwner.INTERNAL,
        artworkRequired: false,
        dataRequired: false,
        sortOrder: sortOrder++,
      });
    }

    if (job.jobType === JobType.BOOKLET_SELF_COVER || job.jobType === JobType.BOOKLET_PLUS_COVER) {
      suggestions.push({
        type: ComponentType.BINDERY,
        name: 'Bindery',
        description: job.jobType === JobType.BOOKLET_PLUS_COVER
          ? 'Saddle stitch with separate cover'
          : 'Saddle stitch self-cover',
        owner: ComponentOwner.INTERNAL,
        artworkRequired: false,
        dataRequired: false,
        sortOrder: sortOrder++,
      });
    }
  }

  // All jobs get PROOF
  suggestions.push({
    type: ComponentType.PROOF,
    name: 'Proof',
    description: 'Customer proof for approval',
    owner: ComponentOwner.INTERNAL,
    artworkRequired: true,
    dataRequired: false,
    sortOrder: sortOrder++,
  });

  // MAILING jobs get mailing services
  if (job.jobMetaType === JobMetaType.MAILING) {
    suggestions.push({
      type: ComponentType.MAILING,
      name: 'Mailing Services',
      description: 'Postal processing and drop-ship',
      owner: ComponentOwner.INTERNAL,
      artworkRequired: false,
      dataRequired: true,
      sortOrder: sortOrder++,
    });
  }

  // Jobs with samples flag
  if (job.hasSamples) {
    suggestions.push({
      type: ComponentType.SAMPLES,
      name: 'Samples',
      description: 'Production samples for customer',
      owner: ComponentOwner.INTERNAL,
      artworkRequired: false,
      dataRequired: false,
      sortOrder: sortOrder++,
    });
  }

  // All jobs get SHIPPING (delivery to customer or mail house)
  suggestions.push({
    type: ComponentType.SHIPPING,
    name: 'Shipping',
    description: job.jobMetaType === JobMetaType.MAILING
      ? 'Delivery to mail facility'
      : 'Delivery to customer',
    owner: ComponentOwner.INTERNAL,
    artworkRequired: false,
    dataRequired: false,
    sortOrder: sortOrder++,
  });

  return suggestions;
}

/**
 * Get default component requirements by type.
 * Used when creating components without full job context.
 */
export function getComponentDefaults(type: ComponentType): {
  artworkRequired: boolean;
  dataRequired: boolean;
} {
  switch (type) {
    case ComponentType.PRINT:
      return { artworkRequired: true, dataRequired: false };
    case ComponentType.DATA:
      return { artworkRequired: false, dataRequired: true };
    case ComponentType.MAILING:
      return { artworkRequired: false, dataRequired: true };
    case ComponentType.PROOF:
      return { artworkRequired: true, dataRequired: false };
    case ComponentType.FINISHING:
    case ComponentType.BINDERY:
    case ComponentType.SHIPPING:
    case ComponentType.SAMPLES:
    case ComponentType.OTHER:
    default:
      return { artworkRequired: false, dataRequired: false };
  }
}

/**
 * Validate component configuration for pathway requirements.
 *
 * @param components - Array of components to validate
 * @returns Array of validation issues (empty if valid)
 */
export function validateComponents(
  components: Array<{
    type?: ComponentType | null;
    owner?: ComponentOwner | null;
    vendorId?: string | null;
  }>
): string[] {
  const issues: string[] = [];

  // Check for required types
  const types = components.map((c) => c.type).filter(Boolean) as ComponentType[];

  if (!types.includes(ComponentType.PRINT)) {
    issues.push('Missing PRINT component (required for all jobs)');
  }

  if (!types.includes(ComponentType.PROOF)) {
    issues.push('Missing PROOF component (required for all jobs)');
  }

  // Check vendor-owned components have vendorId
  for (const component of components) {
    if (component.owner === ComponentOwner.VENDOR && !component.vendorId) {
      issues.push(`Vendor-owned component missing vendorId`);
    }
  }

  return issues;
}

/**
 * Map legacy ComponentSupplier to new ComponentOwner.
 * Used for backfill of existing components.
 */
export function mapSupplierToOwner(
  supplier: 'JD' | 'LAHLOUH' | 'THIRD_PARTY'
): ComponentOwner {
  switch (supplier) {
    case 'JD':
      return ComponentOwner.INTERNAL;
    case 'LAHLOUH':
    case 'THIRD_PARTY':
      return ComponentOwner.VENDOR;
    default:
      return ComponentOwner.INTERNAL;
  }
}

/**
 * Infer ComponentType from legacy component name.
 * Used for backfill of existing components.
 */
export function inferComponentType(name: string): ComponentType {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('print') || nameLower.includes('letter') ||
      nameLower.includes('postcard') || nameLower.includes('mailer')) {
    return ComponentType.PRINT;
  }

  if (nameLower.includes('data') || nameLower.includes('list') ||
      nameLower.includes('cass') || nameLower.includes('ncoa')) {
    return ComponentType.DATA;
  }

  if (nameLower.includes('proof')) {
    return ComponentType.PROOF;
  }

  if (nameLower.includes('mail') || nameLower.includes('postal') ||
      nameLower.includes('drop')) {
    return ComponentType.MAILING;
  }

  if (nameLower.includes('insert') || nameLower.includes('assembly') ||
      nameLower.includes('fold') || nameLower.includes('finish')) {
    return ComponentType.FINISHING;
  }

  if (nameLower.includes('bind') || nameLower.includes('stitch') ||
      nameLower.includes('saddle')) {
    return ComponentType.BINDERY;
  }

  if (nameLower.includes('ship') || nameLower.includes('deliver')) {
    return ComponentType.SHIPPING;
  }

  if (nameLower.includes('sample')) {
    return ComponentType.SAMPLES;
  }

  return ComponentType.OTHER;
}
