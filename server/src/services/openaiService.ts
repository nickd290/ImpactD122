import OpenAI from 'openai';
import { pdf } from 'pdf-to-img';

// Lazy-initialize OpenAI Client to ensure env vars are loaded
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }
  return openai;
}

// Helper to convert PDF buffer to base64 images
async function convertPdfToImages(pdfBuffer: Buffer): Promise<string[]> {
  const images: string[] = [];
  const document = await pdf(pdfBuffer, { scale: 2 });

  for await (const image of document) {
    // image is a Buffer of PNG data
    const base64 = image.toString('base64');
    images.push(base64);
  }

  return images;
}

export const parsePrintSpecs = async (text: string): Promise<any> => {
  if (!text.trim()) return {};

  try {
    const prompt = `Extract commercial printing specifications from the following request into a structured JSON object.
    The user is a print broker at Impact Direct Printing.

    Specific Instructions:
    1. **Product Type**: Determine if it is a BOOK (catalog, booklet, mag), FLAT (flyer, card), or FOLDED (brochure).
    2. **Colors**: Identify "4/4", "4/1", "PMS".
    3. **Books**: Look for "Page Count", "Binding" (Saddle Stitch, Perfect), "Plus Cover" vs "Self Cover".
       - If "Plus Cover", extract distinct "coverPaperType".
    4. **Sizes**: Map "Flat Size" and "Finished/Folded Size".

    Request: "${text}"

    Return a JSON object with: title, description, quantity, specs (productType, paperType, coverPaperType, flatSize, finishedSize, colors, coating, finishing, pageCount, bindingStyle, coverType)`;

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
    });

    const jsonText = response.choices[0]?.message?.content || '';

    if (!jsonText) return {};

    // Extract JSON from markdown code blocks if present
    const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/) || jsonText.match(/```\s*([\s\S]*?)\s*```/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : jsonText);

    return {
      title: parsed.title || "New Print Job",
      specs: {
        productType: parsed.specs?.productType || 'FLAT',
        ...parsed.specs
      },
      lineItems: [
        {
          description: parsed.description || "Print Service",
          quantity: parsed.quantity || 0,
          unitCost: 0,
          markupPercent: 30,
          unitPrice: 0
        }
      ]
    };

  } catch (error) {
    console.error("OpenAI parsing error:", error);
    return {};
  }
};

