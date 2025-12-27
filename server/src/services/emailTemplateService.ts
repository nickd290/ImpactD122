/**
 * Email Template Service
 *
 * Provides reusable components and formatters for email templates.
 * Consolidates duplicate styling/formatting across 11+ email templates.
 *
 * Components:
 * - Formatters: currency, dates, numbers
 * - Layout: wrapper, header, footer, divider
 * - UI: alert boxes (info, success, warning), specs table, CTA buttons
 *
 * Usage:
 * const email = new EmailTemplateBuilder('Impact Direct Printing')
 *   .header('Invoice for Job #1234')
 *   .text('Dear Customer,')
 *   .text('Please find attached your invoice.')
 *   .specsTable({ quantity: 10000, size: '11x6', paper: '80# Gloss' })
 *   .button('View Invoice', 'https://...')
 *   .build();
 */

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format currency for display
 * @example formatCurrency(1234.5) => "$1,234.50"
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  const num = Number(amount) || 0;
  return `$${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format number with thousands separator
 * @example formatNumber(10000) => "10,000"
 */
export function formatNumber(value: number | string | null | undefined): string {
  const num = Number(value) || 0;
  return num.toLocaleString('en-US');
}

/**
 * Format date for display (short format)
 * @example formatDateShort('2024-12-15') => "Dec 15, 2024"
 */
export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return 'TBD';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format date for display (long format)
 * @example formatDateLong('2024-12-15') => "Sunday, December 15, 2024"
 */
export function formatDateLong(date: Date | string | null | undefined): string {
  if (!date) return 'TBD';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================================================
// STYLE CONSTANTS
// ============================================================================

export const COLORS = {
  // Primary
  primary: '#FF8C42',
  primaryDark: '#E67A35',

  // Text
  text: '#374151',
  textMuted: '#6b7280',
  textLight: '#9ca3af',

  // Backgrounds
  background: '#ffffff',
  backgroundLight: '#f9fafb',
  backgroundMuted: '#f3f4f6',

  // Borders
  border: '#e5e7eb',
  borderLight: '#f0f0f0',

  // Status colors
  success: '#22c55e',
  successBg: '#dcfce7',
  successBorder: '#22c55e',
  successText: '#166534',

  info: '#3b82f6',
  infoBg: '#dbeafe',
  infoBorder: '#3b82f6',
  infoText: '#1e40af',

  warning: '#eab308',
  warningBg: '#fef9c3',
  warningBorder: '#eab308',
  warningText: '#a16207',

  error: '#ef4444',
  errorBg: '#fee2e2',
  errorBorder: '#ef4444',
  errorText: '#b91c1c',

  // Brand
  jdBlue: '#1E40AF',
  jdBlueMuted: '#93C5FD',
} as const;

export const FONTS = {
  primary: 'Arial, sans-serif',
  monospace: "'SF Mono', Monaco, 'Courier New', monospace",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
} as const;

// ============================================================================
// HTML COMPONENTS
// ============================================================================

/**
 * Email wrapper - provides consistent outer styling
 */
export function emailWrapper(content: string): string {
  return `
    <div style="font-family: ${FONTS.primary}; max-width: 600px; margin: 0 auto; background-color: ${COLORS.background};">
      ${content}
    </div>
  `;
}

/**
 * Branded header with title and optional subtitle
 */
export function header(
  title: string,
  options?: {
    subtitle?: string;
    backgroundColor?: string;
    textColor?: string;
  }
): string {
  const bgColor = options?.backgroundColor || COLORS.primary;
  const textColor = options?.textColor || '#ffffff';

  return `
    <div style="background-color: ${bgColor}; padding: 20px; text-align: center;">
      <h1 style="color: ${textColor}; margin: 0; font-size: 24px;">${title}</h1>
      ${options?.subtitle ? `<p style="color: ${textColor}; opacity: 0.9; margin: 5px 0 0 0; font-size: 14px;">${options.subtitle}</p>` : ''}
    </div>
  `;
}

/**
 * JD Graphic branded header
 */
export function jdHeader(title: string, subtitle?: string): string {
  return header(title, {
    subtitle,
    backgroundColor: COLORS.jdBlue,
    textColor: '#ffffff',
  });
}

/**
 * Impact Direct branded header
 */
export function impactHeader(title: string, subtitle?: string): string {
  return `
    <div style="background-color: #1a1a1a; padding: 24px 32px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">IMPACT DIRECT PRINTING</h1>
      ${subtitle ? `<p style="color: ${COLORS.textLight}; margin: 4px 0 0 0; font-size: 13px;">${subtitle}</p>` : ''}
    </div>
  `;
}

/**
 * Standard email footer with company info
 */
export function footer(companyName: string, email: string): string {
  return `
    <hr style="border: none; border-top: 1px solid ${COLORS.border}; margin: 20px 0;" />
    <p style="color: ${COLORS.textMuted}; font-size: 12px; text-align: center;">
      ${companyName}<br />
      ${email}
    </p>
  `;
}

/**
 * Horizontal divider
 */
export function divider(): string {
  return `<hr style="border: none; border-top: 1px solid ${COLORS.border}; margin: 20px 0;" />`;
}

/**
 * Section header with underline
 */
export function sectionHeader(title: string): string {
  return `
    <h3 style="color: #1A1A1A; border-bottom: 2px solid ${COLORS.primary}; padding-bottom: 8px; margin: 24px 0 16px 0;">
      ${title}
    </h3>
  `;
}

// ============================================================================
// ALERT BOXES
// ============================================================================

export type AlertType = 'info' | 'success' | 'warning' | 'error';

/**
 * Alert box component for highlighting important info
 */
export function alertBox(
  content: string,
  type: AlertType = 'info',
  options?: { icon?: string }
): string {
  const colors = {
    info: { bg: COLORS.infoBg, border: COLORS.infoBorder, text: COLORS.infoText },
    success: { bg: COLORS.successBg, border: COLORS.successBorder, text: COLORS.successText },
    warning: { bg: COLORS.warningBg, border: COLORS.warningBorder, text: COLORS.warningText },
    error: { bg: COLORS.errorBg, border: COLORS.errorBorder, text: COLORS.errorText },
  };

  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  const c = colors[type];
  const icon = options?.icon ?? icons[type];

  return `
    <div style="background: ${c.bg}; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid ${c.border};">
      ${icon ? `<strong style="color: ${c.text};">${icon}</strong> ` : ''}
      <span style="color: ${c.text};">${content}</span>
    </div>
  `;
}

/**
 * Link box - prominent link display
 */
export function linkBox(label: string, url: string, type: AlertType = 'info'): string {
  const colors = {
    info: { bg: COLORS.infoBg, border: COLORS.infoBorder, text: COLORS.infoText, link: '#2563eb' },
    success: { bg: COLORS.successBg, border: COLORS.successBorder, text: COLORS.successText, link: COLORS.success },
    warning: { bg: COLORS.warningBg, border: COLORS.warningBorder, text: COLORS.warningText, link: '#ca8a04' },
    error: { bg: COLORS.errorBg, border: COLORS.errorBorder, text: COLORS.errorText, link: COLORS.error },
  };

  const c = colors[type];

  return `
    <div style="background-color: ${c.bg}; border: 1px solid ${c.border}; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0 0 5px 0; font-weight: bold; color: ${c.text};">${label}</p>
      <p style="margin: 0;"><a href="${url}" style="color: ${c.link}; word-break: break-all;">${url}</a></p>
    </div>
  `;
}

// ============================================================================
// BUTTONS
// ============================================================================

/**
 * Primary call-to-action button
 */
export function button(
  text: string,
  url: string,
  options?: {
    backgroundColor?: string;
    textColor?: string;
    centered?: boolean;
  }
): string {
  const bgColor = options?.backgroundColor || '#2563eb';
  const textColor = options?.textColor || '#ffffff';
  const centered = options?.centered !== false;

  const buttonHtml = `
    <a href="${url}" style="display: inline-block; background-color: ${bgColor}; color: ${textColor}; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
      ${text}
    </a>
  `;

  return centered ? `<div style="text-align: center; margin: 24px 0;">${buttonHtml}</div>` : buttonHtml;
}

/**
 * Success-styled button (green)
 */
export function successButton(text: string, url: string, centered = true): string {
  return button(text, url, {
    backgroundColor: COLORS.success,
    textColor: '#ffffff',
    centered,
  });
}

/**
 * Portal access button - prominent green box with link
 */
export function portalButton(url: string, title = '📁 Access Job Portal'): string {
  return `
    <div style="background: ${COLORS.successBg}; padding: 16px; border-radius: 8px; margin: 20px 0; border: 2px solid ${COLORS.success}; text-align: center;">
      <strong style="color: ${COLORS.successText}; font-size: 16px;">${title}</strong><br/>
      <p style="color: ${COLORS.successText}; margin: 8px 0 12px 0; font-size: 13px;">Download PO, artwork, and all job files:</p>
      ${button('Open Job Portal →', url, { backgroundColor: COLORS.success, centered: false })}
    </div>
  `;
}

// ============================================================================
// SPECS TABLE
// ============================================================================

export interface SpecsTableRow {
  label: string;
  value: string | number | null | undefined;
}

/**
 * Build specs table from job/PO data
 */
export function specsTable(rows: SpecsTableRow[]): string {
  const validRows = rows.filter(r => r.value !== null && r.value !== undefined && r.value !== '');

  if (validRows.length === 0) return '';

  const rowsHtml = validRows.map(row => `
    <tr>
      <td style="padding: 8px 12px; color: ${COLORS.textMuted}; border-bottom: 1px solid ${COLORS.borderLight};">${row.label}</td>
      <td style="padding: 8px 12px; font-weight: 500; border-bottom: 1px solid ${COLORS.borderLight};">${row.value}</td>
    </tr>
  `).join('');

  return `
    <div style="background: ${COLORS.backgroundMuted}; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <strong style="color: ${COLORS.text}; font-size: 14px;">JOB SPECIFICATIONS</strong>
      <table style="width: 100%; margin-top: 8px; border-collapse: collapse;">
        ${rowsHtml}
      </table>
    </div>
  `;
}

/**
 * Build specs table from job object
 */
export function specsTableFromJob(job: {
  quantity?: number;
  sizeName?: string;
  specs?: {
    productType?: string;
    finishedSize?: string;
    paperType?: string;
    paperStock?: string;
    colors?: string;
    coating?: string;
    finishing?: string;
  };
  dueDate?: string | Date;
  mailDate?: string | Date;
}): string {
  const specs = job.specs || {};

  const rows: SpecsTableRow[] = [
    { label: 'Quantity', value: job.quantity ? formatNumber(job.quantity) : null },
    { label: 'Size', value: job.sizeName || specs.finishedSize },
    { label: 'Product Type', value: specs.productType },
    { label: 'Paper', value: specs.paperType || specs.paperStock },
    { label: 'Colors', value: specs.colors },
    { label: 'Coating', value: specs.coating },
    { label: 'Finishing', value: specs.finishing },
    { label: 'Due Date', value: job.dueDate ? formatDateShort(job.dueDate) : null },
    { label: 'Mail Date', value: job.mailDate ? formatDateShort(job.mailDate) : null },
  ];

  return specsTable(rows);
}

// ============================================================================
// DATA TABLE
// ============================================================================

export interface DataTableRow {
  label: string;
  value: string | number | null | undefined;
  highlight?: boolean;
}

/**
 * Generic data table with label/value pairs
 */
export function dataTable(rows: DataTableRow[]): string {
  const validRows = rows.filter(r => r.value !== null && r.value !== undefined && r.value !== '');

  if (validRows.length === 0) return '';

  const rowsHtml = validRows.map(row => `
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd; background: ${COLORS.backgroundLight}; font-weight: bold;">${row.label}</td>
      <td style="padding: 10px; border: 1px solid #ddd;${row.highlight ? ' font-weight: bold; color: #059669;' : ''}">${row.value}</td>
    </tr>
  `).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      ${rowsHtml}
    </table>
  `;
}

