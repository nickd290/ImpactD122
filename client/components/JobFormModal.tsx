import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { getBradfordSizes, getBradfordPricing, isBradfordSize, BRADFORD_SIZE_PRICING } from '../utils/bradfordPricing';

interface JobFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (jobData: any) => void;
  customers: any[];
  vendors: any[];
  initialData?: any;
}

export function JobFormModal({
  isOpen,
  onClose,
  onSubmit,
  customers,
  vendors,
  initialData,
}: JobFormModalProps) {
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    customerId: initialData?.customerId || '',
    vendorId: initialData?.vendorId || '',
    status: initialData?.status || 'DRAFT',
    notes: initialData?.notes || '',
    customerPONumber: initialData?.customerPONumber || '',
    bradfordRefNumber: initialData?.bradfordRefNumber || '',
    dueDate: initialData?.dueDate || '',
    jdSuppliesPaper: initialData?.jdSuppliesPaper || false, // false = Bradford supplies, true = Vendor supplies
    paperInventoryId: initialData?.paperInventoryId || '',
  });

  // Paper inventory for dropdown
  const [paperInventory, setPaperInventory] = useState<any[]>([]);

  // Reset form when initialData changes (for parsed data or editing different jobs)
  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: initialData?.title || '',
        customerId: initialData?.customerId || '',
        vendorId: initialData?.vendorId || '',
        status: initialData?.status || 'ACTIVE',
        notes: initialData?.notes || '',
        customerPONumber: initialData?.customerPONumber || '',
        bradfordRefNumber: initialData?.bradfordRefNumber || '',
        dueDate: initialData?.dueDate || '',
        jdSuppliesPaper: initialData?.jdSuppliesPaper || false,
        paperInventoryId: initialData?.paperInventoryId || '',
      });

      setSpecs({
        productType: initialData?.specs?.productType || 'OTHER',
        paperType: initialData?.specs?.paperType || '',
        paperWeight: initialData?.specs?.paperWeight || '',
        colors: initialData?.specs?.colors || '',
        coating: initialData?.specs?.coating || '',
        finishing: initialData?.specs?.finishing || '',
        flatSize: initialData?.specs?.flatSize || '',
        finishedSize: initialData?.specs?.finishedSize || '',
        pageCount: initialData?.specs?.pageCount || '',
        bindingStyle: initialData?.specs?.bindingStyle || '',
        coverType: initialData?.specs?.coverType || 'SELF',
        coverPaperType: initialData?.specs?.coverPaperType || '',
        paperLbs: initialData?.bradfordPaperLbs || initialData?.specs?.paperLbs || '',
        // Additional print specs
        folds: initialData?.specs?.folds || '',
        perforations: initialData?.specs?.perforations || '',
        dieCut: initialData?.specs?.dieCut || '',
        bleed: initialData?.specs?.bleed || '',
        proofType: initialData?.specs?.proofType || '',
        // Ship-to information
        shipToName: initialData?.specs?.shipToName || '',
        shipToAddress: initialData?.specs?.shipToAddress || '',
        shipVia: initialData?.specs?.shipVia || '',
        // All parsed notes/instructions - CRITICAL for vendor PO PDF
        specialInstructions: initialData?.specs?.specialInstructions || '',
        artworkInstructions: initialData?.specs?.artworkInstructions || '',
        packingInstructions: initialData?.specs?.packingInstructions || '',
        labelingInstructions: initialData?.specs?.labelingInstructions || '',
        additionalNotes: initialData?.specs?.additionalNotes || '',
        artworkUrl: initialData?.specs?.artworkUrl || '',
        artworkToFollow: initialData?.specs?.artworkToFollow || false,
        // ===== PHASE 15: Enhanced Universal PO Parsing =====
        versions: initialData?.specs?.versions || [],
        languageBreakdown: initialData?.specs?.languageBreakdown || [],
        totalVersionQuantity: initialData?.specs?.totalVersionQuantity || 0,
        timeline: initialData?.specs?.timeline || {},
        mailing: initialData?.specs?.mailing || {},
        responsibilities: initialData?.specs?.responsibilities || { vendorTasks: [], customerTasks: [] },
        specialHandling: initialData?.specs?.specialHandling || {},
        paymentTerms: initialData?.specs?.paymentTerms || '',
        fob: initialData?.specs?.fob || '',
        accountNumber: initialData?.specs?.accountNumber || '',
      });

      setLineItems(initialData?.lineItems?.length > 0 ? initialData.lineItems : [
        { description: '', quantity: 1, unitCost: 0, markupPercent: 20, unitPrice: 0 }
      ]);

      setBradfordFinancials({
        impactCustomerTotal: initialData?.financials?.impactCustomerTotal || 0,
        jdServicesTotal: initialData?.financials?.jdServicesTotal || 0,
        bradfordPaperCost: initialData?.financials?.bradfordPaperCost || 0,
        paperMarkupAmount: initialData?.financials?.paperMarkupAmount || 0,
      });

      setBradfordCPM({
        customerCPM: 0,
        jdServicesCPM: 0,
        bradfordPaperCostCPM: 0,
        paperMarkupCPM: 0,
        printCPM: 0,
      });

      setUseCustomSize(false);
      setCustomSizeValue('');
      setManualOverrides(new Set()); // Reset manual overrides when form resets
      setBradfordCut(initialData?.bradfordCut || 0); // Reset Bradford's cut
      setUseBradford35Percent(false); // Reset 35% checkbox
      setSellPrice(initialData?.sellPrice ? String(initialData.sellPrice) : ''); // Reset sell price
      setSellPriceError(''); // Clear any previous error
      setOverrideSellPrice(!!initialData?.sellPrice); // If editing existing job with sellPrice, enable override
    }
  }, [isOpen, initialData]);

  const [specs, setSpecs] = useState({
    productType: initialData?.specs?.productType || 'OTHER',
    paperType: initialData?.specs?.paperType || '',
    paperWeight: initialData?.specs?.paperWeight || '',
    colors: initialData?.specs?.colors || '',
    coating: initialData?.specs?.coating || '',
    finishing: initialData?.specs?.finishing || '',
    flatSize: initialData?.specs?.flatSize || '',
    finishedSize: initialData?.specs?.finishedSize || '',
    pageCount: initialData?.specs?.pageCount || '',
    bindingStyle: initialData?.specs?.bindingStyle || '',
    coverType: initialData?.specs?.coverType || 'SELF',
    coverPaperType: initialData?.specs?.coverPaperType || '',
    paperLbs: initialData?.bradfordPaperLbs || initialData?.specs?.paperLbs || '',
    // Additional print specs
    folds: initialData?.specs?.folds || '',
    perforations: initialData?.specs?.perforations || '',
    dieCut: initialData?.specs?.dieCut || '',
    bleed: initialData?.specs?.bleed || '',
    proofType: initialData?.specs?.proofType || '',
    // Ship-to information
    shipToName: initialData?.specs?.shipToName || '',
    shipToAddress: initialData?.specs?.shipToAddress || '',
    shipVia: initialData?.specs?.shipVia || '',
    // All parsed notes/instructions - CRITICAL for vendor PO PDF
    specialInstructions: initialData?.specs?.specialInstructions || '',
    artworkInstructions: initialData?.specs?.artworkInstructions || '',
    packingInstructions: initialData?.specs?.packingInstructions || '',
    labelingInstructions: initialData?.specs?.labelingInstructions || '',
    additionalNotes: initialData?.specs?.additionalNotes || '',
    artworkUrl: initialData?.specs?.artworkUrl || '',
    artworkToFollow: initialData?.specs?.artworkToFollow || false,
    // ===== PHASE 15: Enhanced Universal PO Parsing =====
    versions: initialData?.specs?.versions || [],
    languageBreakdown: initialData?.specs?.languageBreakdown || [],
    totalVersionQuantity: initialData?.specs?.totalVersionQuantity || 0,
    timeline: initialData?.specs?.timeline || {},
    mailing: initialData?.specs?.mailing || {},
    responsibilities: initialData?.specs?.responsibilities || { vendorTasks: [], customerTasks: [] },
    specialHandling: initialData?.specs?.specialHandling || {},
    paymentTerms: initialData?.specs?.paymentTerms || '',
    fob: initialData?.specs?.fob || '',
    accountNumber: initialData?.specs?.accountNumber || '',
  });

  const [lineItems, setLineItems] = useState(initialData?.lineItems || [
    {
      description: '',
      quantity: 1,
      unitCost: 0,
      markupPercent: 20,
      unitPrice: 0,
    }
  ]);

  const [bradfordFinancials, setBradfordFinancials] = useState({
    impactCustomerTotal: initialData?.financials?.impactCustomerTotal || 0,
    jdServicesTotal: initialData?.financials?.jdServicesTotal || 0,
    bradfordPaperCost: initialData?.financials?.bradfordPaperCost || 0,
    paperMarkupAmount: initialData?.financials?.paperMarkupAmount || 0,
  });

  // CPM (Cost Per Thousand) values for Bradford pricing
  const [bradfordCPM, setBradfordCPM] = useState({
    customerCPM: 0,
    jdServicesCPM: 0,
    bradfordPaperCostCPM: 0,
    paperMarkupCPM: 0,
    printCPM: 0, // Added Print CPM
  });

  // Track if using custom size (not Bradford size)
  const [useCustomSize, setUseCustomSize] = useState(false);
  const [customSizeValue, setCustomSizeValue] = useState('');

  // Track which fields have been manually edited (to prevent auto-calc overwriting)
  const [manualOverrides, setManualOverrides] = useState<Set<string>>(new Set());

  // Bradford's cut for non-Bradford vendor jobs (payment back to Bradford)
  const [bradfordCut, setBradfordCut] = useState(initialData?.bradfordCut || 0);

  // Checkbox for auto-calculating 35% of net profit as Bradford's cut
  const [useBradford35Percent, setUseBradford35Percent] = useState(false);

  // Sell Price - explicit field for what we charge the customer
  const [sellPrice, setSellPrice] = useState<string>(initialData?.sellPrice ? String(initialData.sellPrice) : '');
  const [sellPriceError, setSellPriceError] = useState<string>('');
  const [overrideSellPrice, setOverrideSellPrice] = useState(false);

  // Auto-sync sellPrice from line items total (when not overridden)
  useEffect(() => {
    if (!overrideSellPrice) {
      const lineItemTotal = lineItems.reduce((sum, item) =>
        sum + ((item.quantity || 0) * (Number(item.unitPrice) || 0)), 0);
      setSellPrice(lineItemTotal > 0 ? lineItemTotal.toFixed(2) : '');
    }
  }, [lineItems, overrideSellPrice]);

  // Calculate total quantity from all line items
  const totalQuantity = lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  // Auto-calculate Bradford financials from CPM values
  const calculateFromCPM = (cpm: number) => {
    return (cpm * totalQuantity) / 1000;
  };

  // Get selected Bradford vendor
  const selectedVendor = vendors.find(v => v.id === formData.vendorId);
  const isBradfordVendor = selectedVendor?.isPartner === true;

  // Fetch paper inventory for dropdown when Bradford supplies paper
  useEffect(() => {
    if (!formData.jdSuppliesPaper) {
      fetch('/api/paper-inventory')
        .then(res => res.json())
        .then(data => setPaperInventory(data || []))
        .catch(() => setPaperInventory([]));
    }
  }, [formData.jdSuppliesPaper]);

  // Auto-calculate Print CPM and Paper Lbs when Bradford vendor + Bradford size is selected
  // Only auto-calculate fields that haven't been manually edited
  useEffect(() => {
    if (isBradfordVendor && specs.finishedSize && !useCustomSize) {
      const pricing = getBradfordPricing(specs.finishedSize);
      if (pricing) {
        // Use current quantity or default to 1000 for CPM calculations
        const qty = totalQuantity > 0 ? totalQuantity : 1000;
        const calcFromCPM = (cpm: number) => (cpm * qty) / 1000;

        // Only update CPM values if not manually overridden
        setBradfordCPM(prev => ({
          ...prev,
          printCPM: manualOverrides.has('printCPM') ? prev.printCPM : pricing.printCPM,
          jdServicesCPM: manualOverrides.has('jdServicesCPM') ? prev.jdServicesCPM : pricing.printCPM,
          bradfordPaperCostCPM: manualOverrides.has('bradfordPaperCostCPM') ? prev.bradfordPaperCostCPM : pricing.costCPMPaper,
          paperMarkupCPM: manualOverrides.has('paperMarkupCPM') ? prev.paperMarkupCPM : (pricing.sellCPMPaper - pricing.costCPMPaper),
        }));

        // Only update financial totals if not manually overridden
        setBradfordFinancials(prev => ({
          ...prev,
          jdServicesTotal: manualOverrides.has('jdServicesTotal') ? prev.jdServicesTotal : calcFromCPM(pricing.printCPM),
          bradfordPaperCost: manualOverrides.has('bradfordPaperCost') ? prev.bradfordPaperCost : calcFromCPM(pricing.costCPMPaper),
          paperMarkupAmount: manualOverrides.has('paperMarkupAmount') ? prev.paperMarkupAmount : calcFromCPM(pricing.sellCPMPaper - pricing.costCPMPaper),
        }));

        // Auto-calculate paper lbs only if not manually overridden
        if (!manualOverrides.has('paperLbs')) {
          const calculatedPaperLbs = (pricing.paperLbsPerM * qty) / 1000;
          setSpecs(prev => ({
            ...prev,
            paperLbs: calculatedPaperLbs.toFixed(2),
          }));
        }
      }
    }
  }, [formData.vendorId, specs.finishedSize, useCustomSize, isBradfordVendor, totalQuantity, manualOverrides]);

  // Auto-calculate 35% of net profit when checkbox is checked
  useEffect(() => {
    if (useBradford35Percent && !isBradfordVendor) {
      // Calculate totals from line items
      const revenue = lineItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
      const cost = lineItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unitCost), 0);
      // Net profit = Revenue - Vendor Cost (before Bradford cut)
      const netProfit = revenue - cost;
      const calculated35 = netProfit * 0.35;
      // Never set negative Bradford cut
      setBradfordCut(Math.max(0, Math.round(calculated35 * 100) / 100));
    }
  }, [useBradford35Percent, lineItems, isBradfordVendor]);

  if (!isOpen) return null;

  const calculateUnitPrice = (unitCost: number, markupPercent: number) => {
    return Math.round(unitCost * (1 + markupPercent / 100) * 10000) / 10000;  // Round to 4 decimals for per-piece pricing
  };

  const handleLineItemChange = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    // Dynamic recalculation based on which field changed:
    // - Cost changed → recalculate Markup% (keep Price fixed)
    // - Price changed → recalculate Markup% (keep Cost fixed)
    // - Markup% changed → recalculate Price (keep Cost fixed)
    if (field === 'unitCost') {
      // Cost changed → recalculate Markup% (keep Price fixed)
      const newCost = parseFloat(value) || 0;
      const currentPrice = updated[index].unitPrice;
      if (newCost > 0 && currentPrice > 0) {
        // Markup% = ((Price - Cost) / Cost) * 100 - round to 4 decimals
        updated[index].markupPercent = Math.round(((currentPrice - newCost) / newCost) * 100 * 10000) / 10000;
      }
    } else if (field === 'unitPrice') {
      // Price changed → recalculate Markup% (keep Cost fixed)
      const newPrice = parseFloat(value) || 0;
      const currentCost = updated[index].unitCost;
      if (currentCost > 0) {
        // Markup% = ((Price - Cost) / Cost) * 100 - round to 4 decimals
        updated[index].markupPercent = Math.round(((newPrice - currentCost) / currentCost) * 100 * 10000) / 10000;
      }
    } else if (field === 'markupPercent') {
      // Markup% changed → recalculate Price (keep Cost fixed)
      const cost = updated[index].unitCost;
      const markup = parseFloat(value) || 0;
      updated[index].unitPrice = calculateUnitPrice(cost, markup);
    }

    setLineItems(updated);
  };

  // Format numbers to 4 decimals on blur (not during typing) - supports per-piece pricing
  const formatOnBlur = (index: number, field: string) => {
    const updated = [...lineItems];
    const value = parseFloat(updated[index][field]) || 0;
    updated[index][field] = Math.round(value * 10000) / 10000;
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, {
      description: '',
      quantity: 1,
      unitCost: 0,
      markupPercent: 20,
      unitPrice: 0,
    }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      alert('Please enter a job title');
      return;
    }

    if (!formData.customerId) {
      alert('Please select a customer');
      return;
    }

    if (!formData.vendorId) {
      alert('Please select a vendor');
      return;
    }

    // Validate sell price
    const parsedSellPrice = parseFloat(sellPrice);
    if (!sellPrice || isNaN(parsedSellPrice)) {
      setSellPriceError('Sell price is required');
      return;
    }
    if (parsedSellPrice <= 0) {
      setSellPriceError('Sell price must be greater than $0');
      return;
    }

    // Validate line items
    const validLineItems = lineItems.filter(item => item.description.trim());
    if (validLineItems.length === 0) {
      alert('Please add at least one line item with a description');
      return;
    }

    // Check if any line item has negative pricing
    const hasInvalidPricing = validLineItems.some(item => item.unitPrice < 0 || item.unitCost < 0);
    if (hasInvalidPricing) {
      alert('Pricing cannot be negative (Price >= $0, Cost >= $0)');
      return;
    }

    // Prepare specs object (only include if at least one field is filled)
    const hasSpecs = specs.productType !== 'OTHER' ||
      specs.paperType || specs.colors || specs.coating ||
      specs.finishing || specs.flatSize || specs.finishedSize || specs.paperLbs ||
      specs.artworkUrl;

    const specsData = hasSpecs ? {
      ...specs,
      pageCount: specs.pageCount ? parseInt(specs.pageCount as any) : null,
      paperLbs: specs.paperLbs ? parseFloat(specs.paperLbs as any) : null,
    } : null;

    // Prepare Bradford financials (optional - only include if at least one field has value)
    const hasFinancials = bradfordFinancials.impactCustomerTotal > 0 ||
      bradfordFinancials.jdServicesTotal > 0 ||
      bradfordFinancials.bradfordPaperCost > 0 ||
      bradfordFinancials.paperMarkupAmount > 0;

    const financialsData = hasFinancials ? bradfordFinancials : null;

    onSubmit({
      ...formData,
      sellPrice: parsedSellPrice,  // Include validated sell price
      specs: specsData,
      lineItems: validLineItems,
      financials: financialsData,
      bradfordCut: !isBradfordVendor && bradfordCut > 0 ? bradfordCut : null,
      bradfordPaperLbs: specs.paperLbs ? parseFloat(specs.paperLbs as any) : null,
    });
    onClose();
  };

  const totalRevenue = lineItems.reduce((sum, item) =>
    sum + (item.quantity * item.unitPrice), 0
  );

  const totalCost = lineItems.reduce((sum, item) =>
    sum + (item.quantity * item.unitCost), 0
  );

  // Include Bradford's cut for non-Bradford vendors in profit calculation
  const effectiveBradfordCut = isBradfordVendor ? 0 : bradfordCut;
  const totalProfit = totalRevenue - totalCost - effectiveBradfordCut;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              {initialData ? 'Edit Job' : 'Create New Job'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter job title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="PAID">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer *
                </label>
                <select
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select customer...</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor *
                </label>
                <select
                  value={formData.vendorId}
                  onChange={(e) => setFormData({ ...formData, vendorId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select vendor...</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer PO Number
                </label>
                <input
                  type="text"
                  value={formData.customerPONumber}
                  onChange={(e) => setFormData({ ...formData, customerPONumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  JD PO / Bradford Payment Ref
                </label>
                <input
                  type="text"
                  value={formData.bradfordRefNumber}
                  onChange={(e) => setFormData({ ...formData, bradfordRefNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="PO number to JD (also used for Bradford payment)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Sell Price *
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideSellPrice}
                      onChange={(e) => setOverrideSellPrice(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Override
                  </label>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={sellPrice}
                    onChange={(e) => {
                      setSellPrice(e.target.value);
                      setSellPriceError('');
                      if (!overrideSellPrice) setOverrideSellPrice(true); // Auto-enable override when manually editing
                    }}
                    readOnly={!overrideSellPrice}
                    className={`w-full pl-7 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      sellPriceError ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    } ${!overrideSellPrice ? 'bg-gray-50' : ''}`}
                    placeholder="0.00"
                    required
                  />
                </div>
                {sellPriceError && (
                  <p className="mt-1 text-sm text-red-600">{sellPriceError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {overrideSellPrice ? 'Manually set (not from line items)' : 'Auto-calculated from line items total'}
                </p>
              </div>
            </div>

            {/* Specifications Section */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Specifications</h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Product Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Type
                  </label>
                  <select
                    value={specs.productType}
                    onChange={(e) => setSpecs({ ...specs, productType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="OTHER">Other</option>
                    <option value="BOOK">Book</option>
                    <option value="FLAT">Flat</option>
                    <option value="FOLDED">Folded</option>
                  </select>
                </div>

                {/* Paper Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paper Type
                  </label>
                  <input
                    type="text"
                    value={specs.paperType}
                    onChange={(e) => setSpecs({ ...specs, paperType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 100# Gloss Text"
                  />
                </div>

                {/* Colors */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Colors
                  </label>
                  <input
                    type="text"
                    value={specs.colors}
                    onChange={(e) => setSpecs({ ...specs, colors: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 4/4, 4/1, PMS"
                  />
                </div>

                {/* Coating */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Coating
                  </label>
                  <input
                    type="text"
                    value={specs.coating}
                    onChange={(e) => setSpecs({ ...specs, coating: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., AQ, UV, Matte"
                  />
                </div>

                {/* Finishing */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Finishing
                  </label>
                  <input
                    type="text"
                    value={specs.finishing}
                    onChange={(e) => setSpecs({ ...specs, finishing: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Die Cut, Scoring"
                  />
                </div>

                {/* Flat Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Flat Size
                  </label>
                  <input
                    type="text"
                    value={specs.flatSize}
                    onChange={(e) => setSpecs({ ...specs, flatSize: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 11x17"
                  />
                </div>

                {/* Finished Size - Dropdown with Bradford sizes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Finished Size
                  </label>
                  {useCustomSize ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customSizeValue}
                        onChange={(e) => {
                          setCustomSizeValue(e.target.value);
                          setSpecs({ ...specs, finishedSize: e.target.value });
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., 8.5 x 11"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUseCustomSize(false);
                          setCustomSizeValue('');
                          setSpecs({ ...specs, finishedSize: '' });
                        }}
                        className="px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg"
                      >
                        Use Dropdown
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={specs.finishedSize}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === 'CUSTOM') {
                            setUseCustomSize(true);
                            setSpecs({ ...specs, finishedSize: '' });
                          } else {
                            setSpecs({ ...specs, finishedSize: value });
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

              {/* Book-Specific Fields */}
              {specs.productType === 'BOOK' && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="text-sm font-semibold text-blue-900 mb-3">Book Specifications</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Page Count */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Page Count
                      </label>
                      <input
                        type="number"
                        value={specs.pageCount}
                        onChange={(e) => setSpecs({ ...specs, pageCount: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., 24"
                      />
                    </div>

                    {/* Binding Style */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Binding Style
                      </label>
                      <input
                        type="text"
                        value={specs.bindingStyle}
                        onChange={(e) => setSpecs({ ...specs, bindingStyle: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Saddle Stitch, Perfect Bound"
                      />
                    </div>

                    {/* Cover Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cover Type
                      </label>
                      <select
                        value={specs.coverType}
                        onChange={(e) => setSpecs({ ...specs, coverType: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="SELF">Self Cover</option>
                        <option value="PLUS">Plus Cover</option>
                      </select>
                    </div>

                    {/* Cover Paper Type (only for Plus Cover) */}
                    {specs.coverType === 'PLUS' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cover Paper Type
                        </label>
                        <input
                          type="text"
                          value={specs.coverPaperType}
                          onChange={(e) => setSpecs({ ...specs, coverPaperType: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="e.g., 100# Gloss Cover"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Add any additional notes..."
              />
            </div>

            {/* Artwork Link for Vendors */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Artwork Files</h3>
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-blue-900">
                    Artwork URL / Link
                  </label>
                  {/* Artwork to Follow Checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(specs as any).artworkToFollow || false}
                      onChange={(e) => setSpecs({ ...specs, artworkToFollow: e.target.checked } as any)}
                      disabled={!!specs.artworkUrl}
                      className="h-4 w-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
                    />
                    <span className={`text-sm font-medium ${specs.artworkUrl ? 'text-gray-400' : 'text-amber-700'}`}>
                      Artwork to follow
                    </span>
                  </label>
                </div>
                <input
                  type="url"
                  value={specs.artworkUrl}
                  onChange={(e) => setSpecs({ ...specs, artworkUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://drive.google.com/... or Dropbox/WeTransfer link"
                />
                {/* Info message when checkbox is checked and no artwork URL */}
                {(specs as any).artworkToFollow && !specs.artworkUrl && (
                  <div className="mt-2 p-2 bg-amber-100 border border-amber-300 rounded text-xs text-amber-700">
                    <p className="font-medium">⚠️ Vendor PO PDFs will display "ARTWORK TO ARRIVE LATER"</p>
                    <p className="mt-1">When you add the artwork URL, emails will automatically be sent to vendors whose POs were previously emailed.</p>
                  </div>
                )}
                {!((specs as any).artworkToFollow) && (
                  <p className="mt-2 text-xs text-blue-700">
                    Provide a link to artwork files (Google Drive, Dropbox, WeTransfer, etc.). This will appear on the Vendor PO PDF.
                  </p>
                )}
              </div>
            </div>

            {/* Paper Source Section */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Paper Source</h3>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="space-y-3">
                  {/* Bradford Supplies Paper */}
                  <label className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border-2 transition-colors ${
                    !formData.jdSuppliesPaper ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="paperSource"
                      checked={!formData.jdSuppliesPaper}
                      onChange={() => setFormData({ ...formData, jdSuppliesPaper: false, paperInventoryId: '' })}
                      className="mt-1 h-4 w-4 text-orange-600 border-gray-300 focus:ring-orange-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Bradford Supplies Paper</div>
                      <p className="text-sm text-gray-500">Bradford will provide paper from inventory (default)</p>

                      {/* Optional inventory link dropdown - only show when Bradford supplies */}
                      {!formData.jdSuppliesPaper && paperInventory.length > 0 && (
                        <div className="mt-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Link to Inventory (optional)
                          </label>
                          <select
                            value={formData.paperInventoryId}
                            onChange={(e) => setFormData({ ...formData, paperInventoryId: e.target.value })}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="">-- Select paper from inventory --</option>
                            {paperInventory.map((paper: any) => (
                              <option key={paper.id} value={paper.id}>
                                {paper.rollType} - {paper.rollWidth}" - {paper.paperPoint}pt {paper.paperType} ({paper.quantity} rolls)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </label>

                  {/* Vendor Supplies Paper */}
                  <label className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border-2 transition-colors ${
                    formData.jdSuppliesPaper ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="paperSource"
                      checked={formData.jdSuppliesPaper}
                      onChange={() => setFormData({ ...formData, jdSuppliesPaper: true, paperInventoryId: '' })}
                      className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Vendor Supplies Paper</div>
                      <p className="text-sm text-gray-500">The vendor will provide their own paper</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">Line Items</h3>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              <div className="space-y-3">
                {lineItems.map((item, index) => {
                  const isBelowCost = item.unitPrice > 0 && item.unitCost > 0 && item.unitPrice < item.unitCost;
                  return <div key={index} className={`border rounded-lg p-4 ${isBelowCost ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
                    {isBelowCost && (
                      <div className="mb-2 flex items-center gap-2 text-red-700 text-xs font-medium">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-200">
                          ⚠️ Selling below cost!
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-12 gap-2">
                      {/* Description - 3 cols */}
                      <div className="col-span-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="Item description"
                        />
                      </div>

                      {/* Quantity - 1 col */}
                      <div className="col-span-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Qty
                        </label>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          min="1"
                        />
                      </div>

                      {/* Cost/Each - 2 cols */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Cost/Each
                        </label>
                        <input
                          type="number"
                          value={item.unitCost}
                          onChange={(e) => handleLineItemChange(index, 'unitCost', e.target.value)}
                          onBlur={() => formatOnBlur(index, 'unitCost')}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          step="any"
                          min="0"
                          placeholder="0.00"
                        />
                      </div>

                      {/* Markup % - 1 col */}
                      <div className="col-span-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Markup%
                        </label>
                        <input
                          type="number"
                          value={item.markupPercent}
                          onChange={(e) => handleLineItemChange(index, 'markupPercent', e.target.value)}
                          onBlur={() => formatOnBlur(index, 'markupPercent')}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          step="any"
                          min="0"
                          placeholder="20"
                        />
                      </div>

                      {/* Price/Each - 2 cols */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Price/Each
                        </label>
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => handleLineItemChange(index, 'unitPrice', e.target.value)}
                          onBlur={() => formatOnBlur(index, 'unitPrice')}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          step="any"
                          min="0"
                          placeholder="0.00"
                        />
                      </div>

                      {/* Line Total - 2 cols */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Line Total
                        </label>
                        <div className="flex items-center gap-1">
                          <div className="flex-1 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm font-medium text-gray-900">
                            ${((item.quantity || 0) * (Number(item.unitPrice) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          {lineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLineItem(index)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                })}
              </div>

              {/* Customer PO Total - Shows what customer is paying us (from parsed PO) */}
              {initialData?.customerPOTotal > 0 && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900">Customer PO Total</h4>
                      <p className="text-xs text-blue-700">Amount from customer's purchase order</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-900">
                      ${initialData.customerPOTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              )}

              {/* Bradford Partner Financials (Optional) - CPM Based - Only for Bradford vendors */}
              {isBradfordVendor && (
              <div className="mt-6 border border-gray-300 rounded-lg p-4 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Bradford Partner Financials
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  CPM-based pricing for Bradford partner jobs.
                </p>
                <p className="text-xs text-blue-600 mb-4">
                  Enter CPM (Cost Per Thousand) values. Totals will auto-calculate based on quantity: <strong>{totalQuantity.toLocaleString()}</strong>
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer CPM
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={bradfordCPM.customerCPM}
                      onChange={(e) => {
                        const cpm = parseFloat(e.target.value) || 0;
                        setBradfordCPM({ ...bradfordCPM, customerCPM: cpm });
                        setBradfordFinancials({
                          ...bradfordFinancials,
                          impactCustomerTotal: calculateFromCPM(cpm)
                        });
                        setManualOverrides(prev => new Set(prev).add('customerCPM').add('impactCustomerTotal'));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Total: <strong>${calculateFromCPM(bradfordCPM.customerCPM).toFixed(2)}</strong>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      JD Services CPM
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={bradfordCPM.jdServicesCPM}
                      onChange={(e) => {
                        const cpm = parseFloat(e.target.value) || 0;
                        setBradfordCPM({ ...bradfordCPM, jdServicesCPM: cpm });
                        setBradfordFinancials({
                          ...bradfordFinancials,
                          jdServicesTotal: calculateFromCPM(cpm)
                        });
                        setManualOverrides(prev => new Set(prev).add('jdServicesCPM').add('jdServicesTotal'));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Total: <strong>${calculateFromCPM(bradfordCPM.jdServicesCPM).toFixed(2)}</strong>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bradford Paper Cost CPM
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={bradfordCPM.bradfordPaperCostCPM}
                      onChange={(e) => {
                        const cpm = parseFloat(e.target.value) || 0;
                        setBradfordCPM({ ...bradfordCPM, bradfordPaperCostCPM: cpm });
                        setBradfordFinancials({
                          ...bradfordFinancials,
                          bradfordPaperCost: calculateFromCPM(cpm)
                        });
                        setManualOverrides(prev => new Set(prev).add('bradfordPaperCostCPM').add('bradfordPaperCost'));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Total: <strong>${calculateFromCPM(bradfordCPM.bradfordPaperCostCPM).toFixed(2)}</strong>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paper Markup CPM
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={bradfordCPM.paperMarkupCPM}
                      onChange={(e) => {
                        const cpm = parseFloat(e.target.value) || 0;
                        setBradfordCPM({ ...bradfordCPM, paperMarkupCPM: cpm });
                        setBradfordFinancials({
                          ...bradfordFinancials,
                          paperMarkupAmount: calculateFromCPM(cpm)
                        });
                        setManualOverrides(prev => new Set(prev).add('paperMarkupCPM').add('paperMarkupAmount'));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Total: <strong>${calculateFromCPM(bradfordCPM.paperMarkupCPM).toFixed(2)}</strong>
                    </p>
                  </div>
                </div>

                {/* Print CPM - Auto-calculated for Bradford sizes */}
                {isBradfordVendor && bradfordCPM.printCPM > 0 && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-semibold text-blue-900 mb-1">
                          Print CPM (Auto-calculated)
                        </label>
                        <p className="text-xs text-blue-700">
                          Based on selected size: <strong>{specs.finishedSize}</strong>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-blue-900">
                          ${bradfordCPM.printCPM.toFixed(2)}
                        </p>
                        <p className="text-xs text-blue-700">
                          Total: <strong>${calculateFromCPM(bradfordCPM.printCPM).toFixed(2)}</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Paper Usage (lbs) - For Bradford jobs */}
                <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label className="block text-sm font-semibold text-orange-900 mb-1">
                        Paper Usage (lbs)
                      </label>
                      <p className="text-xs text-orange-700 mb-2">
                        {specs.finishedSize && !useCustomSize ? (
                          <>Auto-calculated from size. Override if needed.</>
                        ) : (
                          <>Enter paper weight in pounds</>
                        )}
                      </p>
                      <input
                        type="number"
                        step="0.01"
                        value={specs.paperLbs}
                        onChange={(e) => {
                          setSpecs({ ...specs, paperLbs: e.target.value });
                          setManualOverrides(prev => new Set(prev).add('paperLbs'));
                        }}
                        className="w-32 px-3 py-2 border border-orange-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="0.00"
                      />
                    </div>
                    {specs.paperLbs && (
                      <div className="text-right ml-4">
                        <p className="text-2xl font-bold text-orange-900">
                          {parseFloat(specs.paperLbs as any).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lbs
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              )}

              {/* Bradford's Cut - For Non-Bradford Vendor Jobs */}
              {!isBradfordVendor && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label className="block text-sm font-semibold text-amber-900 mb-1">
                        Bradford's Cut
                      </label>
                      <p className="text-xs text-amber-700 mb-2">
                        Payment back to Bradford for this job (deducted from profit)
                      </p>

                      {/* 35% Auto-Calculate Checkbox */}
                      <label className="flex items-center gap-2 mb-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useBradford35Percent}
                          onChange={(e) => {
                            setUseBradford35Percent(e.target.checked);
                            if (!e.target.checked) {
                              // Reset to 0 when unchecked
                              setBradfordCut(0);
                            }
                          }}
                          className="h-4 w-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
                        />
                        <span className="text-sm text-amber-800">
                          Use 35% of Net Profit
                        </span>
                        {useBradford35Percent && (
                          <span className="text-xs text-amber-600 ml-1">
                            (${((totalRevenue - totalCost) * 0.35).toFixed(2)} of ${(totalRevenue - totalCost).toFixed(2)} profit)
                          </span>
                        )}
                      </label>

                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={bradfordCut}
                          onChange={(e) => {
                            setBradfordCut(parseFloat(e.target.value) || 0);
                            // Uncheck auto-calculate if user manually edits
                            if (useBradford35Percent) {
                              setUseBradford35Percent(false);
                            }
                          }}
                          disabled={useBradford35Percent}
                          className={`w-32 px-3 py-2 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                            useBradford35Percent ? 'bg-amber-100 cursor-not-allowed' : ''
                          }`}
                          placeholder="0.00"
                        />
                        {useBradford35Percent && (
                          <span className="text-xs text-amber-600 italic">Auto-calculated</span>
                        )}
                      </div>
                    </div>
                    {bradfordCut > 0 && (
                      <div className="text-right">
                        <p className="text-2xl font-bold text-amber-900">
                          -${bradfordCut.toFixed(2)}
                        </p>
                        <p className="text-xs text-amber-700">from profit</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Totals */}
              <div className="mt-4 bg-gray-900 text-white rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Total Cost:</span>
                    <p className="text-lg font-bold">${totalCost.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Total Revenue:</span>
                    <p className="text-lg font-bold">${totalRevenue.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Total Profit:</span>
                    <p className={`text-lg font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${totalProfit.toFixed(2)}
                    </p>
                    {!isBradfordVendor && bradfordCut > 0 && (
                      <p className="text-xs text-amber-400 mt-1">
                        (after ${bradfordCut.toFixed(2)} Bradford cut)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {initialData ? 'Update Job' : 'Create Job'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
