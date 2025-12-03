import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Calendar, User, Package, FileText, Edit2, Mail, Printer, Receipt,
  DollarSign, Plus, Trash2, Building2, Check, Save, Download, AlertTriangle, Send, ChevronDown, Link, ExternalLink
} from 'lucide-react';
import { EditableField } from './EditableField';
import { pdfApi, emailApi } from '../lib/api';
import { SendEmailModal } from './SendEmailModal';

interface Job {
  id: string;
  number?: string;
  jobNo?: string;
  title: string;
  status: string;
  sellPrice?: number;
  quantity?: number;
  createdAt?: string;
  dateCreated?: string;
  dueDate?: string;
  customerPONumber?: string;
  bradfordRefNumber?: string;
  bradfordPaperLbs?: number | null;
  description?: string;
  // Payment tracking
  customerPaymentAmount?: number;
  customerPaymentDate?: string;
  vendorPaymentAmount?: number;
  vendorPaymentDate?: string;
  bradfordPaymentAmount?: number;
  bradfordPaymentPaid?: boolean;
  bradfordPaymentDate?: string;
  notes?: string;
  customer?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  vendor?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    isPartner?: boolean;
  };
  specs?: {
    productType?: string;
    colors?: string;
    flatSize?: string;
    finishedSize?: string;
    paperType?: string;
    paperLbs?: number;
    coating?: string;
    finishing?: string;
    bindingStyle?: string;
    quantity?: number;
    pageCount?: number;
  };
  lineItems?: Array<{
    id?: string;
    description: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    markupPercent: number;
  }>;
  financials?: {
    impactCustomerTotal?: number;
    jdServicesTotal?: number;
    bradfordPaperCost?: number;
    paperMarkupAmount?: number;
    calculatedSpread?: number;
    bradfordShareAmount?: number;
    impactCostFromBradford?: number;
  };
  purchaseOrders?: Array<{
    id: string;
    poNumber?: string;
    description?: string;
    buyCost?: number;
    paperCost?: number;
    paperMarkup?: number;
    mfgCost?: number;
    printCPM?: number;
    paperCPM?: number;
    status?: string;
    originCompanyId?: string;
    targetCompanyId?: string;
    updatedAt?: string;
    createdAt?: string;
    vendor?: {
      id: string;
      name: string;
    };
  }>;
  // Suggested CPM pricing for standard sizes
  suggestedPricing?: {
    printCPM: number;
    paperCPM: number;
    paperLbsPerM: number;
  } | null;
  // Paper source management
  jdSuppliesPaper?: boolean;
  paperSource?: 'BRADFORD' | 'VENDOR' | 'CUSTOMER';
  paperInventory?: {
    id: string;
    rollType: string;
    rollWidth: number;
    paperType: string;
  } | null;
  // Profit calculation from API
  profit?: {
    sellPrice: number;
    totalCost: number;
    spread: number;
    paperMarkup: number;
    paperCost?: number;
    bradfordSpreadShare?: number;
    impactSpreadShare?: number;
    bradfordTotal: number;
    impactTotal: number;
    marginPercent?: number;
    poCount?: number;
    isOverridden?: boolean;
    overrideReason?: string;
    calculatedAt?: string;
  };
  // Tier pricing for standard sizes
  tierPricing?: {
    tier1?: { printCPM: number; printTotal: number; paperCPM: number; paperTotal: number; total: number };
    tier2?: { printTotal: number; paperTotal: number; paperMarkup: number; total: number };
    tier3?: { suggestedPrice: number };
  };
  sizeName?: string;
  isStandardSize?: boolean;
  // Paper data (snapshotted at creation for historical accuracy)
  paperData?: {
    lbsPerThousand: number;
    costPerLb: number;
    rawCPM: number | null;
    rawTotal: number | null;
    chargedCPM: number | null;
    chargedTotal: number | null;
    markupPercent: number;
    markupAmount: number | null;
    paperType: string;
  };
  // Document tracking
  quoteGeneratedAt?: string;
  quoteGeneratedCount?: number;
  poGeneratedAt?: string;
  poGeneratedCount?: number;
  invoiceGeneratedAt?: string;
  invoiceGeneratedCount?: number;
  // Email tracking
  invoiceEmailedAt?: string;
  invoiceEmailedTo?: string;
  invoiceEmailedCount?: number;
  artworkEmailedAt?: string;
  artworkEmailedTo?: string;
}

interface JobDetailModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onGenerateEmail?: () => void;
  onDownloadPO?: () => void;
  onDownloadInvoice?: () => void;
  onDownloadQuote?: () => void;
  onRefresh?: () => void;
}

type TabType = 'overview' | 'pricing' | 'purchase-orders' | 'notes';

