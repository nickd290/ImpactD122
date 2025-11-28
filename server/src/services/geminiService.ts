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

    const prompt = `Analyze this Purchase Order (PO) for Impact Direct Printing. Extract ALL available information.

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
       - shipToName: Ship-to company or person name
       - shipToAddress: Full shipping address
       - shipVia: Shipping method if specified
       - specialInstructions: ANY notes, instructions, or special requirements mentioned ANYWHERE on the PO

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

    7. **Product Type**:
       - "BOOK": catalog, magazine, booklet, program, annual report
       - "FOLDED": brochure, folder, mailer with folds
       - "FLAT": flyer, postcard, sell sheet, poster, card

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
      artworkInstructions, packingInstructions, labelingInstructions
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
