import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Impact Direct Brand Colors — print-ops letterhead (not generic AI orange)
const BRAND_NAVY = '#2B3A4A';   // Primary brand navy
const BRAND_RUST = '#C0512A';   // Accent rust (logo)
const BRAND_ORANGE = '#C0512A'; // alias — keep call sites working
const BRAND_BLACK = '#1A1A1A';
const BRAND_GRAY = '#5C6570';
const TEXT_GRAY = '#4A5560';
const PAPER = '#FAF9F7';        // Warm paper background tone (used sparingly)

// Blueprint Grid Color Hierarchy
const GRID_HEAVY = '#2B3A4A';
const GRID_MEDIUM = '#A8B0B8';
const GRID_LIGHT = '#D4D8DC';

// ===== CLEAN PDF HELPER FUNCTIONS =====

// No-op - crosshairs removed for clean PDF output
const drawCrosshairs = (doc: any) => {
  // Removed for cleaner PDF output
};

// Simple bold text for document titles
const drawOutlinedText = (doc: any, text: string, x: number, y: number, options: any = {}) => {
  const fontSize = options.fontSize || 22;
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_BLACK);
  doc.text(text, x, y, options);
};

// Simple box around a section (no corner marks)
const drawSectionGrid = (doc: any, x: number, y: number, width: number, height: number) => {
  doc.setDrawColor(GRID_MEDIUM);
  doc.setLineWidth(0.5);
  doc.rect(x, y, width, height);
};

// Simple horizontal divider line
const drawHeavyDivider = (doc: any, x1: number, x2: number, y: number) => {
  doc.setDrawColor(GRID_MEDIUM);
  doc.setLineWidth(0.5);
  doc.line(x1, y, x2, y);
};

// Draws a vertical divider line for column separation
const drawVerticalDivider = (doc: any, x: number, y1: number, y2: number) => {
  doc.setDrawColor(GRID_MEDIUM);
  doc.setLineWidth(0.6);
  doc.line(x, y1, x, y2);
};

// Draws a section header with grid box styling
const drawSectionHeader = (doc: any, text: string, x: number, y: number, width: number) => {
  const headerHeight = 8;

  // Draw grid box around header
  doc.setDrawColor(GRID_MEDIUM);
  doc.setLineWidth(0.6);
  doc.rect(x, y, width, headerHeight);

  // Draw header background
  doc.setFillColor(245, 245, 245);
  doc.rect(x, y, width, headerHeight, 'F');

  // Redraw border on top
  doc.setDrawColor(GRID_MEDIUM);
  doc.setLineWidth(0.6);
  doc.rect(x, y, width, headerHeight);

  // Draw header text
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_BLACK);
  doc.text(text, x + 3, y + 5.5);
};

// Logo helper — polished ID monogram + wordmark (Impact brand letterhead)
const drawLogo = (doc: any, x: number, y: number, size: number = 20) => {
  const badge = Math.max(size * 1.15, 14);
  const r = 2.4;

  // Shadow plate (subtle depth)
  doc.setFillColor(230, 228, 224);
  doc.roundedRect(x + 0.6, y + 0.6, badge, badge, r, r, 'F');

  // Navy badge
  doc.setFillColor(BRAND_NAVY);
  doc.roundedRect(x, y, badge, badge, r, r, 'F');

  // Rust bottom accent bar
  doc.setFillColor(BRAND_RUST);
  doc.rect(x, y + badge - badge * 0.16, badge, badge * 0.16, 'F');
  // Cover bottom corners of accent so bar sits flush
  doc.setFillColor(BRAND_RUST);
  doc.roundedRect(x, y + badge - badge * 0.22, badge, badge * 0.22, r, r, 'F');
  doc.setFillColor(BRAND_NAVY);
  doc.rect(x, y + badge - badge * 0.22, badge, badge * 0.08, 'F');

  // Monogram
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(badge * 0.46);
  doc.setTextColor(255, 255, 255);
  doc.text('ID', x + badge / 2, y + badge * 0.55, { align: 'center' });

  // Wordmark
  const textX = x + badge + 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(size * 0.5, 10));
  doc.setTextColor(BRAND_NAVY);
  doc.text('IMPACT DIRECT', textX, y + badge * 0.4);

  // Rust underline under wordmark
  const markW = Math.max(size * 3.1, 38);
  doc.setDrawColor(BRAND_RUST);
  doc.setLineWidth(1.1);
  doc.line(textX, y + badge * 0.52, textX + markW, y + badge * 0.52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(Math.max(size * 0.22, 6));
  doc.setTextColor(BRAND_GRAY);
  doc.text('PRINT  ·  MAIL  ·  PRODUCTION', textX, y + badge * 0.78);
};

// Build full description text from parsed specs (for Vendor PO to match customer PO format)
const buildFullDescriptionFromSpecs = (specs: any, jobData: any): string => {
  const lines: string[] = [];

  // Job title/description header
  if (jobData.title) {
    lines.push(jobData.title);
  }

  // Show quantity and size prominently
  const totalQty = jobData.quantity || specs.totalVersionQuantity || 0;
  const size = jobData.sizeName || specs.finishedSize || '';

  if (totalQty > 0 || size) {
    lines.push('');
    if (totalQty > 0) {
      lines.push(`TOTAL QUANTITY: ${totalQty.toLocaleString()}`);
    }
    if (size) {
      lines.push(`SIZE: ${size}`);
    }
  }

  // Show product type if available
  if (specs.productType) {
    lines.push(`Product Type: ${specs.productType}`);
  }

  // Show paper info
  if (specs.paperType || specs.paperWeight) {
    lines.push(`Paper: ${[specs.paperType, specs.paperWeight].filter(Boolean).join(', ')}`);
  }

  // Show colors
  if (specs.colors) {
    lines.push(`Colors: ${specs.colors}`);
  }

  // Show coating
  if (specs.coating) {
    lines.push(`Coating: ${specs.coating}`);
  }

  // Show finishing
  if (specs.finishing) {
    lines.push(`Finishing: ${specs.finishing}`);
  }

  // Show binding
  if (specs.bindingStyle) {
    lines.push(`Binding: ${specs.bindingStyle}`);
  }

  // Show page count
  if (specs.pageCount) {
    lines.push(`Page Count: ${specs.pageCount}`);
  }

  // If we have versions data, format each version with its language breakdown
  if (specs.versions?.length > 0) {
    lines.push('');
    lines.push(`${specs.versions.length} VERSIONS`);
    lines.push('');

    specs.versions.forEach((version: any) => {
      lines.push(`"${version.versionName}" Version:`);
      if (version.pageCount) lines.push(version.pageCount);
      if (version.specs?.size) lines.push(`${version.specs.size}; ${version.specs.binding || ''}`);
      if (version.specs?.stock) lines.push(`Stock: ${version.specs.stock}`);
      if (version.specs?.ink) lines.push(`Ink: ${version.specs.ink}`);

      // Language breakdown for this version
      if (version.languageBreakdown?.length > 0) {
        const totalQty = version.languageBreakdown.reduce((sum: number, l: any) => sum + (l.quantity || 0), 0);
        lines.push(`${version.languageBreakdown.length} language versions - Total Quantity: ${totalQty.toLocaleString()}:`);
        version.languageBreakdown.forEach((lang: any) => {
          let langLine = `${lang.language} @ ${lang.quantity?.toLocaleString() || 0}`;
          if (lang.handSort) langLine += ' ***HAND SORT BACK TOGETHER**';
          lines.push(langLine);
        });
      }
      lines.push('');
    });
  } else {
    // Fallback: show simple language breakdown if no versions but has language data
    if (specs.languageBreakdown?.length > 0) {
      lines.push('');
      lines.push('Language Breakdown:');
      specs.languageBreakdown.forEach((lang: any) => {
        lines.push(`${lang.language} @ ${lang.quantity?.toLocaleString() || 0}`);
      });
    }
  }

  // Mailing information
  if (specs.mailing?.isDirectMail) {
    lines.push('');
    lines.push(`-${specs.mailing.mailClass?.toUpperCase() || 'STANDARD'} MAILING-`);
    if (specs.mailing.dropLocation) lines.push(`Drop at ${specs.mailing.dropLocation}`);
  }

  // Timeline/dates
  if (specs.timeline?.mailDate) {
    lines.push('');
    lines.push(`MAIL DATE: ${specs.timeline.mailDate}`);
  }
  if (specs.timeline?.uspsDeliveryDate) {
    lines.push(`DELIVER TO USPS BY ${specs.timeline.uspsDeliveryDate}`);
  }

  // Vendor responsibilities
  if (specs.responsibilities?.vendorTasks?.length > 0) {
    lines.push('');
    lines.push('JD GRAPHIC TO:');
    specs.responsibilities.vendorTasks.forEach((task: any) => {
      lines.push(`- ${task.task}${task.deadline ? ` by ${task.deadline}` : ''}`);
    });
  }

  // Customer responsibilities
  if (specs.responsibilities?.customerTasks?.length > 0) {
    lines.push('');
    lines.push('CUSTOMER TO SUPPLY:');
    specs.responsibilities.customerTasks.forEach((task: any) => {
      lines.push(`- ${task.task}${task.deadline ? ` by ${task.deadline}` : ''}`);
    });
  }

  // Special handling notes
  if (specs.specialHandling?.handSortRequired) {
    lines.push('');
    lines.push('**SPECIAL HANDLING: Hand Sort Required**');
    if (specs.specialHandling.handSortReason) {
      lines.push(specs.specialHandling.handSortReason);
    }
  }

  // All instruction notes
  if (specs.specialInstructions) {
    lines.push('');
    lines.push('SPECIAL INSTRUCTIONS:');
    lines.push(specs.specialInstructions);
  }
  if (specs.artworkInstructions) {
    lines.push('');
    lines.push('ARTWORK:');
    lines.push(specs.artworkInstructions);
  }
  if (specs.packingInstructions) {
    lines.push('');
    lines.push('PACKING:');
    lines.push(specs.packingInstructions);
  }
  if (specs.additionalNotes) {
    lines.push('');
    lines.push(specs.additionalNotes);
  }

  return lines.join('\n');
};