export function JobDetailModal({
  job,
  isOpen,
  onClose,
  onEdit,
  onGenerateEmail,
  onDownloadPO,
  onDownloadInvoice,
  onDownloadQuote,
  onRefresh,
}: JobDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isAddingPO, setIsAddingPO] = useState(false);
  const [selectedLineItems, setSelectedLineItems] = useState<Set<number>>(new Set());
  const [poType, setPOType] = useState<'impact-vendor' | 'bradford-jd'>('impact-vendor');
  const [poVendorId, setPOVendorId] = useState('');
  const [poDescription, setPODescription] = useState('');
  const [poManualCost, setPOManualCost] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Edit existing PO state
  const [editingPOId, setEditingPOId] = useState<string | null>(null);
  const [editPOData, setEditPOData] = useState<{
    description: string;
    buyCost: string;
    paperCost: string;
    paperMarkup: string;
    mfgCost: string;
    printCPM: string;
    paperCPM: string;
    vendorId: string;
    originCompanyId: string;
    targetCompanyId: string;
  }>({ description: '', buyCost: '', paperCost: '', paperMarkup: '', mfgCost: '', printCPM: '', paperCPM: '', vendorId: '', originCompanyId: '', targetCompanyId: '' });

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedJob, setEditedJob] = useState<Partial<Job & { vendorId?: string; bradfordTotal?: number }>>({});
  const [isSavingJob, setIsSavingJob] = useState(false);

  // Vendor list for dropdown
  const [vendors, setVendors] = useState<Array<{ id: string; name: string; isPartner?: boolean }>>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(false);

  // Email modal state
  const [showEmailInvoiceModal, setShowEmailInvoiceModal] = useState(false);
  const [showEmailDropdown, setShowEmailDropdown] = useState(false);
  const [emailType, setEmailType] = useState<'invoice' | 'po' | null>(null);
  const [selectedPOForEmail, setSelectedPOForEmail] = useState<{id: string; poNumber: string; vendorName: string; vendorEmail?: string} | null>(null);

  // Artwork notification state
  const [artworkUrl, setArtworkUrl] = useState('');
  const [showArtworkConfirmModal, setShowArtworkConfirmModal] = useState(false);
  const [isSendingArtworkNotification, setIsSendingArtworkNotification] = useState(false);

  // Fetch vendors when edit mode is enabled OR when adding PO
  useEffect(() => {
    if ((isEditMode || isAddingPO) && vendors.length === 0) {
      setIsLoadingVendors(true);
      fetch('/api/entities?type=VENDOR')
        .then(res => res.json())
        .then(data => setVendors(data))
        .catch(err => console.error('Failed to fetch vendors:', err))
        .finally(() => setIsLoadingVendors(false));
    }
  }, [isEditMode, isAddingPO, vendors.length]);

  // Initialize editedJob when job changes or edit mode is enabled
  useEffect(() => {
    if (job && isEditMode) {
      setEditedJob({
        title: job.title,
        status: job.status,
        sellPrice: job.sellPrice,
        quantity: job.quantity,
        dueDate: job.dueDate,
        customerPONumber: job.customerPONumber,
        notes: job.notes,
        specs: { ...job.specs },
        vendorId: job.vendor?.id,
        bradfordTotal: job.profit?.totalCost,
      });
    }
  }, [job, isEditMode]);

  // Reset edit mode when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsEditMode(false);
      setEditedJob({});
      setShowEmailDropdown(false);
    }
  }, [isOpen]);

  // Close email dropdown when clicking outside
  useEffect(() => {
    if (!showEmailDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-email-dropdown]')) {
        setShowEmailDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmailDropdown]);

  // Payment tracking state
  const [customerPaymentAmount, setCustomerPaymentAmount] = useState<number | null>(null);
  const [customerPaymentDate, setCustomerPaymentDate] = useState<string>('');
  const [vendorPaymentAmount, setVendorPaymentAmount] = useState<number | null>(null);
  const [vendorPaymentDate, setVendorPaymentDate] = useState<string>('');
  const [bradfordPaymentAmount, setBradfordPaymentAmount] = useState<number | null>(null);
  const [bradfordPaymentDate, setBradfordPaymentDate] = useState<string>('');
  const [isSavingPayments, setIsSavingPayments] = useState(false);

  // Sync payment state when job changes
  useEffect(() => {
    if (job) {
      setCustomerPaymentAmount(job.customerPaymentAmount ?? null);
      setCustomerPaymentDate(job.customerPaymentDate || '');
      setVendorPaymentAmount(job.vendorPaymentAmount ?? null);
      setVendorPaymentDate(job.vendorPaymentDate || '');
      setBradfordPaymentAmount(job.bradfordPaymentAmount ?? null);
      setBradfordPaymentDate(job.bradfordPaymentDate || '');
    }
  }, [job?.id]);

  if (!job) return null;

  const jobNumber = job.number || job.jobNo || 'Unknown';
  const createdDate = job.createdAt || job.dateCreated;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Calculate totals - ensure all values are numbers (database may return strings)
  const lineItemsTotal = job.lineItems?.reduce(
    (sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0
  ) || 0;

  const lineItemsCost = job.lineItems?.reduce(
    (sum, item) => sum + (Number(item.unitCost) || 0) * (Number(item.quantity) || 0), 0
  ) || 0;

  // PO total uses buyCost from API - only count Impact-origin POs (not Bradford→JD internal POs)
  const poTotal = job.purchaseOrders
    ?.filter(po => po.originCompanyId === 'impact-direct')
    .reduce((sum, po) => sum + (Number(po.buyCost) || 0), 0) || 0;

  // Calculate totalCost from CPM data if available (consistent with Bradford Cost Breakdown)
  const impactToBradfordPO = job.purchaseOrders?.find(
    po => po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford'
  );
  const bradfordToJDPO = job.purchaseOrders?.find(
    po => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
  );

  const paperCPMValue = impactToBradfordPO?.paperCPM || job.suggestedPricing?.paperCPM || 0;
  const printCPMValue = bradfordToJDPO?.printCPM || job.suggestedPricing?.printCPM || 0;
  // Require BOTH paperCPM AND printCPM for CPM calculation
  const hasCPMData = paperCPMValue > 0 && printCPMValue > 0;

  // Use profit values from API if available, with sensible fallbacks
  const sellPrice = Number(job.profit?.sellPrice) || Number(job.sellPrice) || lineItemsTotal || 0;

  // Calculate totalCost from CPM values when available (matches Bradford Cost Breakdown)
  let totalCost: number;
  if (hasCPMData && job.quantity) {
    const qty = job.quantity;
    const paperCostCalc = paperCPMValue * (qty / 1000);
    const paperMarkupCalc = paperCostCalc * 0.18;
    const mfgCostCalc = printCPMValue * (qty / 1000);
    totalCost = paperCostCalc + paperMarkupCalc + mfgCostCalc;
  } else {
    // Fall back to existing logic for non-Bradford jobs
    totalCost = Number(job.profit?.totalCost) || poTotal || lineItemsCost || 0;
  }
  // Always recalculate spread when using CPM data, otherwise use cached value
  const spread = hasCPMData ? (sellPrice - totalCost) : (Number(job.profit?.spread) ?? (sellPrice - totalCost));

  // Use paper markup from API - respects paperSource enum
  const paperSource = job.paperSource || (job.jdSuppliesPaper ? 'VENDOR' : 'BRADFORD');

  // Calculate paper markup from CPM when available
  let paperMarkup: number;
  if (hasCPMData && job.quantity) {
    const paperCostForMarkup = paperCPMValue * (job.quantity / 1000);
    paperMarkup = paperCostForMarkup * 0.18;
  } else {
    paperMarkup = Number(job.profit?.paperMarkup) || 0;
  }

  // Calculate profit split from spread (not stale backend data)
  // Bradford gets 50% of spread + paper markup (they handle paper), Impact gets 50% of spread only
  const spreadShare = spread / 2;
  const impactShare = hasCPMData ? spreadShare : (Number(job.profit?.impactTotal) || 0);
  const bradfordShare = hasCPMData ? (spreadShare + paperMarkup) : (Number(job.profit?.bradfordTotal) || 0);

  // === DATA ACCURACY WARNINGS ===
  // 1. ProfitSplit staleness - check if any PO was modified after profit calculation
  const profitCalculatedAt = job.profit?.calculatedAt ? new Date(job.profit.calculatedAt) : null;
  const latestPOUpdate = job.purchaseOrders?.reduce((latest, po) => {
    const poUpdated = po.updatedAt ? new Date(po.updatedAt) : null;
    if (!poUpdated) return latest;
    if (!latest) return poUpdated;
    return poUpdated > latest ? poUpdated : latest;
  }, null as Date | null);

  const isProfitStale = profitCalculatedAt && latestPOUpdate && latestPOUpdate > profitCalculatedAt;

  // 2. SellPrice vs PO cost mismatch - warn if they differ significantly
  const sellPricePoMismatch = sellPrice > 0 && totalCost > 0 && (
    sellPrice < totalCost * 0.9 || // Sell price lower than cost (losing money)
    (totalCost > 0 && sellPrice > totalCost * 3) // Sell price > 3x cost (unusually high margin)
  );

  // 3. Payment vs Invoice mismatch (if we have payment data)
  const customerPayment = job.customerPaymentAmount || 0;
  const paymentMismatch = customerPayment > 0 && sellPrice > 0 && Math.abs(customerPayment - sellPrice) > 0.01;

  // Calculate selected line items total for smart PO
  const selectedTotal = useMemo(() => {
    if (!job.lineItems) return 0;
    return Array.from(selectedLineItems).reduce((sum, idx) => {
      const item = job.lineItems![idx];
      return sum + ((Number(item.unitCost) || 0) * (Number(item.quantity) || 0));
    }, 0);
  }, [selectedLineItems, job.lineItems]);

  // Toggle line item selection
  const toggleLineItem = (index: number) => {
    const newSet = new Set(selectedLineItems);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedLineItems(newSet);
  };

  // Select all line items
  const selectAllLineItems = () => {
    if (job.lineItems) {
      setSelectedLineItems(new Set(job.lineItems.map((_, i) => i)));
    }
  };

  // PO Management with smart creation
  const handleAddPO = async () => {
    // For Impact → Vendor POs, must have a vendor selected
    if (poType === 'impact-vendor' && !poVendorId) {
      alert('Please select a vendor');
      return;
    }

    // Must have either selected line items OR a manual cost entered
    const hasLineItems = selectedLineItems.size > 0;
    const manualCostValue = poManualCost ? parseFloat(poManualCost) : 0;
    const hasManualCost = manualCostValue > 0;

    if (!hasLineItems && !hasManualCost) {
      alert('Please select line items or enter a cost amount');
      return;
    }

    setIsSaving(true);
    try {
      // Build description from selected items
      const selectedDescriptions = job.lineItems && hasLineItems
        ? Array.from(selectedLineItems).map(idx => job.lineItems![idx].description).join(', ')
        : '';

      // Use manual cost if provided, otherwise use selected line items total
      const poCost = hasManualCost ? manualCostValue : selectedTotal;

      // Default description based on PO type
      const defaultDescription = poType === 'bradford-jd' ? 'JD Graphic Manufacturing' : 'Vendor Services';

      const response = await fetch(`/api/jobs/${job.id}/pos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poType,
          vendorId: poType === 'impact-vendor' ? poVendorId : undefined,
          buyCost: poCost,
          description: poDescription || selectedDescriptions || defaultDescription,
        }),
      });

      if (!response.ok) throw new Error('Failed to create PO');

      // Reset form
      setSelectedLineItems(new Set());
      setPOType('impact-vendor');
      setPOVendorId('');
      setPODescription('');
      setPOManualCost('');
      setIsAddingPO(false);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to add PO:', error);
      alert('Failed to add purchase order');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePO = async (poId: string) => {
    if (!confirm('Delete this purchase order?')) return;

    try {
      const response = await fetch(`/api/jobs/pos/${poId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete PO');
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to delete PO:', error);
      alert('Failed to delete purchase order');
    }
  };

  // Start editing a PO
  const startEditingPO = (po: any) => {
    const isBradfordToJD = po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic';
    const isImpactToBradford = po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford';

    // For CPM fields: use stored value, or fall back to suggested pricing for standard sizes
    let initialPrintCPM = po.printCPM?.toString() || '';
    let initialPaperCPM = po.paperCPM?.toString() || '';

    // If no stored CPM and we have suggested pricing, use that
    if (!initialPrintCPM && isBradfordToJD && job?.suggestedPricing?.printCPM) {
      initialPrintCPM = job.suggestedPricing.printCPM.toString();
    }
    if (!initialPaperCPM && isImpactToBradford && job?.suggestedPricing?.paperCPM) {
      initialPaperCPM = job.suggestedPricing.paperCPM.toString();
    }

    setEditingPOId(po.id);
    setEditPOData({
      description: po.description || '',
      buyCost: po.buyCost?.toString() || '',
      paperCost: po.paperCost?.toString() || '',
      paperMarkup: po.paperMarkup?.toString() || '',
      mfgCost: po.mfgCost?.toString() || '',
      printCPM: initialPrintCPM,
      paperCPM: initialPaperCPM,
      vendorId: po.vendor?.id || po.vendorId || '',
      originCompanyId: po.originCompanyId || '',
      targetCompanyId: po.targetCompanyId || '',
    });
    // Load vendors if not already loaded
    if (vendors.length === 0) {
      setIsLoadingVendors(true);
      fetch('/api/entities?type=VENDOR')
        .then(res => res.json())
        .then(data => setVendors(data))
        .catch(err => console.error('Failed to fetch vendors:', err))
        .finally(() => setIsLoadingVendors(false));
    }
  };

  // Save edited PO
  const handleSavePO = async (poId: string) => {
    setIsSaving(true);
    try {
      // Determine PO type based on company IDs
      const isImpactToBradford = editPOData.originCompanyId === 'impact-direct' && editPOData.targetCompanyId === 'bradford';
      const isBradfordToJD = editPOData.originCompanyId === 'bradford' && editPOData.targetCompanyId === 'jd-graphic';

      const qty = job?.quantity || 0;

      // Calculate costs based on CPM for structured POs
      let calculatedBuyCost: number | undefined;
      let calculatedMfgCost: number | undefined;
      let calculatedPaperCost: number | undefined;
      let calculatedPaperMarkup: number | undefined;

      if (isBradfordToJD) {
        // Bradford→JD: Calculate mfgCost from Print CPM
        const printCPM = parseFloat(editPOData.printCPM) || 0;
        calculatedMfgCost = printCPM * (qty / 1000);
        calculatedBuyCost = calculatedMfgCost;
      } else if (isImpactToBradford) {
        // Impact→Bradford: Calculate paper costs from Paper CPM
        const paperCPM = parseFloat(editPOData.paperCPM) || 0;
        calculatedPaperCost = paperCPM * (qty / 1000);
        calculatedPaperMarkup = calculatedPaperCost * 0.18; // 18% markup

        // Get JD mfg cost from Bradford→JD PO
        const bradfordToJDPO = job?.purchaseOrders?.find(
          p => p.originCompanyId === 'bradford' && p.targetCompanyId === 'jd-graphic'
        );
        const jdMfgCost = bradfordToJDPO?.buyCost || 0;

        calculatedBuyCost = calculatedPaperCost + calculatedPaperMarkup + jdMfgCost;
      } else {
        // Generic PO: use manual buyCost
        calculatedBuyCost = editPOData.buyCost ? parseFloat(editPOData.buyCost) : undefined;
      }

      const response = await fetch(`/api/jobs/pos/${poId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editPOData.description || undefined,
          buyCost: calculatedBuyCost,
          paperCost: calculatedPaperCost ?? (editPOData.paperCost ? parseFloat(editPOData.paperCost) : undefined),
          paperMarkup: calculatedPaperMarkup ?? (editPOData.paperMarkup ? parseFloat(editPOData.paperMarkup) : undefined),
          mfgCost: calculatedMfgCost ?? (editPOData.mfgCost ? parseFloat(editPOData.mfgCost) : undefined),
          printCPM: editPOData.printCPM ? parseFloat(editPOData.printCPM) : undefined,
          paperCPM: editPOData.paperCPM ? parseFloat(editPOData.paperCPM) : undefined,
          vendorId: editPOData.vendorId || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to update PO');
      setEditingPOId(null);
      setEditPOData({ description: '', buyCost: '', paperCost: '', paperMarkup: '', mfgCost: '', printCPM: '', paperCPM: '', vendorId: '', originCompanyId: '', targetCompanyId: '' });
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to update PO:', error);
      alert('Failed to update purchase order');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel editing PO
  const cancelEditingPO = () => {
    setEditingPOId(null);
    setEditPOData({ description: '', buyCost: '', paperCost: '', paperMarkup: '', mfgCost: '', printCPM: '', paperCPM: '', vendorId: '', originCompanyId: '', targetCompanyId: '' });
  };

  // Initialize PO vendor from job
  const startAddingPO = () => {
    setPOVendorId(job.vendor?.id || '');
    setPOManualCost('');
    setIsAddingPO(true);
    if (job.lineItems && job.lineItems.length > 0) {
      selectAllLineItems();
    }
  };

  // Save all payment statuses
  const handleSavePayments = async () => {
    setIsSavingPayments(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}/payments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPaymentAmount: customerPaymentAmount,
          customerPaymentDate: customerPaymentDate || null,
          vendorPaymentAmount: vendorPaymentAmount,
          vendorPaymentDate: vendorPaymentDate || null,
          bradfordPaymentAmount: bradfordPaymentAmount,
          bradfordPaymentDate: bradfordPaymentDate || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to save payments');
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to save payments:', error);
      alert('Failed to save payment information');
    } finally {
      setIsSavingPayments(false);
    }
  };

  // Save edited job
  const handleSaveJob = async () => {
    setIsSavingJob(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedJob),
      });

      if (!response.ok) throw new Error('Failed to save job');
      setIsEditMode(false);
      setEditedJob({});
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to save job:', error);
      alert('Failed to save job');
    } finally {
      setIsSavingJob(false);
    }
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedJob({});
  };

  // Update a field in editedJob
  const updateEditedField = (field: string, value: any) => {
    setEditedJob(prev => ({ ...prev, [field]: value }));
  };

  // Update a spec field
  const updateEditedSpec = (field: string, value: any) => {
    setEditedJob(prev => ({
      ...prev,
      specs: { ...prev.specs, [field]: value }
    }));
  };

  // Get the current value (edited or original)
  const getValue = <T,>(field: keyof Job): T | undefined => {
    if (isEditMode && field in editedJob) {
      return editedJob[field] as T;
    }
    return job[field] as T;
  };

  // Get spec value
  const getSpecValue = (field: keyof NonNullable<Job['specs']>): any => {
    if (isEditMode && editedJob.specs && field in editedJob.specs) {
      return editedJob.specs[field];
    }
    return job.specs?.[field];
  };

  // Status options matching database JobStatus enum
  const statusOptions = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Paid', value: 'PAID' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  // Tab content components
  const OverviewTab = () => (
    <div className="space-y-6">
      {/* Job Info - Status and key fields */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Info</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            <div>
              <span className="text-xs text-gray-500 uppercase block mb-1">Status</span>
              {isEditMode ? (
                <select
                  value={editedJob.status ?? job.status ?? ''}
                  onChange={(e) => updateEditedField('status', e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {statusOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                  job.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                  job.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                  job.status === 'ACTIVE' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {statusOptions.find(s => s.value === job.status)?.label || job.status}
                </span>
              )}
            </div>
            <EditableField
              label="Customer PO"
              value={getSpecValue('customerPONumber') ?? getValue<string>('customerPONumber')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedField('customerPONumber', val)}
              emptyText="—"
            />
            <EditableField
              label="Due Date"
              value={getValue<string>('dueDate')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedField('dueDate', val)}
              type="date"
              emptyText="Not set"
            />
            <EditableField
              label="Sell Price"
              value={getValue<number>('sellPrice')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedField('sellPrice', parseFloat(val) || 0)}
              type="number"
              prefix="$"
              emptyText="$0.00"
            />
            <EditableField
              label="Quantity"
              value={getValue<number>('quantity')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedField('quantity', parseInt(val) || 0)}
              type="number"
              emptyText="—"
            />
          </div>
        </div>
      </div>

      {/* Job Specifications - Front and Center */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Specifications</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            <EditableField
              label="Product Type"
              value={getSpecValue('productType')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedSpec('productType', val)}
              emptyText="—"
            />
            <EditableField
              label="Standard Size"
              value={job.sizeName || ''}
              isEditing={false}
              onChange={() => {}}
              emptyText="—"
            />
            <EditableField
              label="Flat Size"
              value={getSpecValue('flatSize')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedSpec('flatSize', val)}
              emptyText="—"
            />
            <EditableField
              label="Finished Size"
              value={getSpecValue('finishedSize')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedSpec('finishedSize', val)}
              emptyText="—"
            />
            <EditableField
              label="Colors"
              value={getSpecValue('colors')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedSpec('colors', val)}
              emptyText="—"
            />
            <EditableField
              label="Pages"
              value={getSpecValue('pageCount')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedSpec('pageCount', parseInt(val) || 0)}
              type="number"
              emptyText="—"
            />
            <EditableField
              label="Paper Type"
              value={getSpecValue('paperType')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedSpec('paperType', val)}
              emptyText="—"
            />
            <EditableField
              label="Bradford Paper (lbs)"
              value={job.bradfordPaperLbs ?? getSpecValue('paperLbs') ?? ''}
              isEditing={isEditMode}
              onChange={(val) => updateEditedField('bradfordPaperLbs', parseFloat(val) || null)}
              type="number"
              emptyText="—"
            />
            <EditableField
              label="Coating"
              value={getSpecValue('coating')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedSpec('coating', val)}
              emptyText="—"
            />
            <EditableField
              label="Finishing"
              value={getSpecValue('finishing')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedSpec('finishing', val)}
              emptyText="—"
            />
            <EditableField
              label="Binding"
              value={getSpecValue('bindingStyle')}
              isEditing={isEditMode}
              onChange={(val) => updateEditedSpec('bindingStyle', val)}
              emptyText="—"
            />
          </div>
        </div>
      </div>

      {/* Customer & Vendor - Side by Side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</span>
          </div>
          {job.customer ? (
            <div className="space-y-1">
              <p className="font-semibold text-gray-900">{job.customer.name}</p>
              {job.customer.contactPerson && (
                <p className="text-sm text-gray-600">{job.customer.contactPerson}</p>
              )}
              {job.customer.email && (
                <p className="text-sm text-gray-500">{job.customer.email}</p>
              )}
              {job.customer.phone && (
                <p className="text-sm text-gray-500">{job.customer.phone}</p>
              )}
              {job.customerPONumber && (
                <p className="text-sm text-blue-600 font-medium mt-2">PO: {job.customerPONumber}</p>
              )}
            </div>
          ) : (
            <p className="text-gray-400 italic text-sm">Not assigned</p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendor</span>
            {!isEditMode && job.vendor?.isPartner && (
              <span className="px-2 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded ml-auto">
                PARTNER
              </span>
            )}
          </div>
          {isEditMode ? (
            <div className="space-y-2">
              <select
                value={editedJob.vendorId || ''}
                onChange={(e) => updateEditedField('vendorId', e.target.value || null)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isLoadingVendors}
              >
                <option value="">Select vendor...</option>
                {vendors.map(vendor => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}{vendor.isPartner ? ' (Partner)' : ''}
                  </option>
                ))}
              </select>
              {editedJob.vendorId && vendors.find(v => v.id === editedJob.vendorId)?.isPartner && (
                <span className="inline-flex px-2 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded">
                  PARTNER - 50/50 Split
                </span>
              )}
            </div>
          ) : job.vendor ? (
            <div className="space-y-1">
              <p className="font-semibold text-gray-900">{job.vendor.name}</p>
              {job.vendor.contactPerson && (
                <p className="text-sm text-gray-600">{job.vendor.contactPerson}</p>
              )}
              {job.vendor.email && (
                <p className="text-sm text-gray-500">{job.vendor.email}</p>
              )}
              {job.vendor.phone && (
                <p className="text-sm text-gray-500">{job.vendor.phone}</p>
              )}
            </div>
          ) : (
            <p className="text-gray-400 italic text-sm">Not assigned</p>
          )}
        </div>
      </div>

      {/* Paper Source */}
      <div className={`border rounded-lg p-4 ${
        paperSource === 'BRADFORD' ? 'bg-orange-50 border-orange-200' :
        paperSource === 'CUSTOMER' ? 'bg-blue-50 border-blue-200' :
        'bg-white border-gray-200'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className={`w-4 h-4 ${
            paperSource === 'BRADFORD' ? 'text-orange-500' :
            paperSource === 'CUSTOMER' ? 'text-blue-500' :
            'text-gray-400'
          }`} />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Paper Source</span>
        </div>
        <p className={`font-semibold ${
          paperSource === 'BRADFORD' ? 'text-orange-700' :
          paperSource === 'CUSTOMER' ? 'text-blue-700' :
          'text-gray-700'
        }`}>
          {paperSource === 'BRADFORD' ? 'Bradford Supplies Paper' :
           paperSource === 'VENDOR' ? 'Vendor Supplies Paper' :
           'Customer Supplies Paper'}
        </p>
        {paperSource === 'BRADFORD' && job.paperInventory && (
          <p className="text-sm text-orange-600 mt-1">
            Linked: {job.paperInventory.rollType} - {job.paperInventory.rollWidth}" {job.paperInventory.paperType}
          </p>
        )}
        {paperMarkup > 0 && (
          <p className="text-sm text-orange-600 mt-1">
            Paper Markup: {formatCurrency(paperMarkup)}
          </p>
        )}
      </div>

      {/* Artwork Link Section */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link className="w-4 h-4 text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Artwork Link</h3>
          </div>
          {job.artworkEmailedAt && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Sent {new Date(job.artworkEmailedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="p-4">
          {/* Show existing artwork URL if present */}
          {job.specs?.artworkUrl && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-600 font-medium mb-1">Current Artwork Link:</p>
              <a
                href={job.specs.artworkUrl as string}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-700 hover:underline flex items-center gap-1 break-all"
              >
                {job.specs.artworkUrl as string}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          )}

          {/* Input and send button */}
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="Paste artwork link here..."
              value={artworkUrl}
              onChange={(e) => setArtworkUrl(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={() => setShowArtworkConfirmModal(true)}
              disabled={!artworkUrl.trim() || !job.vendor?.email || isSendingArtworkNotification}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>

          {/* Warning if no vendor email */}
          {!job.vendor?.email && (
            <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              No vendor email - assign a vendor with email to send notifications
            </p>
          )}

          {/* Info about who will receive */}
          {job.vendor?.email && (
            <p className="mt-2 text-xs text-gray-500">
              Will send to: {job.vendor.name} ({job.vendor.email}) + internal team
            </p>
          )}
        </div>
      </div>

      {/* Paper Details (for standard sizes with snapshotted data) */}
      {job.paperData && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Paper Details</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Paper Type</span>
                <p className="font-medium text-gray-900">{job.paperData.paperType}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Weight per 1,000</span>
                <p className="font-medium text-gray-900">{job.paperData.lbsPerThousand} lbs</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Cost per lb</span>
                <p className="font-medium text-gray-900">${job.paperData.costPerLb.toFixed(3)}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Raw Paper Cost</span>
                <p className="font-medium text-gray-900">
                  {job.paperData.rawTotal ? formatCurrency(job.paperData.rawTotal) : '—'}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Paper Charged</span>
                <p className="font-medium text-gray-900">
                  {job.paperData.chargedTotal ? formatCurrency(job.paperData.chargedTotal) : '—'}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Bradford Markup ({job.paperData.markupPercent}%)</span>
                <p className="font-semibold text-orange-600">
                  {job.paperData.markupAmount ? formatCurrency(job.paperData.markupAmount) : '—'}
                </p>
              </div>
            </div>
            {job.sizeName && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  Standard Size: {job.sizeName} • Data snapshotted at job creation
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dates & References */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dates & References</h3>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {createdDate && (
              <div>
                <span className="text-xs text-gray-500 uppercase">Created</span>
                <p className="font-medium text-gray-900">
                  {new Date(createdDate).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </p>
              </div>
            )}
            {job.dueDate && (
              <div>
                <span className="text-xs text-gray-500 uppercase">Due Date</span>
                <p className="font-medium text-gray-900">
                  {new Date(job.dueDate).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric'
                  })}
                </p>
              </div>
            )}
            {job.customerPONumber && (
              <div>
                <span className="text-xs text-gray-500 uppercase">Customer PO</span>
                <p className="font-medium text-gray-900">{job.customerPONumber}</p>
              </div>
            )}
            {job.vendorPONumber && (
              <div>
                <span className="text-xs text-gray-500 uppercase">Vendor PO</span>
                <p className="font-medium text-gray-900">{job.vendorPONumber}</p>
              </div>
            )}
            {job.invoiceNumber && (
              <div>
                <span className="text-xs text-gray-500 uppercase">Invoice #</span>
                <p className="font-medium text-gray-900">{job.invoiceNumber}</p>
              </div>
            )}
            {job.quoteNumber && (
              <div>
                <span className="text-xs text-gray-500 uppercase">Quote #</span>
                <p className="font-medium text-gray-900">{job.quoteNumber}</p>
              </div>
            )}
            {job.bradfordRefNumber && (
              <div>
                <span className="text-xs text-gray-500 uppercase">JD PO / Bradford Payment Ref</span>
                <p className="font-semibold text-orange-600">{job.bradfordRefNumber}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const PricingTab = () => {
    // Extract PO data for cost breakdown
    // Check both targetCompanyId and targetVendorId since manual POs use vendor links
    const impactToBradfordPO = job.purchaseOrders?.find(
      po => po.originCompanyId === 'impact-direct' && (
        po.targetCompanyId === 'bradford' ||
        po.vendorId?.toLowerCase().includes('bradford') ||
        po.vendor?.name?.toLowerCase().includes('bradford')
      )
    );
    const bradfordToJDPO = job.purchaseOrders?.find(
      po => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
    );

    // Also find any Impact-origin POs for general cost display
    const anyImpactPO = job.purchaseOrders?.find(
      po => po.originCompanyId === 'impact-direct'
    );

    // Get CPM values from POs or suggested pricing
    const qty = job.quantity || 0;
    const paperCPM = impactToBradfordPO?.paperCPM || job.suggestedPricing?.paperCPM || 0;
    const printCPM = bradfordToJDPO?.printCPM || job.suggestedPricing?.printCPM || 0;
    const paperLbsPerM = job.suggestedPricing?.paperLbsPerM || job.paperData?.lbsPerThousand || 0;

    // Calculate costs from CPM
    const paperUsageLbs = paperLbsPerM * (qty / 1000);
    const paperCost = paperCPM * (qty / 1000);
    const paperMarkupCalc = paperCost * 0.18;
    const mfgCost = printCPM * (qty / 1000);
    const totalPOCost = paperCost + paperMarkupCalc + mfgCost;

    // Check if we have CPM-based pricing data
    const hasCPMData = paperCPM > 0 || printCPM > 0;

    // Calculate total from actual PO buyCost values for non-CPM jobs
    const impactPOs = job.purchaseOrders?.filter(po => po.originCompanyId === 'impact-direct') || [];
    const totalBuyCost = impactPOs.reduce((sum, po) => sum + (po.buyCost || 0), 0);

    const hasPOData = impactToBradfordPO || bradfordToJDPO || anyImpactPO;

    return (
    <div className="space-y-6">
      {/* Cost Breakdown from POs - Primary section */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bradford Cost Breakdown</h3>
          {job.sizeName && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
              Size: {job.sizeName}
            </span>
          )}
        </div>
        <div className="p-4">
          {hasPOData ? (
            <div className="space-y-4">
              {hasCPMData ? (
                <>
                  {/* CPM-based cost breakdown grid */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {/* Paper Usage */}
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <span className="text-xs text-gray-500 uppercase block mb-1">Paper Usage</span>
                      <p className="text-lg font-bold text-gray-900">{paperUsageLbs.toFixed(1)} lbs</p>
                      <p className="text-xs text-gray-500">{paperLbsPerM} lbs/M × {(qty/1000).toFixed(1)}M</p>
                    </div>

                    {/* Paper Cost */}
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <span className="text-xs text-amber-700 uppercase block mb-1">Paper Cost</span>
                      <p className="text-lg font-bold text-amber-900">{formatCurrency(paperCost)}</p>
                      <p className="text-xs text-amber-600">${paperCPM.toFixed(2)}/M CPM</p>
                    </div>

                    {/* Paper Markup */}
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <span className="text-xs text-blue-700 uppercase block mb-1">Paper Markup</span>
                      <p className="text-lg font-bold text-blue-900">{formatCurrency(paperMarkupCalc)}</p>
                      <p className="text-xs text-blue-600">18% markup</p>
                    </div>

                    {/* Mfg Cost */}
                    <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                      <span className="text-xs text-purple-700 uppercase block mb-1">Mfg Cost</span>
                      <p className="text-lg font-bold text-purple-900">{formatCurrency(mfgCost)}</p>
                      <p className="text-xs text-purple-600">${printCPM.toFixed(2)}/M CPM</p>
                    </div>

                    {/* Total Cost */}
                    <div className="bg-green-50 rounded-lg p-3 border border-green-300">
                      <span className="text-xs text-green-700 uppercase block mb-1">Total Cost</span>
                      <p className="text-lg font-bold text-green-900">{formatCurrency(totalPOCost)}</p>
                      <p className="text-xs text-green-600">from POs</p>
                    </div>
                  </div>

                  {/* PO Reference */}
                  <div className="flex gap-4 text-xs text-gray-500 pt-2 border-t border-gray-200">
                    {impactToBradfordPO && (
                      <span>Impact→Bradford PO: <span className="font-mono text-gray-700">{impactToBradfordPO.poNumber || 'N/A'}</span></span>
                    )}
                    {bradfordToJDPO && (
                      <span>Bradford→JD PO: <span className="font-mono text-gray-700">{bradfordToJDPO.poNumber || 'N/A'}</span></span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Simple PO cost summary for non-CPM jobs */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Total PO Cost */}
                    <div className="bg-green-50 rounded-lg p-4 border border-green-300">
                      <span className="text-xs text-green-700 uppercase block mb-1">Total PO Cost</span>
                      <p className="text-2xl font-bold text-green-900">{formatCurrency(totalBuyCost)}</p>
                      <p className="text-xs text-green-600">{impactPOs.length} Impact PO{impactPOs.length !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Quantity */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <span className="text-xs text-gray-500 uppercase block mb-1">Quantity</span>
                      <p className="text-2xl font-bold text-gray-900">{qty.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">pieces</p>
                    </div>
                  </div>

                  {/* PO List */}
                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500 uppercase mb-2">Purchase Orders</p>
                    <div className="space-y-2">
                      {impactPOs.map(po => (
                        <div key={po.id} className="flex justify-between items-center text-sm bg-gray-50 px-3 py-2 rounded">
                          <div>
                            <span className="font-mono text-purple-700">{po.poNumber}</span>
                            {po.description && <span className="text-gray-500 ml-2">• {po.description}</span>}
                          </div>
                          <span className="font-semibold">{formatCurrency(po.buyCost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <p className="text-sm">No POs generated yet</p>
              <p className="text-xs mt-1">Go to Purchase Orders tab to create POs with pricing</p>
            </div>
          )}
        </div>
      </div>

      {/* Line Items */}
      {job.lineItems && job.lineItems.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Description</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase">Qty</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase">Unit Cost</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase">Unit Price</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {job.lineItems.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{item.description || '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{(item.quantity ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.unitCost ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.unitPrice ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency((item.unitPrice ?? 0) * (item.quantity ?? 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-700 uppercase text-xs">Total</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(lineItemsTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Data Accuracy Warnings */}
      {(isProfitStale || sellPricePoMismatch || paymentMismatch) && (
        <div className="space-y-2">
          {isProfitStale && (
            <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Financial Summary May Be Outdated</p>
                <p className="text-xs text-yellow-700 mt-0.5">
                  Purchase orders were modified after the profit calculation. The displayed values may not reflect recent changes.
                </p>
              </div>
            </div>
          )}
          {sellPricePoMismatch && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Sell Price Differs Significantly from Costs</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {sellPrice < totalCost
                    ? `Sell price (${formatCurrency(sellPrice)}) is below total cost (${formatCurrency(totalCost)}). You may be losing money on this job.`
                    : `Sell price (${formatCurrency(sellPrice)}) is significantly higher than costs (${formatCurrency(totalCost)}). Please verify pricing is correct.`
                  }
                </p>
              </div>
            </div>
          )}
          {paymentMismatch && (
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">Payment Amount Doesn't Match Sell Price</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Customer payment ({formatCurrency(customerPayment)}) differs from sell price ({formatCurrency(sellPrice)}). Please verify the payment is correct.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Profit Summary */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Profit Summary</h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500 uppercase block mb-1">Sell Price</span>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(sellPrice)}</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500 uppercase block mb-1">Total Cost</span>
              {isEditMode ? (
                <input
                  type="number"
                  value={editedJob.bradfordTotal ?? totalCost ?? ''}
                  onChange={(e) => updateEditedField('bradfordTotal', parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1 text-center text-2xl font-bold border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  step="0.01"
                />
              ) : (
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalCost)}</p>
              )}
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500 uppercase block mb-1">Spread</span>
              <p className={`text-2xl font-bold ${spread >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(spread)}
              </p>
            </div>
          </div>

          {/* Profit Split - Only show for partner jobs */}
          {job.vendor?.isPartner && (
            <div className="pt-4 border-t border-gray-200">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Profit Split (50/50)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="text-xs text-blue-600 font-medium uppercase">Impact Direct</span>
                  <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(impactShare)}</p>
                  {paperMarkup > 0 && (
                    <p className="text-xs text-blue-500 mt-1">Includes {formatCurrency(paperMarkup)} paper markup</p>
                  )}
                </div>
                <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                  <span className="text-xs text-orange-600 font-medium uppercase">Bradford</span>
                  <p className="text-xl font-bold text-orange-700 mt-1">{formatCurrency(bradfordShare)}</p>
                  <p className="text-xs text-orange-500 mt-1">50% of spread</p>
                </div>
              </div>
            </div>
          )}

          {/* Bradford Partner Details (if available) */}
          {job.vendor?.isPartner && job.financials?.impactCustomerTotal && (
            <div className="pt-4 border-t border-gray-200">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bradford Partner Details</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-xs text-gray-500 uppercase">Customer Total</span>
                  <p className="font-medium text-gray-900">{formatCurrency(job.financials.impactCustomerTotal)}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase">JD Services</span>
                  <p className="font-medium text-gray-900">{formatCurrency(job.financials.jdServicesTotal || 0)}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase">Paper Cost</span>
                  <p className="font-medium text-gray-900">{formatCurrency(job.financials.bradfordPaperCost || 0)}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase">Paper Markup</span>
                  <p className="font-medium text-gray-900">{formatCurrency(job.financials.paperMarkupAmount || 0)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  };

  const PurchaseOrdersTab = () => (
    <div className="space-y-6">
      {/* Existing POs */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Purchase Orders</h3>
          {!isAddingPO && (
            <button
              onClick={startAddingPO}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg font-medium"
            >
              <Plus className="w-4 h-4" />
              Add PO
            </button>
          )}
        </div>

        {job.purchaseOrders && job.purchaseOrders.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">PO #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Vendor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Description</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase">Amount</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {job.purchaseOrders.map((po) => {
                // Determine PO type based on company IDs
                const isImpactToBradford = po.originCompanyId === 'impact-direct' && po.targetCompanyId === 'bradford';
                const isBradfordToJD = po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic';
                const isStructuredPO = isImpactToBradford || isBradfordToJD;
                // Any Impact-origin PO counts as our cost
                const isImpactCost = po.originCompanyId === 'impact-direct';

                // Find the Bradford→JD PO to get JD mfg cost
                const bradfordToJDPO = job.purchaseOrders?.find(
                  p => p.originCompanyId === 'bradford' && p.targetCompanyId === 'jd-graphic'
                );
                const jdMfgCost = bradfordToJDPO?.buyCost || 0;

                // Calculate totals using CPM for Impact→Bradford PO
                const qty = job.quantity || 0;
                const paperCPM = parseFloat(editPOData.paperCPM) || 0;
                const paperTotal = paperCPM * (qty / 1000);
                const paperMarkupAmount = paperTotal * 0.18;
                const calculatedTotal = isImpactToBradford
                  ? paperTotal + paperMarkupAmount + jdMfgCost
                  : 0;

                return editingPOId === po.id ? (
                  // Edit mode - expanded row for structured POs
                  isStructuredPO ? (
                    <tr key={po.id} className="bg-blue-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="space-y-3">
                          {/* PO Header */}
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono text-sm text-blue-700">{po.poNumber || '-'}</span>
                              <span className="ml-2 text-xs text-gray-500">
                                {isImpactToBradford ? 'Impact → Bradford' : 'Bradford → JD Graphic'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleSavePO(po.id)}
                                disabled={isSaving}
                                className="px-3 py-1.5 text-sm text-white bg-green-600 hover:bg-green-700 rounded font-medium flex items-center gap-1"
                              >
                                <Check className="w-4 h-4" />
                                Save
                              </button>
                              <button
                                onClick={cancelEditingPO}
                                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>

                          {/* Cost Fields Grid */}
                          {isImpactToBradford ? (
                            <div className="grid grid-cols-5 gap-3">
                              {/* Paper CPM */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Paper CPM
                                  {job?.suggestedPricing?.paperCPM && (
                                    <span className="ml-1 text-blue-500 font-normal">(suggested)</span>
                                  )}
                                </label>
                                <div className="relative">
                                  <span className="absolute left-2 top-1.5 text-gray-500 text-sm">$</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={editPOData.paperCPM}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                        setEditPOData(prev => ({ ...prev, paperCPM: val }));
                                      }
                                    }}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    placeholder={job?.suggestedPricing?.paperCPM?.toFixed(2) || '0.00'}
                                    className="w-full pl-6 pr-2 py-1.5 text-sm text-right border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                {!job?.suggestedPricing && (
                                  <p className="text-xs text-amber-600 mt-0.5">Custom size</p>
                                )}
                              </div>

                              {/* Paper Total (calculated) */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Paper Total</label>
                                <div className="px-2 py-1.5 text-sm text-right bg-gray-100 border border-gray-200 rounded text-gray-700">
                                  {formatCurrency(paperTotal)}
                                </div>
                              </div>

                              {/* Paper Markup (auto 18%) */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Markup (18%)</label>
                                <div className="px-2 py-1.5 text-sm text-right bg-gray-100 border border-gray-200 rounded text-gray-700">
                                  {formatCurrency(paperMarkupAmount)}
                                </div>
                              </div>

                              {/* JD Mfg Cost (from Bradford→JD PO) */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">JD Mfg Cost</label>
                                <div className="px-2 py-1.5 text-sm text-right bg-blue-50 border border-blue-200 rounded text-blue-700">
                                  {formatCurrency(jdMfgCost)}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">from Bradford→JD</p>
                              </div>

                              {/* Grand Total (calculated) */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Total</label>
                                <div className="px-2 py-1.5 text-sm text-right font-bold bg-green-100 border border-green-200 rounded text-green-800">
                                  {formatCurrency(calculatedTotal)}
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* Bradford → JD: CPM-based entry */
                            <div className="grid grid-cols-3 gap-3 max-w-xl">
                              {/* Print CPM */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Print CPM
                                  {job?.suggestedPricing?.printCPM && (
                                    <span className="ml-1 text-blue-500 font-normal">(suggested)</span>
                                  )}
                                </label>
                                <div className="relative">
                                  <span className="absolute left-2 top-1.5 text-gray-500 text-sm">$</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={editPOData.printCPM}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                        setEditPOData(prev => ({ ...prev, printCPM: val }));
                                      }
                                    }}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    placeholder={job?.suggestedPricing?.printCPM?.toFixed(2) || '0.00'}
                                    className="w-full pl-6 pr-2 py-1.5 text-sm text-right border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                {!job?.suggestedPricing && (
                                  <p className="text-xs text-amber-600 mt-0.5">Custom size - enter CPM</p>
                                )}
                              </div>

                              {/* Quantity (display only) */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                                <div className="px-2 py-1.5 text-sm text-right bg-gray-100 border border-gray-200 rounded text-gray-700">
                                  {(job?.quantity || 0).toLocaleString()}
                                </div>
                              </div>

                              {/* Total (calculated) */}
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Total</label>
                                <div className="px-2 py-1.5 text-sm text-right font-bold bg-green-100 border border-green-200 rounded text-green-800">
                                  {formatCurrency((parseFloat(editPOData.printCPM) || 0) * ((job?.quantity || 0) / 1000))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    /* Generic PO - simple inline edit */
                    <tr key={po.id} className="bg-blue-50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-blue-700">{po.poNumber || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={editPOData.vendorId}
                          onChange={(e) => setEditPOData(prev => ({ ...prev, vendorId: e.target.value }))}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          disabled={isLoadingVendors}
                        >
                          <option value="">Select vendor...</option>
                          {vendors.map(vendor => (
                            <option key={vendor.id} value={vendor.id}>
                              {vendor.name}{vendor.isPartner ? ' (Partner)' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editPOData.description}
                          onChange={(e) => setEditPOData(prev => ({ ...prev, description: e.target.value }))}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder="Description"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <span className="absolute left-2 top-1.5 text-gray-500 text-sm">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editPOData.buyCost}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                setEditPOData(prev => ({ ...prev, buyCost: val }));
                              }
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder="0.00"
                            className="w-full pl-6 pr-2 py-1.5 text-sm text-right border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSavePO(po.id)}
                            disabled={isSaving}
                            className="p-1.5 text-green-600 hover:bg-green-100 rounded"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEditingPO}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ) : (
                  // View mode row - clickable to edit
                  isStructuredPO ? (
                    // Expanded view for structured POs
                    <tr
                      key={po.id}
                      className="hover:bg-gray-50 cursor-pointer group"
                      onClick={() => startEditingPO(po)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <span className="group-hover:text-blue-600">{po.poNumber || '-'}</span>
                        <span className="block text-xs text-gray-400">
                          {isImpactToBradford ? 'Impact → Bradford' : 'Bradford → JD'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          isImpactCost
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {isImpactCost ? 'Impact Cost' : 'Bradford Internal'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {po.vendor?.name || (isImpactToBradford ? 'Bradford' : 'JD Graphic')}
                      </td>
                      <td className="px-4 py-3">
                        {isImpactToBradford ? (
                          <div className="text-xs space-y-0.5">
                            {po.paperCPM ? (
                              <div className="text-blue-600 font-medium">
                                Paper CPM: {formatCurrency(Number(po.paperCPM))} × {((job?.quantity || 0) / 1000).toFixed(1)}M
                              </div>
                            ) : null}
                            <div className="text-gray-500">
                              Paper: {formatCurrency(Number(po.paperCost) || 0)}
                              {' + '}Markup: {formatCurrency(Number(po.paperMarkup) || 0)}
                              {' + '}JD: {formatCurrency(Number(po.mfgCost) || 0)}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs space-y-0.5">
                            {po.printCPM ? (
                              <div className="text-blue-600 font-medium">
                                Print CPM: {formatCurrency(Number(po.printCPM))} × {((job?.quantity || 0) / 1000).toFixed(1)}M
                              </div>
                            ) : null}
                            <span className="text-gray-600">Mfg Total: {formatCurrency(Number(po.mfgCost) || Number(po.buyCost) || 0)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(Number(po.buyCost) || 0)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); pdfApi.generatePO(po.id); }}
                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); startEditingPO(po); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeletePO(po.id); }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    // Simple view for generic POs
                    <tr
                      key={po.id}
                      className="hover:bg-gray-50 cursor-pointer group"
                      onClick={() => startEditingPO(po)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <span className="group-hover:text-blue-600">{po.poNumber || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          isImpactCost
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {isImpactCost ? 'Impact Cost' : 'Bradford Internal'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{po.vendor?.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{po.description || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(Number(po.buyCost) || 0)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); pdfApi.generatePO(po.id); }}
                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); startEditingPO(po); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeletePO(po.id); }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-700 uppercase text-xs">Total (Impact Cost)</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(poTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="p-6 text-center text-gray-500">
            <p className="text-sm">No purchase orders yet</p>
            <p className="text-xs text-gray-400 mt-1">Click "Add PO" to create one from the job's line items</p>
          </div>
        )}
      </div>

      {/* Smart Add PO Form */}
      {isAddingPO && (
        <div className="bg-white border-2 border-blue-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
            <h3 className="text-sm font-semibold text-blue-800">Create Purchase Order</h3>
          </div>
          <div className="p-4 space-y-4">
            {/* PO Type Selector */}
            <div>
              <label className="text-xs font-medium text-gray-600 uppercase block mb-2">PO Type *</label>
              <select
                value={poType}
                onChange={(e) => {
                  setPOType(e.target.value as 'impact-vendor' | 'bradford-jd');
                  // Clear vendor selection when switching to Bradford → JD
                  if (e.target.value === 'bradford-jd') {
                    setPOVendorId('');
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="impact-vendor">Impact → Vendor (counts as our cost)</option>
                <option value="bradford-jd">Bradford → JD Graphic (Bradford's internal)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {poType === 'impact-vendor'
                  ? 'This PO will be counted toward our total cost'
                  : "This is Bradford's internal PO - not counted as our cost"}
              </p>
            </div>

            {/* Vendor Selection - only for Impact → Vendor POs */}
            {poType === 'impact-vendor' && (
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase block mb-2">Vendor *</label>
                <select
                  value={poVendorId}
                  onChange={(e) => setPOVendorId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isLoadingVendors}
                >
                  <option value="">Select vendor...</option>
                  {vendors.map(vendor => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}{vendor.isPartner ? ' (Partner)' : ''}
                    </option>
                  ))}
                </select>
                {poVendorId && vendors.find(v => v.id === poVendorId)?.isPartner && (
                  <p className="text-xs text-orange-600 mt-1">Partner vendor - 50/50 profit split will apply</p>
                )}
              </div>
            )}

            {/* Line Items Selection */}
            {job.lineItems && job.lineItems.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600 uppercase">Select Line Items to Include</label>
                  <button
                    onClick={selectAllLineItems}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Select All
                  </button>
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {job.lineItems.map((item, index) => (
                    <label
                      key={index}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <div
                        onClick={(e) => {
                          e.preventDefault();
                          toggleLineItem(index);
                        }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          selectedLineItems.has(index)
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {selectedLineItems.has(index) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <span className="flex-1 text-sm text-gray-900">{item.description}</span>
                      <span className="text-sm text-gray-500">
                        {item.quantity.toLocaleString()} × {formatCurrency(item.unitCost)}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        = {formatCurrency(item.unitCost * item.quantity)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Cost Input - for jobs without line items or to override */}
            <div>
              <label className="text-xs font-medium text-gray-600 uppercase block mb-2">
                Cost Amount {job.lineItems && job.lineItems.length > 0 ? '(or override line items)' : '*'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={poManualCost}
                  onChange={(e) => {
                    // Allow only numbers and decimal point
                    const val = e.target.value;
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setPOManualCost(val);
                    }
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={selectedTotal > 0 ? selectedTotal.toFixed(2) : '0.00'}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {selectedTotal > 0 && !poManualCost && (
                <p className="text-xs text-gray-500 mt-1">Using selected line items total: {formatCurrency(selectedTotal)}</p>
              )}
            </div>

            {/* PO Total */}
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <span className="text-sm font-medium text-gray-700">PO Total:</span>
              <span className="text-xl font-bold text-green-700">
                {formatCurrency(poManualCost && parseFloat(poManualCost) > 0 ? parseFloat(poManualCost) : selectedTotal)}
              </span>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-gray-600 uppercase block mb-2">Description (Optional)</label>
              <input
                type="text"
                value={poDescription}
                onChange={(e) => setPODescription(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="e.g., Printing + Paper"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setIsAddingPO(false);
                  setSelectedLineItems(new Set());
                  setPOType('impact-vendor');
                  setPOVendorId('');
                  setPODescription('');
                  setPOManualCost('');
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPO}
                disabled={isSaving || (poType === 'impact-vendor' && !poVendorId) || (selectedLineItems.size === 0 && (!poManualCost || parseFloat(poManualCost) <= 0))}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Creating...' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const NotesTab = () => (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</h3>
      </div>
      <div className="p-4">
        {isEditMode ? (
          <textarea
            value={editedJob.notes ?? job.notes ?? ''}
            onChange={(e) => updateEditedField('notes', e.target.value)}
            placeholder="Add notes about this job..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            rows={8}
          />
        ) : job.notes ? (
          <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{job.notes}</p>
        ) : (
          <p className="text-gray-400 italic text-sm">No notes for this job</p>
        )}
      </div>
    </div>
  );

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'purchase-orders', label: 'Purchase Orders' },
    { id: 'notes', label: 'Notes' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black transition-opacity duration-200 z-[60] ${
          isOpen ? 'opacity-50' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleBackdropClick}
      />

      {/* Modal */}
      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-all duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleBackdropClick}
      >
        <div
          className={`bg-gray-50 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transform transition-transform duration-200 ${
            isOpen ? 'scale-100' : 'scale-95'
          }`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`border-b px-6 py-4 flex-shrink-0 ${isEditMode ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
            {isEditMode && (
              <div className="flex items-center gap-2 text-blue-600 text-sm font-medium mb-3">
                <Edit2 className="w-4 h-4" />
                Edit Mode - Make changes below and click Save
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <h2 className="text-xl font-bold text-gray-900 flex-shrink-0">{jobNumber}</h2>
                <span className="text-gray-400 flex-shrink-0">•</span>
                {isEditMode ? (
                  <input
                    type="text"
                    value={editedJob.title ?? job.title ?? ''}
                    onChange={(e) => updateEditedField('title', e.target.value)}
                    className="flex-1 px-2 py-1 text-gray-900 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Job title"
                  />
                ) : (
                  <span className="text-gray-600 truncate">{job.title}</span>
                )}
                {job.vendor?.isPartner && (
                  <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded flex-shrink-0">
                    PARTNER
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors ml-2"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 mt-4">
              {/* Edit Mode Toggle */}
              {isEditMode ? (
                <>
                  <button
                    onClick={handleSaveJob}
                    disabled={isSavingJob}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {isSavingJob ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSavingJob}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit Job
                  </button>
                  {onGenerateEmail && (
                    <button
                      onClick={onGenerateEmail}
                      className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      <Mail className="w-4 h-4" />
                      Email
                    </button>
                  )}
                  {onDownloadPO && (
                    <button
                      onClick={onDownloadPO}
                      className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      <Printer className="w-4 h-4" />
                      PO PDF
                    </button>
                  )}
                  {onDownloadInvoice && (
                    <button
                      onClick={onDownloadInvoice}
                      className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      <Receipt className="w-4 h-4" />
                      Invoice
                    </button>
                  )}

                  {/* Unified Send Email Dropdown */}
                  <div className="relative" data-email-dropdown>
                    <button
                      onClick={() => setShowEmailDropdown(!showEmailDropdown)}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 text-sm"
                    >
                      <Send className="w-4 h-4" />
                      Send Email
                      <ChevronDown className={`w-4 h-4 transition-transform ${showEmailDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {showEmailDropdown && (
                      <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                        {/* Invoice to Customer */}
                        <button
                          onClick={() => {
                            setEmailType('invoice');
                            setShowEmailInvoiceModal(true);
                            setShowEmailDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 border-b border-gray-100"
                        >
                          <Receipt className="w-4 h-4 text-gray-500" />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">Invoice to Customer</div>
                            <div className="text-xs text-gray-500">{job.customer?.email || 'No email'}</div>
                          </div>
                          {job.invoiceEmailedAt && (
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Sent
                            </span>
                          )}
                        </button>

                        {/* PO to Vendor(s) */}
                        {job.purchaseOrders && job.purchaseOrders.length > 0 ? (
                          job.purchaseOrders.map((po: any) => (
                            <button
                              key={po.id}
                              onClick={() => {
                                setEmailType('po');
                                setSelectedPOForEmail({
                                  id: po.id,
                                  poNumber: po.poNumber,
                                  vendorName: po.targetCompany?.name || 'Vendor',
                                  vendorEmail: po.targetCompany?.email
                                });
                                setShowEmailDropdown(false);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                            >
                              <FileText className="w-4 h-4 text-gray-500" />
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">PO to {po.targetCompany?.name?.slice(0, 15) || 'Vendor'}</div>
                                <div className="text-xs text-gray-500">PO #{po.poNumber}</div>
                              </div>
                              {po.emailedAt && (
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  Sent
                                </span>
                              )}
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-sm text-gray-500">
                            No POs to send
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Email sent indicators */}
                  {job.invoiceEmailedAt && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded" title={`Invoice sent to ${job.invoiceEmailedTo || 'customer'}`}>
                      <Check className="w-3 h-3" />
                      Inv sent {new Date(job.invoiceEmailedAt).toLocaleDateString()}
                    </span>
                  )}
                  {onDownloadQuote && (
                    <button
                      onClick={onDownloadQuote}
                      className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      <FileText className="w-4 h-4" />
                      Quote
                    </button>
                  )}
                </>
              )}
            </div>

          </div>

          {/* Tab Navigation */}
          <div className="bg-white border-b border-gray-200 px-6 flex-shrink-0">
            <div className="flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'purchase-orders' && job.purchaseOrders && job.purchaseOrders.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                      {job.purchaseOrders.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6 overflow-y-auto flex-1">
            {activeTab === 'overview' && OverviewTab()}
            {activeTab === 'pricing' && PricingTab()}
            {activeTab === 'purchase-orders' && PurchaseOrdersTab()}
            {activeTab === 'notes' && NotesTab()}
          </div>
        </div>
      </div>

      {/* Email Invoice Modal */}
      {showEmailInvoiceModal && job && (
        <SendEmailModal
          type="invoice"
          jobId={job.id}
          jobNo={job.number || job.jobNo}
          defaultEmail={job.customer?.email || ''}
          recipientName={job.customer?.name || ''}
          onClose={() => setShowEmailInvoiceModal(false)}
          onSuccess={() => {
            setShowEmailInvoiceModal(false);
            onRefresh?.();
          }}
        />
      )}

      {/* Email PO Modal */}
      {selectedPOForEmail && (
        <SendEmailModal
          type="po"
          poId={selectedPOForEmail.id}
          poNumber={selectedPOForEmail.poNumber}
          defaultEmail={selectedPOForEmail.vendorEmail || ''}
          recipientName={selectedPOForEmail.vendorName}
          onClose={() => setSelectedPOForEmail(null)}
          onSuccess={() => {
            setSelectedPOForEmail(null);
            onRefresh?.();
          }}
        />
      )}

      {/* Artwork Notification Confirmation Modal */}
      {showArtworkConfirmModal && job && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80]">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Send Artwork Notification</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">Artwork link to send:</p>
                <p className="text-sm font-medium text-blue-600 break-all bg-blue-50 p-2 rounded">
                  {artworkUrl}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">This email will be sent to:</p>
                <ul className="text-sm space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    <strong>{job.vendor?.name}</strong> ({job.vendor?.email})
                  </li>
                  <li className="text-gray-500 ml-4">CC:</li>
                  <li className="flex items-center gap-2 ml-4">
                    <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                    brandon@impactdirectprinting.com
                  </li>
                  <li className="flex items-center gap-2 ml-4">
                    <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                    nick@jdgraphic.com
                  </li>
                  <li className="flex items-center gap-2 ml-4">
                    <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                    devin@jdgraphic.com
                  </li>
                </ul>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowArtworkConfirmModal(false)}
                disabled={isSendingArtworkNotification}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsSendingArtworkNotification(true);
                  try {
                    await emailApi.sendArtworkNotification(job.id, artworkUrl);
                    setShowArtworkConfirmModal(false);
                    setArtworkUrl('');
                    onRefresh?.();
                  } catch (error: any) {
                    alert(error.message || 'Failed to send artwork notification');
                  } finally {
                    setIsSendingArtworkNotification(false);
                  }
                }}
                disabled={isSendingArtworkNotification}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2"
              >
                {isSendingArtworkNotification ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Notification
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