export const parsePurchaseOrder = async (base64Data: string, mimeType: string): Promise<any> => {
  try {
    // Handle PDF files by converting to images first
    let imageContents: Array<{ type: 'image_url'; image_url: { url: string } }> = [];

    if (mimeType === 'application/pdf') {
      console.log('📄 Converting PDF to images for OpenAI Vision...');
      const pdfBuffer = Buffer.from(base64Data, 'base64');
      const pdfImages = await convertPdfToImages(pdfBuffer);
      console.log(`📄 Converted PDF to ${pdfImages.length} page(s)`);

      // Add each page as an image (limit to first 5 pages to avoid token limits)
      const pagesToProcess = pdfImages.slice(0, 5);
      imageContents = pagesToProcess.map((imgBase64) => ({
        type: 'image_url' as const,
        image_url: { url: `data:image/png;base64,${imgBase64}` }
      }));
    } else {
      // Regular image file
      imageContents = [{
        type: 'image_url' as const,
        image_url: { url: `data:${mimeType};base64,${base64Data}` }
      }];
    }

    const prompt = `Analyze this Purchase Order (PO) for Impact Direct Printing. Extract ALL available information into STRUCTURED fields.

    **CRITICAL: You MUST return ALL structured fields listed below. Do NOT put structured data into additionalNotes - use the proper fields!**

    **EXTRACTION RULES - BE THOROUGH:**

    1. **Customer/Company Info**:
       - customerName: Company name sending the PO
       - contactPerson: Contact name if shown
       - contactEmail: Email address
       - contactPhone: Phone number
       - customerAddress: Billing address if shown

    2. **PO Details**:
       - poNumber: The PO number (look for "PO#", "Purchase Order #", "Order #")
       - title: Job name/title/description
       - projectName: Project or campaign name if different from title

    3. **Dates (CRITICAL for print jobs)**:
       - dueDate: Delivery date, ship date, due date, or "need by" date
       - mailDate: If this is direct mail, look for "mail date", "drop date", "pool date", or "mailing date"
         - IMPORTANT: "Pool date" IS the mail date - extract it as mailDate
       - inHomesDate: "In-homes date" or "in-home date" for direct mail
       - Format dates as "YYYY-MM-DD"

    4. **Shipping/Delivery**:
       - shipToName: Ship-to company or person name (e.g., "Lahlouh - Receiving - OH")
       - shipToAddress: ONLY the physical street address (e.g., "150 Lawton Avenue, Monroe, OH 45050")
         - IMPORTANT: Do NOT include facility names or prefixes like "Ohio Facility" in the address
         - Extract ONLY: street, city, state, zip
       - shipVia: Shipping method if specified
       - specialInstructions: Brief notes only - put detailed info in the structured fields below

    5. **Quantity (CRITICAL - LOOK CAREFULLY)**:
       - ALWAYS extract the exact quantity from the PO
       - Look for "Qty:", "Quantity:", "QTY", numeric values near descriptions
       - Common quantities: 1000, 2500, 5000, 10000, 25000, 50000, 100000
       - NEVER default to 1 - if unclear, look harder
       - If multiple quantities exist (like 5,000 + 2,500), capture them separately

    6. **Pricing (CRITICAL - READ CAREFULLY)**:
       - The price on the PO is the **Customer's Price** (our Revenue)
       - IMPORTANT: Print pricing is often quoted "per thousand" or "/M"
         - "$35.00/M" means $35.00 per 1,000 pieces
         - "$35/M" for 30,000 qty = $35 × 30 = $1,050 total (NOT $35 × 30,000)
         - "CPM" also means Cost Per Thousand (M = Roman numeral for 1000)
       - When you see "/M", "per M", "per thousand", or "CPM":
         - pricePerThousand: The rate per 1,000 (e.g., 35.00)
         - lineTotal: pricePerThousand × (quantity / 1000)
         - unitPrice: pricePerThousand / 1000 (price per single piece)
       - If a flat total is given (no /M), use that as lineTotal
       - NEVER multiply per-thousand rates by the full quantity

    7. **Product Type - BE VERY CAREFUL**:
       - "BOOK": ANY multi-page product with pages - look for:
         - Page counts like "16pg", "24pg", "8 page", "12pp", "32pp" - ALWAYS a BOOK
         - "Self cover", "self", "plus cover" - ALWAYS a BOOK
         - "Stitch", "Saddle Stitch", "Perfect Bound", "Wire-O", "Spiral" - ALWAYS a BOOK
         - "Booklet", "catalog", "magazine", "program", "annual report", "newsletter"
       - "FOLDED": ONLY single sheet that folds (NO page count):
         - "Tri-fold", "Z-fold", "Gate fold", "Roll fold"
         - Brochure, folder, self-mailer
       - "FLAT": Single sheet, no folds - flyer, postcard, sell sheet, poster, card
       - IMPORTANT: If you see BOTH page count AND "fold/stitch", it's still a BOOK (saddle stitch books)

    8. **Print Specifications - Extract ALL available**:
       - flatSize: Unfolded/flat size (e.g., "11 x 17", "17 x 22")
       - finishedSize: Final trimmed size - LOOK FOR "Page Size:" or "Size:" on the PO
         - Common sizes: "6 x 9", "6 x 11", "8.5 x 11", "5.5 x 8.5"
         - Oversized postcards: "6 x 11", "7 1/4 x 16 3/8", "8 1/2 x 17 1/2", "9 3/4 x 22 1/8"
         - Format as "W x H" with spaces around the x (e.g., "6 x 11" not "6x11")
       - paperType: Text/body paper stock (e.g., "80# Gloss Text", "100# Uncoated")
       - paperWeight: Paper weight if separate from type (e.g., "100#", "80 lb")
       - coverPaperType: Cover stock for books (e.g., "100# Gloss Cover")
       - colors: Print colors (e.g., "4/4", "4/1", "4/0", "CMYK", "PMS 485")
       - coating: Coating type (e.g., "AQ", "UV", "Matte", "Gloss", "Satin", "Soft Touch")
       - finishing: Finishing operations (e.g., "Score", "Die Cut", "Emboss", "Foil")
       - folds: Fold type (e.g., "Tri-fold", "Z-fold", "Gate fold", "Roll fold")
       - perforations: Any perfs (e.g., "Perf at 3.5 inches")
       - dieCut: Die cut details if applicable
       - pageCount: Number of pages for books (e.g., "16 + cover", "32pp")
       - bindingStyle: Binding type (e.g., "Saddle Stitch", "Perfect Bound", "Wire-O", "Spiral")
       - coverType: "PLUS" (separate cover) or "SELF" (self-cover)
       - bleed: Bleed information if specified
       - proofType: Proof requirements (e.g., "PDF proof", "Hard copy proof", "No proof needed")

    9. **Line Items**:
       - Extract EACH line item with: description, quantity (REQUIRED!), pricePerThousand (if /M pricing), lineTotal
       - If pricing is "/M" or "per thousand": include pricePerThousand and calculate lineTotal = pricePerThousand × (quantity / 1000)
       - If there are multiple size/quantity combinations, capture each separately

    10. **Additional Fields**:
        - artworkInstructions: Instructions about artwork, files, etc.
        - packingInstructions: How to pack/box the job
        - labelingInstructions: Labeling requirements

    11. **Additional Notes - CRITICAL FOR VENDOR**:
        - additionalNotes: Capture ANY important information that doesn't fit structured fields:
          - Mailing instructions (mail date, drop location, USPS requirements)
          - File delivery dates/requirements
          - Proof requirements and dates
          - Special sorting/handling instructions
          - Language versions breakdown (e.g., "English @ 69,481, Spanish @ 61,424")
          - Hand-sorting requirements (e.g., "HAND SORT BACK TOGETHER")
          - Data file instructions
          - Version details (e.g., "REGULAR PRINT" vs "LARGE PRINT")
          - Client approval requirements
          - Any other vendor-critical information
        - This is a catch-all - include EVERYTHING the vendor needs to know to do the job correctly

    12. **Multiple Versions/Variants (MANDATORY - ALWAYS EXTRACT)**:
        **IMPORTANT: If the PO has MULTIPLE product types/versions (e.g., "REGULAR PRINT" and "LARGE PRINT"), you MUST extract each as a separate version object!**
        - versions: Array of version objects. EXAMPLE for Lahlouh PO with Regular and Large Print:
          "versions": [
            { "versionName": "REGULAR PRINT", "pageCount": "16pg Self", "quantity": 136489, "specs": {"size": "8.5 x 11", "binding": "Stitch on 11"}, "languageBreakdown": [{"language": "English", "quantity": 69481, "handSort": false}, {"language": "Spanish", "quantity": 61424, "handSort": false}, {"language": "Chinese", "quantity": 4336, "handSort": false}, {"language": "Tagalog", "quantity": 1248, "handSort": false}] },
            { "versionName": "LARGE PRINT", "pageCount": "24pg Self", "quantity": 947, "specs": {"size": "8.5 x 11", "binding": "Stitch on 11"}, "languageBreakdown": [{"language": "English", "quantity": 557, "handSort": false}, {"language": "Spanish", "quantity": 183, "handSort": true}, {"language": "Chinese", "quantity": 127, "handSort": true}, {"language": "Tagalog", "quantity": 80, "handSort": true}] }
          ]
        - Look for: "REGULAR PRINT", "LARGE PRINT", "Version A/B", "Standard/Large", different page counts per variant

    13. **Language/Version Quantity Breakdown (MANDATORY)**:
        **IMPORTANT: If you see language breakdowns like "English @ 69,481, Spanish @ 61,424", you MUST extract them!**
        - languageBreakdown: Array of {language, quantity} - EXAMPLE:
          [{"language": "English", "quantity": 70038}, {"language": "Spanish", "quantity": 61607}, {"language": "Chinese", "quantity": 4463}, {"language": "Tagalog", "quantity": 1328}]
        - totalVersionQuantity: Sum of all language quantities (e.g., 137436)

    14. **Timeline/Milestones (MANDATORY - Extract ALL dates mentioned)**:
        **IMPORTANT: Extract EVERY date mentioned into the timeline object!**
        - timeline: Object with ALL dates - EXAMPLE:
          {"orderDate": "2025-11-25", "filesDueDate": "2025-12-02", "proofDueDate": "2025-12-03 to 2025-12-05", "approvalDueDate": null, "productionStartDate": null, "dueDate": "2025-12-12", "mailDate": "2025-12-12", "uspsDeliveryDate": "2025-12-19", "inHomesDate": null}
        - Look for: "Files due by", "Proofs by", "Print ready by", "Mail by", "Deliver to USPS by"

    15. **Mailing Details (MANDATORY for Direct Mail jobs)**:
        **IMPORTANT: If this is a mail job, you MUST extract all mailing details!**
        - mailing: Object - EXAMPLE:
          {"isDirectMail": true, "mailClass": "Standard Mail", "mailProcess": "Secure Mail Process", "dropLocation": "SF USPS", "uspsRequirements": "Deliver to SF Post Office", "mailDatRequired": true, "mailDatResponsibility": "Lahlouh", "placardTagFiles": true, "presortType": "Standard"}
        - Look for: "STANDARD MAILING", "USPS", "MAIL.DAT", "presort", "drop", "Post Office"

    16. **Responsibility Matrix (MANDATORY)**:
        **IMPORTANT: Extract who does what and by when!**
        - responsibilities: Object with vendorTasks and customerTasks arrays - EXAMPLE:
          {"vendorTasks": [{"task": "Print, Inkjet, Trim, Fold, Stitch", "deadline": "2025-12-12"}, {"task": "Provide PDF proofs", "deadline": "2025-12-03"}, {"task": "Deliver to SF USPS", "deadline": "2025-12-19"}], "customerTasks": [{"task": "Provide print-ready files for English versions", "deadline": "2025-12-02"}, {"task": "Provide print-ready files for remaining versions", "deadline": "2025-12-03"}, {"task": "Upload to USPS MAIL.DAT", "deadline": null}, {"task": "Provide client approval of proofs", "deadline": null}]}
        - Look for: "JD GRAPHIC TO", "VENDOR TO", "LAHLOUH TO SUPPLY", "CUSTOMER TO"

    17. **Special Handling Requirements (MANDATORY if present)**:
        **IMPORTANT: If hand-sorting or special handling is mentioned, extract it!**
        - specialHandling: Object - EXAMPLE:
          {"handSortRequired": true, "handSortItems": ["Spanish Large Print", "Chinese Large Print", "Tagalog Large Print"], "handSortReason": "Not enough quantity for individual presorts - sort together based on OEL info for tray and sequencing", "rushJob": false, "fragile": false, "oversizedShipment": false, "customFlags": ["Produce as individual files then hand sort together to create one mailing"]}
        - Look for: "HAND SORT", "hand sorted together", "special handling"

    18. **Payment & Shipping Terms**:
        - paymentTerms: Payment terms (e.g., "Net 30", "Due on Receipt", "Net 45")
        - fob: FOB terms (e.g., "Delivered", "Origin", "Destination")
        - accountNumber: Customer account number if shown

    Return comprehensive JSON with ALL extracted fields:
    {
      customerName, contactPerson, contactEmail, contactPhone, customerAddress,
      poNumber, title, projectName,
      dueDate, mailDate, inHomesDate,
      shipToName, shipToAddress, shipVia, specialInstructions,
      specs: {
        productType, flatSize, finishedSize, paperType, paperWeight, coverPaperType,
        colors, coating, finishing, folds, perforations, dieCut,
        pageCount, bindingStyle, coverType, bleed, proofType
      },
      items: [{ description, quantity, pricePerThousand, lineTotal }],
      artworkInstructions, packingInstructions, labelingInstructions,
      additionalNotes,
      versions: [{ versionName, pageCount, quantity, specs, languageBreakdown }],
      languageBreakdown: [{ language, quantity }],
      totalVersionQuantity,
      timeline: { orderDate, filesDueDate, proofDueDate, approvalDueDate, productionStartDate, dueDate, mailDate, uspsDeliveryDate, inHomesDate },
      mailing: { isDirectMail, mailClass, mailProcess, dropLocation, uspsRequirements, mailDatRequired, mailDatResponsibility, placardTagFiles, presortType },
      responsibilities: { vendorTasks: [{ task, deadline }], customerTasks: [{ task, deadline }] },
      specialHandling: { handSortRequired, handSortItems, handSortReason, rushJob, fragile, oversizedShipment, customFlags },
      paymentTerms, fob, accountNumber
    }`;

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          ...imageContents,
          { type: 'text', text: prompt }
        ]
      }],
      max_tokens: 4096,
    });

    const text = response.choices[0]?.message?.content || '';

    if (!text) return {};

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);

    // Log the full parsed data for debugging
    console.log('📋 PO Parser (OpenAI) - Full AI Response:', JSON.stringify(parsed, null, 2));

    // Calculate total quantity from all line items
    const totalQuantity = parsed.items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;

    return {
      // Basic job info
      title: parsed.title || parsed.projectName || "PO Import",
      customerPONumber: parsed.poNumber,
      customerName: parsed.customerName,

      // Contact info
      contactPerson: parsed.contactPerson || null,
      contactEmail: parsed.contactEmail || null,
      contactPhone: parsed.contactPhone || null,
      customerAddress: parsed.customerAddress || null,

      // Dates - parse to Date objects if valid
      dueDate: parsed.dueDate ? new Date(parsed.dueDate).toISOString() : null,
      mailDate: parsed.mailDate ? new Date(parsed.mailDate).toISOString() : null,
      inHomesDate: parsed.inHomesDate ? new Date(parsed.inHomesDate).toISOString() : null,

      // Shipping
      shipToName: parsed.shipToName || null,
      shipToAddress: parsed.shipToAddress || null,
      shipVia: parsed.shipVia || null,

      // Total quantity from all items
      quantity: totalQuantity,

      // Comprehensive specs
      specs: {
        productType: parsed.specs?.productType || 'FLAT',
        flatSize: parsed.specs?.flatSize || null,
        finishedSize: parsed.specs?.finishedSize || null,
        paperType: parsed.specs?.paperType || null,
        paperWeight: parsed.specs?.paperWeight || null,
        coverPaperType: parsed.specs?.coverPaperType || null,
        colors: parsed.specs?.colors || null,
        coating: parsed.specs?.coating || null,
        finishing: parsed.specs?.finishing || null,
        folds: parsed.specs?.folds || null,
        perforations: parsed.specs?.perforations || null,
        dieCut: parsed.specs?.dieCut || null,
        pageCount: parsed.specs?.pageCount || null,
        bindingStyle: parsed.specs?.bindingStyle || null,
        coverType: parsed.specs?.coverType || null,
        bleed: parsed.specs?.bleed || null,
        proofType: parsed.specs?.proofType || null,
        // Combine all special instructions
        specialInstructions: [
          parsed.specialInstructions,
          parsed.artworkInstructions,
          parsed.packingInstructions,
          parsed.labelingInstructions
        ].filter(Boolean).join('\n\n') || null,
      },

      // Line items with smart price calculation
      lineItems: parsed.items?.map((i: any, index: number) => {
        const qty = i.quantity || 0;
        let lineTotal = 0;
        let unitPrice = 0;
        let pricePerThousand = i.pricePerThousand || 0;

        // Log warning if quantity is missing or suspicious
        if (!i.quantity || i.quantity === 0 || i.quantity === 1) {
          console.warn(`⚠️ PO Parser Warning: Item ${index + 1} has suspicious quantity:`, {
            description: i.description,
            extractedQuantity: i.quantity,
            rawItem: i
          });
        }

        // Smart Price Logic for /M (per thousand) pricing
        if (pricePerThousand > 0 && qty > 0) {
          // Price is per thousand - calculate correctly
          lineTotal = pricePerThousand * (qty / 1000);
          unitPrice = pricePerThousand / 1000;
          console.log(`💰 PO Parser: /M pricing detected - $${pricePerThousand}/M × ${qty / 1000} = $${lineTotal}`);
        } else if (i.lineTotal && i.lineTotal > 0) {
          // Explicit line total provided
          lineTotal = i.lineTotal;
          unitPrice = qty > 0 ? lineTotal / qty : 0;
        } else if (i.unitPrice && i.unitPrice > 0) {
          // Old unitPrice field (fallback)
          unitPrice = i.unitPrice;
          // Check if this looks like a /M rate (small number relative to quantity)
          if (unitPrice < 100 && qty >= 1000) {
            // Likely a per-thousand rate mistakenly put in unitPrice
            pricePerThousand = unitPrice;
            lineTotal = pricePerThousand * (qty / 1000);
            unitPrice = pricePerThousand / 1000;
            console.log(`💰 PO Parser: Detected /M rate in unitPrice - $${pricePerThousand}/M × ${qty / 1000} = $${lineTotal}`);
          } else {
            lineTotal = unitPrice * qty;
          }
        }

        return {
          description: i.description || "PO Item",
          quantity: qty,
          pricePerThousand: pricePerThousand,
          unitPrice: unitPrice,
          lineTotal: lineTotal,
          unitCost: 0, // Vendor cost unknown initially
          markupPercent: 0 // Margin unknown initially
        };
      }) || [],

      // Additional instructions (also stored separately for easy access)
      specialInstructions: parsed.specialInstructions || null,
      artworkInstructions: parsed.artworkInstructions || null,
      packingInstructions: parsed.packingInstructions || null,
      labelingInstructions: parsed.labelingInstructions || null,

      // Notes - capture ALL critical vendor information
      notes: parsed.additionalNotes || null,

      // Customer PO Total - sum of all line items for revenue display
      customerPOTotal: parsed.items?.reduce((sum: number, item: any) => sum + (item.lineTotal || 0), 0) || 0,

      // ===== PHASE 15: Enhanced Universal PO Parsing =====

      // Multiple Product Versions - for complex POs with variants
      versions: parsed.versions?.map((v: any) => ({
        versionName: v.versionName || 'Standard',
        pageCount: v.pageCount || null,
        quantity: v.quantity || 0,
        specs: v.specs || {},
        languageBreakdown: v.languageBreakdown?.map((lb: any) => ({
          language: lb.language,
          quantity: lb.quantity || 0,
          handSort: lb.handSort || false,
        })) || [],
      })) || [],

      // Top-level language breakdown summary
      languageBreakdown: parsed.languageBreakdown?.map((lb: any) => ({
        language: lb.language,
        quantity: lb.quantity || 0,
      })) || [],
      totalVersionQuantity: parsed.totalVersionQuantity || totalQuantity,

      // Timeline/Milestones - all dates for the job
      timeline: {
        orderDate: parsed.timeline?.orderDate || null,
        filesDueDate: parsed.timeline?.filesDueDate || null,
        proofDueDate: parsed.timeline?.proofDueDate || null,
        approvalDueDate: parsed.timeline?.approvalDueDate || null,
        productionStartDate: parsed.timeline?.productionStartDate || null,
        dueDate: parsed.timeline?.dueDate || parsed.dueDate || null,
        mailDate: parsed.timeline?.mailDate || parsed.mailDate || null,
        uspsDeliveryDate: parsed.timeline?.uspsDeliveryDate || null,
        inHomesDate: parsed.timeline?.inHomesDate || parsed.inHomesDate || null,
      },

      // Mailing details - for direct mail jobs
      mailing: {
        isDirectMail: parsed.mailing?.isDirectMail || false,
        mailClass: parsed.mailing?.mailClass || null,
        mailProcess: parsed.mailing?.mailProcess || null,
        dropLocation: parsed.mailing?.dropLocation || null,
        uspsRequirements: parsed.mailing?.uspsRequirements || null,
        mailDatRequired: parsed.mailing?.mailDatRequired || false,
        mailDatResponsibility: parsed.mailing?.mailDatResponsibility || null,
        placardTagFiles: parsed.mailing?.placardTagFiles || false,
        presortType: parsed.mailing?.presortType || null,
      },

      // Responsibility matrix - who does what
      responsibilities: {
        vendorTasks: parsed.responsibilities?.vendorTasks?.map((t: any) => ({
          task: t.task,
          deadline: t.deadline || null,
        })) || [],
        customerTasks: parsed.responsibilities?.customerTasks?.map((t: any) => ({
          task: t.task,
          deadline: t.deadline || null,
        })) || [],
      },

      // Special handling requirements
      specialHandling: {
        handSortRequired: parsed.specialHandling?.handSortRequired || false,
        handSortItems: parsed.specialHandling?.handSortItems || [],
        handSortReason: parsed.specialHandling?.handSortReason || null,
        rushJob: parsed.specialHandling?.rushJob || false,
        fragile: parsed.specialHandling?.fragile || false,
        oversizedShipment: parsed.specialHandling?.oversizedShipment || false,
        customFlags: parsed.specialHandling?.customFlags || [],
      },

      // Payment and shipping terms
      paymentTerms: parsed.paymentTerms || null,
      fob: parsed.fob || null,
      accountNumber: parsed.accountNumber || null,
    };

  } catch (e) {
    console.error("PO Parsing Error (OpenAI)", e);
    return {};
  }
};

