/**
 * Mailing Detection Service
 *
 * Auto-detects if a job is a mailing job vs a print-only job,
 * and suggests the appropriate mail format based on specs.
 *
 * Used by:
 * - ParsedJobReviewModal (preview detection before submit)
 * - Job creation flows (default values if not explicitly set)
 */

import { MailFormat } from '@prisma/client';

// Input interface for detection
export interface MailingDetectionInput {
  // Top-level fields
  mailDate?: string | Date | null;
  inHomesDate?: string | Date | null;
  matchType?: string | null;
  notes?: string | null;

  // Nested mailing object (from AI parsing)
  mailing?: {
    isDirectMail?: boolean;
    mailDate?: string | Date | null;
    inHomesDate?: string | Date | null;
    dropLocation?: string | null;
    mailClass?: string | null;
    presortType?: string | null;
    mailProcess?: string | null;
  } | null;

  // Timeline object (alternative location for dates)
  timeline?: {
    mailDate?: string | Date | null;
    inHomesDate?: string | Date | null;
  } | null;

  // Components and versions
  components?: Array<{ name?: string; description?: string }> | null;
  versions?: Array<{ name?: string; quantity?: number }> | null;

  // Raw specs (stringified JSON or object)
  specs?: Record<string, unknown> | string | null;

  // Title for keyword detection
  title?: string | null;
}

// Detection result
export interface MailingDetectionResult {
  isMailing: boolean;
  suggestedFormat: MailFormat | null;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
  envelopeComponents?: number;
}

// Keywords that strongly indicate mailing
const MAILING_KEYWORDS = [
  'mail date',
  'in-homes',
  'in homes',
  'inhomes',
  'usps',
  'presort',
  'drop date',
  'mailing date',
  'standard mail',
  'first class mail',
  'first-class mail',
  'bulk mail',
  'direct mail',
  'saturation mail',
  'carrier route',
  'eddm',
  'postage',
];

// Keywords for mail format detection
const SELF_MAILER_KEYWORDS = [
  'self-mailer',
  'self mailer',
  'selfmailer',
  'tri-fold',
  'trifold',
  'bi-fold',
  'bifold',
  'folded mailer',
  'saddle stitch mailer',
];

const POSTCARD_KEYWORDS = [
  'postcard',
  'post card',
  'post-card',
  '4x6',
  '5x7',
  '6x9 postcard',
  '6x11',
  '8.5x11 postcard',
];

const ENVELOPE_KEYWORDS = [
  'envelope',
  '#10 envelope',
  '#10 env',
  '6x9 envelope',
  '9x12 envelope',
  'window envelope',
  'insert',
  'letter',
  'outer envelope',
  'business reply',
  'brc',
  'bre',
  'buck slip',
  'lift note',
  'letter package',
];

/**
 * Detect if a job is a mailing job and suggest mail format.
 */
