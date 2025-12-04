import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Impact Direct Brand Colors (from logo analysis)
const BRAND_ORANGE = '#FF8C42'; // Orange accent (from logo)
const BRAND_BLACK = '#1A1A1A';  // Primary black (from "IDP" text)
const BRAND_GRAY = '#666666';   // Secondary gray
const TEXT_GRAY = '#505050';    // Body text

// Blueprint Grid Color Hierarchy
const GRID_HEAVY = '#444444';   // Heavy structural grid lines
const GRID_MEDIUM = '#888888';  // Section dividers
const GRID_LIGHT = '#CCCCCC';   // Internal grids, crosshairs

// ===== BLUEPRINT HELPER FUNCTIONS =====

// Draws crosshair registration marks in all 4 corners of the page
const drawCrosshairs = (doc: any) => {
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const crosshairSize = 8;
  const margin = 10;

  doc.setDrawColor(GRID_LIGHT);
  doc.setLineWidth(0.5);

  // Top-left crosshair
  doc.line(margin, margin + crosshairSize, margin, margin - 2);
  doc.line(margin - 2, margin, margin + crosshairSize, margin);

  // Top-right crosshair
  doc.line(pageWidth - margin, margin + crosshairSize, pageWidth - margin, margin - 2);
  doc.line(pageWidth - margin + 2, margin, pageWidth - margin - crosshairSize, margin);

  // Bottom-left crosshair
  doc.line(margin, pageHeight - margin - crosshairSize, margin, pageHeight - margin + 2);
  doc.line(margin - 2, pageHeight - margin, margin + crosshairSize, pageHeight - margin);

  // Bottom-right crosshair
  doc.line(pageWidth - margin, pageHeight - margin - crosshairSize, pageWidth - margin, pageHeight - margin + 2);
  doc.line(pageWidth - margin + 2, pageHeight - margin, pageWidth - margin - crosshairSize, pageHeight - margin);
};

// Draws outlined/stroked text effect for document titles (workaround for jsPDF's lack of native text stroke)
const drawOutlinedText = (doc: any, text: string, x: number, y: number, options: any = {}) => {
  const fontSize = options.fontSize || 22;
  const strokeWidth = 0.3;

  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'bold');

  // Draw stroke by offsetting text multiple times
  doc.setTextColor(GRID_HEAVY);
  doc.text(text, x - strokeWidth, y - strokeWidth, options);
  doc.text(text, x + strokeWidth, y - strokeWidth, options);
  doc.text(text, x - strokeWidth, y + strokeWidth, options);
  doc.text(text, x + strokeWidth, y + strokeWidth, options);

  // Draw fill
  doc.setTextColor(BRAND_BLACK);
  doc.text(text, x, y, options);
};

// Draws a grid box around a section
const drawSectionGrid = (doc: any, x: number, y: number, width: number, height: number) => {
  doc.setDrawColor(GRID_MEDIUM);
  doc.setLineWidth(0.8);
  doc.rect(x, y, width, height);

  // Corner marks inside the box
  const markSize = 3;
  doc.setDrawColor(GRID_LIGHT);
  doc.setLineWidth(0.4);

  // Top-left corner
  doc.line(x, y, x + markSize, y);
  doc.line(x, y, x, y + markSize);

  // Top-right corner
  doc.line(x + width, y, x + width - markSize, y);
  doc.line(x + width, y, x + width, y + markSize);

  // Bottom-left corner
  doc.line(x, y + height, x + markSize, y + height);
  doc.line(x, y + height, x, y + height - markSize);

  // Bottom-right corner
  doc.line(x + width, y + height, x + width - markSize, y + height);
  doc.line(x + width, y + height, x + width, y + height - markSize);
};

