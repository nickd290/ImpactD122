
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
  
  // Branding Colors (Impact Direct Website Style)
  // Rust Orange for primary branding
  const brandColor = [217, 83, 30]; // ~#D9531E
  const brandDark = [20, 20, 20];   // ~#141414
  const sectionGray = [241, 245, 249]; // Slate 100
  
  // --- Header Background ---
  doc.setFillColor(brandColor[0], brandColor[1], brandColor[2]);
  doc.rect(0, 0, 210, 45, 'F');
  
  // --- Company Identity (Left) ---
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text("IMPACT DIRECT PRINTING", 14, 22);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text("Brokerage Services | Commercial Printing", 14, 30);

  // --- Document Type & Number (Right) ---
  let docTitle: string = type;
  let docNumber = job.number;

  if (type === 'PO') {
      docTitle = "PURCHASE ORDER";
      // Use Vendor PO Number if available, otherwise fallback to Job #
      docNumber = job.vendorPONumber || job.number;
  } else if (type === 'INVOICE') {
      docTitle = "INVOICE";
      docNumber = job.invoiceNumber || job.number;
  } else if (type === 'QUOTE') {
      docTitle = "QUOTE";
      docNumber = job.number;
  }

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(docTitle, 196, 22, { align: 'right' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`# ${docNumber}`, 196, 30, { align: 'right' });

  // --- Address Block ---
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  
  let yPos = 55; // Start below header
  
  // FROM (Left)
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]); // Use brand color for label
  doc.text("FROM:", 14, yPos);
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold'); // Company name bold
  doc.text(fromEntity.name, 14, yPos + 5);
  
  doc.setFont('helvetica', 'normal');
  doc.text(fromEntity.address.split('\n'), 14, yPos + 10);
  doc.text(`Contact: ${fromEntity.contactPerson}`, 14, yPos + 25);

  // TO (Right side)
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
  doc.text("TO:", 110, yPos);
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(toEntity.name, 110, yPos + 5);
  
  doc.setFont('helvetica', 'normal');
  doc.text(toEntity.address.split('\n'), 110, yPos + 10);
  if (toEntity.contactPerson) {
     // Calculate Y based on address lines to avoid overlap
     const addressLines = toEntity.address.split('\n').length;
     doc.text(`Attn: ${toEntity.contactPerson}`, 110, yPos + 10 + (addressLines * 4) + 2);
  }
  
  // --- Metadata Bar ---
  yPos = 95;
  const dateStr = new Date(job.dateCreated).toLocaleDateString();
  
  doc.setFillColor(sectionGray[0], sectionGray[1], sectionGray[2]);
  doc.rect(14, yPos - 8, 182, 20, 'F'); // Gray background strip
  
  // Draw Metadata Columns
  doc.setTextColor(brandDark[0], brandDark[1], brandDark[2]);
  
  // Col 1: Reference / Job ID
  doc.setFont('helvetica', 'bold');
  doc.text(`Job #: ${job.number}`, 18, yPos);
  
  // Col 2: Customer Ref (if exists)
  if (job.customerPONumber) {
     doc.text(`Cust PO: ${job.customerPONumber}`, 18, yPos + 6);
  }

  // Col 3: Date
  doc.text("Date:", 85, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(dateStr, 100, yPos);

  // Col 4: Due Date
  doc.setFont('helvetica', 'bold');
  doc.text("Due Date:", 140, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(job.dueDate ? new Date(job.dueDate).toLocaleDateString() : 'TBD', 160, yPos);


  // --- Specifications ---
  let currentY = 125;
  
  if (job.specs && Object.keys(job.specs).length > 0) {
      // Section Title
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
      doc.text("JOB SPECIFICATIONS", 14, currentY);
      
      // Specs Divider Line
      doc.setDrawColor(brandColor[0], brandColor[1], brandColor[2]);
      doc.setLineWidth(0.5);
      doc.line(14, currentY + 2, 196, currentY + 2);
      
      currentY += 8;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      
      const specs = job.specs;
      const specLines: string[] = [];

      // Formatting logic for specs
      if (specs.productType) specLines.push(`Product: ${specs.productType}`);
      if (specs.finishedSize) specLines.push(`Size: ${specs.finishedSize}`);
      if (specs.flatSize) specLines.push(`Flat Size: ${specs.flatSize}`);
      if (specs.colors) specLines.push(`Colors: ${specs.colors}`);
      
      if (specs.productType === 'BOOK') {
           if (specs.pageCount) specLines.push(`Page Count: ${specs.pageCount}`);
           if (specs.bindingStyle) specLines.push(`Binding: ${specs.bindingStyle}`);
           if (specs.coverType) specLines.push(`Cover Style: ${specs.coverType === 'PLUS' ? 'Plus Cover' : 'Self Cover'}`);
           if (specs.paperType) specLines.push(`Text Stock: ${specs.paperType}`);
           if (specs.coverPaperType) specLines.push(`Cover Stock: ${specs.coverPaperType}`);
      } else {
           if (specs.paperType) specLines.push(`Stock: ${specs.paperType}`);
      }
      
      if (specs.coating) specLines.push(`Coating: ${specs.coating}`);
      if (specs.finishing) specLines.push(`Finishing: ${specs.finishing}`);

      // Render specs in 2 columns
      const mid = Math.ceil(specLines.length / 2);
      const col1 = specLines.slice(0, mid);
      const col2 = specLines.slice(mid);
      
      col1.forEach((line, i) => doc.text(`• ${line}`, 14, currentY + (i * 5)));
      col2.forEach((line, i) => doc.text(`• ${line}`, 110, currentY + (i * 5)));
      
      currentY += (Math.max(col1.length, col2.length) * 5) + 10;
  }

  // --- Line Items Table ---
  
  const tableBody = job.items.map((item: LineItem) => {
    if (type === 'PO') {
       // PO shows Unit Cost (Buy Price)
       const total = item.quantity * item.unitCost;
       return [item.description, item.quantity, formatCurrency(item.unitCost, 4), formatCurrency(total, 2)];
    } else {
       // Quote/Invoice shows Unit Price (Sell Price)
       const total = item.quantity * item.unitPrice;
       return [item.description, item.quantity, formatCurrency(item.unitPrice, 4), formatCurrency(total, 2)];
    }
  });

  const tableHead = type === 'PO' 
    ? [['Description', 'Qty', 'Unit Cost', 'Total']]
    : [['Description', 'Qty', 'Unit Price', 'Total']];

  autoTable(doc, {
    startY: currentY,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: { 
        fillColor: brandColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'left'
    },
    styles: { 
        fontSize: 10, 
        cellPadding: 4,
        lineColor: [220, 220, 220]
    },
    alternateRowStyles: {
        fillColor: [250, 250, 250]
    },
    columnStyles: {
      0: { cellWidth: 'auto' }, // Description
      1: { cellWidth: 25, halign: 'center' }, // Qty
      2: { cellWidth: 35, halign: 'right' }, // Unit Price
      3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' } // Total
    }
  });

  // --- Totals Section ---
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  
  let totalAmount = 0;
  job.items.forEach(i => {
      totalAmount += (type === 'PO' ? i.unitCost : i.unitPrice) * i.quantity;
  });

  // Draw Total Box
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
  doc.text(`TOTAL: ${formatCurrency(totalAmount, 2)}`, 196, finalY, { align: 'right' });

  // --- Footer ---
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120, 120, 120);
  
  let footerText = "Thank you for your business.";
  if (type === 'QUOTE') footerText = "This quote is valid for 30 days.";
  if (type === 'PO') footerText = "Please confirm receipt of this order immediately.";
  if (type === 'INVOICE') footerText = "Payment due upon receipt.";

  doc.text(footerText, 105, 280, { align: 'center' });
  
  // Brand Tagline in Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
  doc.text("IMPACT DIRECT PRINTING", 105, 285, { align: 'center' });

  // Save File
  doc.save(`${type}_${docNumber}.pdf`);
};