// ============================================================================
// EMAIL TEMPLATE BUILDER
// ============================================================================

/**
 * Fluent builder for constructing emails
 *
 * @example
 * const html = new EmailTemplateBuilder()
 *   .header('Invoice', { subtitle: 'Job #1234' })
 *   .paragraph('Dear Customer,')
 *   .paragraph('Please find attached your invoice.')
 *   .specsFromJob(job)
 *   .button('View Invoice', 'https://...')
 *   .footer('Impact Direct Printing', 'brandon@impactdirectprinting.com')
 *   .build();
 */
export class EmailTemplateBuilder {
  private parts: string[] = [];

  constructor(private options?: { fontFamily?: string }) {}

  /**
   * Add branded header
   */
  header(title: string, opts?: { subtitle?: string; backgroundColor?: string }): this {
    this.parts.push(header(title, opts));
    return this;
  }

  /**
   * Add Impact Direct branded header
   */
  impactHeader(subtitle?: string): this {
    this.parts.push(impactHeader('IMPACT DIRECT PRINTING', subtitle));
    return this;
  }

  /**
   * Add JD Graphic branded header
   */
  jdHeader(title: string, subtitle?: string): this {
    this.parts.push(jdHeader(title, subtitle));
    return this;
  }

  /**
   * Add body content wrapper with padding
   */
  body(): this {
    this.parts.push('<div style="padding: 20px;">');
    return this;
  }

