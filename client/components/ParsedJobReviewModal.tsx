import React, { useState, useEffect } from 'react';
import { FileText, X, AlertCircle, Plus, Trash2, UserPlus, Mail, Zap } from 'lucide-react';
import { entitiesApi, jobsApi } from '../lib/api';
import { getBradfordSizes, getBradfordPricing, isBradfordSize } from '../utils/bradfordPricing';

interface ParsedJobReviewModalProps {
  parsedData: any;
  customers: any[];
  vendors: any[];
  onCancel: () => void;
  onCreate: (jobData: any) => void;
  onSaveDraft: (jobData: any) => void;
}

export function ParsedJobReviewModal({
  parsedData,
  customers,
  vendors,
  onCancel,
  onCreate,
  onSaveDraft
}: ParsedJobReviewModalProps) {
  // Basic Info
  const [title, setTitle] = useState(parsedData.title || 'New Print Job');
  const [jobType, setJobType] = useState<'single' | 'multipart'>('single');
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [customerPONumber, setCustomerPONumber] = useState(parsedData.customerPONumber || '');
  const [bradfordRefNumber, setBradfordRefNumber] = useState(parsedData.bradfordRefNumber || '');
  // Parse due date from parsedData if available
  const [dueDate, setDueDate] = useState(() => {
    if (parsedData.dueDate) {
      const d = new Date(parsedData.dueDate);
      return d.toISOString().split('T')[0];
    }
    return '';
  });
  const [mailDate, setMailDate] = useState(() => {
    if (parsedData.mailDate) {
      const d = new Date(parsedData.mailDate);
      return d.toISOString().split('T')[0];
    }
    return '';
  });
  const [inHomesDate, setInHomesDate] = useState(() => {
    if (parsedData.inHomesDate) {
      const d = new Date(parsedData.inHomesDate);
      return d.toISOString().split('T')[0];
    }
    return '';
  });
  // Combine special instructions into notes
  const [notes, setNotes] = useState(
    parsedData.notes ||
    parsedData.specs?.specialInstructions ||
    parsedData.specialInstructions ||
    ''
  );

  // Shipping info from PO
  const [shipToAddress, setShipToAddress] = useState(parsedData.shipToAddress || '');

  // New Customer Form
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerContact, setNewCustomerContact] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [unmatchedCustomerName, setUnmatchedCustomerName] = useState('');

  // New Vendor Form
  const [showNewVendorForm, setShowNewVendorForm] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorContact, setNewVendorContact] = useState('');
  const [creatingVendor, setCreatingVendor] = useState(false);

  // Specifications
  const [productType, setProductType] = useState(parsedData.specs?.productType || 'FLAT');
  const [paperType, setPaperType] = useState(parsedData.specs?.paperType || '');
  const [paperWeight, setPaperWeight] = useState(parsedData.specs?.paperWeight || '');
  const [colors, setColors] = useState(parsedData.specs?.colors || '');
  const [coating, setCoating] = useState(parsedData.specs?.coating || '');
  const [finishing, setFinishing] = useState(parsedData.specs?.finishing || '');
  const [folds, setFolds] = useState(parsedData.specs?.folds || '');
  const [perforations, setPerforations] = useState(parsedData.specs?.perforations || '');
  const [dieCut, setDieCut] = useState(parsedData.specs?.dieCut || '');
  const [flatSize, setFlatSize] = useState(parsedData.specs?.flatSize || '');
  const [finishedSize, setFinishedSize] = useState(parsedData.specs?.finishedSize || '');

  // Quantity from parsed data
  const [quantity, setQuantity] = useState(parsedData.quantity || 0);

  // Book-Specific
  const [pageCount, setPageCount] = useState(parsedData.specs?.pageCount || 0);
  const [bindingStyle, setBindingStyle] = useState(parsedData.specs?.bindingStyle || '');
  const [coverType, setCoverType] = useState(parsedData.specs?.coverType || '');
  const [coverPaperType, setCoverPaperType] = useState(parsedData.specs?.coverPaperType || '');

  // Line Items
  const [lineItems, setLineItems] = useState(
    parsedData.lineItems && parsedData.lineItems.length > 0
      ? parsedData.lineItems
      : [{ description: '', quantity: 0, unitCost: 0, unitPrice: 0, markupPercent: 30 }]
  );

  // Bradford Size & Pricing
  const [useCustomSize, setUseCustomSize] = useState(false);
  const [customSizeValue, setCustomSizeValue] = useState('');
  const [bradfordPrintCPM, setBradfordPrintCPM] = useState(0);
  const [bradfordPaperCostCPM, setBradfordPaperCostCPM] = useState(0);
  const [bradfordPaperSellCPM, setBradfordPaperSellCPM] = useState(0);
  // Total cost to Impact = Paper SELL + Print (NOT paper cost)
  const [impactTotalCostCPM, setImpactTotalCostCPM] = useState(0);

  // Mailing Type Detection
  const [jobCategory, setJobCategory] = useState<'print' | 'mailing'>('print');
  const [mailFormat, setMailFormat] = useState<'SELF_MAILER' | 'POSTCARD' | 'ENVELOPE' | null>(null);
  const [envelopeComponents, setEnvelopeComponents] = useState<number>(2);
  const [detectionResult, setDetectionResult] = useState<{
    isMailing: boolean;
    suggestedFormat: 'SELF_MAILER' | 'POSTCARD' | 'ENVELOPE' | null;
    confidence: 'high' | 'medium' | 'low';
    signals: string[];
    envelopeComponents?: number;
  } | null>(null);
  const [detectingMailing, setDetectingMailing] = useState(false);

  // Component details for envelope mailings
  const [envelopeComponentList, setEnvelopeComponentList] = useState<{
    name: string;
    size: string;
  }[]>([
    { name: '', size: '' },
    { name: '', size: '' }
  ]);

  // Check for unmatched customer on mount and pre-fill contact info
  useEffect(() => {
    if (parsedData.customerName) {
      const matchingCustomer = customers.find(c =>
        c.name?.toLowerCase().includes(parsedData.customerName.toLowerCase()) ||
        parsedData.customerName.toLowerCase().includes(c.name?.toLowerCase() ?? '')
      );

      if (matchingCustomer) {
        setCustomerId(matchingCustomer.id);
      } else {
        setUnmatchedCustomerName(parsedData.customerName);
        setNewCustomerName(parsedData.customerName);
        // Pre-fill contact info from parsed data
        if (parsedData.contactPerson) setNewCustomerContact(parsedData.contactPerson);
        if (parsedData.contactEmail) setNewCustomerEmail(parsedData.contactEmail);
        if (parsedData.contactPhone) setNewCustomerPhone(parsedData.contactPhone);
      }
    }
  }, []);

  // Auto-detect Bradford size from parsed data and set vendor/size
  useEffect(() => {
    const parsedSize = parsedData.specs?.finishedSize;
    if (parsedSize) {
      // Normalize the size format (handle "6x11" vs "6 x 11")
      const normalizedSize = parsedSize.replace(/\s*x\s*/gi, ' x ').trim();

      // Check if it's a Bradford size
      if (isBradfordSize(normalizedSize)) {
        setFinishedSize(normalizedSize);

        // Auto-select Bradford vendor if available
        const bradfordVendor = vendors.find(v =>
          v.isPartner === true ||
          v.name?.toLowerCase().includes('bradford')
        );
        if (bradfordVendor && !vendorId) {
          setVendorId(bradfordVendor.id);
          console.log(`🏭 Auto-selected Bradford vendor for size: ${normalizedSize}`);
        }
      } else {
        // Check common size variations
        const sizeVariations: { [key: string]: string } = {
          '6x11': '6 x 11',
          '6x9': '6 x 9',
          '6 x 9': '6 x 9',
          '6 x 11': '6 x 11',
        };
        const mappedSize = sizeVariations[parsedSize.toLowerCase().replace(/\s+/g, '')] || parsedSize;

        if (isBradfordSize(mappedSize)) {
          setFinishedSize(mappedSize);
          const bradfordVendor = vendors.find(v =>
            v.isPartner === true ||
            v.name?.toLowerCase().includes('bradford')
          );
          if (bradfordVendor && !vendorId) {
            setVendorId(bradfordVendor.id);
            console.log(`🏭 Auto-selected Bradford vendor for mapped size: ${mappedSize}`);
          }
        } else {
          setFinishedSize(parsedSize);
        }
      }
    }
  }, [parsedData.specs?.finishedSize, vendors]);

  // Get selected Bradford vendor
  const selectedVendor = vendors.find(v => v.id === vendorId);
  const isBradfordVendor = selectedVendor?.isPartner === true;

  // Auto-calculate Bradford pricing when vendor and size change
  // CORRECT BUSINESS LOGIC:
  // - Impact pays Bradford: Paper SELL price (with 18% markup) + Print (passthrough from JD)
  // - Profit = Customer Revenue - Impact's Total Cost
  // - 50/50 split on the profit
  // - Bradford also keeps the paper markup (difference between paper sell and paper cost)
  useEffect(() => {
    if (isBradfordVendor && finishedSize && !useCustomSize) {
      const pricing = getBradfordPricing(finishedSize);
      if (pricing) {
        setBradfordPrintCPM(pricing.printCPM);
        setBradfordPaperCostCPM(pricing.costCPMPaper);
        setBradfordPaperSellCPM(pricing.sellCPMPaper);
        // Impact's Total Cost = Paper SELL + Print (NOT paper cost!)
        const totalCostToImpact = pricing.sellCPMPaper + pricing.printCPM;
        setImpactTotalCostCPM(totalCostToImpact);

        // Auto-apply Bradford costs to line items
        const updatedLineItems = lineItems.map((item: any) => {
          const qty = item.quantity || 0;
          // Calculate unit cost based on Impact's cost (paper sell + print)
          const unitCostFromBradford = totalCostToImpact / 1000; // Cost per piece
          const totalCost = qty > 0 ? totalCostToImpact * (qty / 1000) : 0;

          return {
            ...item,
            unitCost: unitCostFromBradford,
            bradfordPrintCost: qty > 0 ? pricing.printCPM * (qty / 1000) : 0,
            bradfordPaperSellCost: qty > 0 ? pricing.sellCPMPaper * (qty / 1000) : 0,
            bradfordTotalCost: totalCost,
          };
        });
        setLineItems(updatedLineItems);
      } else {
        setBradfordPrintCPM(0);
        setBradfordPaperCostCPM(0);
        setBradfordPaperSellCPM(0);
        setImpactTotalCostCPM(0);
      }
    } else {
      setBradfordPrintCPM(0);
      setBradfordPaperCostCPM(0);
      setBradfordPaperSellCPM(0);
      setImpactTotalCostCPM(0);
    }
  }, [vendorId, finishedSize, useCustomSize, isBradfordVendor]);

  // Mailing type auto-detection on mount
  useEffect(() => {
    const detectMailing = async () => {
      setDetectingMailing(true);
      try {
        const result = await jobsApi.detectMailingType({
          mailDate: parsedData.mailDate || parsedData.timeline?.mailDate,
          inHomesDate: parsedData.inHomesDate || parsedData.timeline?.inHomesDate,
          matchType: parsedData.matchType,
          notes: parsedData.notes || parsedData.specs?.specialInstructions,
          mailing: parsedData.mailing,
          timeline: parsedData.timeline,
          components: parsedData.productComponents,
          specs: parsedData.specs,
          title: parsedData.title,
        });
        setDetectionResult(result);
        // Auto-apply detection if high/medium confidence
        if (result.isMailing && result.confidence !== 'low') {
          setJobCategory('mailing');
          if (result.suggestedFormat) {
            setMailFormat(result.suggestedFormat);
          }
          if (result.envelopeComponents) {
            setEnvelopeComponents(result.envelopeComponents);
          }
        }
      } catch (error) {
        console.error('Mailing detection error:', error);
      } finally {
        setDetectingMailing(false);
      }
    };
    detectMailing();
  }, []); // Run once on mount

  // Sync envelope component list size with count
  useEffect(() => {
    setEnvelopeComponentList(prev => {
      const newList = [...prev];
      while (newList.length < envelopeComponents) {
        newList.push({ name: '', size: '' });
      }
      return newList.slice(0, envelopeComponents);
    });
  }, [envelopeComponents]);

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 0, unitCost: 0, unitPrice: 0, markupPercent: 30 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_: any, i: number) => i !== index));
  };

  const handleLineItemChange = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const handleCreateNewCustomer = async () => {
    if (!newCustomerName.trim()) {
      alert('Customer name is required');
      return;
    }

    try {
      setCreatingCustomer(true);
      const newCustomer = await entitiesApi.create({
        type: 'CUSTOMER',
        name: newCustomerName,
        email: newCustomerEmail || '',
        phone: newCustomerPhone || '',
        address: '',
        contactPerson: newCustomerContact || '',
      });

      // Add to customers list and select it
      customers.push(newCustomer);
      setCustomerId(newCustomer.id);
      setShowNewCustomerForm(false);
      setUnmatchedCustomerName('');
    } catch (error) {
      console.error('Failed to create customer:', error);
      alert('Failed to create customer. Please try again.');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handleCreateNewVendor = async () => {
    if (!newVendorName.trim()) {
      alert('Vendor name is required');
      return;
    }

    try {
      setCreatingVendor(true);
      const newVendor = await entitiesApi.create({
        type: 'VENDOR',
        name: newVendorName,
        email: newVendorEmail || '',
        phone: newVendorPhone || '',
        address: '',
        contactPerson: newVendorContact || '',
      });

      // Add to vendors list and select it
      vendors.push(newVendor);
      setVendorId(newVendor.id);
      setShowNewVendorForm(false);
      // Clear form
      setNewVendorName('');
      setNewVendorEmail('');
      setNewVendorPhone('');
      setNewVendorContact('');
    } catch (error) {
      console.error('Failed to create vendor:', error);
      alert('Failed to create vendor. Please try again.');
    } finally {
      setCreatingVendor(false);
    }
  };

  const handleCreate = () => {
    const jobData = {
      title,
      customerId,
      vendorId: jobType === 'single' ? vendorId : undefined, // No vendor for multipart (assigned per component)
      customerPONumber,
      bradfordRefNumber,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      mailDate: mailDate ? new Date(mailDate).toISOString() : undefined,
      inHomesDate: inHomesDate ? new Date(inHomesDate).toISOString() : undefined,
      notes,
      quantity: quantity || undefined,
      // Job type for multi-part vs single vendor workflow
      jobType,
      // Product components for multi-part jobs (blanket PO)
      productComponents: jobType === 'multipart' ? parsedData.productComponents : undefined,
      // Raw description text from PO
      rawDescriptionText: parsedData.rawDescriptionText || undefined,
      specs: {
        productType,
        paperType,
        paperWeight,
        colors,
        coating,
        finishing,
        folds,
        perforations,
        dieCut,
        flatSize,
        finishedSize,
        pageCount: pageCount || undefined,
        bindingStyle,
        coverType,
        coverPaperType,
        shipToAddress: shipToAddress || undefined,
      },
      lineItems,
      status: 'ACTIVE',
      // Bradford pricing data for auto-PO creation (only for single-vendor Bradford jobs)
      // CORRECT: Impact's cost = Paper SELL + Print, then 50/50 profit split
      isBradfordJob: jobType === 'single' && isBradfordVendor && isBradfordSize(finishedSize),
      bradfordPricing: jobType === 'single' && isBradfordVendor && isBradfordSize(finishedSize) ? {
        printCPM: bradfordPrintCPM,
        paperCostCPM: bradfordPaperCostCPM,
        paperSellCPM: bradfordPaperSellCPM,
        impactTotalCostCPM: impactTotalCostCPM, // Paper SELL + Print
        // Total amounts
        totalPrintCost: quantity > 0 ? bradfordPrintCPM * (quantity / 1000) : 0,
        totalPaperCost: quantity > 0 ? bradfordPaperCostCPM * (quantity / 1000) : 0,
        totalPaperSell: quantity > 0 ? bradfordPaperSellCPM * (quantity / 1000) : 0,
        totalCostToImpact: quantity > 0 ? impactTotalCostCPM * (quantity / 1000) : 0,
        // Bradford's paper profit (separate from 50/50 split)
        bradfordPaperProfit: quantity > 0 ? (bradfordPaperSellCPM - bradfordPaperCostCPM) * (quantity / 1000) : 0,
      } : undefined,
      // Mailing type fields
      jobMetaType: jobCategory === 'mailing' ? 'MAILING' : 'JOB',
      mailFormat: jobCategory === 'mailing' ? mailFormat : null,
      envelopeComponents: jobCategory === 'mailing' && mailFormat === 'ENVELOPE' ? envelopeComponents : null,
      // Envelope component details
      components: jobCategory === 'mailing' && mailFormat === 'ENVELOPE'
        ? envelopeComponentList.map((comp, idx) => ({
            name: comp.name || `Component ${idx + 1}`,
            specs: { size: comp.size },
            sortOrder: idx
          }))
        : undefined,
    };
    onCreate(jobData);
  };

  const handleSaveDraft = () => {
    const jobData = {
      title,
      customerId,
      vendorId: jobType === 'single' ? vendorId : undefined,
      customerPONumber,
      bradfordRefNumber,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      mailDate: mailDate ? new Date(mailDate).toISOString() : undefined,
      inHomesDate: inHomesDate ? new Date(inHomesDate).toISOString() : undefined,
      notes,
      quantity: quantity || undefined,
      jobType,
      productComponents: jobType === 'multipart' ? parsedData.productComponents : undefined,
      rawDescriptionText: parsedData.rawDescriptionText || undefined,
      specs: {
        productType,
        paperType,
        paperWeight,
        colors,
        coating,
        finishing,
        folds,
        perforations,
        dieCut,
        flatSize,
        finishedSize,
        pageCount: pageCount || undefined,
        bindingStyle,
        coverType,
        coverPaperType,
        shipToAddress: shipToAddress || undefined,
      },
      lineItems,
      status: 'ACTIVE',
      // Mailing type fields
      jobMetaType: jobCategory === 'mailing' ? 'MAILING' : 'JOB',
      mailFormat: jobCategory === 'mailing' ? mailFormat : null,
      envelopeComponents: jobCategory === 'mailing' && mailFormat === 'ENVELOPE' ? envelopeComponents : null,
      // Envelope component details
      components: jobCategory === 'mailing' && mailFormat === 'ENVELOPE'
        ? envelopeComponentList.map((comp, idx) => ({
            name: comp.name || `Component ${idx + 1}`,
            specs: { size: comp.size },
            sortOrder: idx
          }))
        : undefined,
    };
    onSaveDraft(jobData);
  };

  // Vendor not required for multipart jobs (assigned per component later)
  const hasWarnings = !customerId || (jobType === 'single' && !vendorId) || lineItems.some((item: any) => !item.description || !item.quantity || item.quantity <= 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-white flex-shrink-0">
          <div className="flex items-center space-x-2">
            <FileText className="w-6 h-6 text-orange-600" />
            <h3 className="text-xl font-bold">Review AI-Parsed Job</h3>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Warnings */}
          {hasWarnings && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">Please review these fields:</p>
                <ul className="list-disc list-inside space-y-1">
                  {!customerId && <li>Customer is required</li>}
                  {jobType === 'single' && !vendorId && <li>Vendor is required for single-vendor jobs</li>}
                  {lineItems.some((item: any) => !item.description) && <li>Line item descriptions are required</li>}
                  {lineItems.some((item: any) => item.quantity <= 0) && <li>Line item quantities must be greater than 0</li>}
                </ul>
              </div>
            </div>
          )}

          {/* Unmatched Customer Warning */}
          {unmatchedCustomerName && !showNewCustomerForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 mb-2">
                    Customer "{unmatchedCustomerName}" not found in database
                  </p>
                  <p className="text-sm text-blue-800 mb-3">
                    Would you like to add this customer or select an existing one?
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowNewCustomerForm(true)}
                      className="flex items-center space-x-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Add New Customer</span>
                    </button>
                    <button
                      onClick={() => setUnmatchedCustomerName('')}
                      className="px-4 py-2 border border-blue-300 rounded-lg hover:bg-blue-100 text-sm text-blue-900"
                    >
                      Select Existing
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* New Customer Form */}
          {showNewCustomerForm && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-green-900">Add New Customer</h4>
                <button
                  onClick={() => setShowNewCustomerForm(false)}
                  className="text-green-600 hover:text-green-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={newCustomerContact}
                    onChange={(e) => setNewCustomerContact(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="email@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <button
                onClick={handleCreateNewCustomer}
                disabled={creatingCustomer || !newCustomerName.trim()}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingCustomer ? 'Creating...' : 'Create Customer'}
              </button>
            </div>
          )}

          {/* New Vendor Form */}
          {showNewVendorForm && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-purple-900">Add New Vendor</h4>
                <button
                  onClick={() => setShowNewVendorForm(false)}
                  className="text-purple-600 hover:text-purple-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={newVendorContact}
                    onChange={(e) => setNewVendorContact(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newVendorEmail}
                    onChange={(e) => setNewVendorEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="email@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newVendorPhone}
                    onChange={(e) => setNewVendorPhone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <button
                onClick={handleCreateNewVendor}
                disabled={creatingVendor || !newVendorName.trim()}
                className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingVendor ? 'Creating...' : 'Create Vendor'}
              </button>
            </div>
          )}

          {/* Basic Info */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-gray-900">Basic Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Type
                </label>
                <select
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value as 'single' | 'multipart')}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="single">Single Vendor</option>
                  <option value="multipart">Multi-Part Vendors</option>
                </select>
              </div>

              {/* Mailing Type Detection */}
              <div className="col-span-2">
                <div className="flex items-center gap-4 mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Job Category
                  </label>
                  {detectingMailing && (
                    <span className="text-xs text-gray-500 italic">Detecting...</span>
                  )}
                  {detectionResult && !detectingMailing && detectionResult.confidence !== 'low' && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      detectionResult.isMailing
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      <Zap className="w-3 h-3" />
                      {detectionResult.isMailing ? 'Detected: Mailing' : 'Detected: Print Only'}
                      <span className="text-gray-500">({detectionResult.confidence})</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <select
                    value={jobCategory}
                    onChange={(e) => {
                      setJobCategory(e.target.value as 'print' | 'mailing');
                      if (e.target.value === 'print') {
                        setMailFormat(null);
                      } else if (e.target.value === 'mailing' && !mailFormat && detectionResult?.suggestedFormat) {
                        setMailFormat(detectionResult.suggestedFormat);
                      }
                    }}
                    className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="print">Print Job</option>
                    <option value="mailing">Direct Mail</option>
                  </select>

                  {jobCategory === 'mailing' && (
                    <>
                      <select
                        value={mailFormat || ''}
                        onChange={(e) => setMailFormat(e.target.value as 'SELF_MAILER' | 'POSTCARD' | 'ENVELOPE' | null)}
                        className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Select Format...</option>
                        <option value="SELF_MAILER">Self-Mailer</option>
                        <option value="POSTCARD">Postcard</option>
                        <option value="ENVELOPE">Envelope</option>
                      </select>

                      {mailFormat === 'ENVELOPE' && (
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600">Components:</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={envelopeComponents}
                            onChange={(e) => setEnvelopeComponents(parseInt(e.target.value) || 2)}
                            className="w-16 px-2 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                      )}
                      {mailFormat === 'ENVELOPE' && envelopeComponents > 0 && (
                        <div className="col-span-2 mt-2 space-y-2">
                          <label className="text-sm font-medium text-gray-700">Component Details:</label>
                          {envelopeComponentList.map((comp, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                              <span className="text-xs text-gray-500 w-6">{idx + 1}.</span>
                              <input
                                type="text"
                                placeholder={`Name (e.g., ${idx === 0 ? '#10 Envelope' : idx === 1 ? 'Letter' : 'Buckslip'})`}
                                value={comp.name}
                                onChange={(e) => {
                                  const updated = [...envelopeComponentList];
                                  updated[idx] = { ...updated[idx], name: e.target.value };
                                  setEnvelopeComponentList(updated);
                                }}
                                className="flex-1 px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                              <input
                                type="text"
                                placeholder="Size (e.g., 9.5 x 4.125)"
                                value={comp.size}
                                onChange={(e) => {
                                  const updated = [...envelopeComponentList];
                                  updated[idx] = { ...updated[idx], size: e.target.value };
                                  setEnvelopeComponentList(updated);
                                }}
                                className="w-36 px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {detectionResult && detectionResult.signals.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {detectionResult.signals.slice(0, 3).join(' · ')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                      !customerId ? 'border-red-300 bg-red-50' : ''
                    }`}
                  >
                    <option value="">Select Customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowNewCustomerForm(true)}
                    className="flex items-center justify-center w-10 h-10 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200"
                    title="Add new customer"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Single Vendor - only show for single vendor jobs */}
              {jobType === 'single' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <select
                      value={vendorId}
                      onChange={(e) => setVendorId(e.target.value)}
                      className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                        !vendorId ? 'border-red-300 bg-red-50' : ''
                      }`}
                    >
                      <option value="">Select Vendor...</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowNewVendorForm(true)}
                      className="flex items-center justify-center w-10 h-10 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200"
                      title="Add new vendor"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Multi-Part info - show when multi-part selected */}
              {jobType === 'multipart' && (
                <div className="col-span-2 bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-purple-700 font-medium">Multi-Part Job (Blanket PO)</span>
                    <span className="text-sm text-purple-600">
                      ({parsedData.productComponents?.length || 0} components detected)
                    </span>
                  </div>
                  <p className="text-sm text-purple-600 mb-3">
                    Vendors will be assigned to individual components after job creation.
                  </p>

                  {/* Show detected components */}
                  {parsedData.productComponents && parsedData.productComponents.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-purple-800 uppercase">Detected Components:</p>
                      <div className="grid gap-2">
                        {parsedData.productComponents.map((component: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between bg-white border border-purple-200 rounded px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-medium">
                                {idx + 1}
                              </span>
                              <div>
                                <span className="font-medium text-gray-900">{component.componentType}</span>
                                {component.description && (
                                  <span className="text-sm text-gray-500 ml-2">- {component.description}</span>
                                )}
                              </div>
                            </div>
                            {component.quantity && (
                              <span className="text-sm text-gray-600">{component.quantity.toLocaleString()} qty</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer PO Number</label>
                <input
                  type="text"
                  value={customerPONumber}
                  onChange={(e) => setCustomerPONumber(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bradford Ref Number</label>
                <input
                  type="text"
                  value={bradfordRefNumber}
                  onChange={(e) => setBradfordRefNumber(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mail Date</label>
                <input
                  type="date"
                  value={mailDate}
                  onChange={(e) => setMailDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">In-Homes Date</label>
                <input
                  type="date"
                  value={inHomesDate}
                  onChange={(e) => setInHomesDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Total quantity"
                />
              </div>
            </div>

            {/* Shipping Address (if extracted) */}
            {shipToAddress && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <label className="block text-sm font-medium text-blue-800 mb-1">Ship-To Address (from PO)</label>
                <textarea
                  value={shipToAddress}
                  onChange={(e) => setShipToAddress(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes / Special Instructions</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Additional notes or instructions..."
              />
            </div>
          </div>

          {/* Specifications */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-gray-900">Specifications</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="FLAT">Flat</option>
                  <option value="FOLDED">Folded</option>
                  <option value="BOOK">Book</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paper Type</label>
                <input
                  type="text"
                  value={paperType}
                  onChange={(e) => setPaperType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., 100# Gloss Text"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Paper Weight</label>
                <input
                  type="text"
                  value={paperWeight}
                  onChange={(e) => setPaperWeight(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., 100#, 80 lb"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colors</label>
                <input
                  type="text"
                  value={colors}
                  onChange={(e) => setColors(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., 4/4, 4/1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Coating</label>
                <input
                  type="text"
                  value={coating}
                  onChange={(e) => setCoating(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., AQ, UV, Matte"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Finishing</label>
                <input
                  type="text"
                  value={finishing}
                  onChange={(e) => setFinishing(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., Die Cut, Scoring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Folds</label>
                <input
                  type="text"
                  value={folds}
                  onChange={(e) => setFolds(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., Tri-fold, Z-fold"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Perforations</label>
                <input
                  type="text"
                  value={perforations}
                  onChange={(e) => setPerforations(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., Perf at 3.5 inches"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Die Cut</label>
                <input
                  type="text"
                  value={dieCut}
                  onChange={(e) => setDieCut(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Die cut details"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Flat Size</label>
                <input
                  type="text"
                  value={flatSize}
                  onChange={(e) => setFlatSize(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., 11x17"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Finished Size</label>
                {useCustomSize ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customSizeValue}
                      onChange={(e) => {
                        setCustomSizeValue(e.target.value);
                        setFinishedSize(e.target.value);
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      placeholder="e.g., 8.5 x 11"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setUseCustomSize(false);
                        setCustomSizeValue('');
                        setFinishedSize('');
                      }}
                      className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg"
                    >
                      Use Dropdown
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={finishedSize}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'CUSTOM') {
                          setUseCustomSize(true);
                          setFinishedSize('');
                        } else {
                          setFinishedSize(value);
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Select Size</option>
                      {getBradfordSizes().map(size => (
                        <option key={size} value={size}>
                          {size} {isBradfordVendor ? '(Bradford)' : ''}
                        </option>
                      ))}
                      <option value="CUSTOM">Custom Size...</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Book-Specific (only show if productType is BOOK) */}
          {productType === 'BOOK' && (
            <div>
              <h4 className="text-lg font-semibold mb-4 text-gray-900">Book-Specific Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Page Count</label>
                  <input
                    type="number"
                    value={pageCount}
                    onChange={(e) => setPageCount(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Binding Style</label>
                  <input
                    type="text"
                    value={bindingStyle}
                    onChange={(e) => setBindingStyle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g., Saddle Stitch, Perfect Bound"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cover Type</label>
                  <select
                    value={coverType}
                    onChange={(e) => setCoverType(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select...</option>
                    <option value="SELF">Self Cover</option>
                    <option value="PLUS">Plus Cover</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cover Paper Type</label>
                  <input
                    type="text"
                    value={coverPaperType}
                    onChange={(e) => setCoverPaperType(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g., 100# Gloss Cover"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Bradford Size Detection Alert */}
          {isBradfordSize(finishedSize) && !isBradfordVendor && (
            <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-900 mb-1">
                    Bradford Size Detected: {finishedSize}
                  </p>
                  <p className="text-sm text-yellow-800 mb-2">
                    This is a standard Bradford size. Jobs with this size should go to Bradford for printing.
                  </p>
                  <button
                    onClick={() => {
                      const bradfordVendor = vendors.find(v =>
                        v.isPartner === true || v.name?.toLowerCase().includes('bradford')
                      );
                      if (bradfordVendor) setVendorId(bradfordVendor.id);
                    }}
                    className="text-sm bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700"
                  >
                    Select Bradford Vendor
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bradford PO Preview - Full Cost Breakdown with 50/50 Profit Split */}
          {isBradfordVendor && bradfordPrintCPM > 0 && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-300 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-blue-900">Bradford PO Will Be Generated</h4>
                    <p className="text-xs text-blue-700">Size: {finishedSize} • 50/50 Profit Split Model</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Impact's Cost/M</p>
                  <p className="text-xl font-bold text-blue-900">${impactTotalCostCPM.toFixed(2)}</p>
                </div>
              </div>

              {/* Cost Breakdown Table */}
              <div className="bg-white rounded-lg p-3 mb-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 text-gray-600">Cost Component</th>
                      <th className="text-right py-1 text-gray-600">Per M</th>
                      {quantity > 0 && <th className="text-right py-1 text-gray-600">Total ({(quantity/1000).toFixed(1)}M)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-gray-500 text-xs">
                      <td className="py-1 pl-2">└ Paper Cost (Bradford pays)</td>
                      <td className="text-right font-mono">${bradfordPaperCostCPM.toFixed(2)}</td>
                      {quantity > 0 && <td className="text-right font-mono">${(bradfordPaperCostCPM * (quantity / 1000)).toFixed(2)}</td>}
                    </tr>
                    <tr>
                      <td className="py-1">Paper Sell (Impact pays Bradford)</td>
                      <td className="text-right font-mono">${bradfordPaperSellCPM.toFixed(2)}</td>
                      {quantity > 0 && <td className="text-right font-mono">${(bradfordPaperSellCPM * (quantity / 1000)).toFixed(2)}</td>}
                    </tr>
                    <tr className="text-purple-600 text-xs">
                      <td className="py-1 pl-2">└ Bradford Paper Profit (18% markup)</td>
                      <td className="text-right font-mono">${(bradfordPaperSellCPM - bradfordPaperCostCPM).toFixed(2)}</td>
                      {quantity > 0 && <td className="text-right font-mono">${((bradfordPaperSellCPM - bradfordPaperCostCPM) * (quantity / 1000)).toFixed(2)}</td>}
                    </tr>
                    <tr>
                      <td className="py-1">Print (JD→Bradford→Impact passthrough)</td>
                      <td className="text-right font-mono">${bradfordPrintCPM.toFixed(2)}</td>
                      {quantity > 0 && <td className="text-right font-mono">${(bradfordPrintCPM * (quantity / 1000)).toFixed(2)}</td>}
                    </tr>
                    <tr className="border-t font-semibold bg-blue-50">
                      <td className="py-1">Total Cost to Impact</td>
                      <td className="text-right font-mono">${impactTotalCostCPM.toFixed(2)}</td>
                      {quantity > 0 && <td className="text-right font-mono text-blue-700">${(impactTotalCostCPM * (quantity / 1000)).toFixed(2)}</td>}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 50/50 Profit Split Preview */}
              {quantity > 0 && lineItems[0]?.lineTotal > 0 && (() => {
                const customerRevenue = lineItems[0].lineTotal;
                const impactTotalCost = impactTotalCostCPM * (quantity / 1000);
                const profitToSplit = customerRevenue - impactTotalCost;
                const impactShare = profitToSplit / 2;
                const bradfordShare = profitToSplit / 2;
                const bradfordPaperProfit = (bradfordPaperSellCPM - bradfordPaperCostCPM) * (quantity / 1000);
                const bradfordTotalProfit = bradfordShare + bradfordPaperProfit;

                return (
                  <div className="bg-white rounded-lg p-3 border border-green-200">
                    <p className="text-xs font-semibold text-gray-600 mb-2">50/50 PROFIT SPLIT</p>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-xs text-gray-500">Customer Revenue</p>
                        <p className="font-bold text-gray-900">${customerRevenue.toFixed(2)}</p>
                      </div>
                      <div className="bg-blue-50 rounded p-2">
                        <p className="text-xs text-blue-600">Impact Cost</p>
                        <p className="font-bold text-blue-900">${impactTotalCost.toFixed(2)}</p>
                      </div>
                      <div className="bg-yellow-50 rounded p-2">
                        <p className="text-xs text-yellow-700">Profit to Split</p>
                        <p className="font-bold text-yellow-900">${profitToSplit.toFixed(2)}</p>
                      </div>
                      <div className="bg-green-100 rounded p-2 border-2 border-green-400">
                        <p className="text-xs text-green-700">Impact's Share (50%)</p>
                        <p className="font-bold text-green-900 text-lg">${impactShare.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-dashed border-gray-300">
                      <div className="flex justify-between text-xs text-purple-700">
                        <span>Bradford gets: ${bradfordShare.toFixed(2)} (50% split) + ${bradfordPaperProfit.toFixed(2)} (paper profit)</span>
                        <span className="font-semibold">= ${bradfordTotalProfit.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <p className="text-xs text-blue-600 mt-2 text-center">
                ✓ Bradford PO will be auto-created when job is saved
              </p>
            </div>
          )}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-900">Line Items</h4>
              <button
                onClick={handleAddLineItem}
                className="flex items-center space-x-1 text-sm text-orange-600 hover:text-orange-700"
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">Item #{index + 1}</span>
                    {lineItems.length > 1 && (
                      <button
                        onClick={() => handleRemoveLineItem(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                          !item.description ? 'border-red-300 bg-red-50' : ''
                        }`}
                        placeholder="Item description"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Quantity <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleLineItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                          item.quantity <= 0 ? 'border-red-300 bg-red-50' : ''
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Price/M ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.pricePerThousand || ''}
                        onChange={(e) => {
                          const ppm = parseFloat(e.target.value) || 0;
                          const qty = item.quantity || 0;
                          handleLineItemChange(index, 'pricePerThousand', ppm);
                          handleLineItemChange(index, 'lineTotal', ppm * (qty / 1000));
                          handleLineItemChange(index, 'unitPrice', ppm / 1000);
                        }}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="Per 1000"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Line Total ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.lineTotal || ''}
                        onChange={(e) => {
                          const total = parseFloat(e.target.value) || 0;
                          const qty = item.quantity || 0;
                          handleLineItemChange(index, 'lineTotal', total);
                          if (qty > 0) {
                            handleLineItemChange(index, 'pricePerThousand', total / (qty / 1000));
                            handleLineItemChange(index, 'unitPrice', total / qty);
                          }
                        }}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-green-50 font-medium"
                        placeholder="Total price"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitCost}
                        onChange={(e) => handleLineItemChange(index, 'unitCost', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Markup %</label>
                      <input
                        type="number"
                        step="0.1"
                        value={item.markupPercent}
                        onChange={(e) => handleLineItemChange(index, 'markupPercent', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-6 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-white"
          >
            Cancel
          </button>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSaveDraft}
              className="px-6 py-2 border border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50"
            >
              Save as Draft
            </button>
            <button
              onClick={handleCreate}
              disabled={hasWarnings}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Job
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
