
import { GoogleGenAI, Type } from "@google/genai";
import { Job, ProductType } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const parsePrintSpecs = async (text: string): Promise<Partial<Job>> => {
  if (!text.trim()) return {};

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract commercial printing specifications from the following request into a structured JSON object. 
      The user is a print broker at Impact Direct Printing.
      
      Specific Instructions:
      1. **Product Type**: Determine if it is a BOOK (catalog, booklet, mag), FLAT (flyer, card), or FOLDED (brochure).
      2. **Colors**: Identify "4/4", "4/1", "PMS".
      3. **Books**: Look for "Page Count", "Binding" (Saddle Stitch, Perfect), "Plus Cover" vs "Self Cover".
         - If "Plus Cover", extract distinct "coverPaperType".
      4. **Sizes**: Map "Flat Size" and "Finished/Folded Size".
      
      Request: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            specs: {
              type: Type.OBJECT,
              properties: {
                productType: { type: Type.STRING, enum: ["BOOK", "FLAT", "FOLDED", "OTHER"] },
                paperType: { type: Type.STRING, description: "Text stock or main stock" },
                coverPaperType: { type: Type.STRING, description: "Cover stock if different" },
                flatSize: { type: Type.STRING },
                finishedSize: { type: Type.STRING },
                colors: { type: Type.STRING },
                coating: { type: Type.STRING },
                finishing: { type: Type.STRING },
                pageCount: { type: Type.NUMBER },
                bindingStyle: { type: Type.STRING },
                coverType: { type: Type.STRING, enum: ["SELF", "PLUS"] }
              }
            }
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) return {};
    
    const parsed = JSON.parse(jsonText);
    
    return {
      title: parsed.title || "New Print Job",
      specs: {
          productType: (parsed.specs?.productType as ProductType) || 'FLAT',
          ...parsed.specs
      },
      items: [
        {
          id: crypto.randomUUID(),
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

export const parsePurchaseOrder = async (base64Data: string, mimeType: string): Promise<Partial<Job> & { customerName?: string }> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                },
                {
                    text: `Analyze this Purchase Order (PO) for Impact Direct Printing.
                    
                    **Extraction Rules:**
                    1. **Customer**: Identify the company sending the PO.
                    2. **Pricing**: 
                       - The price on the PO is the **Revenue** (Customer Price). 
                       - Set 'unitPrice' to this value.
                       - IMPORTANT: If the unitPrice looks like a Total (e.g. > $100 for a quantity > 100), assume it is the 'Line Total'. 
                       - In your JSON, provide 'unitPrice' (per piece) and 'lineTotal' (total amount). Calculate unitPrice if only total is present.
                    3. **Product Type**:
                       - If "Book", "Catalog", "Magazine", "Booklet" is mentioned -> "BOOK".
                       - If "Fold", "Brochure" -> "FOLDED".
                       - Otherwise "FLAT".
                    4. **Book Details**:
                       - Look for "Page Count".
                       - "Cover Type": "Plus Cover" vs "Self Cover".
                       - "Stock" or "Cover Stock" -> map to 'coverPaperType'.
                       - "Text" or "Text Weight" -> map to 'paperType'.
                       - "Binding": Saddle Stitch, Perfect Bound, etc.
                    5. **Line Items**:
                       - Extract description, quantity, and the total price.

                    Return clean JSON.`
                }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        customerName: { type: Type.STRING },
                        poNumber: { type: Type.STRING },
                        title: { type: Type.STRING },
                        specs: {
                            type: Type.OBJECT,
                            properties: {
                                productType: { type: Type.STRING, enum: ["BOOK", "FLAT", "FOLDED", "OTHER"] },
                                paperType: { type: Type.STRING },
                                coverPaperType: { type: Type.STRING },
                                flatSize: { type: Type.STRING },
                                finishedSize: { type: Type.STRING },
                                colors: { type: Type.STRING },
                                coating: { type: Type.STRING },
                                finishing: { type: Type.STRING },
                                pageCount: { type: Type.NUMBER },
                                bindingStyle: { type: Type.STRING },
                                coverType: { type: Type.STRING, enum: ["SELF", "PLUS"] }
                            }
                        },
                        items: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    description: { type: Type.STRING },
                                    quantity: { type: Type.NUMBER },
                                    unitPrice: { type: Type.NUMBER },
                                    lineTotal: { type: Type.NUMBER }
                                }
                            }
                        }
                    }
                }
            }
        });

        const text = response.text;
        if (!text) return {};
        const parsed = JSON.parse(text);
        
        return {
            title: parsed.title || "PO Import",
            customerPONumber: parsed.poNumber,
            customerName: parsed.customerName,
            specs: {
                productType: (parsed.specs?.productType as ProductType) || 'FLAT',
                ...parsed.specs
            },
            items: parsed.items?.map((i: any) => {
                // Smart Price Logic: If unitPrice seems way too high, it might be a total
                let finalUnitPrice = i.unitPrice || 0;
                const qty = i.quantity || 1;
                
                // Heuristic: If UnitPrice > 100 and Qty > 100, it's likely a total disguised as a unit price
                // Or if lineTotal is explicitly provided
                if (i.lineTotal && i.lineTotal > 0) {
                    finalUnitPrice = i.lineTotal / qty;
                } else if (finalUnitPrice > 50 && qty > 50) {
                     // Fallback heuristic
                     finalUnitPrice = finalUnitPrice / qty;
                }

                return {
                    id: crypto.randomUUID(),
                    description: i.description || "PO Item",
                    quantity: qty,
                    unitPrice: finalUnitPrice,
                    unitCost: 0, // Vendor cost unknown initially
                    markupPercent: 0 // Margin unknown initially
                };
            })
        };

    } catch (e) {
        console.error("PO Parsing Error", e);
        return {};
    }
};

export const generateEmailDraft = async (
    job: Job, 
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
            prompt = `Write a professional email to vendor "${recipientName}" attaching Purchase Order #${job.vendorPONumber || 'TBD'}.
            Context: We are ordering Job #${job.number}: "${job.title}".
            Specs: ${job.specs.productType} - ${job.items[0]?.description}.
            Deadline: ${job.dueDate ? new Date(job.dueDate).toLocaleDateString() : 'ASAP'}.
            Sign off exactly as:
            ${signature}`;
        } else {
            prompt = `Write a professional, friendly email for "Impact Direct Printing" to customer "${recipientName}".
            Context: We are sending a ${type} for Job #${job.number}: "${job.title}".
            Job Description: ${job.items.map(i => i.description).join(', ')}.
            Keep it brief and call to action.
            Sign off exactly as:
            ${signature}`;
        }

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        return response.text || "";
    } catch (e) {
        console.error(e);
        return "Could not generate email draft.";
    }
}
