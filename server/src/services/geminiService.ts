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

    const prompt = `Analyze this Purchase Order (PO) for Impact Direct Printing.

    **Extraction Rules:**
    1. **Customer**: Identify the company sending the PO.
    2. **Quantity (CRITICAL)**:
       - ALWAYS extract the exact quantity from the PO.
       - Look for "Qty:", "Quantity:", "QTY", or numeric values near item descriptions.
       - Common quantities: 1000, 2500, 5000, 10000, etc.
       - NEVER default to 1 - if unclear, look harder at the document.
       - The quantity is a separate field from the price - do not confuse them.
    3. **Pricing**:
       - The price on the PO is the **Revenue** (Customer Price).
       - Set 'unitPrice' to this value.
       - IMPORTANT: If the unitPrice looks like a Total (e.g. > $100 for a quantity > 100), assume it is the 'Line Total'.
       - In your JSON, provide 'unitPrice' (per piece) and 'lineTotal' (total amount). Calculate unitPrice if only total is present.
    4. **Product Type**:
       - If "Book", "Catalog", "Magazine", "Booklet" is mentioned -> "BOOK".
       - If "Fold", "Brochure" -> "FOLDED".
       - Otherwise "FLAT".
    5. **Sizes**:
       - Extract "Flat Size" (unfolded/uncut size) -> map to 'flatSize'.
       - Extract "Finished Size" or "Final Size" or "Folded Size" -> map to 'finishedSize'.
       - Format as "Width x Height" (e.g., "8.5 x 11", "11 x 17").
    6. **Book Details**:
       - Look for "Page Count".
       - "Cover Type": "Plus Cover" vs "Self Cover".
       - "Stock" or "Cover Stock" -> map to 'coverPaperType'.
       - "Text" or "Text Weight" -> map to 'paperType'.
       - "Binding": Saddle Stitch, Perfect Bound, etc.
    7. **Line Items**:
       - Extract description, quantity (REQUIRED - look carefully!), and the total price.
       - Each item MUST have a quantity - it's one of the most important fields.

    Return clean JSON with: customerName, poNumber, title, specs (productType, flatSize, finishedSize, paperType, coverPaperType, colors, coating, finishing, pageCount, bindingStyle, coverType), items (EACH item must have: description, quantity, unitPrice or lineTotal)`;

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

    return {
      title: parsed.title || "PO Import",
      customerPONumber: parsed.poNumber,
      customerName: parsed.customerName,
      specs: {
        productType: parsed.specs?.productType || 'FLAT',
        ...parsed.specs
      },
      lineItems: parsed.items?.map((i: any, index: number) => {
        // Smart Price Logic: If unitPrice seems way too high, it might be a total
        let finalUnitPrice = i.unitPrice || 0;
        const qty = i.quantity || 0; // Changed from 1 to 0 to make missing quantities more obvious

        // Log warning if quantity is missing or suspicious
        if (!i.quantity || i.quantity === 0 || i.quantity === 1) {
          console.warn(`⚠️ PO Parser Warning: Item ${index + 1} has suspicious quantity:`, {
            description: i.description,
            extractedQuantity: i.quantity,
            rawItem: i
          });
        }

        // Heuristic: If UnitPrice > 100 and Qty > 100, it's likely a total disguised as a unit price
        // Or if lineTotal is explicitly provided
        if (i.lineTotal && i.lineTotal > 0 && qty > 0) {
          finalUnitPrice = i.lineTotal / qty;
        } else if (finalUnitPrice > 50 && qty > 50) {
          // Fallback heuristic
          finalUnitPrice = finalUnitPrice / qty;
        }

        return {
          description: i.description || "PO Item",
          quantity: qty,
          unitPrice: finalUnitPrice,
          unitCost: 0, // Vendor cost unknown initially
          markupPercent: 0 // Margin unknown initially
        };
      }) || []
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
