import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const parsePrintSpecs = async (text: string): Promise<any> => {
  if (!text.trim()) return {};

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text();

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
    console.error("Gemini parsing error:", error);
    return {};
  }
};

export const parsePurchaseOrder = async (base64Data: string, mimeType: string): Promise<any> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are analyzing a Purchase Order (PO) for Impact Direct Printing, a commercial print broker.

    IMPORTANT: POs come from MANY different customers with DIFFERENT formats. Be flexible and thorough.
    Look for information ANYWHERE on the document - headers, footers, tables, sidebars, notes sections.

    **EXTRACTION RULES:**

    1. **Customer/Company Info**:
       - customerName: Company name sending the PO (look for "Bill To", "From", letterhead, logo)
       - contactPerson: Contact name if shown
       - contactEmail: Email address
       - contactPhone: Phone number
       - customerAddress: Billing address if shown

    2. **PO Details**:
       - poNumber: The PO number (look for "PO#", "PO:", "Purchase Order #", "Order #", "Reference #")
       - title: Job name/title/description (the main product being ordered)
       - projectName: Project or campaign name if different from title

    3. **Dates**:
       - dueDate: Delivery date, ship date, due date, "need by", "required by" date
       - mailDate: For direct mail - "mail date", "drop date", "pool date", "mailing date"
       - inHomesDate: "In-homes date" or "in-home date" for direct mail
       - Format all dates as "YYYY-MM-DD"

    4. **Shipping/Delivery**:
       - shipToName: Ship-to company or person name
       - shipToAddress: Full shipping address (may have multiple - capture primary)
       - shipVia: Shipping method if specified
       - specialInstructions: ANY notes, instructions, special requirements ANYWHERE on the PO

    5. **PRICING - CRITICAL (This is the customer's price = our revenue)**:

       a) **Look for PO Grand Total**:
          - poTotal: The GRAND TOTAL / TOTAL AMOUNT on the PO (e.g., $2,400.00)
          - Look for "Total:", "Grand Total:", "Amount Due:", "PO Total:", bottom-right totals

       b) **Per-Unit Pricing**:
          - unitPrice: Price per single piece (e.g., "$8.00 each", "$8.00/ea")
          - If you see "$8.00 each" or "$8.00/ea" → unitPrice = 8.00

       c) **Per-Thousand Pricing (/M)**:
          - pricePerThousand: Rate per 1,000 pieces
          - "$35.00/M" means $35.00 per 1,000 pieces
          - For 30,000 qty at $35/M: lineTotal = 35 × 30 = $1,050 (NOT $35 × 30,000)

       d) **Line Totals**:
          - lineTotal: Extended price for each line item
          - = unitPrice × quantity, OR = pricePerThousand × (quantity / 1000)

    6. **QUANTITY - CRITICAL**:
       - Extract the EXACT product quantity (not shipping splits)
       - Look for "Qty:", "Quantity:", "QTY", numbers near product descriptions
       - Common print quantities: 250, 500, 1000, 2500, 5000, 10000, 25000, 50000
       - If quantity shows as "300" for printing - that's the print quantity
       - Shipping splits (200 here, 100 there) add up to print quantity

    7. **Product Type**:
       - "BOOK": catalog, magazine, booklet, program, annual report, perfect bound, saddle stitch
       - "FOLDED": brochure, folder, mailer with folds
       - "FLAT": flyer, postcard, sell sheet, poster, card, single sheet

    8. **Print Specifications - Extract ALL you can find**:
       - flatSize: Unfolded/flat size
       - finishedSize: Final trimmed size (e.g., "8.5 x 11", "6 x 9")
       - paperType: Body/text paper (e.g., "70# Gloss Text", "80# Matte")
       - paperWeight: Paper weight if separate
       - coverPaperType: Cover stock for books (e.g., "80# Matte Cover")
       - colors: Print colors (e.g., "4/4" = full color both sides, "4/1", "4/0")
       - coating: AQ, UV, Matte, Gloss, Satin, Soft Touch
       - finishing: Score, Die Cut, Emboss, Foil, Drill
       - folds: Tri-fold, Z-fold, Gate fold, etc.
       - pageCount: For books - "132 pages", "16pp", "24 + cover"
       - bindingStyle: Saddle Stitch, Perfect Bound, Wire-O, Spiral, Case Bound
       - coverType: "PLUS" (separate cover stock) or "SELF" (self-cover)

    9. **LINE ITEMS - CRITICAL**:
       Each item needs a "type" to distinguish products from services:

       - type: "PRODUCT" (printed materials), "SHIPPING" (freight/delivery), "SERVICE" (other charges)
       - description: What it is
       - quantity: How many (REQUIRED for PRODUCT items)
       - unitPrice: Price per single unit (e.g., 8.00 for "$8.00 each")
       - pricePerThousand: If /M pricing
       - lineTotal: Extended total for this line

       Examples:
       - "300 Catalogs @ $8.00 each = $2,400" → type: "PRODUCT", qty: 300, unitPrice: 8.00, lineTotal: 2400
       - "Freight to NY" → type: "SHIPPING"
       - "Rush fee" → type: "SERVICE"

    10. **Additional Fields**:
        - artworkInstructions: Instructions about artwork, files
        - packingInstructions: How to pack/box
        - labelingInstructions: Labeling requirements
        - notes: Anything else important that doesn't fit above

    **RETURN THIS JSON STRUCTURE:**
    {
      "customerName": "string",
      "contactPerson": "string or null",
      "contactEmail": "string or null",
      "contactPhone": "string or null",
      "customerAddress": "string or null",
      "poNumber": "string",
      "title": "string - main product description",
      "projectName": "string or null",
      "poTotal": number (GRAND TOTAL on the PO - this is critical!),
      "dueDate": "YYYY-MM-DD or null",
      "mailDate": "YYYY-MM-DD or null",
      "inHomesDate": "YYYY-MM-DD or null",
      "shipToName": "string or null",
      "shipToAddress": "string or null",
      "shipVia": "string or null",
      "specialInstructions": "string or null",
      "specs": {
        "productType": "BOOK|FLAT|FOLDED",
        "flatSize": "string or null",
        "finishedSize": "string or null",
        "paperType": "string or null",
        "paperWeight": "string or null",
        "coverPaperType": "string or null",
        "colors": "string or null",
        "coating": "string or null",
        "finishing": "string or null",
        "folds": "string or null",
        "pageCount": "string or null",
        "bindingStyle": "string or null",
        "coverType": "PLUS|SELF|null"
      },
      "items": [
        {
          "type": "PRODUCT|SHIPPING|SERVICE",
          "description": "string",
          "quantity": number,
          "unitPrice": number (price per single unit),
          "pricePerThousand": number or null,
          "lineTotal": number
        }
      ],
      "artworkInstructions": "string or null",
      "packingInstructions": "string or null",
      "labelingInstructions": "string or null",
      "notes": "string or null"
    }`;

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      },
      { text: prompt }
    ]);

    const response = await result.response;
    const text = response.text();

    if (!text) return {};

    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);

    // Log the full parsed data for debugging
    console.log('📋 PO Parser - Full AI Response:', JSON.stringify(parsed, null, 2));

    // Calculate total quantity from PRODUCT items only (exclude shipping/service)
    const totalQuantity = parsed.items
      ?.filter((item: any) => item.type === 'PRODUCT' || !item.type)
      .reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;

    return {
      // Basic job info
      title: parsed.title || parsed.projectName || "PO Import",
      customerPONumber: parsed.poNumber,
      customerName: parsed.customerName,

      // PO Total (sell price) - the grand total from the customer's PO
      poTotal: parsed.poTotal || null,

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
          type: i.type || 'PRODUCT', // PRODUCT, SHIPPING, or SERVICE
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
    };

  } catch (e) {
    console.error("PO Parsing Error", e);
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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

    const result = await model.generateContent(prompt);
    const response = await result.response;

    return response.text() || "";
  } catch (e) {
    console.error(e);
    return "Could not generate email draft.";
  }
};
