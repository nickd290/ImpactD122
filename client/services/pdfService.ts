
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Job, Entity, LineItem, JobSpecs } from "../types";

const formatCurrency = (num: number, precision = 2) => {
  return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
  }).format(num);
};

export const generatePDF = (type: 'QUOTE' | 'PO' | 'INVOICE', job: Job, fromEntity: Entity, toEntity: Entity) => {
  const doc = new jsPDF();

  // Validate inputs
  if (!job || !fromEntity || !toEntity) {
    throw new Error('Missing required data for PDF generation');
  }

  if (!job.items || job.items.length === 0) {
    throw new Error('Job has no line items');
  }

  // Ensure addresses are strings
  const normalizedFromEntity = {
    ...fromEntity,
    address: fromEntity.address || 'No address provided',
    contactPerson: fromEntity.contactPerson || 'No contact',
  };

  const normalizedToEntity = {
    ...toEntity,
    address: toEntity.address || 'No address provided',
    contactPerson: toEntity.contactPerson || 'No contact',
  };

  // Brand Colors
  const impactOrange = [212, 114, 46]; // #D4722E
  const darkGray = [51, 51, 51]; // #333333
  const lightGray = [240, 240, 240]; // #F0F0F0

  // --- Logo (IDP box with orange dot) ---
  // Draw logo box
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(1);
  doc.rect(14, 10, 35, 18);

  // IDP text
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text("IDP", 18, 22);

  // Orange dot
  doc.setFillColor(impactOrange[0], impactOrange[1], impactOrange[2]);
  doc.circle(42, 23, 3, 'F');

  // --- Company Name & Info (Right of Logo) ---
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text("IMPACT DIRECT", 55, 16);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text("PRINT-NATIVE AGENCY", 55, 22);

  doc.setFontSize(9);
  doc.text("Brandon@impactdirectprinting.com | (555) 123-4567", 55, 27);

  // --- Document Type Title ---
  let docTitle = "PURCHASE ORDER";
  if (type === 'INVOICE') docTitle = "INVOICE";
  if (type === 'QUOTE') docTitle = "QUOTE";

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(docTitle, 14, 38);

  // Orange underline
  doc.setDrawColor(impactOrange[0], impactOrange[1], impactOrange[2]);
  doc.setLineWidth(1.5);
  doc.line(14, 40, 196, 40);

  // --- Left Box: Metadata ---
  const leftBoxY = 48;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.5);
  doc.rect(14, leftBoxY, 85, 30);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);

  let docNumber = job.number;
  if (type === 'PO') {
    docNumber = job.vendorPONumber || job.number;
  } else if (type === 'INVOICE') {
    docNumber = job.invoiceNumber || job.number;
  }

  const dateStr = new Date(job.dateCreated).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const dueDateStr = job.dueDate
    ? new Date(job.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'ASAP';

  doc.text(`${type === 'PO' ? 'PO' : type} NUMBER:`, 18, leftBoxY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(docNumber, 55, leftBoxY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text(`${type === 'PO' ? 'PO' : type} DATE:`, 18, leftBoxY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(dateStr, 55, leftBoxY + 12);

  doc.setFont('helvetica', 'bold');
  doc.text("JOB NUMBER:", 18, leftBoxY + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(job.number, 55, leftBoxY + 18);

  doc.setFont('helvetica', 'bold');
  doc.text("DUE DATE:", 18, leftBoxY + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(dueDateStr, 55, leftBoxY + 24);

  // --- Right Box: Customer/Vendor ---
  const rightBoxY = leftBoxY;
  doc.setDrawColor(100, 100, 100);
  doc.rect(105, rightBoxY, 91, 30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);

  const entityLabel = type === 'PO' ? 'VENDOR:' : 'CUSTOMER:';
  doc.text(entityLabel, 109, rightBoxY + 6);

  doc.setFont('helvetica', 'normal');
  const addressLines = normalizedToEntity.address.split('\n');

  doc.text(normalizedToEntity.name, 109, rightBoxY + 11);
  doc.text(normalizedToEntity.contactPerson, 109, rightBoxY + 16);
  doc.text(normalizedToEntity.email, 109, rightBoxY + 21);
  doc.text(normalizedToEntity.phone, 109, rightBoxY + 26);

  // --- PROJECT Section ---
  const projectY = 85;
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.rect(14, projectY, 182, 8, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`PROJECT:`, 18, projectY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.text(job.title, 42, projectY + 5.5);

  // --- PRINT SPECIFICATIONS Section ---
  let currentY = 100;

  if (job.specs && Object.keys(job.specs).length > 0) {
    // Section border
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.5);

    // Header
    doc.setFillColor(255, 255, 255);
    doc.rect(14, currentY, 182, 7, 'FD');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text("PRINT SPECIFICATIONS", 18, currentY + 5);

    currentY += 10;
    const specs = job.specs;
    const specsList: Array<{label: string, value: string}> = [];

    if (specs.productType) specsList.push({ label: 'Product Type:', value: specs.productType });

    // Calculate total quantity from line items
    const totalQty = job.items.reduce((sum, item) => sum + item.quantity, 0);
    specsList.push({ label: 'Quantity:', value: totalQty.toLocaleString() });

    if (specs.finishedSize) specsList.push({ label: 'Finished Size:', value: specs.finishedSize });
    if (specs.paperType) specsList.push({ label: 'Paper Stock:', value: specs.paperType });
    if (specs.colors) specsList.push({ label: 'Colors:', value: specs.colors });
    if (specs.pageCount) specsList.push({ label: 'Page Count:', value: specs.pageCount.toString() });
    if (specs.bindingStyle) specsList.push({ label: 'Binding:', value: specs.bindingStyle });
    if (specs.coverType) specsList.push({ label: 'Cover Type:', value: specs.coverType === 'PLUS' ? 'Plus Cover' : 'Self Cover' });
    if (specs.coverPaperType) specsList.push({ label: 'Cover Stock:', value: specs.coverPaperType });
    if (specs.coating) specsList.push({ label: 'Coating:', value: specs.coating });
    if (specs.finishing) specsList.push({ label: 'Finishing:', value: specs.finishing });

    doc.setFontSize(9);
    specsList.forEach((spec, index) => {
      doc.setFont('helvetica', 'bold');
      doc.text(spec.label, 18, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(spec.value, 60, currentY);
      currentY += 5;
    });

    // Close specs box
    const specsHeight = (specsList.length * 5) + 7;
    doc.rect(14, 100, 182, specsHeight);

    currentY = 100 + specsHeight + 8;
  }

  // --- ORDER DETAILS Section ---
  // Header
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.5);
  doc.setFillColor(255, 255, 255);
  doc.rect(14, currentY, 182, 7, 'FD');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text("ORDER DETAILS", 18, currentY + 5);

  currentY += 10;

  // Table
  const tableBody = job.items.map((item: LineItem) => {
    const quantity = item.quantity || 0;
    const unitCost = item.unitCost || 0;
    const unitPrice = item.unitPrice || 0;

    if (type === 'PO') {
      const total = quantity * unitCost;
      return [
        item.description || 'No description',
        quantity.toLocaleString(),
        formatCurrency(unitCost, 2),
        formatCurrency(total, 2)
      ];
    } else {
      const total = quantity * unitPrice;
      return [
        item.description || 'No description',
        quantity.toLocaleString(),
        formatCurrency(unitPrice, 2),
        formatCurrency(total, 2)
      ];
    }
  });

  const tableHead = type === 'PO'
    ? [['Description', 'Quantity', 'Unit Cost', 'Line Total']]
    : [['Description', 'Quantity', 'Unit Price', 'Line Total']];

  autoTable(doc, {
    startY: currentY,
    head: tableHead,
    body: tableBody,
    theme: 'plain',
    headStyles: {
      fillColor: [impactOrange[0], impactOrange[1], impactOrange[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 3
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: [200, 200, 200],
      lineWidth: 0.1
    },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' }
    }
  });

  // --- Total Box ---
  const finalY = (doc as any).lastAutoTable.finalY + 5;

  let totalAmount = 0;
  job.items.forEach(i => {
    const quantity = i.quantity || 0;
    const unitCost = i.unitCost || 0;
    const unitPrice = i.unitPrice || 0;
    totalAmount += (type === 'PO' ? unitCost : unitPrice) * quantity;
  });

  // Debug logging
  console.log('PDF Generation Debug:', {
    type,
    jobNumber: job.number,
    itemsCount: job.items.length,
    items: job.items.map(i => ({
      description: i.description,
      quantity: i.quantity,
      unitCost: i.unitCost,
      unitPrice: i.unitPrice
    })),
    totalAmount
  });

  // Orange box for total
  doc.setFillColor(impactOrange[0], impactOrange[1], impactOrange[2]);
  doc.setDrawColor(impactOrange[0], impactOrange[1], impactOrange[2]);
  doc.setLineWidth(2);
  doc.rect(144, finalY, 52, 12, 'FD');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL:", 148, finalY + 8);
  doc.text(formatCurrency(totalAmount, 2), 191, finalY + 8, { align: 'right' });

  // --- Footer ---
  const footerY = 275;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120, 120, 120);

  let footerText1 = "";
  let footerText2 = "Questions? Contact Brandon at Brandon@impactdirectprinting.com";

  if (type === 'PO') {
    footerText1 = "Please confirm receipt of this PO and provide production timeline.";
  } else if (type === 'QUOTE') {
    footerText1 = "This quote is valid for 30 days from the date above.";
  } else if (type === 'INVOICE') {
    footerText1 = "Payment due upon receipt. Thank you for your business.";
  }

  doc.text(footerText1, 105, footerY, { align: 'center' });
  doc.text(footerText2, 105, footerY + 5, { align: 'center' });

  // Orange line at bottom
  doc.setDrawColor(impactOrange[0], impactOrange[1], impactOrange[2]);
  doc.setLineWidth(1);
  doc.line(14, footerY + 10, 196, footerY + 10);

  // Save File
  doc.save(`${type}_${docNumber}.pdf`);
};