export const generateEmailDraft = async (
  jobData: any,
  recipientName: string,
  type: 'QUOTE' | 'INVOICE' | 'VENDOR_PO',
  senderIdentity: 'NICK' | 'IDP' = 'IDP'
): Promise<string> => {
  try {
    let prompt = '';
    const signature = senderIdentity === 'NICK'
      ? "Nick\nJD Graphic / Impact Direct Team\nnick@jdgraphic.com"
      : "Brandon Ferris\nImpact Direct Printing\nBrandon@impactdirectprinting.com";

    if (type === 'VENDOR_PO') {
      prompt = `Write a professional email to vendor "${recipientName}" attaching Purchase Order #${jobData.vendorPONumber || 'TBD'}.
      Context: We are ordering Job #${jobData.number}: "${jobData.title}".
      Specs: ${jobData.specs?.productType} - ${jobData.lineItems?.[0]?.description}.
      Deadline: ${jobData.dueDate ? new Date(jobData.dueDate).toLocaleDateString() : 'ASAP'}.
      Sign off exactly as:
      ${signature}`;
    } else {
      prompt = `Write a professional, friendly email for "Impact Direct Printing" to customer "${recipientName}".
      Context: We are sending a ${type} for Job #${jobData.number}: "${jobData.title}".
      Job Description: ${jobData.lineItems?.map((i: any) => i.description).join(', ')}.
      Keep it brief and call to action.
      Sign off exactly as:
      ${signature}`;
    }

    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    });

    return response.choices[0]?.message?.content || "Could not generate email draft.";
  } catch (e) {
    console.error(e);
    return "Could not generate email draft.";
  }
};
