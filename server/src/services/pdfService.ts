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
  doc.text(jobData.number, 55, currentY);

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

  const tableData = jobData.lineItems?.map((item: any) => [
    item.description,
    item.quantity.toLocaleString(),
    `$${item.unitPrice.toFixed(2)}`,
    `$${(item.quantity * item.unitPrice).toFixed(2)}`
  ]) || [];

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
    sum + (item.quantity * item.unitPrice), 0) || 0;

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
  doc.text(jobData.invoiceNumber || jobData.number, 60, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE DATE:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 60, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('JOB NUMBER:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.number, 60, currentY);

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

  const tableData = jobData.lineItems?.map((item: any) => [
    item.description,
    item.quantity.toLocaleString(),
    `$${item.unitPrice.toFixed(2)}`,
    `$${(item.quantity * item.unitPrice).toFixed(2)}`
  ]) || [];

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
    sum + (item.quantity * item.unitPrice), 0) || 0;

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
  doc.text(jobData.vendorPONumber || jobData.number, 50, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('PO DATE:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 50, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('JOB NUMBER:', 20, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(jobData.number, 50, currentY);

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

  // ===== SPECIFICATIONS SECTION WITH GRID HEADER =====
  const hasSpecs = jobData.specs || jobData.lineItems?.length > 0;

  if (hasSpecs) {
    drawSectionHeader(doc, 'PRINT SPECIFICATIONS', 20, currentY, 170);
    currentY += 10;

    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const specs = jobData.specs || {};
    const specsData: string[][] = [];

    // Product Type
    if (specs.productType) {
      specsData.push(['Product Type:', specs.productType]);
    }

    // Quantity - ALWAYS show if available from line items
    const totalQuantity = jobData.lineItems?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;
    if (totalQuantity > 0) {
      specsData.push(['Quantity:', totalQuantity.toLocaleString()]);
    }

    // Page Count - Show prominently for books RIGHT AFTER quantity
    if (specs.productType === 'BOOK' && specs.pageCount) {
      specsData.push(['Page Count:', specs.pageCount.toString() + ' pages']);
    }

    // Sizes
    if (specs.flatSize) {
      specsData.push(['Flat Size:', specs.flatSize]);
    }
    if (specs.finishedSize) {
      specsData.push(['Finished Size:', specs.finishedSize]);
    }

    // Paper
    if (specs.paperType) {
      specsData.push(['Paper Stock:', specs.paperType]);
    }

    // Colors
    if (specs.colors) {
      specsData.push(['Colors:', specs.colors]);
    }

    // Coating
    if (specs.coating) {
      specsData.push(['Coating:', specs.coating]);
    }

    // Finishing
    if (specs.finishing) {
      specsData.push(['Finishing:', specs.finishing]);
    }

    // Book-specific specs (binding and cover)
    if (specs.productType === 'BOOK') {
      if (specs.bindingStyle) {
        specsData.push(['Binding:', specs.bindingStyle]);
      }
      if (specs.coverType) {
        specsData.push(['Cover Type:', specs.coverType === 'PLUS' ? 'Plus Cover' : 'Self Cover']);
      }
      if (specs.coverPaperType) {
        specsData.push(['Cover Stock:', specs.coverPaperType]);
      }
    }

    if (specsData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        body: specsData,
        theme: 'plain',
        styles: {
          fontSize: 9,
          cellPadding: 2,
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 40 },
          1: { cellWidth: 130 },
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // ===== LINE ITEMS TABLE WITH GRID HEADER =====
  drawSectionHeader(doc, 'ORDER DETAILS', 20, currentY, 170);
  currentY += 10;

  const tableData = jobData.lineItems?.map((item: any) => [
    item.description,
    item.quantity.toLocaleString(),
    `$${item.unitCost.toFixed(2)}`,
    `$${(item.quantity * item.unitCost).toFixed(2)}`
  ]) || [];

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
  const total = jobData.lineItems?.reduce((sum: number, item: any) =>
    sum + (item.quantity * item.unitCost), 0) || 0;

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

  // ===== NOTES SECTION =====
  if (jobData.notes && jobData.notes.trim()) {
    currentY = finalY + 20;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTES:', 20, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const splitNotes = doc.splitTextToSize(jobData.notes, 170);
    doc.text(splitNotes, 20, currentY + 5);
    currentY += 5 + (splitNotes.length * 4);
  }

  // ===== FOOTER =====
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  doc.text('Please confirm receipt of this PO and provide production timeline.', 105, pageHeight - 20, { align: 'center' });
  doc.text('Questions? Contact Brandon at Brandon@impactdirectprinting.com', 105, pageHeight - 15, { align: 'center' });

  doc.setDrawColor(BRAND_ORANGE);
  doc.setLineWidth(0.3);
  doc.line(20, pageHeight - 10, 190, pageHeight - 10);

  return Buffer.from(doc.output('arraybuffer'));
};