  /**
   * Close body wrapper
   */
  endBody(): this {
    this.parts.push('</div>');
    return this;
  }

  /**
   * Add paragraph
   */
  paragraph(text: string, options?: { muted?: boolean }): this {
    const color = options?.muted ? COLORS.textMuted : COLORS.text;
    this.parts.push(`<p style="color: ${color}; font-size: 15px; line-height: 1.6;">${text}</p>`);
    return this;
  }

  /**
   * Add bold paragraph
   */
  bold(text: string): this {
    this.parts.push(`<p style="color: ${COLORS.text}; font-size: 15px;"><strong>${text}</strong></p>`);
    return this;
  }

  /**
   * Add greeting
   */
  greeting(name: string): this {
    return this.paragraph(`Dear ${name},`);
  }

  /**
   * Add section header
   */
  section(title: string): this {
    this.parts.push(sectionHeader(title));
    return this;
  }

  /**
   * Add alert box
   */
  alert(content: string, type: AlertType = 'info'): this {
    this.parts.push(alertBox(content, type));
    return this;
  }

  /**
   * Add link box
   */
  link(label: string, url: string, type: AlertType = 'info'): this {
    this.parts.push(linkBox(label, url, type));
    return this;
  }

  /**
   * Add specs table from rows
   */
  specs(rows: SpecsTableRow[]): this {
    this.parts.push(specsTable(rows));
    return this;
  }