export const generateQuotePDF = (jobData: any): Buffer => {
  const doc = new jsPDF();

  // ===== CROSSHAIR REGISTRATION MARKS =====
  drawCrosshairs(doc);

  let currentY = 15;

  // ===== LOGO (Top Left) =====
  drawLogo(doc, 20, currentY, 16);

  // ===== HEADER SECTION (Right Side) =====
  doc.setFontSize(24);
  doc.setTextColor(BRAND_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.text('IMPACT DIRECT', 105, currentY + 8, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(TEXT_GRAY);
  doc.setFont('helvetica', 'normal');
  doc.text('PRINT-NATIVE AGENCY', 105, currentY + 14, { align: 'center' });

  doc.setFontSize(9);
  doc.text('Brandon@impactdirectprinting.com | 844-467-2280', 105, currentY + 20, { align: 'center' });

  currentY += 28;

  // ===== OUTLINED DOCUMENT TITLE =====
  drawOutlinedText(doc, 'QUOTATION', 105, currentY, { align: 'center', fontSize: 22 });

  // Heavy divider below title
  currentY += 4;
  drawHeavyDivider(doc, 20, 190, currentY);

  // Orange accent line
  doc.setLineWidth(0.8);
  doc.setDrawColor(BRAND_ORANGE);
  doc.line(20, currentY + 1, 190, currentY + 1);

  currentY += 10;

  // ===== TWO-COLUMN LAYOUT WITH GRID BOXES =====
  const infoStartY = currentY;

  // Left Column - Quote Info
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTE NUMBER:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.jobNo || 'N/A', 55, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTE DATE:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 55, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('VALID UNTIL:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  doc.text(validUntil.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 55, currentY);

  // Right Column - Customer Info with Grid Box
  const customerY = infoStartY;
  const customerBoxHeight = 22;

  // Draw grid box around "PREPARED FOR" section
  drawSectionGrid(doc, 118, customerY - 4, 72, customerBoxHeight);

  doc.setFont('helvetica', 'bold');
  doc.text('PREPARED FOR:', 120, customerY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.customer?.name || 'N/A', 120, customerY + 5);
  doc.text(jobData.customer?.contactPerson || '', 120, customerY + 10);
  doc.text(jobData.customer?.email || '', 120, customerY + 15);

  // Vertical divider between columns
  drawVerticalDivider(doc, 110, infoStartY - 4, infoStartY + customerBoxHeight - 4);

  currentY += 10;

  // ===== PROJECT TITLE =====
  doc.setFillColor(240, 240, 240);
  doc.rect(20, currentY, 170, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PROJECT:', 22, currentY + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.title || 'Custom Print Job', 45, currentY + 6.5);

  currentY += 15;

  // ===== SPECIFICATIONS SECTION WITH GRID HEADER =====
  const hasQuoteSpecs = jobData.specs || jobData.lineItems?.length > 0;

  if (hasQuoteSpecs) {
    drawSectionHeader(doc, 'PRINT SPECIFICATIONS', 20, currentY, 170);
    currentY += 10;

    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const specs = jobData.specs || {};
    const specsData: string[][] = [];

    if (specs.productType) specsData.push(['Product Type:', specs.productType]);

    // Quantity - sum all line items
    const totalQuantity = jobData.lineItems?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;
    if (totalQuantity > 0) {
      specsData.push(['Quantity:', totalQuantity.toLocaleString()]);
    }

    // Page Count for books - show prominently
    if (specs.productType === 'BOOK' && specs.pageCount) {
      specsData.push(['Page Count:', specs.pageCount.toString() + ' pages']);
    }

    if (specs.flatSize) specsData.push(['Flat Size:', specs.flatSize]);
    if (specs.finishedSize) specsData.push(['Finished Size:', specs.finishedSize]);
    if (specs.paperType) specsData.push(['Paper Stock:', specs.paperType]);
    if (specs.colors) specsData.push(['Colors:', specs.colors]);
    if (specs.coating) specsData.push(['Coating:', specs.coating]);
    if (specs.finishing) specsData.push(['Finishing:', specs.finishing]);

    if (specs.productType === 'BOOK') {
      if (specs.bindingStyle) specsData.push(['Binding:', specs.bindingStyle]);
      if (specs.coverType) specsData.push(['Cover Type:', specs.coverType === 'PLUS' ? 'Plus Cover' : 'Self Cover']);
      if (specs.coverPaperType) specsData.push(['Cover Stock:', specs.coverPaperType]);
    }

    if (specsData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        body: specsData,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 40 },
          1: { cellWidth: 130 },
        },
      });
      currentY = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // ===== LINE ITEMS TABLE WITH GRID HEADER =====
  drawSectionHeader(doc, 'PRICING', 20, currentY, 170);
  currentY += 10;

  const tableData = jobData.lineItems?.map((item: any) => {
    const unitPrice = Number(item.unitPrice) || 0;
    const quantity = Number(item.quantity) || 0;
    return [
      item.description,
      quantity.toLocaleString(),
      `$${unitPrice.toFixed(2)}`,
      `$${(quantity * unitPrice).toFixed(2)}`
    ];
  }) || [];

  autoTable(doc, {
    startY: currentY,
    head: [['Description', 'Quantity', 'Unit Price', 'Line Total']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: BRAND_ORANGE, fontSize: 10, fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY || currentY + 20;

  // ===== TOTAL WITH GRID BORDER =====
  const total = jobData.lineItems?.reduce((sum: number, item: any) =>
    sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0) || 0;

  // Draw grid border around total box
  drawSectionGrid(doc, 128, finalY + 6, 64, 20);

  // Larger, more prominent total box
  doc.setFillColor(BRAND_ORANGE);
  doc.rect(130, finalY + 8, 60, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', 135, finalY + 18.5);
  doc.setFontSize(16);
  doc.text(`$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 185, finalY + 18.5, { align: 'right' });

  // ===== FOOTER =====
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  doc.text('This quote is valid for 30 days from the date above.', 105, pageHeight - 20, { align: 'center' });
  doc.text('Questions? Contact Brandon at 844-467-2280 or Brandon@impactdirectprinting.com', 105, pageHeight - 15, { align: 'center' });

  doc.setDrawColor(BRAND_ORANGE);
  doc.setLineWidth(0.3);
  doc.line(20, pageHeight - 10, 190, pageHeight - 10);

  return Buffer.from(doc.output('arraybuffer'));
};

/** JD job # like "26-15399" or "CUST-15399" → trailing digits only. */
export function extractJdJobSuffix(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const parts = s.split(/[-_/]/).filter(Boolean);
  const last = parts[parts.length - 1] || s;
  const m = last.match(/(\d+)\s*$/);
  return m ? m[1] : last;
}

export function resolveBradfordPOFromJob(job: any): string | null {
  const pos = job.PurchaseOrder || job.purchaseOrders || [];
  const n =
    pos.find((po: any) => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic')?.poNumber ||
    pos.find((po: any) => po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford')?.poNumber ||
    job.partnerPONumber ||
    job.bradfordPONumber ||
    null;
  return n ? String(n).trim() : null;
}

/**
 * Key milestones for invoice narrative.
 * Artwork only if uploaded ≥2h after job create.
 */
export function buildInvoiceProjectTimeline(job: any): Array<{ label: string; at: Date; detail?: string }> {
  const events: Array<{ label: string; at: Date; detail?: string }> = [];
  const createdAt = job.createdAt ? new Date(job.createdAt) : null;
  if (createdAt) events.push({ label: 'Job created', at: createdAt });

  const files = job.File || job.files || [];
  const firstArtwork = files
    .filter((f: any) => f.kind === 'ARTWORK' && f.createdAt)
    .map((f: any) => ({ ...f, createdAt: new Date(f.createdAt) }))
    .sort((a: any, b: any) => a.createdAt - b.createdAt)[0];

  if (firstArtwork?.createdAt && createdAt) {
    const hoursLater = (firstArtwork.createdAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursLater >= 2) {
      events.push({
        label: 'Artwork uploaded',
        at: firstArtwork.createdAt,
        detail: firstArtwork.fileName || firstArtwork.originalName || firstArtwork.filename || undefined,
      });
    }
  } else if (job.artOverrideAt && createdAt) {
    const artAt = new Date(job.artOverrideAt);
    if ((artAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60) >= 2) {
      events.push({ label: 'Artwork marked ready', at: artAt });
    }
  }

  if (job.poEmailedAt) events.push({ label: 'PO sent to vendor', at: new Date(job.poEmailedAt) });
  else if (job.poGeneratedAt) events.push({ label: 'PO generated', at: new Date(job.poGeneratedAt) });
  if (job.proofReceivedAt) events.push({ label: 'Proof received', at: new Date(job.proofReceivedAt) });
  if (job.proofSentToCustomerAt) events.push({ label: 'Proof sent to customer', at: new Date(job.proofSentToCustomerAt) });
  if (job.approvedAt) {
    events.push({ label: 'Proof approved', at: new Date(job.approvedAt), detail: job.approvedBy || undefined });
  }
  if (job.completedAt) {
    events.push({ label: 'Job completed', at: new Date(job.completedAt) });
  } else if (job.workflowStatus === 'COMPLETED' || job.status === 'PAID' || job.status === 'COMPLETED') {
    const doneAt = job.workflowUpdatedAt || job.updatedAt;
    if (doneAt) events.push({ label: 'Job completed', at: new Date(doneAt) });
  }
  if (job.customerPaymentDate) {
    events.push({ label: 'Customer payment received', at: new Date(job.customerPaymentDate) });
  }
  if (job.invoiceEmailedAt) {
    events.push({ label: 'Invoice emailed', at: new Date(job.invoiceEmailedAt) });
  }

  const byLabel = new Map<string, { label: string; at: Date; detail?: string }>();
  for (const e of events.sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (!byLabel.has(e.label)) byLabel.set(e.label, e);
  }
  return Array.from(byLabel.values());
}

/** Normalize any job record (prisma include shape) for generateInvoicePDF. */
export function prepareInvoiceJobData(job: any): any {
  const revenue = job.sellPrice
    ? Number(job.sellPrice)
    : job.impactCustomerTotal
      ? Number(job.impactCustomerTotal)
      : job.customerTotal
        ? Number(job.customerTotal)
        : 0;
  const quantity = job.quantity || 0;
  const unitPrice = quantity > 0 ? revenue / quantity : 0;
  const storedLineItems = job.specs?.lineItems || job.lineItems;
  const bradfordPO = resolveBradfordPOFromJob(job);
  const jdJobRaw = job.customerJobNumber || job.externalJobId || job.mailingVendorJobNo || job.jdJobNumberRaw || null;
  const jdJobSuffix = extractJdJobSuffix(jdJobRaw);

  return {
    id: job.id,
    number: job.jobNo || job.number,
    jobNo: job.jobNo || job.number,
    title: job.title || '',
    status: job.status,
    workflowStatus: job.workflowStatus,
    paperSource: job.paperSource,
    sizeName: job.sizeName || '',
    notes: [job.notes, job.vendorSpecialInstructions].filter(Boolean).join('\n\n') || '',
    quantity,
    sellPrice: revenue,
    customerPONumber: job.customerPONumber || '',
    invoiceNumber: job.invoiceNumber || job.jobNo || job.number,
    dueDate: job.deliveryDate || job.dueDate,
    mailDate: job.mailDate,
    inHomesDate: job.inHomesDate,
    mailFormat: job.mailFormat || null,
    bradfordPaperLbs: job.bradfordPaperLbs != null ? Number(job.bradfordPaperLbs) : null,
    bradfordPaperType: job.bradfordPaperType || null,
    jobType: job.jobType || null,
    jobTypeCode: job.jobTypeCode || null,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    partnerPONumber: bradfordPO,
    bradfordPONumber: bradfordPO,
    ccid: bradfordPO,
    jdJobNumberRaw: jdJobRaw,
    jdJobNumber: jdJobSuffix,
    customerJobNumber: job.customerJobNumber || null,
    timeline: job.timeline || buildInvoiceProjectTimeline(job),
    purchaseOrders: job.purchaseOrders || job.PurchaseOrder || [],
    customer: job.customer || (job.Company
      ? {
          name: job.Company.name,
          email: job.Company.email || '',
          phone: job.Company.phone || '',
          address: job.Company.address || '',
          contactPerson: '',
        }
      : { name: 'N/A', email: '', phone: '', address: '', contactPerson: '' }),
    vendor: job.vendor || (job.Vendor
      ? {
          name: job.Vendor.name,
          email: job.Vendor.email || '',
          phone: job.Vendor.phone || '',
          address: [job.Vendor.streetAddress, job.Vendor.city, job.Vendor.state, job.Vendor.zip]
            .filter(Boolean)
            .join(', '),
          contactPerson: '',
        }
      : { name: 'External Vendor', email: '', phone: '', address: '', contactPerson: '' }),
    specs: job.specs || {},
    lineItems:
      storedLineItems ||
      (quantity > 0
        ? [
            {
              description: job.title || 'Print Job',
              quantity,
              unitCost: 0,
              unitPrice,
            },
          ]
        : []),
    financials: {
      impactCustomerTotal: revenue,
      jdServicesTotal: job.jdTotal ? Number(job.jdTotal) : 0,
      bradfordPaperCost: job.bradfordTotal ? Number(job.bradfordTotal) : 0,
      paperMarkupAmount: job.impactMargin ? Number(job.impactMargin) : 0,
    },
  };
}

/** Pull every useful print-spec field from job + specs JSON. */
function collectInvoiceSpecPairs(jobData: any, ccid: string | null, jdJob: string | null): string[][] {
  const specs = jobData.specs || {};
  const pairs: string[][] = [];
  const add = (label: string, val: any) => {
    if (val == null || val === '') return;
    if (typeof val === 'boolean') {
      pairs.push([label, val ? 'Yes' : 'No']);
      return;
    }
    if (Array.isArray(val)) {
      if (!val.length) return;
      const s = val
        .map((v) => (typeof v === 'object' ? (v.name || v.description || JSON.stringify(v)) : String(v)))
        .join(', ');
      if (s && s !== '[]') pairs.push([label, s.slice(0, 80)]);
      return;
    }
    const s = String(val).trim();
    if (!s || s === 'undefined' || s === 'null' || s === '{}' || s === '[]') return;
    pairs.push([label, s.slice(0, 90)]);
  };

  const totalQuantity =
    jobData.lineItems?.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0) ||
    Number(jobData.quantity) ||
    0;

  add('Product', specs.productType || jobData.jobType || jobData.jobTypeCode);
  if (totalQuantity > 0) add('Quantity', totalQuantity.toLocaleString());
  add('Flat size', specs.flatSize || specs.flat);
  add('Finished size', specs.finishedSize || jobData.sizeName || specs.sizeName);
  if (jobData.sizeName && jobData.sizeName !== specs.finishedSize && jobData.sizeName !== specs.sizeName) {
    add('Size (press)', jobData.sizeName);
  }
  add('Paper / stock', specs.paperType || specs.paperStock || specs.stock || jobData.bradfordPaperType);
  add('Paper weight', specs.paperWeight || (specs.paperLbs != null && specs.paperLbs !== '' ? `${specs.paperLbs}#` : null));
  if (jobData.bradfordPaperLbs != null && Number(jobData.bradfordPaperLbs) > 0) {
    add('Paper lbs (job)', `${Number(jobData.bradfordPaperLbs).toLocaleString()} lbs`);
  }
  add(
    'Paper source',
    jobData.paperSource === 'VENDOR'
      ? 'JD'
      : jobData.paperSource === 'BRADFORD'
        ? 'Bradford'
        : jobData.paperSource === 'CUSTOMER'
          ? 'Customer'
          : jobData.paperSource
  );
  add('Colors', specs.colors);
  add('Front colors', specs.frontColors);
  add('Back colors', specs.backColors);
  add('Print sides', specs.printSides || specs.sides);
  add('Coating', specs.coating);
  add('Finishing', specs.finishing);
  add('Folds', specs.folds);
  add('Perforations', specs.perforations);
  add('Die cut', specs.dieCut);
  add('Bleed', specs.bleed);
  add('Binding', specs.bindingStyle || specs.binding);
  add(
    'Cover type',
    specs.coverType === 'PLUS' ? 'Plus cover' : specs.coverType === 'SELF' ? 'Self cover' : specs.coverType
  );
  add('Cover stock', specs.coverPaperType);
  add('Pages', specs.pageCount);
  add('Proof type', specs.proofType);
  add('Versions', specs.versions);
  add('Components', specs.components);
  add('Mail format', jobData.mailFormat || specs.mailFormat);
  if (ccid) add('CCID', ccid);
  if (jdJob) add('JD job #', jdJob);
  add('Customer PO', jobData.customerPONumber);
  if (jobData.mailDate) {
    add(
      'Mail date',
      new Date(jobData.mailDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    );
  }
  if (jobData.inHomesDate) {
    add(
      'In-homes',
      new Date(jobData.inHomesDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    );
  }
  if (jobData.dueDate || jobData.deliveryDate) {
    add(
      'Due / delivery',
      new Date(jobData.dueDate || jobData.deliveryDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    );
  }

  const seen = new Set<string>();
  return pairs.filter(([label]) => {
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

/** Pack pairs into 4-col rows: Label | Value | Label | Value */
function packSpecGrid(pairs: string[][]): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i];
    const b = pairs[i + 1];
    rows.push([a[0], a[1], b ? b[0] : '', b ? b[1] : '']);
  }
  return rows;
}

export const generateInvoicePDF = (jobData: any): Buffer => {
  // Accept raw prisma job or already-transformed payload
  if (jobData && !jobData.timeline && (jobData.Company || jobData.File || jobData.createdAt)) {
    jobData = prepareInvoiceJobData(jobData);
  }

  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.width;
  const pageH = doc.internal.pageSize.height;
  const left = 14;
  const right = pageW - 14;
  const contentW = right - left;
  // Hard one-page: reserve bottom for total + footer
  const maxContentY = pageH - 40;

  doc.setFillColor(BRAND_NAVY);
  doc.rect(0, 0, pageW, 3.5, 'F');

  let y = 10;
  drawLogo(doc, left, y, 12);

  const invNo = jobData.invoiceNumber || jobData.jobNo || '—';
  const invDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const dueStr = due.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(BRAND_NAVY);
  doc.text('INVOICE', right, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(BRAND_GRAY);
  doc.text(`No. ${invNo}`, right, y + 10.5, { align: 'right' });
  doc.text(`Date  ${invDate}`, right, y + 14.5, { align: 'right' });
  doc.text(`Due    ${dueStr}  ·  Net 30`, right, y + 18.5, { align: 'right' });

  y = 32;
  doc.setDrawColor(BRAND_RUST);
  doc.setLineWidth(1);
  doc.line(left, y, right, y);
  y += 5;

  const jobNo = jobData.jobNo || jobData.number || '—';
  const ccid = jobData.ccid || jobData.bradfordPONumber || jobData.partnerPONumber || null;
  const jdJob =
    jobData.jdJobNumber ||
    (jobData.jdJobNumberRaw
      ? String(jobData.jdJobNumberRaw).split(/[-_/]/).filter(Boolean).pop()
      : null);

  doc.setFillColor(43, 58, 74);
  doc.roundedRect(left, y, contentW, 11, 1, 1, 'F');
  doc.setFillColor(BRAND_RUST);
  doc.rect(left, y, 2, 11, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  const idParts: string[] = [`Job ${jobNo}`];
  if (ccid) idParts.push(`CCID ${ccid}`);
  if (jdJob) idParts.push(`JD #${jdJob}`);
  doc.text(idParts.join('   ·   '), left + 5, y + 7.2);
  y += 14;

  const colGap = 6;
  const colW = (contentW - colGap) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(BRAND_RUST);
  doc.text('BILL TO', left, y);
  doc.text('PROJECT', left + colW + colGap, y);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(BRAND_NAVY);
  doc.text(String(jobData.customer?.name || 'Customer').slice(0, 36), left, y);
  doc.text(String(jobData.title || 'Custom Print Job').slice(0, 40), left + colW + colGap, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(TEXT_GRAY);
  const billLines = [jobData.customer?.email, jobData.customer?.phone].filter(Boolean) as string[];
  billLines.forEach((line, i) => doc.text(String(line).slice(0, 42), left, y + i * 3.4));
  const rightMeta = [
    jobData.customerPONumber ? `Cust PO  ${jobData.customerPONumber}` : null,
    jobData.vendor?.name ? `Vendor  ${String(jobData.vendor.name).slice(0, 28)}` : null,
  ].filter(Boolean) as string[];
  rightMeta.forEach((line, i) => doc.text(line, left + colW + colGap, y + i * 3.4));
  y += Math.max(billLines.length, rightMeta.length, 1) * 3.4 + 4;

  // Dense full specs (paper, flat, finished, colors, etc.)
  const specPairs = collectInvoiceSpecPairs(jobData, ccid, jdJob || null);
  if (specPairs.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(BRAND_RUST);
    doc.text('JOB SPECIFICATIONS', left, y);
    y += 2;

    const maxPairs = 20;
    const gridRows = packSpecGrid(specPairs.slice(0, maxPairs));

    autoTable(doc, {
      startY: y,
      body: gridRows,
      theme: 'plain',
      styles: {
        fontSize: 7,
        cellPadding: { top: 1.05, bottom: 1.05, left: 1.5, right: 2 },
        textColor: BRAND_NAVY,
        overflow: 'ellipsize',
      },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 26, textColor: BRAND_GRAY },
        1: { cellWidth: contentW / 2 - 26 },
        2: { fontStyle: 'bold', cellWidth: 26, textColor: BRAND_GRAY },
        3: { cellWidth: contentW / 2 - 26 },
      },
      margin: { left, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
  }

  // Timeline — compact, max 6
  const timeline: Array<{ label: string; at: Date | string; detail?: string }> = Array.isArray(
    jobData.timeline
  )
    ? jobData.timeline.slice(0, 6)
    : [];

  if (timeline.length > 0 && y < maxContentY - 50) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(BRAND_RUST);
    doc.text('PROJECT TIMELINE', left, y);
    y += 2;

    const fmt = (d: Date | string) =>
      new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

    const timelineRows = timeline.map((e) => [
      fmt(e.at),
      e.label + (e.detail ? `  ·  ${String(e.detail).slice(0, 36)}` : ''),
    ]);

    autoTable(doc, {
      startY: y,
      body: timelineRows,
      theme: 'plain',
      styles: {
        fontSize: 7,
        cellPadding: { top: 0.85, bottom: 0.85, left: 1.5, right: 1.5 },
        textColor: BRAND_BLACK,
      },
      columnStyles: {
        0: { cellWidth: 24, fontStyle: 'bold', textColor: BRAND_GRAY },
        1: { cellWidth: contentW - 24, textColor: BRAND_NAVY },
      },
      margin: { left, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
  }

  const total =
    jobData.lineItems?.reduce(
      (sum: number, item: any) =>
        sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
      0
    ) ||
    Number(jobData.sellPrice) ||
    0;

  let tableData =
    jobData.lineItems?.map((item: any) => {
      const unitPrice = Number(item.unitPrice) || 0;
      const quantity = Number(item.quantity) || 0;
      return [
        String(item.description || '—').slice(0, 55),
        quantity.toLocaleString(),
        `$${unitPrice.toFixed(2)}`,
        `$${(quantity * unitPrice).toFixed(2)}`,
      ];
    }) || [];

  if (tableData.length === 0) {
    const sell = Number(jobData.sellPrice) || 0;
    const qty = Number(jobData.quantity) || 1;
    tableData.push([
      String(jobData.title || 'Print production').slice(0, 55),
      qty.toLocaleString(),
      sell > 0 && qty > 0 ? `$${(sell / qty).toFixed(4)}` : '—',
      sell > 0 ? `$${sell.toFixed(2)}` : '—',
    ]);
  }

  const roomForLines = Math.max(maxContentY - y - 6, 16);
  const maxLineRows = Math.max(1, Math.floor((roomForLines - 8) / 5.2));
  if (tableData.length > maxLineRows) {
    const kept = tableData.slice(0, Math.max(1, maxLineRows - 1));
    const rest = tableData.length - kept.length;
    kept.push([`+ ${rest} more line item(s)`, '', '', '']);
    tableData = kept;
  }

  if (y < maxContentY - 14) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(BRAND_RUST);
    doc.text('LINE ITEMS', left, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [['Description', 'Qty', 'Unit', 'Amount']],
      body: tableData,
      theme: 'plain',
      headStyles: {
        fillColor: BRAND_NAVY,
        textColor: 255,
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: BRAND_BLACK,
        cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 },
      },
      alternateRowStyles: { fillColor: [250, 249, 247] },
      columnStyles: {
        0: { cellWidth: contentW - 70 },
        1: { cellWidth: 20, halign: 'right' },
        2: { cellWidth: 24, halign: 'right' },
        3: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 3;
  }

  // Total pinned near bottom (always page 1)
  const totalBoxW = 68;
  const totalBoxX = right - totalBoxW;
  const totalBoxY = Math.min(Math.max(y + 1, pageH - 36), pageH - 36);

  doc.setFillColor(BRAND_NAVY);
  doc.roundedRect(totalBoxX, totalBoxY, totalBoxW, 15, 1.2, 1.2, 'F');
  doc.setFillColor(BRAND_RUST);
  doc.rect(totalBoxX, totalBoxY, 2, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('TOTAL DUE', totalBoxX + 5, totalBoxY + 5.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(
    `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    right - 3.5,
    totalBoxY + 11.5,
    { align: 'right' }
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(BRAND_NAVY);
  doc.text('Payment terms', left, totalBoxY + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(TEXT_GRAY);
  doc.text('Net 30. Remit to Impact Direct Printing.', left, totalBoxY + 9.5);

  doc.setDrawColor(GRID_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(left, pageH - 11, right, pageH - 11);
  doc.setFontSize(7);
  doc.setTextColor(BRAND_GRAY);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Brandon@impactdirectprinting.com  ·  844-467-2280  ·  impactdirectprinting.com',
    105,
    pageH - 7.5,
    { align: 'center' }
  );
  doc.setFillColor(BRAND_RUST);
  doc.rect(0, pageH - 3, pageW, 3, 'F');

  return Buffer.from(doc.output('arraybuffer'));
};

export const generateVendorPOPDF = (jobData: any): Buffer => {
  const doc = new jsPDF();
  const specs = jobData.specs || {};

  // ===== CROSSHAIR REGISTRATION MARKS =====
  drawCrosshairs(doc);

  let currentY = 15;

  // ===== HEADER: LOGO + TITLE + PROMINENT DUE DATE =====
  drawLogo(doc, 20, currentY, 16);

  doc.setFontSize(22);
  doc.setTextColor(BRAND_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.text('IMPACT DIRECT', 105, currentY + 8, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(BRAND_ORANGE);
  doc.text('PURCHASE ORDER', 105, currentY + 16, { align: 'center' });

  // Contact info - smaller, right aligned
  doc.setFontSize(8);
  doc.setTextColor(TEXT_GRAY);
  doc.setFont('helvetica', 'normal');
  doc.text('Brandon@impactdirectprinting.com | 844-467-2280', 190, currentY + 4, { align: 'right' });

  // PO Number and Due Date in header - prominent
  doc.setFontSize(11);
  doc.setTextColor(BRAND_BLACK);
  doc.setFont('helvetica', 'bold');
  const poNum = jobData.vendorPONumber || jobData.jobNo || 'N/A';
  const dueDate = jobData.dueDate
    ? new Date(jobData.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'ASAP';
  doc.text(`PO# ${poNum}`, 20, currentY + 26);

  // Due date box - prominent orange
  doc.setFillColor(BRAND_ORANGE);
  doc.rect(140, currentY + 20, 50, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`DUE: ${dueDate}`, 165, currentY + 26.5, { align: 'center' });

  currentY += 35;

  // Divider line
  doc.setDrawColor(BRAND_ORANGE);
  doc.setLineWidth(1);
  doc.line(20, currentY, 190, currentY);
  currentY += 8;

  // ===== PROJECT TITLE BAR =====
  doc.setFillColor(240, 240, 240);
  doc.rect(20, currentY, 170, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(BRAND_BLACK);
  doc.text(jobData.title || 'Print Job', 25, currentY + 8);

  // Vendor name on right side
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`TO: ${jobData.vendor?.name || 'Vendor'}`, 185, currentY + 8, { align: 'right' });

  currentY += 18;

  // ===== SECTION 1: WHAT YOU'RE PRINTING =====
  doc.setFillColor(BRAND_BLACK);
  doc.rect(20, currentY, 170, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('WHAT YOU\'RE PRINTING', 25, currentY + 5.5);
  currentY += 12;

  // Build bullet points for key specs
  doc.setTextColor(BRAND_BLACK);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const bulletPoints: string[] = [];

  // Product description
  if (specs.productType) {
    let productDesc = specs.productType;
    if (specs.pageCount) productDesc += `, ${specs.pageCount} pages`;
    if (specs.bindingStyle) productDesc += `, ${specs.bindingStyle}`;
    bulletPoints.push(productDesc);
  }

  // Size
  if (specs.finishedSize || jobData.sizeName) {
    bulletPoints.push(`Size: ${specs.finishedSize || jobData.sizeName}${specs.flatSize ? ` (flat: ${specs.flatSize})` : ''}`);
  }

  // Paper
  if (specs.paperType || specs.paperWeight || specs.paperLbs) {
    let paper = specs.paperType || '';
    if (specs.paperLbs) paper += ` ${specs.paperLbs}#`;
    else if (specs.paperWeight) paper += ` ${specs.paperWeight}`;
    bulletPoints.push(`Paper: ${paper}`);
  }

  // Colors
  if (specs.colors) {
    bulletPoints.push(`Colors: ${specs.colors}`);
  }

  // Coating/Finishing
  const finishingParts: string[] = [];
  if (specs.coating) finishingParts.push(specs.coating);
  if (specs.finishing) finishingParts.push(specs.finishing);
  if (specs.folds) finishingParts.push(`${specs.folds} folds`);
  if (finishingParts.length > 0) {
    bulletPoints.push(`Finishing: ${finishingParts.join(', ')}`);
  }

  // Quantity
  if (jobData.quantity) {
    bulletPoints.push(`Quantity: ${jobData.quantity.toLocaleString()}`);
  }

  // Render bullet points
  bulletPoints.forEach((point) => {
    doc.text(`•  ${point}`, 25, currentY);
    currentY += 5;
  });

  if (bulletPoints.length === 0) {
    doc.setTextColor(100, 100, 100);
    doc.text('(See full specs below)', 25, currentY);
    currentY += 5;
  }

  currentY += 6;

  // ===== SECTION 2: KEY DATES (PROMINENT BOX) =====
  const mailDate = specs.mailing?.mailDate || specs.timeline?.mailDate || jobData.mailDate;
  const inHomesDate = specs.mailing?.inHomesDate || specs.timeline?.inHomesDate || jobData.inHomesDate;
  const hasMailingDates = mailDate || inHomesDate;

  // Green box for dates - can't miss it
  doc.setFillColor(220, 252, 231); // Light green background
  doc.setDrawColor(34, 197, 94); // Green border
  doc.setLineWidth(1.5);
  const datesBoxHeight = hasMailingDates ? 28 : 18;
  doc.rect(20, currentY, 170, datesBoxHeight, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 101, 52); // Dark green
  doc.text('KEY DATES', 25, currentY + 6);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(BRAND_BLACK);

  // Due Date row
  doc.setFont('helvetica', 'bold');
  doc.text('Due Date:', 25, currentY + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(dueDate, 55, currentY + 13);

  if (hasMailingDates) {
    // Mail Date
    if (mailDate) {
      doc.setFont('helvetica', 'bold');
      doc.text('Mail Date:', 95, currentY + 13);
      doc.setFont('helvetica', 'normal');
      const formattedMailDate = new Date(mailDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      doc.text(formattedMailDate, 125, currentY + 13);
    }

    // In-Homes Date
    if (inHomesDate) {
      doc.setFont('helvetica', 'bold');
      doc.text('In-Homes:', 25, currentY + 20);
      doc.setFont('helvetica', 'normal');
      const formattedInHomes = new Date(inHomesDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      doc.text(formattedInHomes, 55, currentY + 20);
    }
  }

  currentY += datesBoxHeight + 6;

  // ===== SECTION 3: ARTWORK FILES =====
  const artworkUrl = jobData.poArtworkFilesLink || jobData.specs?.artworkUrl;
  const artworkToFollow = jobData.specs?.artworkToFollow || jobData.artworkToFollow;

  if (artworkUrl) {
    doc.setFillColor(219, 234, 254); // Light blue background
    doc.setDrawColor(59, 130, 246); // Blue border
    doc.setLineWidth(1);
    doc.rect(20, currentY, 170, 16, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('ARTWORK FILES', 25, currentY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(37, 99, 235);
    const displayUrl = artworkUrl.length > 75 ? artworkUrl.substring(0, 72) + '...' : artworkUrl;
    doc.text(displayUrl, 25, currentY + 12);

    currentY += 20;
  } else if (artworkToFollow) {
    doc.setFillColor(254, 243, 199); // Light amber
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(1);
    doc.rect(20, currentY, 170, 12, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text('ARTWORK TO FOLLOW - We will send files separately', 25, currentY + 8);

    currentY += 16;
  }

  // ===== SECTION 4: SHIP TO =====
  const shipTo = specs.shipToName || specs.shipToAddress;
  if (shipTo) {
    doc.setFillColor(245, 245, 245);
    doc.rect(20, currentY, 170, 22, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND_BLACK);
    doc.text('SHIP TO', 25, currentY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (specs.shipToName) doc.text(specs.shipToName, 25, currentY + 12);
    if (specs.shipToAddress) {
      const addrLines = doc.splitTextToSize(specs.shipToAddress, 100);
      doc.text(addrLines.slice(0, 2), 25, currentY + (specs.shipToName ? 17 : 12));
    }
    if (specs.shipVia) {
      doc.setFont('helvetica', 'bold');
      doc.text('Ship Via:', 130, currentY + 12);
      doc.setFont('helvetica', 'normal');
      doc.text(specs.shipVia, 155, currentY + 12);
    }

    currentY += 26;
  }

  // ===== SECTION 5: YOUR ROLE (NEW - CRITICAL!) =====
  doc.setFillColor(BRAND_ORANGE);
  doc.rect(20, currentY, 170, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('YOUR ROLE - What We Need From You', 25, currentY + 5.5);
  currentY += 12;

  doc.setTextColor(BRAND_BLACK);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  // Standard vendor checklist
  const vendorSteps = [
    '1. Confirm receipt of this PO via portal or email',
    '2. Review specs and contact us with any questions',
    '3. Upload proof for approval before printing',
    '4. Print upon approval and meet the due date',
    '5. Ship to address above (or contact us for instructions)',
    '6. Update portal status when shipped + provide tracking'
  ];

  vendorSteps.forEach((step) => {
    doc.text(step, 25, currentY);
    currentY += 4.5;
  });

  currentY += 6;

  // ===== SECTION 6: FULL SPECS FROM CUSTOMER PO =====
  const rawJobDescription = jobData.specs?.rawJobDescription || jobData.specs?.rawDescriptionText || jobData.rawJobDescription || jobData.rawDescriptionText;

  if (rawJobDescription && rawJobDescription.trim()) {
    // Check if we need a page break
    const rawDescLines = doc.splitTextToSize(rawJobDescription, 165);
    const rawDescLineHeight = 3.5;
    const rawDescContentHeight = Math.min(rawDescLines.length * rawDescLineHeight + 12, 120);

    if (currentY + rawDescContentHeight + 10 > 260) {
      doc.addPage();
      drawCrosshairs(doc);
      currentY = 20;
    }

    // Section header
    doc.setFillColor(100, 100, 100);
    doc.rect(20, currentY, 170, 8, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('FULL SPECS (From Customer PO)', 25, currentY + 5.5);
    currentY += 12;

    // Content box
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(20, currentY - 2, 170, rawDescContentHeight, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);

    let lineY = currentY;
    const maxLines = Math.floor((rawDescContentHeight - 8) / rawDescLineHeight);
    rawDescLines.slice(0, maxLines).forEach((line: string) => {
      if (lineY < currentY + rawDescContentHeight - 4) {
        doc.text(line, 22, lineY + 2);
        lineY += rawDescLineHeight;
      }
    });

    currentY += rawDescContentHeight + 6;
  }

  // ===== SECTION 7: SPECIAL INSTRUCTIONS (if any) =====
  if (jobData.poSpecialInstructions || jobData.notes) {
    const instructions = jobData.poSpecialInstructions || jobData.notes;
    const instructionLines = doc.splitTextToSize(instructions, 160);
    const boxHeight = Math.min(10 + (instructionLines.length * 4), 30);

    if (currentY + boxHeight + 50 > 260) {
      doc.addPage();
      drawCrosshairs(doc);
      currentY = 20;
    }

    doc.setFillColor(254, 249, 195);
    doc.setDrawColor(234, 179, 8);
    doc.setLineWidth(1);
    doc.rect(20, currentY, 170, boxHeight, 'FD');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(161, 98, 7);
    doc.text('SPECIAL INSTRUCTIONS:', 25, currentY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(instructionLines.slice(0, 4), 25, currentY + 10);

    currentY += boxHeight + 6;
  }

  // ===== SECTION 8: PRICING (AT BOTTOM) =====
  if (currentY > 200) {
    doc.addPage();
    drawCrosshairs(doc);
    currentY = 20;
  }

  drawSectionHeader(doc, 'PRICING', 20, currentY, 170);
  currentY += 10;

  const tableData = jobData.lineItems?.map((item: any) => {
    let unitCost = Number(item.unitCost) || 0;
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const markupPercent = Number(item.markupPercent) || 0;

    if (unitCost === 0 && unitPrice > 0 && markupPercent > 0) {
      unitCost = unitPrice / (1 + markupPercent / 100);
    }

    return [
      item.description,
      quantity.toLocaleString(),
      `$${unitCost.toFixed(4)}`,
      `$${(quantity * unitCost).toFixed(2)}`
    ];
  }) || [];

  autoTable(doc, {
    startY: currentY,
    head: [['Description', 'Qty', 'Unit', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [80, 80, 80],
      fontSize: 9,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 25, halign: 'right' },
    },
    margin: { left: 20, right: 20 },
  });

  const finalY = (doc as any).lastAutoTable.finalY || currentY + 20;

  // Total box
  const total = jobData.buyCost
    ? Number(jobData.buyCost)
    : jobData.lineItems?.reduce((sum: number, item: any) => {
        let unitCost = Number(item.unitCost) || 0;
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        const markupPercent = Number(item.markupPercent) || 0;
        if (unitCost === 0 && unitPrice > 0 && markupPercent > 0) {
          unitCost = unitPrice / (1 + markupPercent / 100);
        }
        return sum + quantity * unitCost;
      }, 0) || 0;

  doc.setFillColor(BRAND_ORANGE);
  doc.rect(130, finalY + 4, 60, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', 135, finalY + 12);
  doc.setFontSize(12);
  doc.text(`$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 185, finalY + 12, { align: 'right' });

  // Payment terms if present
  if (specs.paymentTerms || specs.fob) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    if (specs.paymentTerms) doc.text(`Payment Terms: ${specs.paymentTerms}`, 20, finalY + 12);
  }

  // ===== FOOTER ON ALL PAGES =====
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.height;

    // Page number
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${totalPages}`, 105, pageHeight - 8, { align: 'center' });

    // Contact footer on last page
    if (i === totalPages) {
      doc.setDrawColor(BRAND_ORANGE);
      doc.setLineWidth(0.5);
      doc.line(20, pageHeight - 18, 190, pageHeight - 18);

      doc.setFont('helvetica', 'normal');
      doc.text('Questions? Brandon@impactdirectprinting.com | 844-467-2280', 105, pageHeight - 13, { align: 'center' });
    }
  }

  return Buffer.from(doc.output('arraybuffer'));
};

export const generatePOPDF = (poData: any): Buffer => {
  const doc = new jsPDF();

  // ===== CROSSHAIR REGISTRATION MARKS =====
  drawCrosshairs(doc);

  let currentY = 15;

  // ===== LOGO (Top Left) =====
  drawLogo(doc, 20, currentY, 16);

  // ===== HEADER SECTION (Right Side) =====
  doc.setFontSize(24);
  doc.setTextColor(BRAND_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.text('IMPACT DIRECT', 105, currentY + 8, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(TEXT_GRAY);
  doc.setFont('helvetica', 'normal');
  doc.text('PRINT-NATIVE AGENCY', 105, currentY + 14, { align: 'center' });

  doc.setFontSize(9);
  doc.text('Brandon@impactdirectprinting.com | 844-467-2280', 105, currentY + 20, { align: 'center' });

  currentY += 28;

  // ===== OUTLINED DOCUMENT TITLE =====
  drawOutlinedText(doc, 'PURCHASE ORDER', 105, currentY, { align: 'center', fontSize: 20 });

  // Heavy divider below title
  currentY += 4;
  drawHeavyDivider(doc, 20, 190, currentY);

  // Orange accent line
  doc.setLineWidth(0.8);
  doc.setDrawColor(BRAND_ORANGE);
  doc.line(20, currentY + 1, 190, currentY + 1);

  currentY += 10;

  // ===== TWO-COLUMN LAYOUT WITH GRID BOXES =====
  const infoStartY = currentY;

  // Left Column - PO Info
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('PO NUMBER:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(poData.poNumber, 55, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('PO DATE:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(poData.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 55, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('JOB NUMBER:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(poData.jobNumber, 55, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('CUSTOMER PO:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(poData.customerPONumber || 'N/A', 55, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('DUE DATE:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(poData.dueDate ? new Date(poData.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'ASAP', 55, currentY);

  if (poData.vendorRef) {
    currentY += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('VENDOR REF:', 20, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(poData.vendorRef, 55, currentY);
  }

  // Right Column - Vendor Info with Grid Box
  const vendorY = infoStartY;
  const vendorBoxHeight = 34;

  // Draw grid box around "VENDOR:" section
  drawSectionGrid(doc, 118, vendorY - 4, 72, vendorBoxHeight);

  doc.setFont('helvetica', 'bold');
  doc.text('VENDOR:', 120, vendorY);
  doc.setFont('helvetica', 'normal');
  doc.text(poData.vendor?.name || 'N/A', 120, vendorY + 5);
  doc.text(poData.vendor?.email || '', 120, vendorY + 10);
  doc.text(poData.vendor?.phone || '', 120, vendorY + 15);

  // Truncate address if too long
  const vendorAddress = poData.vendor?.address || '';
  const truncatedAddress = vendorAddress.length > 35 ? vendorAddress.substring(0, 32) + '...' : vendorAddress;
  doc.text(truncatedAddress, 120, vendorY + 20);

  // Vertical divider between columns
  drawVerticalDivider(doc, 110, infoStartY - 4, infoStartY + vendorBoxHeight - 4);

  currentY = infoStartY + vendorBoxHeight + 6;

  // ===== CUSTOMER INFO SECTION =====
  if (poData.customer?.name && poData.customer.name !== 'N/A') {
    doc.setFillColor(248, 248, 248);
    doc.rect(20, currentY, 170, 16, 'F');
    doc.setDrawColor(GRID_LIGHT);
    doc.setLineWidth(0.5);
    doc.rect(20, currentY, 170, 16);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND_BLACK);
    doc.text('FOR CUSTOMER:', 22, currentY + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(poData.customer.name, 55, currentY + 5);

    doc.setFont('helvetica', 'bold');
    doc.text('PROJECT:', 22, currentY + 11);
    doc.setFont('helvetica', 'normal');
    const projectTitle = poData.jobTitle || 'Print Job';
    doc.text(projectTitle.length > 60 ? projectTitle.substring(0, 57) + '...' : projectTitle, 55, currentY + 11);

    currentY += 20;
  }

  // ===== ARTWORK URL OR "ARTWORK TO ARRIVE LATER" =====
  const poArtworkUrl = poData.specs?.artworkUrl;
  if (poArtworkUrl) {
    // Draw blue highlighted box for artwork link
    doc.setFillColor(219, 234, 254); // Light blue background
    doc.setDrawColor(59, 130, 246); // Blue border
    doc.setLineWidth(1);
    doc.rect(20, currentY, 170, 18, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175); // Dark blue text
    doc.text('ARTWORK FILES:', 25, currentY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(37, 99, 235); // Blue link color

    // Truncate URL if too long for display
    const displayUrl = poArtworkUrl.length > 80 ? poArtworkUrl.substring(0, 77) + '...' : poArtworkUrl;
    doc.text(displayUrl, 25, currentY + 12);

    // Add note about accessing artwork
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(7);
    doc.text('Click or copy this link to access artwork files', 25, currentY + 16);

    currentY += 22;
  } else if (poData.specs?.artworkToFollow || poData.artworkToFollow) {
    // Draw amber highlighted box for "artwork to arrive later"
    doc.setFillColor(254, 243, 199); // Light amber background
    doc.setDrawColor(245, 158, 11); // Amber border
    doc.setLineWidth(1);
    doc.rect(20, currentY, 170, 14, 'FD');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9); // Dark amber text
    doc.text('ARTWORK TO ARRIVE LATER', 25, currentY + 9);

    currentY += 18;
  }

  // ===== LINE ITEMS SECTION (PO Description as line items) =====
  drawSectionHeader(doc, 'ORDER ITEMS', 20, currentY, 170);
  currentY += 10;

  // Parse description into line items (descriptions are comma-separated)
  const descriptionItems = (poData.description || 'Purchase Order').split(',').map((item: string) => item.trim()).filter((item: string) => item);
  const quantity = poData.quantity || 0;
  const costPerItem = descriptionItems.length > 0 ? poData.buyCost / descriptionItems.length : poData.buyCost;

  // Build table data with line items
  const tableData: string[][] = descriptionItems.map((item: string, index: number) => {
    // If there's only one item, show the full cost
    // Otherwise show as individual line items
    if (descriptionItems.length === 1) {
      return [item, quantity > 0 ? quantity.toLocaleString() : '1', `$${poData.buyCost.toFixed(2)}`, `$${poData.buyCost.toFixed(2)}`];
    } else {
      // Multiple items - show them as individual line items
      return [item, '1', `$${costPerItem.toFixed(2)}`, `$${costPerItem.toFixed(2)}`];
    }
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Description', 'Qty', 'Unit Cost', 'Line Total']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: BRAND_ORANGE,
      fontSize: 10,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
    },
  });

  let finalY = (doc as any).lastAutoTable.finalY || currentY + 20;

  // ===== PRINT SPECIFICATIONS SECTION =====
  const specs = poData.specs || {};
  const hasSpecs = specs.productType || specs.finishedSize || specs.paperType || specs.colors || specs.coating || specs.finishing;

  if (hasSpecs) {
    finalY += 8;
    drawSectionHeader(doc, 'PRINT SPECIFICATIONS', 20, finalY, 170);
    finalY += 10;

    const specsData: string[][] = [];

    if (specs.productType) specsData.push(['Product Type:', specs.productType]);
    if (poData.quantity) specsData.push(['Total Quantity:', poData.quantity.toLocaleString()]);
    if (specs.finishedSize) specsData.push(['Finished Size:', specs.finishedSize]);
    if (specs.flatSize) specsData.push(['Flat Size:', specs.flatSize]);
    if (specs.paperType) specsData.push(['Paper Stock:', specs.paperType]);
    if (specs.paperWeight) specsData.push(['Paper Weight:', specs.paperWeight]);
    if (specs.colors) specsData.push(['Colors:', specs.colors]);
    if (specs.coating) specsData.push(['Coating:', specs.coating]);
    if (specs.finishing) specsData.push(['Finishing:', specs.finishing]);
    if (specs.folds) specsData.push(['Folds:', specs.folds]);
    if (specs.perforations) specsData.push(['Perforations:', specs.perforations]);
    if (specs.dieCut) specsData.push(['Die Cut:', specs.dieCut]);
    if (specs.bleed) specsData.push(['Bleed:', specs.bleed]);
    if (specs.proofType) specsData.push(['Proof Type:', specs.proofType]);

    // Book-specific specs - show page count for all types if available
    if (specs.pageCount) specsData.push(['Page Count:', specs.pageCount.toString() + (specs.pageCount.toString().includes('pg') ? '' : ' pages')]);
    if (specs.bindingStyle) specsData.push(['Binding:', specs.bindingStyle]);
    if (specs.coverType) specsData.push(['Cover Type:', specs.coverType === 'PLUS' ? 'Plus Cover' : (specs.coverType === 'SELF' ? 'Self Cover' : specs.coverType)]);
    if (specs.coverPaperType) specsData.push(['Cover Stock:', specs.coverPaperType]);

    // Ship-to information
    if (specs.shipToName) specsData.push(['Ship To:', specs.shipToName]);
    if (specs.shipToAddress) specsData.push(['Ship Address:', specs.shipToAddress]);
    if (specs.shipVia) specsData.push(['Ship Via:', specs.shipVia]);

    if (specsData.length > 0) {
      autoTable(doc, {
        startY: finalY,
        body: specsData,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 40 },
          1: { cellWidth: 130 },
        },
      });
      finalY = (doc as any).lastAutoTable.finalY + 5;
    }
  }

  // ===== COST BREAKDOWN (if available) =====
  if (poData.paperCost || poData.mfgCost || poData.printCPM || poData.paperCPM) {
    finalY += 5;
    doc.setFontSize(9);
    doc.setTextColor(TEXT_GRAY);
    doc.setFont('helvetica', 'bold');
    doc.text('Cost Breakdown:', 20, finalY);
    doc.setFont('helvetica', 'normal');
    finalY += 5;

    if (poData.paperCost) {
      doc.text(`Paper Cost: $${poData.paperCost.toFixed(2)}`, 25, finalY);
      finalY += 4;
    }
    if (poData.paperMarkup) {
      doc.text(`Paper Markup (18%): $${poData.paperMarkup.toFixed(2)}`, 25, finalY);
      finalY += 4;
    }
    if (poData.mfgCost) {
      doc.text(`Manufacturing: $${poData.mfgCost.toFixed(2)}`, 25, finalY);
      finalY += 4;
    }
    if (poData.printCPM) {
      doc.text(`Print CPM: $${poData.printCPM.toFixed(2)}/M`, 25, finalY);
      finalY += 4;
    }
    if (poData.paperCPM) {
      doc.text(`Paper CPM: $${poData.paperCPM.toFixed(2)}/M`, 25, finalY);
    }
  }

  // ===== DATES SECTION =====
  if (poData.mailDate || poData.inHomesDate) {
    finalY += 8;
    doc.setFontSize(9);
    doc.setTextColor(BRAND_BLACK);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Dates:', 20, finalY);
    doc.setFont('helvetica', 'normal');
    finalY += 5;

    if (poData.dueDate) {
      doc.text(`Delivery Date: ${new Date(poData.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 25, finalY);
      finalY += 4;
    }
    if (poData.mailDate) {
      doc.text(`Mail Date: ${new Date(poData.mailDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 25, finalY);
      finalY += 4;
    }
    if (poData.inHomesDate) {
      doc.text(`In-Homes Date: ${new Date(poData.inHomesDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 25, finalY);
    }
  }

  // ===== PHASE 15: ENHANCED UNIVERSAL PO PARSING SECTIONS =====

  // VERSIONS SECTION - Show multiple product versions
  const versionsData = poData.specs?.versions || [];
  if (versionsData.length > 0) {
    finalY += 10;
    drawSectionHeader(doc, 'PRODUCT VERSIONS', 20, finalY, 170);
    finalY += 10;

    const versionTableData: string[][] = versionsData.map((v: any) => [
      v.versionName || 'Standard',
      v.pageCount || '-',
      v.quantity?.toLocaleString() || '-',
      v.specs?.finishedSize || '-',
    ]);

    autoTable(doc, {
      startY: finalY,
      head: [['Version', 'Page Count', 'Quantity', 'Size']],
      body: versionTableData,
      theme: 'striped',
      headStyles: { fillColor: [100, 100, 100], fontSize: 9 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 40, halign: 'center' },
        2: { cellWidth: 40, halign: 'right' },
        3: { cellWidth: 40 },
      },
    });
    finalY = (doc as any).lastAutoTable.finalY + 5;
  }

  // LANGUAGE BREAKDOWN SECTION
  const languageData = poData.specs?.languageBreakdown || [];
  if (languageData.length > 0) {
    finalY += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND_BLACK);
    doc.text('Language Breakdown:', 20, finalY);
    doc.setFont('helvetica', 'normal');
    finalY += 5;

    languageData.forEach((lang: any) => {
      doc.text(`${lang.language}: ${lang.quantity?.toLocaleString() || 0}`, 25, finalY);
      finalY += 4;
    });
    finalY += 3;
  }

  // MAILING DETAILS SECTION - For direct mail jobs
  const mailingData = poData.specs?.mailing;
  if (mailingData && mailingData.isDirectMail) {
    finalY += 5;
    doc.setFillColor(240, 253, 244); // Light green background
    doc.setDrawColor(34, 197, 94); // Green border
    doc.setLineWidth(0.5);

    const mailingBoxStartY = finalY;
    const mailingItems: string[] = [];

    if (mailingData.mailClass) mailingItems.push(`Mail Class: ${mailingData.mailClass}`);
    if (mailingData.mailProcess) mailingItems.push(`Process: ${mailingData.mailProcess}`);
    if (mailingData.dropLocation) mailingItems.push(`Drop Location: ${mailingData.dropLocation}`);
    if (mailingData.presortType) mailingItems.push(`Presort: ${mailingData.presortType}`);
    if (mailingData.mailDatRequired) mailingItems.push(`MAIL.DAT: Required${mailingData.mailDatResponsibility ? ` (${mailingData.mailDatResponsibility})` : ''}`);
    if (mailingData.placardTagFiles) mailingItems.push('USPS Placard/Tag Files: Required');
    if (mailingData.uspsRequirements) mailingItems.push(`USPS Requirements: ${mailingData.uspsRequirements}`);

    const mailingBoxHeight = Math.max(25, mailingItems.length * 5 + 10);
    doc.rect(20, finalY, 170, mailingBoxHeight, 'FD');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 101, 52); // Dark green
    doc.text('DIRECT MAIL DETAILS', 25, finalY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    let mailingY = finalY + 12;
    mailingItems.forEach((item) => {
      doc.text(item, 25, mailingY);
      mailingY += 4;
    });

    finalY += mailingBoxHeight + 5;
  }

  // RESPONSIBILITY MATRIX SECTION
  const responsibilitiesData = poData.specs?.responsibilities;
  if (responsibilitiesData && (responsibilitiesData.vendorTasks?.length > 0 || responsibilitiesData.customerTasks?.length > 0)) {
    finalY += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND_BLACK);
    doc.text('Responsibilities:', 20, finalY);
    finalY += 6;

    doc.setFontSize(8);
    if (responsibilitiesData.vendorTasks?.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('VENDOR (JD Graphic):', 20, finalY);
      doc.setFont('helvetica', 'normal');
      finalY += 4;
      responsibilitiesData.vendorTasks.forEach((task: any) => {
        const taskText = task.deadline ? `${task.task} [Due: ${task.deadline}]` : task.task;
        doc.text(`• ${taskText}`, 25, finalY);
        finalY += 4;
      });
      finalY += 2;
    }

    if (responsibilitiesData.customerTasks?.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('CUSTOMER:', 20, finalY);
      doc.setFont('helvetica', 'normal');
      finalY += 4;
      responsibilitiesData.customerTasks.forEach((task: any) => {
        const taskText = task.deadline ? `${task.task} [Due: ${task.deadline}]` : task.task;
        doc.text(`• ${taskText}`, 25, finalY);
        finalY += 4;
      });
    }
    finalY += 3;
  }

  // SPECIAL HANDLING SECTION
  const handlingData = poData.specs?.specialHandling;
  if (handlingData && (handlingData.handSortRequired || handlingData.rushJob || handlingData.customFlags?.length > 0)) {
    finalY += 5;
    doc.setFillColor(254, 243, 199); // Light yellow background
    doc.setDrawColor(245, 158, 11); // Amber border
    doc.setLineWidth(0.5);

    const handlingItems: string[] = [];
    if (handlingData.rushJob) handlingItems.push('*** RUSH JOB ***');
    if (handlingData.handSortRequired) {
      handlingItems.push('HAND-SORT REQUIRED');
      if (handlingData.handSortItems?.length > 0) {
        handlingData.handSortItems.forEach((item: string) => handlingItems.push(`  - ${item}`));
      }
      if (handlingData.handSortReason) handlingItems.push(`  Reason: ${handlingData.handSortReason}`);
    }
    if (handlingData.customFlags?.length > 0) {
      handlingData.customFlags.forEach((flag: string) => handlingItems.push(flag));
    }

    const handlingBoxHeight = Math.max(18, handlingItems.length * 4 + 10);
    doc.rect(20, finalY, 170, handlingBoxHeight, 'FD');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9); // Dark amber
    doc.text('SPECIAL HANDLING', 25, finalY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    let handlingY = finalY + 10;
    handlingItems.forEach((item) => {
      doc.text(item, 25, handlingY);
      handlingY += 4;
    });

    finalY += handlingBoxHeight + 5;
  }

  // PAYMENT TERMS SECTION
  const paymentTerms = poData.specs?.paymentTerms;
  const fob = poData.specs?.fob;
  if (paymentTerms || fob) {
    finalY += 3;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    if (paymentTerms) doc.text(`Payment Terms: ${paymentTerms}`, 20, finalY);
    if (fob) doc.text(`FOB: ${fob}`, paymentTerms ? 100 : 20, finalY);
    finalY += 5;
  }

  // ===== END PHASE 15 SECTIONS =====

  // ===== TOTAL WITH GRID BORDER =====
  const totalBoxY = Math.max(finalY + 15, (doc as any).lastAutoTable?.finalY + 15 || finalY + 15);

  // Draw grid border around total box
  drawSectionGrid(doc, 128, totalBoxY, 64, 20);

  // Larger, more prominent total box
  doc.setFillColor(BRAND_ORANGE);
  doc.rect(130, totalBoxY + 2, 60, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', 135, totalBoxY + 12.5);
  doc.setFontSize(16);
  doc.text(`$${poData.buyCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 185, totalBoxY + 12.5, { align: 'right' });

  // ===== NOTES SECTION - Combine all parsed notes =====
  const instructionsY = totalBoxY + 28;
  const specs2 = poData.specs || {};

  // Collect all notes from various sources
  const allNotes2: string[] = [];

  if (specs2.specialInstructions) {
    allNotes2.push(`SPECIAL INSTRUCTIONS: ${specs2.specialInstructions}`);
  }
  if (specs2.artworkInstructions) {
    allNotes2.push(`ARTWORK: ${specs2.artworkInstructions}`);
  }
  if (specs2.packingInstructions) {
    allNotes2.push(`PACKING: ${specs2.packingInstructions}`);
  }
  if (specs2.labelingInstructions) {
    allNotes2.push(`LABELING: ${specs2.labelingInstructions}`);
  }
  if (specs2.additionalNotes) {
    allNotes2.push(`ADDITIONAL: ${specs2.additionalNotes}`);
  }

  if (allNotes2.length > 0) {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('INSTRUCTIONS & NOTES:', 20, instructionsY);
    let currentY2 = instructionsY + 6;

    // Use readable 8pt font - no shrinking
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const lineHeight2 = 4;

    const combinedNotes2 = allNotes2.join('\n\n');
    const splitNotes2 = doc.splitTextToSize(combinedNotes2, 170);
    const totalLines2 = splitNotes2.length;

    // Calculate how many lines fit on current page
    const pageHeight2 = doc.internal.pageSize.height;
    const footerMargin2 = 30; // Space for footer
    let yPos2 = currentY2;
    let lineIndex2 = 0;

    while (lineIndex2 < totalLines2) {
      // Calculate remaining space on current page
      const availableHeight2 = pageHeight2 - yPos2 - footerMargin2;
      const linesThisPage2 = Math.floor(availableHeight2 / lineHeight2);

      if (linesThisPage2 <= 0) {
        // No room on this page, add new page
        doc.addPage();
        yPos2 = 25;

        // Add header on continuation page
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(BRAND_ORANGE);
        doc.text('INSTRUCTIONS & NOTES (continued)', 20, 15);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        continue;
      }

      // Print lines that fit on this page
      const linesForThisPage2 = splitNotes2.slice(lineIndex2, lineIndex2 + linesThisPage2);
      doc.text(linesForThisPage2, 20, yPos2);

      lineIndex2 += linesThisPage2;

      // If more lines remain, add new page
      if (lineIndex2 < totalLines2) {
        doc.addPage();

        // Add header on continuation page
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(BRAND_ORANGE);
        doc.text('INSTRUCTIONS & NOTES (continued)', 20, 15);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        yPos2 = 25; // Start after header
      }
    }
  }

  // ===== FOOTER - Add to all pages with page numbers =====
  const totalPages2 = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages2; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.height;

    // Page number on all pages
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${totalPages2}`, 105, pageHeight - 8, { align: 'center' });

    // Full footer only on last page
    if (i === totalPages2) {
      doc.setFont('helvetica', 'italic');
      doc.text('Please confirm receipt of this PO and provide production timeline.', 105, pageHeight - 20, { align: 'center' });
      doc.text('Questions? Contact Brandon at 844-467-2280 or Brandon@impactdirectprinting.com', 105, pageHeight - 15, { align: 'center' });

      doc.setDrawColor(BRAND_ORANGE);
      doc.setLineWidth(0.3);
      doc.line(20, pageHeight - 12, 190, pageHeight - 12);
    }
  }

  return Buffer.from(doc.output('arraybuffer'));
};

// ============================================
// JD GRAPHIC → BRADFORD INVOICE
// ============================================

// JD Graphic Brand Colors
const JD_BLUE = '#1E40AF';      // JD Graphic primary blue
const JD_LIGHT_BLUE = '#3B82F6'; // Accent blue

// Draws the JD Graphic logo placeholder
const drawJDLogo = (doc: any, x: number, y: number, size: number = 20) => {
  const boxWidth = size * 3.5;
  const boxHeight = size * 1.2;
  const padding = 4;

  // Draw complete grid box around logo
  doc.setDrawColor(JD_BLUE);
  doc.setLineWidth(0.8);
  doc.rect(x - padding, y - padding, boxWidth, boxHeight);

  // Draw "JD GRAPHIC" text
  doc.setFontSize(size * 0.9);
  doc.setTextColor(JD_BLUE);
  doc.setFont('helvetica', 'bold');
  doc.text('JD GRAPHIC', x, y + size * 0.6);
};

export const generateJDToBradfordInvoicePDF = (jobData: any): Buffer => {
  const doc = new jsPDF();

  // ===== CROSSHAIR REGISTRATION MARKS =====
  drawCrosshairs(doc);

  let currentY = 15;

  // ===== JD GRAPHIC LOGO (Top Left) =====
  drawJDLogo(doc, 20, currentY, 16);

  // ===== HEADER SECTION (Right Side) =====
  doc.setFontSize(24);
  doc.setTextColor(JD_BLUE);
  doc.setFont('helvetica', 'bold');
  doc.text('JD GRAPHIC', 140, currentY + 8, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(TEXT_GRAY);
  doc.setFont('helvetica', 'normal');
  doc.text('Manufacturing Invoice', 140, currentY + 14, { align: 'center' });

  currentY += 28;

  // ===== OUTLINED DOCUMENT TITLE =====
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(JD_BLUE);
  doc.text('INVOICE', 105, currentY, { align: 'center' });

  // Heavy divider below title
  currentY += 4;
  doc.setDrawColor(JD_BLUE);
  doc.setLineWidth(1.2);
  doc.line(20, currentY, 190, currentY);

  // Light accent line
  doc.setLineWidth(0.8);
  doc.setDrawColor(JD_LIGHT_BLUE);
  doc.line(20, currentY + 1, 190, currentY + 1);

  currentY += 10;

  // ===== TWO-COLUMN LAYOUT =====
  const infoStartY = currentY;

  // Left Column - Invoice Info
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE NUMBER:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(`JD-${jobData.jobNo || 'N/A'}`, 60, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE DATE:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 60, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('JOB NUMBER:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.jobNo || 'N/A', 60, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('BRADFORD PO:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  // Get Bradford PO number - prefer PO's poNumber, fall back to job fields
  const bradfordToJDPOForDisplay = (jobData.purchaseOrders || []).find(
    (po: any) => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
  );
  const bradfordPONumber = bradfordToJDPOForDisplay?.poNumber
    || jobData.bradfordPONumber
    || jobData.partnerPONumber
    || 'N/A';
  doc.text(bradfordPONumber, 60, currentY);

  // Right Column - Bradford Info with Grid Box
  const bradfordY = infoStartY;
  const bradfordBoxHeight = 28;

  // Draw grid box around "BILL TO:" section
  doc.setDrawColor(JD_BLUE);
  doc.setLineWidth(0.6);
  doc.rect(118, bradfordY - 4, 72, bradfordBoxHeight);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(JD_BLUE);
  doc.text('BILL TO:', 120, bradfordY);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.text('Bradford Direct', 120, bradfordY + 6);
  doc.text('Steve Gustafson', 120, bradfordY + 12);
  doc.text('steve.gustafson@bgeltd.com', 120, bradfordY + 18);

  currentY += 10;

  // ===== PROJECT TITLE =====
  doc.setFillColor(240, 240, 240);
  doc.rect(20, currentY, 170, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PROJECT:', 22, currentY + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.title || 'Print Job', 45, currentY + 6.5);

  currentY += 18;

  // ===== LINE ITEMS TABLE =====
  doc.setDrawColor(JD_BLUE);
  doc.setLineWidth(0.6);
  doc.rect(20, currentY, 170, 8);
  doc.setFillColor(30, 64, 175); // JD Blue background
  doc.rect(20, currentY, 170, 8, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('MANUFACTURING CHARGES', 25, currentY + 5.5);

  currentY += 10;

  // Build line items
  const lineItems: string[][] = [];

  // Get manufacturing cost from Bradford→JD PO
  const bradfordToJDPO = (jobData.purchaseOrders || []).find(
    (po: any) => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
  );

  const quantity = jobData.quantity || 0;

  // Try to get cost from PO first, then fall back to job-level fields
  const poMfgCost = Number(bradfordToJDPO?.mfgCost) || 0;
  const poBuyCost = Number(bradfordToJDPO?.buyCost) || 0;
  const poPrintCPM = Number(bradfordToJDPO?.printCPM) || 0;
  const jobPrintCPM = Number(jobData.bradfordPrintCPM) || 0;
  const jobBuyCost = Number(jobData.bradfordBuyCost) || 0;

  // Get CPM from suggestedPricing (most reliable - from standard pricing table)
  const suggestedPrintCPM = Number(jobData.suggestedPricing?.printCPM) || 0;

  // Determine the effective CPM - prioritize sources:
  // 1. PO's explicit printCPM field (if set)
  // 2. suggestedPricing.printCPM (from standard pricing table - most reliable)
  // 3. Job-level printCPM field
  let effectiveCPM = 0;
  let cpmSource = 'none';
  if (poPrintCPM > 0) {
    effectiveCPM = poPrintCPM;
    cpmSource = 'PO printCPM';
  } else if (suggestedPrintCPM > 0) {
    effectiveCPM = suggestedPrintCPM;
    cpmSource = 'suggestedPricing.printCPM';
  } else if (jobPrintCPM > 0) {
    effectiveCPM = jobPrintCPM;
    cpmSource = 'job printCPM';
  }

  // DEBUG: Log CPM calculation
  console.log('📄 JD Invoice PDF - CPM Calculation Debug:');
  console.log('  poPrintCPM:', poPrintCPM);
  console.log('  suggestedPrintCPM:', suggestedPrintCPM);
  console.log('  jobPrintCPM:', jobPrintCPM);
  console.log('  poBuyCost:', poBuyCost);
  console.log('  effectiveCPM:', effectiveCPM);
  console.log('  cpmSource:', cpmSource);

  // Calculate the actual manufacturing cost
  let mfgCost = 0;
  if (poMfgCost > 0) {
    mfgCost = poMfgCost;
  } else if (effectiveCPM > 0 && quantity > 0) {
    // Calculate from CPM: CPM * (quantity / 1000)
    mfgCost = effectiveCPM * (quantity / 1000);
  } else if (poBuyCost > 0) {
    // Use poBuyCost as total cost (last resort fallback)
    mfgCost = poBuyCost;
  } else if (jobBuyCost > 0) {
    mfgCost = jobBuyCost;
  }

  // If we still don't have a CPM but have mfgCost, calculate it
  if (effectiveCPM === 0 && mfgCost > 0 && quantity > 0) {
    effectiveCPM = (mfgCost / quantity) * 1000;
  }

  // Round mfgCost to avoid floating point precision issues
  const roundedMfgCost = Math.round(mfgCost * 100) / 100;
  if (roundedMfgCost > 0) {
    lineItems.push([
      `Print/Manufacturing - ${quantity.toLocaleString()} pcs @ $${effectiveCPM.toFixed(2)}/M`,
      quantity.toLocaleString(),
      `$${effectiveCPM.toFixed(2)}/M`,
      `$${roundedMfgCost.toFixed(2)}`
    ]);
  }

  // Add paper usage if Bradford supplies paper
  // Calculate paper lbs from suggestedPricing.paperLbsPerM (primary source)
  const paperLbsPerM = jobData.suggestedPricing?.paperLbsPerM || 0;
  const calculatedPaperLbs = paperLbsPerM > 0 && quantity > 0
    ? paperLbsPerM * (quantity / 1000)
    : 0;

  // DEBUG: Log paper calculation values
  console.log('📄 JD Invoice PDF - Paper Calculation Debug:');
  console.log('  sizeName:', jobData.sizeName);
  console.log('  suggestedPricing:', JSON.stringify(jobData.suggestedPricing));
  console.log('  paperLbsPerM:', paperLbsPerM);
  console.log('  quantity:', quantity);
  console.log('  calculatedPaperLbs:', calculatedPaperLbs);
  console.log('  bradfordPaperLbs (job field):', jobData.bradfordPaperLbs);

  // Use job-level bradfordPaperLbs if set, otherwise use calculated value
  let paperLbs = Number(jobData.bradfordPaperLbs) || calculatedPaperLbs;

  // Fallback: try specs.paperLbsPerM if still no paper lbs
  if (paperLbs === 0 && jobData.paperSource === 'BRADFORD') {
    const specs = jobData.specs || {};
    if (specs.paperLbsPerM && quantity > 0) {
      paperLbs = specs.paperLbsPerM * (quantity / 1000);
    }
  }

  if (paperLbs > 0) {
    const lbsPerM = quantity > 0 ? (paperLbs / quantity) * 1000 : 0;
    lineItems.push([
      `Paper Usage - ${paperLbs.toFixed(1)} lbs${lbsPerM > 0 ? ` (${lbsPerM.toFixed(2)} lbs/M)` : ''}`,
      `${paperLbs.toFixed(1)} lbs`,
      '-',
      '(Supplied by Bradford)'
    ]);
  }

  // If no specific line items, show total from PO or job-level bradfordBuyCost
  const fallbackCost = Number(bradfordToJDPO?.buyCost) || Number(jobData.bradfordBuyCost) || 0;
  if (lineItems.length === 0 && fallbackCost > 0) {
    lineItems.push([
      'Manufacturing Services',
      quantity > 0 ? quantity.toLocaleString() : '1',
      '-',
      `$${fallbackCost.toFixed(2)}`
    ]);
  }

  autoTable(doc, {
    startY: currentY,
    head: [['Description', 'Qty', 'Rate', 'Amount']],
    body: lineItems,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 64, 175], // JD Blue
      fontSize: 9,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY || currentY + 20;

  // ===== TOTAL DUE =====
  // Round to 2 decimal places to avoid floating point precision issues
  const totalAmount = Math.round((mfgCost || Number(bradfordToJDPO?.buyCost) || Number(jobData.bradfordBuyCost) || 0) * 100) / 100;

  // Draw grid border around total box
  doc.setDrawColor(JD_BLUE);
  doc.setLineWidth(0.6);
  doc.rect(118, finalY + 6, 74, 22);

  // Total box
  doc.setFillColor(30, 64, 175); // JD Blue
  doc.rect(120, finalY + 8, 70, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL DUE:', 125, finalY + 19.5);
  doc.setFontSize(16);
  doc.text(`$${totalAmount.toFixed(2)}`, 185, finalY + 19.5, { align: 'right' });

  // ===== PAYMENT TERMS =====
  currentY = finalY + 35;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT TERMS:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Net 30 days from invoice date.', 20, currentY + 5);

  // ===== FOOTER =====
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  doc.text('Thank you for your business!', 105, pageHeight - 20, { align: 'center' });
  doc.text('Questions? Contact JD Graphic', 105, pageHeight - 15, { align: 'center' });

  doc.setDrawColor(JD_BLUE);
  doc.setLineWidth(0.3);
  doc.line(20, pageHeight - 10, 190, pageHeight - 10);

  return Buffer.from(doc.output('arraybuffer'));
};

// ===== CUSTOMER STATEMENT PDF =====
export function generateStatementPDF(company: any, invoices: any[]): Buffer {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  // ===== HEADER =====
  // Dark header bar
  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, pageWidth, 35, 'F');

  // White background for logo
  doc.setFillColor(255, 255, 255);
  doc.rect(12, 4, 80, 27, 'F');

  // Company logo area
  drawLogo(doc, 20, 8, 25);

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('CUSTOMER STATEMENT', pageWidth - 20, 20, { align: 'right' });

  // Statement date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 20, 28, { align: 'right' });

  // ===== CUSTOMER INFO =====
  let currentY = 50;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', 20, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  currentY += 7;
  doc.text(company.name, 20, currentY);
  if (company.address) {
    currentY += 5;
    doc.setFontSize(10);
    doc.text(company.address, 20, currentY);
  }
  if (company.email) {
    currentY += 5;
    doc.text(company.email, 20, currentY);
  }

  // ===== SUMMARY BOX =====
  const totalAmount = invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
  const unpaidAmount = invoices.filter(inv => !inv.paidAt).reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);
  const paidAmount = totalAmount - unpaidAmount;

  // Summary box on right side
  doc.setDrawColor(BRAND_ORANGE);
  doc.setLineWidth(1);
  doc.rect(120, 45, 70, 30);

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Total Invoiced:', 125, 53);
  doc.text('Paid:', 125, 61);
  doc.text('Balance Due:', 125, 69);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${totalAmount.toFixed(2)}`, 185, 53, { align: 'right' });
  doc.setTextColor(34, 197, 94);
  doc.text(`$${paidAmount.toFixed(2)}`, 185, 61, { align: 'right' });
  doc.setTextColor(239, 68, 68);
  doc.setFontSize(11);
  doc.text(`$${unpaidAmount.toFixed(2)}`, 185, 69, { align: 'right' });

  // ===== INVOICE TABLE =====
  currentY = 90;

  if (invoices.length === 0) {
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.text('No invoices found.', 20, currentY);
  } else {
    const tableData = invoices.map(inv => [
      inv.invoiceNo || inv.id.slice(0, 8),
      inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : '-',
      inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : '-',
      `$${(Number(inv.amount) || 0).toFixed(2)}`,
      inv.paidAt ? 'Paid' : 'Unpaid'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Invoice #', 'Date', 'Due Date', 'Amount', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [26, 26, 26],
        fontSize: 10,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 35, halign: 'center' },
        3: { cellWidth: 35, halign: 'right' },
        4: { cellWidth: 30, halign: 'center' },
      },
      didParseCell: (data: any) => {
        // Color status column
        if (data.column.index === 4 && data.section === 'body') {
          if (data.cell.raw === 'Paid') {
            data.cell.styles.textColor = [34, 197, 94];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [239, 68, 68];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    // Add totals row below table
    const finalY = (doc as any).lastAutoTable.finalY || currentY + 20;

    doc.setDrawColor(26, 26, 26);
    doc.setLineWidth(0.5);
    doc.line(20, finalY + 5, 190, finalY + 5);

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Total:', 140, finalY + 12);
    doc.text(`$${totalAmount.toFixed(2)}`, 185, finalY + 12, { align: 'right' });

    if (unpaidAmount > 0) {
      doc.setTextColor(239, 68, 68);
      doc.text('Balance Due:', 140, finalY + 20);
      doc.text(`$${unpaidAmount.toFixed(2)}`, 185, finalY + 20, { align: 'right' });
    }
  }

  // ===== FOOTER =====
  const pageHeight = doc.internal.pageSize.height;

  doc.setDrawColor(BRAND_ORANGE);
  doc.setLineWidth(0.5);
  doc.line(20, pageHeight - 25, 190, pageHeight - 25);

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('Impact Direct Printing', 105, pageHeight - 18, { align: 'center' });
  doc.text('brandon@impactdirectprinting.com | (330) 963-0970', 105, pageHeight - 12, { align: 'center' });

  return Buffer.from(doc.output('arraybuffer'));
}