export function detectMailingType(data: MailingDetectionInput): MailingDetectionResult {
  const signals: string[] = [];
  let confidence: 'high' | 'medium' | 'low' = 'low';

  // Parse specs if it's a string
  let specs: Record<string, unknown> | null = null;
  if (typeof data.specs === 'string') {
    try {
      specs = JSON.parse(data.specs);
    } catch {
      specs = null;
    }
  } else if (data.specs) {
    specs = data.specs;
  }

  // ============ DETECT IF MAILING ============

  // HIGH confidence signals
  // 1. Explicit isDirectMail flag
  if (data.mailing?.isDirectMail === true) {
    signals.push('Explicit direct mail flag set');
    confidence = 'high';
  }

  // 2. Mail date or in-homes date present
  const hasMailDate = Boolean(
    data.mailDate ||
    data.mailing?.mailDate ||
    data.timeline?.mailDate
  );
  const hasInHomesDate = Boolean(
    data.inHomesDate ||
    data.mailing?.inHomesDate ||
    data.timeline?.inHomesDate
  );

  if (hasMailDate) {
    signals.push('Mail date present');
    confidence = confidence === 'low' ? 'high' : confidence;
  }
  if (hasInHomesDate) {
    signals.push('In-homes date present');
    confidence = confidence === 'low' ? 'high' : confidence;
  }

  // 3. Match type set (2-WAY, 3-WAY)
  if (data.matchType) {
    signals.push(`Match type: ${data.matchType}`);
    confidence = confidence === 'low' ? 'high' : confidence;
  }

  // 4. Mailing infrastructure fields
  if (data.mailing?.dropLocation) {
    signals.push('Drop location specified');
    confidence = 'high';
  }
  if (data.mailing?.mailClass) {
    signals.push(`Mail class: ${data.mailing.mailClass}`);
    confidence = 'high';
  }
  if (data.mailing?.presortType) {
    signals.push(`Presort type: ${data.mailing.presortType}`);
    confidence = 'high';
  }

  // MEDIUM confidence: Check specs for mailing object
  if (specs?.mailing && typeof specs.mailing === 'object') {
    const mailingSpecs = specs.mailing as Record<string, unknown>;
    if (mailingSpecs.isDirectMail) {
      signals.push('Specs indicate direct mail');
      confidence = confidence === 'low' ? 'medium' : confidence;
    }
  }

  // LOW/MEDIUM confidence: Keyword search in text fields
  const textToSearch = [
    data.notes || '',
    data.title || '',
    JSON.stringify(specs || {}),
    JSON.stringify(data.components || []),
  ].join(' ').toLowerCase();

  const foundKeywords = MAILING_KEYWORDS.filter(kw =>
    textToSearch.includes(kw.toLowerCase())
  );

  if (foundKeywords.length > 0) {
    signals.push(`Keywords: ${foundKeywords.slice(0, 3).join(', ')}${foundKeywords.length > 3 ? '...' : ''}`);
    if (confidence === 'low') {
      confidence = foundKeywords.length >= 2 ? 'medium' : 'low';
    }
  }

  // Check components for envelope (strong mailing indicator)
  if (data.components?.some(c => {
    const name = (c.name || '').toLowerCase();
    const desc = (c.description || '').toLowerCase();
    return name.includes('envelope') ||
           desc.includes('envelope') ||
           name.includes('insert') ||
           name.includes('letter');
  })) {
    signals.push('Components include envelope/insert');
    confidence = confidence === 'low' ? 'medium' : confidence;
  }

  const isMailing = signals.length > 0;

  // ============ DETECT MAIL FORMAT (if mailing) ============

  let suggestedFormat: MailFormat | null = null;
  let envelopeComponents: number | undefined = undefined;

  if (isMailing) {
    // Check for envelope indicators
    const hasEnvelopeSignal = ENVELOPE_KEYWORDS.some(kw =>
      textToSearch.includes(kw.toLowerCase())
    );

    // Check for postcard indicators
    const hasPostcardSignal = POSTCARD_KEYWORDS.some(kw =>
      textToSearch.includes(kw.toLowerCase())
    );

    // Check for self-mailer indicators
    const hasSelfMailerSignal = SELF_MAILER_KEYWORDS.some(kw =>
      textToSearch.includes(kw.toLowerCase())
    );

    // Count envelope components for envelope mailings
    const envelopeComponentCount = data.components?.filter(c => {
      const name = (c.name || '').toLowerCase();
      const desc = (c.description || '').toLowerCase();
      return name.includes('insert') ||
             name.includes('letter') ||
             name.includes('buck slip') ||
             name.includes('lift note') ||
             desc.includes('insert') ||
             desc.includes('enclosure');
    }).length || 0;

    // Priority: Envelope > Postcard > Self-Mailer (based on specificity)
    if (hasEnvelopeSignal || envelopeComponentCount > 0) {
      suggestedFormat = MailFormat.ENVELOPE;
      // Estimate envelope components (1 = letter only, 2+ = with inserts)
      envelopeComponents = Math.max(1, envelopeComponentCount + 1); // +1 for outer envelope
      signals.push(`Suggested format: Envelope (${envelopeComponents} components)`);
    } else if (hasPostcardSignal) {
      suggestedFormat = MailFormat.POSTCARD;
      signals.push('Suggested format: Postcard');
    } else if (hasSelfMailerSignal) {
      suggestedFormat = MailFormat.SELF_MAILER;
      signals.push('Suggested format: Self-Mailer');
    } else {
      // Default to self-mailer if mailing but unclear format
      suggestedFormat = MailFormat.SELF_MAILER;
      signals.push('Suggested format: Self-Mailer (default)');
    }
  }

  return {
    isMailing,
    suggestedFormat,
    confidence: isMailing ? confidence : 'low',
    signals,
    ...(envelopeComponents !== undefined && { envelopeComponents }),
  };
}

/**
 * Quick check if job data indicates mailing (for use in existing flows).
 * Wrapper around detectMailingType for backward compatibility.
 */
export function isMailingJobFromSpecs(data: MailingDetectionInput): boolean {
  return detectMailingType(data).isMailing;
}