// Draws a heavy horizontal divider line
const drawHeavyDivider = (doc: any, x1: number, x2: number, y: number) => {
  doc.setDrawColor(GRID_HEAVY);
  doc.setLineWidth(1.2);
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

// Logo helper function - draws the "IDP" logo in top left with complete grid box
const drawLogo = (doc: any, x: number, y: number, size: number = 20) => {
  const boxWidth = size * 3;
  const boxHeight = size * 1.2;
  const padding = 4;

  // Draw complete grid box around logo
  doc.setDrawColor(GRID_MEDIUM);
  doc.setLineWidth(0.8);
  doc.rect(x - padding, y - padding, boxWidth, boxHeight);

  // Draw internal corner crosshair marks
  const markSize = 2;
  doc.setDrawColor(GRID_LIGHT);
  doc.setLineWidth(0.4);

  // Top-left corner mark
  doc.line(x - padding, y - padding, x - padding + markSize, y - padding);
  doc.line(x - padding, y - padding, x - padding, y - padding + markSize);

  // Top-right corner mark
  doc.line(x - padding + boxWidth, y - padding, x - padding + boxWidth - markSize, y - padding);
  doc.line(x - padding + boxWidth, y - padding, x - padding + boxWidth, y - padding + markSize);

  // Bottom-left corner mark
  doc.line(x - padding, y - padding + boxHeight, x - padding + markSize, y - padding + boxHeight);
  doc.line(x - padding, y - padding + boxHeight, x - padding, y - padding + boxHeight - markSize);

  // Bottom-right corner mark
  doc.line(x - padding + boxWidth, y - padding + boxHeight, x - padding + boxWidth - markSize, y - padding + boxHeight);
  doc.line(x - padding + boxWidth, y - padding + boxHeight, x - padding + boxWidth, y - padding + boxHeight - markSize);

  // Draw "IDP" text
  doc.setFontSize(size);
  doc.setTextColor(BRAND_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.text('IDP', x, y + size * 0.7);

  // Draw orange accent circle
  doc.setFillColor(BRAND_ORANGE);
  doc.circle(x + size * 2.2, y + size * 0.55, size * 0.2, 'F');
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
  doc.text('Brandon@impactdirectprinting.com | (555) 123-4567', 105, currentY + 20, { align: 'center' });

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
  doc.text('Questions? Contact Brandon at Brandon@impactdirectprinting.com', 105, pageHeight - 15, { align: 'center' });

  doc.setDrawColor(BRAND_ORANGE);
  doc.setLineWidth(0.3);
  doc.line(20, pageHeight - 10, 190, pageHeight - 10);

  return Buffer.from(doc.output('arraybuffer'));
};

export const generateInvoicePDF = (jobData: any): Buffer => {
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
  doc.text('Brandon@impactdirectprinting.com | (555) 123-4567', 105, currentY + 20, { align: 'center' });

  currentY += 28;

  // ===== OUTLINED DOCUMENT TITLE =====
  drawOutlinedText(doc, 'INVOICE', 105, currentY, { align: 'center', fontSize: 22 });

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

  // Left Column - Invoice Info
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE NUMBER:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.invoiceNumber || jobData.jobNo || 'N/A', 60, currentY);

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
  doc.text('CUSTOMER PO:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.customerPONumber || 'N/A', 60, currentY);

  // Right Column - Customer Info with Grid Box
  const customerY = infoStartY;
  const customerBoxHeight = 28;

  // Draw grid box around "BILL TO:" section
  drawSectionGrid(doc, 118, customerY - 4, 72, customerBoxHeight);

  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', 120, customerY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.customer?.name || 'N/A', 120, customerY + 5);
  doc.text(jobData.customer?.contactPerson || '', 120, customerY + 10);
  doc.text(jobData.customer?.email || '', 120, customerY + 15);
  doc.text(jobData.customer?.phone || '', 120, customerY + 20);

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
  const hasInvoiceSpecs = jobData.specs || jobData.lineItems?.length > 0;

  if (hasInvoiceSpecs) {
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
  drawSectionHeader(doc, 'ITEMS', 20, currentY, 170);
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

  // ===== TOTAL DUE WITH GRID BORDER =====
  const total = jobData.lineItems?.reduce((sum: number, item: any) =>
    sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0) || 0;

  // Draw grid border around total box
  drawSectionGrid(doc, 118, finalY + 6, 74, 22);

  // Larger, more prominent total box
  doc.setFillColor(BRAND_ORANGE);
  doc.rect(120, finalY + 8, 70, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL DUE:', 125, finalY + 19.5);
  doc.setFontSize(18);
  doc.text(`$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 185, finalY + 19.5, { align: 'right' });

  // ===== PAYMENT TERMS =====
  currentY = finalY + 20;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT TERMS:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Net 30 days. Payment due within 30 days of invoice date.', 20, currentY + 5);

  // ===== FOOTER =====
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  doc.text('Thank you for your business!', 105, pageHeight - 20, { align: 'center' });
  doc.text('Questions? Contact Brandon at Brandon@impactdirectprinting.com', 105, pageHeight - 15, { align: 'center' });

  doc.setDrawColor(BRAND_ORANGE);
  doc.setLineWidth(0.3);
  doc.line(20, pageHeight - 10, 190, pageHeight - 10);

  return Buffer.from(doc.output('arraybuffer'));
};

export const generateVendorPOPDF = (jobData: any): Buffer => {
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
  doc.text('Brandon@impactdirectprinting.com | (555) 123-4567', 105, currentY + 20, { align: 'center' });

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
  doc.text(jobData.vendorPONumber || jobData.jobNo || 'N/A', 50, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('PO DATE:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 50, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('JOB NUMBER:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.jobNo || 'N/A', 50, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('DUE DATE:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.dueDate ? new Date(jobData.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'ASAP', 50, currentY);

  // Right Column - Vendor Info with Grid Box
  const vendorY = infoStartY;
  const vendorBoxHeight = 28;

  // Draw grid box around "VENDOR:" section
  drawSectionGrid(doc, 118, vendorY - 4, 72, vendorBoxHeight);

  doc.setFont('helvetica', 'bold');
  doc.text('VENDOR:', 120, vendorY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.vendor?.name || 'N/A', 120, vendorY + 5);
  doc.text(jobData.vendor?.contactPerson || '', 120, vendorY + 10);
  doc.text(jobData.vendor?.email || '', 120, vendorY + 15);
  doc.text(jobData.vendor?.phone || '', 120, vendorY + 20);

  // Vertical divider between columns
  drawVerticalDivider(doc, 110, infoStartY - 4, infoStartY + vendorBoxHeight - 4);

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

  // ===== ARTWORK URL OR "ARTWORK TO ARRIVE LATER" =====
  const artworkUrl = jobData.specs?.artworkUrl;
  if (artworkUrl) {
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
    const displayUrl = artworkUrl.length > 80 ? artworkUrl.substring(0, 77) + '...' : artworkUrl;
    doc.text(displayUrl, 25, currentY + 12);

    // Add note about accessing artwork
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(7);
    doc.text('Click or copy this link to access artwork files', 25, currentY + 16);

    currentY += 22;
  } else if (jobData.specs?.artworkToFollow || jobData.artworkToFollow) {
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

  // ===== FULL DESCRIPTION SECTION (matches customer PO format) =====
  const specs = jobData.specs || {};
  const fullDescription = buildFullDescriptionFromSpecs(specs, jobData);

  if (fullDescription.trim()) {
    drawSectionHeader(doc, 'JOB SPECIFICATIONS', 20, currentY, 170);
    currentY += 10;

    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    // Split description into lines that fit the page width
    const descriptionLines = doc.splitTextToSize(fullDescription, 165);

    descriptionLines.forEach((line: string) => {
      // Check for page break
      if (currentY > 270) {
        doc.addPage();
        drawCrosshairs(doc);
        currentY = 20;
      }
      doc.text(line, 22, currentY);
      currentY += 4.5;
    });

    currentY += 5;
  }

  // ===== LINE ITEMS TABLE WITH GRID HEADER =====
  drawSectionHeader(doc, 'ORDER DETAILS', 20, currentY, 170);
  currentY += 10;

  const tableData = jobData.lineItems?.map((item: any) => {
    const unitCost = Number(item.unitCost) || 0;
    const quantity = Number(item.quantity) || 0;
    return [
      item.description,
      quantity.toLocaleString(),
      `$${unitCost.toFixed(2)}`,
      `$${(quantity * unitCost).toFixed(2)}`
    ];
  }) || [];

  autoTable(doc, {
    startY: currentY,
    head: [['Description', 'Quantity', 'Unit Cost', 'Line Total']],
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

  const finalY = (doc as any).lastAutoTable.finalY || currentY + 20;

  // ===== TOTAL WITH GRID BORDER =====
  // Use buyCost directly if available, otherwise calculate from lineItems
  const total = jobData.buyCost
    ? Number(jobData.buyCost)
    : jobData.lineItems?.reduce((sum: number, item: any) =>
        sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0), 0) || 0;

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

  // PAYMENT TERMS SECTION (keep below the total)
  const paymentTerms = specs.paymentTerms;
  const fob = specs.fob;
  if (paymentTerms || fob) {
    const termsY = finalY + 30;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    if (paymentTerms) doc.text(`Payment Terms: ${paymentTerms}`, 20, termsY);
    if (fob) doc.text(`FOB: ${fob}`, paymentTerms ? 100 : 20, termsY);
  }

  // ===== FOOTER - Add to all pages with page numbers =====
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.height;

    // Page number on all pages
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${totalPages}`, 105, pageHeight - 8, { align: 'center' });

    // Full footer only on last page
    if (i === totalPages) {
      doc.setFont('helvetica', 'italic');
      doc.text('Please confirm receipt of this PO and provide production timeline.', 105, pageHeight - 20, { align: 'center' });
      doc.text('Questions? Contact Brandon at Brandon@impactdirectprinting.com', 105, pageHeight - 15, { align: 'center' });

      doc.setDrawColor(BRAND_ORANGE);
      doc.setLineWidth(0.3);
      doc.line(20, pageHeight - 12, 190, pageHeight - 12);
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
  doc.text('Brandon@impactdirectprinting.com | (555) 123-4567', 105, currentY + 20, { align: 'center' });

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
      doc.text('Questions? Contact Brandon at Brandon@impactdirectprinting.com', 105, pageHeight - 15, { align: 'center' });

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