  /**
   * Add specs table from job
   */
  specsFromJob(job: Parameters<typeof specsTableFromJob>[0]): this {
    this.parts.push(specsTableFromJob(job));
    return this;
  }

  /**
   * Add data table
   */
  table(rows: DataTableRow[]): this {
    this.parts.push(dataTable(rows));
    return this;
  }

  /**
   * Add CTA button
   */
  button(text: string, url: string, opts?: { color?: string }): this {
    this.parts.push(button(text, url, { backgroundColor: opts?.color }));
    return this;
  }

  /**
   * Add portal button
   */
  portal(url: string, title?: string): this {
    this.parts.push(portalButton(url, title));
    return this;
  }

  /**
   * Add divider
   */
  divider(): this {
    this.parts.push(divider());
    return this;
  }

  /**
   * Add standard footer
   */
  footer(companyName: string, email: string): this {
    this.parts.push(footer(companyName, email));
    return this;
  }

  /**
   * Add raw HTML
   */
  raw(html: string): this {
    this.parts.push(html);
    return this;
  }

  /**
   * Build final HTML
   */
  build(): string {
    const fontFamily = this.options?.fontFamily || FONTS.primary;
    return `
      <div style="font-family: ${fontFamily}; max-width: 600px; margin: 0 auto; background-color: ${COLORS.background};">
        ${this.parts.join('\n')}
      </div>
    `;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Formatters
  formatCurrency,
  formatNumber,
  formatDateShort,
  formatDateLong,

  // Components
  emailWrapper,
  header,
  jdHeader,
  impactHeader,
  footer,
  divider,
  sectionHeader,
  alertBox,
  linkBox,
  button,
  successButton,
  portalButton,
  specsTable,
  specsTableFromJob,
  dataTable,

  // Builder
  EmailTemplateBuilder,

  // Constants
  COLORS,
  FONTS,
};
