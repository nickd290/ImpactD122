import React, { useState, useMemo, useEffect } from 'react';
import {
  X, Calendar, User, Package, FileText, Edit2, Mail, Printer, Receipt,
  DollarSign, Plus, Trash2, Building2, Check, Save, Download, AlertTriangle, Send, ChevronDown, Link, ExternalLink, MessageSquare, Upload, Truck
} from 'lucide-react';
import { toDateInputValue } from '../lib/utils';
import { EditableField } from './EditableField';
import { InlineEditableCell } from './InlineEditableCell';
import { LineItemRow } from './LineItemRow';
import { pdfApi, emailApi, communicationsApi, invoiceApi, filesApi } from '../lib/api';
import { SendEmailModal } from './SendEmailModal';
import { CommunicationThread } from './CommunicationThread';
import { useQuery } from '@tanstack/react-query';
import { WorkflowStatusBadge, getNextWorkflowStatuses } from './WorkflowStatusBadge';
import { PDFPreviewModal } from './PDFPreviewModal';

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
  // Vendor portal status
  portal?: {
    confirmedAt?: string;
    confirmedByName?: string;
    confirmedByEmail?: string;
    vendorStatus?: 'PENDING' | 'PO_RECEIVED' | 'IN_PRODUCTION' | 'PRINTING_COMPLETE' | 'SHIPPED';
    statusUpdatedAt?: string;
    trackingNumber?: string;
    trackingCarrier?: string;
  } | null;
  // Invoices
  invoices?: Array<{
    id: string;
    amount?: number | null;
    paidAt?: string | null;
  }>;
  hasPaidInvoice?: boolean;
  // Workflow status tracking
  workflowStatus?: string;
  workflowUpdatedAt?: string;
  jdInvoiceNumber?: string;
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

type TabType = 'details' | 'vendors-costs' | 'communications';

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
  const [activeTab, setActiveTab] = useState<TabType>('details');
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
  const [selectedPOForEmail, setSelectedPOForEmail] = useState<{
    id: string;
    jobId: string;
    poNumber: string;
    vendorName: string;
    vendorEmail?: string;
    vendorContacts?: Array<{ id: string; name: string; email: string; title?: string; isPrimary?: boolean }>;
  } | null>(null);

  // Artwork notification state
  const [artworkUrl, setArtworkUrl] = useState('');
  const [showArtworkConfirmModal, setShowArtworkConfirmModal] = useState(false);
  const [isSendingArtworkNotification, setIsSendingArtworkNotification] = useState(false);

  // Specs display state
  const [showAllSpecs, setShowAllSpecs] = useState(false);

  // Send proof to customer state
  const [showSendProofModal, setShowSendProofModal] = useState(false);
  const [selectedProofFiles, setSelectedProofFiles] = useState<any[]>([]);
  const [proofMessage, setProofMessage] = useState('');
  const [isSendingProof, setIsSendingProof] = useState(false);

  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // PDF Preview state
  const [previewFile, setPreviewFile] = useState<{ id: string; fileName: string } | null>(null);

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

  // Line item editing state
  const [editingLineItemIndex, setEditingLineItemIndex] = useState<number | null>(null);
  const [isAddingLineItem, setIsAddingLineItem] = useState(false);
  const [isSavingLineItem, setIsSavingLineItem] = useState(false);
  const [showLineItemPresets, setShowLineItemPresets] = useState(false);
  const [presetLineItem, setPresetLineItem] = useState<{ description: string; quantity: number; unitCost: number; unitPrice: number } | null>(null);

  // Line item presets
  const lineItemPresets = [
    { label: 'Shipping & Handling', description: 'Shipping & Handling', quantity: 1, unitCost: 0, unitPrice: 0 },
    { label: 'Rush Fee', description: 'Rush Fee', quantity: 1, unitCost: 0, unitPrice: 0 },
    { label: 'Setup Fee', description: 'Setup/Prep Fee', quantity: 1, unitCost: 0, unitPrice: 0 },
    { label: 'Freight', description: 'Freight', quantity: 1, unitCost: 0, unitPrice: 0 },
    { label: 'Proof/Sample', description: 'Proof/Sample', quantity: 1, unitCost: 0, unitPrice: 0 },
  ];

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

  // Fetch uploaded files when job changes
  useEffect(() => {
    if (job?.id) {
      fetch(`/api/jobs/${job.id}/files`)
        .then(res => res.json())
        .then(files => setUploadedFiles(files || []))
        .catch(() => setUploadedFiles([]));
    } else {
      setUploadedFiles([]);
    }
    setUploadError('');
  }, [job?.id]);

  // Fetch pending communications count for badge - MUST be before early return
  const { data: commData } = useQuery({
    queryKey: ['communications', job?.id],
    queryFn: () => job?.id ? communicationsApi.getByJob(job.id) : Promise.resolve([]),
    enabled: !!job?.id,
  });
  const pendingCommCount = (commData || []).filter((c: any) => c.status === 'PENDING_REVIEW').length;

  // Fetch PO files for this job
  const { data: jobFiles } = useQuery({
    queryKey: ['jobFiles', job?.id],
    queryFn: () => job?.id ? filesApi.getJobFiles(job.id) : Promise.resolve([]),
    enabled: !!job?.id,
  });
  const poFiles = (jobFiles || []).filter((f: any) => f.kind === 'PO_PDF');

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

  // File upload handler
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !job?.id) return;
    setUploadError('');
    setIsUploading(true);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', 'ARTWORK');

      try {
        const response = await fetch(`/api/jobs/${job.id}/files`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }

        const result = await response.json();
        setUploadedFiles(prev => [...prev, result.file]);
      } catch (error: any) {
        setUploadError(error.message || 'Failed to upload file');
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // File delete handler
  const handleDeleteFile = async (fileId: string) => {
    if (!job?.id) return;
    try {
      const response = await fetch(`/api/jobs/${job.id}/files/${fileId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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

  // Check if a vendor has any email addresses (main email or contacts)
  const hasVendorEmail = (vendor?: { email?: string; contacts?: Array<{ email?: string }> }) => {
    if (!vendor) return false;
    if (vendor.email) return true;
    return vendor.contacts?.some(c => c.email) || false;
  };

  // Get email availability for a PO (checks PO vendor, then job vendor)
  const getPOEmailStatus = (po: any) => {
    const vendorWithEmail = po.vendor?.email || po.vendor?.contacts?.some((c: any) => c.email);
    const jobVendorWithEmail = job.vendor?.email || job.vendor?.contacts?.some((c: any) => c.email);
    return vendorWithEmail || jobVendorWithEmail;
  };

  // PO Management with smart creation
  const handleAddPO = async () => {
    // For Impact → Vendor POs, must have a vendor on the job
    if (poType === 'impact-vendor' && !job.vendor?.id) {
      alert('Please set a vendor on the job first (in job details)');
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
          vendorId: poType === 'impact-vendor' ? job.vendor?.id : undefined,
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
      const response = await fetch(`/api/jobs/${job.id}/pos/${poId}`, { method: 'DELETE' });
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

      const response = await fetch(`/api/jobs/${job.id}/pos/${poId}`, {
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
          // vendorId is now inherited from job - not editable on PO
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
      console.log('[handleSaveJob] Saving editedJob:', editedJob);
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedJob),
      });

      console.log('[handleSaveJob] Response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[handleSaveJob] Error:', errorData);
        throw new Error(errorData.message || errorData.error || 'Failed to save job');
      }
      const result = await response.json();
      console.log('[handleSaveJob] Success:', result);
      setIsEditMode(false);
      setEditedJob({});
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to save job:', error);
      alert(`Failed to save job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSavingJob(false);
    }
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedJob({});
  };

  // Inline save for individual fields (no edit mode required)
  const handleInlineSave = async (field: string, value: any) => {
    try {
      console.log(`[handleInlineSave] Saving ${field}:`, value);
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      console.log(`[handleInlineSave] Response status:`, response.status);
      if (!response.ok) {
        const error = await response.json();
        console.error(`[handleInlineSave] Error response:`, error);
        throw new Error(error.message || 'Failed to save');
      }
      const result = await response.json();
      console.log(`[handleInlineSave] Success:`, result);
      if (onRefresh) {
        console.log(`[handleInlineSave] Calling onRefresh`);
        onRefresh();
      } else {
        console.warn(`[handleInlineSave] No onRefresh callback!`);
      }
    } catch (error) {
      console.error(`Failed to save ${field}:`, error);
      throw error;
    }
  };

  // Workflow status change handler
  const handleWorkflowStatusChange = async (newStatus: string) => {
    if (!job) return;

    try {
      // Special case: Notify vendor when approving
      if (newStatus === 'IN_PRODUCTION' && job.workflowStatus === 'APPROVED_PENDING_VENDOR') {
        // Call the vendor approval notification endpoint
        const emailResponse = await fetch(`/api/emails/vendor-approval/${job.id}`, {
          method: 'POST',
        });
        if (!emailResponse.ok) {
          const error = await emailResponse.json();
          console.error('Failed to send vendor approval notification:', error);
          // Don't throw - we still want to update the status
        }
      }

      // Update the workflow status
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowStatus: newStatus,
          workflowUpdatedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update workflow status');
      }

      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to update workflow status:', error);
      alert(`Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Line item handlers
  const handleLineItemSave = async (index: number, updatedItem: any) => {
    setIsSavingLineItem(true);
    try {
      const newLineItems = [...(job.lineItems || [])];
      newLineItems[index] = updatedItem;
      await handleInlineSave('lineItems', newLineItems);
      setEditingLineItemIndex(null);
    } catch (error) {
      console.error('Failed to save line item:', error);
      alert(`Failed to save line item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSavingLineItem(false);
    }
  };

  const handleLineItemAdd = async (newItem: any) => {
    setIsSavingLineItem(true);
    try {
      const newLineItems = [...(job.lineItems || []), newItem];
      await handleInlineSave('lineItems', newLineItems);
      setIsAddingLineItem(false);
      setPresetLineItem(null);
    } catch (error) {
      console.error('Failed to add line item:', error);
      alert(`Failed to add line item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSavingLineItem(false);
    }
  };

  const handlePresetSelect = (preset: typeof lineItemPresets[0] | null) => {
    setShowLineItemPresets(false);
    if (preset) {
      setPresetLineItem({ description: preset.description, quantity: preset.quantity, unitCost: preset.unitCost, unitPrice: preset.unitPrice });
    } else {
      setPresetLineItem(null);
    }
    setIsAddingLineItem(true);
  };

  const handleLineItemDelete = async (index: number) => {
    if (!confirm('Delete this line item?')) return;
    setIsSavingLineItem(true);
    try {
      const newLineItems = (job.lineItems || []).filter((_, i) => i !== index);
      console.log('Deleting line item, new array:', newLineItems);
      await handleInlineSave('lineItems', newLineItems);
    } catch (error) {
      console.error('Failed to delete line item:', error);
      alert(`Failed to delete line item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSavingLineItem(false);
    }
  };

  // Update a field in editedJob
  const updateEditedField = (field: string, value: any) => {
    setEditedJob(prev => ({ ...prev, [field]: value }));
  };

  // Update a spec field
  const updateEditedSpec = (field: string, value: any) => {
    setEditedJob(prev => ({
      ...prev,
      specs: { ...(prev.specs || {}), [field]: value }
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
  // Helper to get populated specs only
  const getPopulatedSpecs = () => {
    const specs = [
      { key: 'productType', label: 'Product', value: getSpecValue('productType') },
      { key: 'sizeName', label: 'Size', value: job.sizeName },
      { key: 'flatSize', label: 'Flat', value: getSpecValue('flatSize') },
      { key: 'finishedSize', label: 'Finished', value: getSpecValue('finishedSize') },
      { key: 'colors', label: 'Colors', value: getSpecValue('colors') },
      { key: 'pageCount', label: 'Pages', value: getSpecValue('pageCount') },
      { key: 'paperType', label: 'Paper', value: getSpecValue('paperType') },
      { key: 'coating', label: 'Coating', value: getSpecValue('coating') },
      { key: 'finishing', label: 'Finishing', value: getSpecValue('finishing') },
      { key: 'bindingStyle', label: 'Binding', value: getSpecValue('bindingStyle') },
    ];
    return specs.filter(s => s.value && s.value !== '');
  };

  const OverviewTab = () => {
    const populatedSpecs = getPopulatedSpecs();
    const hasArtwork = job.specs?.artworkUrl || isEditMode;
    const showPaperSource = paperSource !== 'VENDOR' || paperMarkup > 0 || job.paperInventory;

    return (
    <div className="space-y-4">
      {/* Key Metrics Row */}
      <div className="grid grid-cols-4 gap-3">
        {/* Status */}
        <div className="bg-card border border-border rounded-lg p-3">
          <span className="text-[10px] text-muted-foreground uppercase block mb-1">Status</span>
          {isEditMode ? (
            <select
              value={editedJob.status ?? job.status ?? ''}
              onChange={(e) => updateEditedField('status', e.target.value)}
              className="w-full px-2 py-1 text-sm border border-input rounded focus:ring-2 focus:ring-primary"
            >
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
              job.status === 'PAID' ? 'bg-green-100 text-green-700' :
              job.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
              job.status === 'ACTIVE' ? 'bg-amber-100 text-amber-700' :
              'bg-muted text-muted-foreground'
            }`}>
              {statusOptions.find(s => s.value === job.status)?.label || job.status}
            </span>
          )}
        </div>
        {/* Sell Price - Editable in Edit Mode */}
        <div className="bg-card border border-border rounded-lg p-3">
          <span className="text-[10px] text-muted-foreground uppercase block mb-1">Sell Price</span>
          {job.invoiceGeneratedAt ? (
            <p className="text-lg font-semibold text-foreground" title="Locked after invoice generated">
              {formatCurrency(job.sellPrice || 0)}
            </p>
          ) : isEditMode ? (
            <input
              type="number"
              step="0.01"
              value={editedJob.sellPrice ?? job.sellPrice ?? ''}
              onChange={(e) => updateEditedField('sellPrice', parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1 text-lg font-semibold border border-input rounded focus:ring-2 focus:ring-primary"
            />
          ) : (
            <InlineEditableCell
              value={job.sellPrice}
              onSave={async (value) => {
                await handleInlineSave('sellPrice', parseFloat(value) || 0);
              }}
              type="number"
              prefix="$"
              formatDisplay={(val) => formatCurrency(Number(val) || 0)}
              className="text-lg font-semibold"
            />
          )}
        </div>
        {/* Quantity */}
        <div className="bg-card border border-border rounded-lg p-3">
          <span className="text-[10px] text-muted-foreground uppercase block mb-1">Quantity</span>
          {isEditMode ? (
            <input
              type="number"
              value={editedJob.quantity ?? job.quantity ?? ''}
              onChange={(e) => updateEditedField('quantity', parseInt(e.target.value) || 0)}
              className="w-full px-2 py-1 text-sm border border-input rounded focus:ring-2 focus:ring-primary"
            />
          ) : (
            <p className="text-lg font-semibold text-foreground">{(job.quantity || 0).toLocaleString()}</p>
          )}
        </div>
        {/* Spread */}
        <div className="bg-card border border-border rounded-lg p-3">
          <span className="text-[10px] text-muted-foreground uppercase block mb-1">Spread</span>
          <p className={`text-lg font-semibold ${(job.profit?.spread || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(job.profit?.spread || 0)}
          </p>
        </div>
      </div>

      {/* Workflow Status Row */}
      {job.workflowStatus && (
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground uppercase">Workflow</span>
              <WorkflowStatusBadge status={job.workflowStatus} size="md" />
              {job.workflowUpdatedAt && (
                <span className="text-xs text-muted-foreground">
                  Updated {new Date(job.workflowUpdatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {getNextWorkflowStatuses(job.workflowStatus).map(({ status, action }) => (
                <button
                  key={status}
                  onClick={() => handleWorkflowStatusChange(status)}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Customer & Vendor Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Customer</span>
          </div>
          {job.customer ? (
            <div>
              <p className="font-medium text-sm text-foreground">{job.customer.name}</p>
              {job.customer.email && <p className="text-xs text-muted-foreground">{job.customer.email}</p>}
            </div>
          ) : (
            <p className="text-muted-foreground italic text-sm">Not assigned</p>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Vendor</span>
            {!isEditMode && job.vendor?.isPartner && (
              <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-[9px] font-bold rounded ml-auto">
                PARTNER
              </span>
            )}
          </div>
          {isEditMode ? (
            <select
              value={editedJob.vendorId || ''}
              onChange={(e) => updateEditedField('vendorId', e.target.value || null)}
              className="w-full px-2 py-1 text-sm border border-input rounded focus:ring-2 focus:ring-primary"
              disabled={isLoadingVendors}
            >
              <option value="">Select vendor...</option>
              {vendors.map(vendor => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}{vendor.isPartner ? ' (Partner)' : ''}
                </option>
              ))}
            </select>
          ) : job.vendor ? (
            <div>
              <p className="font-medium text-sm text-foreground">{job.vendor.name}</p>
              {job.vendor.email && <p className="text-xs text-muted-foreground">{job.vendor.email}</p>}
            </div>
          ) : (
            <p className="text-muted-foreground italic text-sm">Not assigned</p>
          )}
        </div>
      </div>

      {/* Job Details Row: PO, Due Date, Paper Source */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-[10px] text-muted-foreground uppercase">Customer PO</span>
            {isEditMode ? (
              <input
                type="text"
                value={editedJob.customerPONumber ?? job.customerPONumber ?? ''}
                onChange={(e) => updateEditedField('customerPONumber', e.target.value)}
                className="w-32 px-2 py-1 text-sm border border-input rounded focus:ring-2 focus:ring-primary block mt-0.5"
                placeholder="PO #"
              />
            ) : (
              <p className="font-medium text-foreground">{job.customerPONumber || '—'}</p>
            )}
            {/* PO Document */}
            {poFiles.length > 0 && (
              <div className="mt-1">
                {poFiles.map((file: any) => (
                  <button
                    key={file.id}
                    onClick={() => setPreviewFile({ id: file.id, fileName: file.fileName })}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    title={`Preview: ${file.fileName}`}
                  >
                    <FileText className="w-3 h-3" />
                    <span className="truncate max-w-[100px]">{file.fileName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase">Due Date</span>
            {isEditMode ? (
              <input
                type="date"
                value={toDateInputValue(editedJob.dueDate ?? job.dueDate)}
                onChange={(e) => updateEditedField('dueDate', e.target.value)}
                className="px-2 py-1 text-sm border border-input rounded focus:ring-2 focus:ring-primary block mt-0.5"
              />
            ) : (
              <p className={`font-medium ${job.dueDate && new Date(job.dueDate) < new Date() ? 'text-red-600' : 'text-foreground'}`}>
                {job.dueDate ? new Date(job.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
              </p>
            )}
          </div>
          {showPaperSource && (
            <div className="flex items-center gap-2 ml-auto">
              <Building2 className={`w-4 h-4 ${paperSource === 'BRADFORD' ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-sm font-medium ${paperSource === 'BRADFORD' ? 'text-primary' : 'text-muted-foreground'}`}>
                {paperSource === 'BRADFORD' ? 'Bradford Paper' : paperSource === 'CUSTOMER' ? 'Customer Paper' : 'Vendor Paper'}
              </span>
              {paperMarkup > 0 && (
                <span className="text-xs text-primary">+{formatCurrency(paperMarkup)}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Specifications - Collapsible */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowAllSpecs(!showAllSpecs)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Specifications</span>
            {!isEditMode && populatedSpecs.length > 0 && (
              <span className="text-xs text-muted-foreground">({populatedSpecs.length} fields)</span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showAllSpecs ? 'rotate-180' : ''}`} />
        </button>

        {/* Compact inline specs preview (when collapsed) */}
        {!showAllSpecs && populatedSpecs.length > 0 && (
          <div className="px-3 pb-2 text-sm text-muted-foreground">
            {populatedSpecs.slice(0, 4).map((s, i) => (
              <span key={s.key}>
                {i > 0 && ' · '}
                <span className="text-foreground">{s.value}</span>
              </span>
            ))}
            {populatedSpecs.length > 4 && <span> · +{populatedSpecs.length - 4} more</span>}
          </div>
        )}

        {/* Full specs grid (when expanded or editing) */}
        {(showAllSpecs || isEditMode) && (
          <div className="px-3 pb-3 pt-1 border-t border-border">
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
              <EditableField label="Product" value={getSpecValue('productType')} isEditing={isEditMode} onChange={(val) => updateEditedSpec('productType', val)} emptyText="—" />
              <EditableField label="Flat Size" value={getSpecValue('flatSize')} isEditing={isEditMode} onChange={(val) => updateEditedSpec('flatSize', val)} emptyText="—" />
              <EditableField label="Finished" value={getSpecValue('finishedSize')} isEditing={isEditMode} onChange={(val) => updateEditedSpec('finishedSize', val)} emptyText="—" />
              <EditableField label="Colors" value={getSpecValue('colors')} isEditing={isEditMode} onChange={(val) => updateEditedSpec('colors', val)} emptyText="—" />
              <EditableField label="Pages" value={getSpecValue('pageCount')} isEditing={isEditMode} onChange={(val) => updateEditedSpec('pageCount', parseInt(val) || 0)} type="number" emptyText="—" />
              <EditableField label="Paper" value={getSpecValue('paperType')} isEditing={isEditMode} onChange={(val) => updateEditedSpec('paperType', val)} emptyText="—" />
              <EditableField label="Coating" value={getSpecValue('coating')} isEditing={isEditMode} onChange={(val) => updateEditedSpec('coating', val)} emptyText="—" />
              <EditableField label="Finishing" value={getSpecValue('finishing')} isEditing={isEditMode} onChange={(val) => updateEditedSpec('finishing', val)} emptyText="—" />
              <EditableField label="Binding" value={getSpecValue('bindingStyle')} isEditing={isEditMode} onChange={(val) => updateEditedSpec('bindingStyle', val)} emptyText="—" />
              {(job.bradfordPaperLbs || isEditMode) && (
                <EditableField label="Bradford lbs" value={job.bradfordPaperLbs ?? getSpecValue('paperLbs') ?? ''} isEditing={isEditMode} onChange={(val) => updateEditedField('bradfordPaperLbs', parseFloat(val) || null)} type="number" emptyText="—" />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Artwork Link - Only show if has URL or in edit mode */}
      {hasArtwork && (
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Link className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Artwork</span>
            </div>
            {job.artworkEmailedAt && (
              <span className="text-[10px] text-green-600 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Sent {new Date(job.artworkEmailedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          {job.specs?.artworkUrl && (
            <a
              href={job.specs.artworkUrl as string}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1 mb-2 truncate"
            >
              {job.specs.artworkUrl as string}
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          )}
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="Paste artwork link..."
              value={artworkUrl}
              onChange={(e) => setArtworkUrl(e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm border border-input rounded focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => setShowArtworkConfirmModal(true)}
              disabled={!artworkUrl.trim() || !job.vendor?.email || isSendingArtworkNotification}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </div>
          {!job.vendor?.email && (
            <p className="mt-1 text-[10px] text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              No vendor email
            </p>
          )}
        </div>
      )}

      {/* Vendor Status Section */}
      {job.portal && (
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Vendor Status</span>
          </div>
          <div className="space-y-2">
            {/* Confirmation Status */}
            <div className="flex items-center gap-2">
              {job.portal.confirmedAt ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-foreground">
                    Confirmed by {job.portal.confirmedByName}
                    <span className="text-muted-foreground ml-1">
                      ({new Date(job.portal.confirmedAt).toLocaleDateString()})
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-amber-600">Awaiting PO confirmation</span>
                </>
              )}
            </div>

            {/* Production Status Badge */}
            {job.portal.vendorStatus && job.portal.vendorStatus !== 'PENDING' && (
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                  job.portal.vendorStatus === 'SHIPPED' ? 'bg-green-100 text-green-700' :
                  job.portal.vendorStatus === 'PRINTING_COMPLETE' ? 'bg-blue-100 text-blue-700' :
                  job.portal.vendorStatus === 'IN_PRODUCTION' ? 'bg-purple-100 text-purple-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {job.portal.vendorStatus === 'PO_RECEIVED' ? 'PO Received' :
                   job.portal.vendorStatus === 'IN_PRODUCTION' ? 'In Production' :
                   job.portal.vendorStatus === 'PRINTING_COMPLETE' ? 'Printing Complete' :
                   job.portal.vendorStatus === 'SHIPPED' ? 'Shipped' :
                   job.portal.vendorStatus}
                </span>
                {job.portal.statusUpdatedAt && (
                  <span className="text-[10px] text-muted-foreground">
                    Updated {new Date(job.portal.statusUpdatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}

            {/* Tracking Info */}
            {job.portal.vendorStatus === 'SHIPPED' && job.portal.trackingNumber && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Tracking:</span>
                <span className="font-mono text-foreground">
                  {job.portal.trackingCarrier && `${job.portal.trackingCarrier}: `}
                  {job.portal.trackingNumber}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Upload Section */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Upload className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Files</span>
          </div>
          {uploadedFiles.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Drag & Drop Zone */}
        <div
          className={`relative border-2 border-dashed rounded-lg p-3 text-center transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept="*/*"
          />
          <Upload className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">
            {isUploading ? 'Uploading...' : 'Drop files or click to browse'}
          </p>
        </div>

        {/* Upload Error */}
        {uploadError && (
          <p className="mt-2 text-xs text-destructive">{uploadError}</p>
        )}

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div className="mt-2 space-y-1">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{file.fileName}</span>
                  <span className="text-muted-foreground flex-shrink-0">{formatFileSize(file.size)}</span>
                  {file.kind === 'VENDOR_PROOF' && (
                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-semibold rounded flex-shrink-0">
                      VENDOR PROOF
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {file.kind === 'VENDOR_PROOF' && job.customer?.email && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProofFiles([file]);
                        setShowSendProofModal(true);
                      }}
                      className="p-1 text-primary hover:bg-primary/10 rounded"
                      title="Send to customer"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteFile(file.id)}
                    className="p-1 text-destructive hover:bg-destructive/10 rounded"
                    title="Delete file"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Send All Proofs Button */}
        {uploadedFiles.filter(f => f.kind === 'VENDOR_PROOF').length > 0 && job.customer?.email && (
          <button
            type="button"
            onClick={() => {
              setSelectedProofFiles(uploadedFiles.filter(f => f.kind === 'VENDOR_PROOF'));
              setShowSendProofModal(true);
            }}
            className="mt-2 w-full px-3 py-2 bg-primary/10 text-primary text-sm font-medium rounded hover:bg-primary/20 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send {uploadedFiles.filter(f => f.kind === 'VENDOR_PROOF').length} Proof{uploadedFiles.filter(f => f.kind === 'VENDOR_PROOF').length !== 1 ? 's' : ''} to Customer
          </button>
        )}
      </div>

      {/* Paper Details - Condensed */}
      {job.paperData && (
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Paper Details</span>
            {job.sizeName && <span className="text-[10px] text-muted-foreground">({job.sizeName})</span>}
          </div>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-[10px] text-muted-foreground">Type</span>
              <p className="font-medium text-foreground">{job.paperData.paperType}</p>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Wt/1000</span>
              <p className="font-medium text-foreground">{job.paperData.lbsPerThousand} lbs</p>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Paper Cost</span>
              <p className="font-medium text-foreground">{job.paperData.rawTotal ? formatCurrency(job.paperData.rawTotal) : '—'}</p>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground">Markup ({job.paperData.markupPercent}%)</span>
              <p className="font-semibold text-primary">{job.paperData.markupAmount ? formatCurrency(job.paperData.markupAmount) : '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* References - Compact inline */}
      {(createdDate || job.bradfordRefNumber || job.customerPONumber) && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
          {createdDate && (
            <span>Created {new Date(createdDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          )}
          {job.bradfordRefNumber && (
            <span>JD Ref: <span className="text-primary font-medium">{job.bradfordRefNumber}</span></span>
          )}
          {job.invoiceNumber && <span>Invoice #{job.invoiceNumber}</span>}
          {job.quoteNumber && <span>Quote #{job.quoteNumber}</span>}
        </div>
      )}
    </div>
  );
  };

  // Visual Vendor Cards Section - Groups POs by vendor with clear status/cost display
  const VendorCardsSection = () => {
    // Group POs by vendor (no useMemo - this is a render helper function)
    const grouped: Record<string, {
      vendorId: string;
      vendorName: string;
      isPartner: boolean;
      pos: typeof job.purchaseOrders;
      totalCost: number;
      paperCost: number;
      paperMarkup: number;
      mfgCost: number;
      hasSentPO: boolean;
    }> = {};

    (job.purchaseOrders || []).forEach((po) => {
      // Only show Impact-origin POs (our costs)
      if (po.originCompanyId !== 'impact-direct') return;

      const vendorId = po.vendorId || po.vendor?.id || po.targetCompanyId || 'unknown';
      const vendorName = po.vendor?.name ||
        (po.targetCompanyId === 'bradford' ? 'Bradford Printing' :
         po.targetCompanyId === 'jd-graphic' ? 'JD Graphic' : 'Unknown Vendor');
      const isPartner = po.vendor?.isPartner || vendorName.toLowerCase().includes('bradford');

      if (!grouped[vendorId]) {
        grouped[vendorId] = {
          vendorId,
          vendorName,
          isPartner,
          pos: [],
          totalCost: 0,
          paperCost: 0,
          paperMarkup: 0,
          mfgCost: 0,
          hasSentPO: false,
        };
      }

      grouped[vendorId].pos!.push(po);
      grouped[vendorId].totalCost += po.buyCost || 0;
      grouped[vendorId].paperCost += po.paperCost || 0;
      grouped[vendorId].paperMarkup += po.paperMarkup || (po.paperCost ? po.paperCost * 0.18 : 0);
      grouped[vendorId].mfgCost += po.mfgCost || 0;
      if (po.emailedAt) grouped[vendorId].hasSentPO = true;
    });

    const posByVendor = Object.values(grouped);

    // Calculate totals
    const totalVendorCost = posByVendor.reduce((sum, v) => sum + v.totalCost, 0);
    const sellPrice = job.sellPrice || 0;
    const profit = sellPrice - totalVendorCost;
    const profitPercent = sellPrice > 0 ? (profit / sellPrice) * 100 : 0;

    const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
    const formatDate = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    if (posByVendor.length === 0) {
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No vendor purchase orders yet</p>
          <p className="text-xs text-gray-400 mt-1">Create a PO below to track vendor costs</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Cost Summary Bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Sell Price</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(sellPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Total Cost</p>
              <p className="text-xl font-bold text-gray-700">{formatCurrency(totalVendorCost)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Profit</p>
              <p className={`text-xl font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(profit)} <span className="text-sm font-normal">({profitPercent.toFixed(1)}%)</span>
              </p>
            </div>
          </div>
        </div>

        {/* Vendor Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {posByVendor.map((vendor) => (
            <div key={vendor.vendorId} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              {/* Vendor Header */}
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-gray-500" />
                  <span className="font-semibold text-gray-900">{vendor.vendorName}</span>
                  {vendor.isPartner ? (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">Partner</span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded">Third-Party</span>
                  )}
                </div>
                {/* PO Status */}
                {vendor.hasSentPO ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <Check className="w-3 h-3" /> PO Sent
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="w-3 h-3" /> Pending
                  </span>
                )}
              </div>

              {/* Cost Breakdown */}
              <div className="p-4 space-y-3">
                {/* Individual POs */}
                {vendor.pos!.map((po) => (
                  <div key={po.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                    <div className="flex-1">
                      <span className="font-mono text-xs text-gray-500">{po.poNumber || '—'}</span>
                      <p className="text-gray-700 truncate" title={po.description}>{po.description || 'No description'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{formatCurrency(po.buyCost || 0)}</p>
                      {po.emailedAt && (
                        <p className="text-[10px] text-green-600">Sent {formatDate(po.emailedAt)}</p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Cost Details */}
                {(vendor.paperCost > 0 || vendor.mfgCost > 0) && (
                  <div className="pt-2 border-t border-gray-100 grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <p className="text-gray-400 uppercase">Paper</p>
                      <p className="font-medium text-amber-700">{formatCurrency(vendor.paperCost)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-400 uppercase">Markup 18%</p>
                      <p className="font-medium text-blue-700">{formatCurrency(vendor.paperMarkup)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-400 uppercase">Mfg</p>
                      <p className="font-medium text-purple-700">{formatCurrency(vendor.mfgCost)}</p>
                    </div>
                  </div>
                )}

                {/* Vendor Total */}
                <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">Vendor Total</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(vendor.totalCost)}</span>
                </div>

                {/* Quick Actions */}
                <div className="pt-2 flex gap-2">
                  {vendor.pos!.length > 0 && vendor.pos![0].id && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); pdfApi.generatePO(vendor.pos![0].id); }}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded font-medium"
                      >
                        <Download className="w-3 h-3" /> Download PO
                      </button>
                      {!vendor.hasSentPO && (
                        (() => {
                          const po = vendor.pos![0];
                          const hasEmail = getPOEmailStatus(po);
                          return hasEmail ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPOForEmail({
                                  id: po.id,
                                  jobId: job.id,
                                  poNumber: po.poNumber,
                                  vendorEmail: po.vendor?.email || job.vendor?.email || '',
                                  vendorName: vendor.vendorName,
                                  vendorContacts: po.vendor?.contacts || job.vendor?.contacts || [],
                                });
                              }}
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded font-medium"
                            >
                              <Send className="w-3 h-3" /> Send Email
                            </button>
                          ) : (
                            <span
                              title="Vendor has no email address"
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-gray-400 bg-gray-100 rounded font-medium cursor-not-allowed"
                            >
                              <Send className="w-3 h-3" /> No Email
                            </span>
                          );
                        })()
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

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
          <div className="flex items-center gap-2">
            {job.sizeName && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                Size: {job.sizeName}
              </span>
            )}
          </div>
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

      {/* Line Items - Editable CRUD */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</h3>
          {!job.invoiceGeneratedAt && !isAddingLineItem && (
            <div className="relative">
              <button
                onClick={() => setShowLineItemPresets(!showLineItemPresets)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
              >
                <Plus className="w-3 h-3" />
                Add Line Item
                <ChevronDown className="w-3 h-3" />
              </button>
              {showLineItemPresets && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  {lineItemPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePresetSelect(preset)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <div className="border-t border-gray-100">
                    <button
                      onClick={() => handlePresetSelect(null)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-b-lg"
                    >
                      Custom...
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Description</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase w-20">Qty</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase w-24">Unit Cost</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase w-24">Unit Price</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase w-24">Total</th>
              {!job.invoiceGeneratedAt && (
                <th className="text-right px-4 py-3 font-medium text-gray-600 text-xs uppercase w-20">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(job.lineItems || []).map((item, index) => (
              <LineItemRow
                key={index}
                item={item}
                isEditing={editingLineItemIndex === index}
                isSaving={isSavingLineItem && editingLineItemIndex === index}
                onEdit={() => setEditingLineItemIndex(editingLineItemIndex === index ? null : index)}
                onSave={async (updated) => await handleLineItemSave(index, updated)}
                onDelete={() => handleLineItemDelete(index)}
                disabled={!!job.invoiceGeneratedAt}
              />
            ))}
            {isAddingLineItem && (
              <LineItemRow
                isNew
                item={presetLineItem || undefined}
                isSaving={isSavingLineItem}
                onSave={handleLineItemAdd}
                onCancel={() => { setIsAddingLineItem(false); setPresetLineItem(null); }}
              />
            )}
            {(!job.lineItems || job.lineItems.length === 0) && !isAddingLineItem && (
              <tr>
                <td colSpan={job.invoiceGeneratedAt ? 5 : 6} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No line items yet. {!job.invoiceGeneratedAt && 'Click "Add Line Item" to add one.'}
                </td>
              </tr>
            )}
          </tbody>
          {(job.lineItems && job.lineItems.length > 0) && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={job.invoiceGeneratedAt ? 4 : 5} className="px-4 py-3 text-right font-semibold text-gray-700 uppercase text-xs">Total</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(lineItemsTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

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
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
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
                        <div className="px-2 py-1.5 text-sm text-gray-600 bg-gray-50 rounded">
                          {job.vendor?.name || 'No vendor'}
                          <span className="text-xs text-gray-400 block">From job</span>
                        </div>
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

            {/* Vendor Display - inherited from job (read-only) */}
            {poType === 'impact-vendor' && (
              <div>
                <label className="text-xs font-medium text-gray-600 uppercase block mb-2">Vendor</label>
                {job.vendor ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                    {job.vendor.name}
                    {job.vendor.isPartner && (
                      <span className="ml-2 text-xs text-orange-600">(Partner - 50/50 split)</span>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Inherited from job. Change vendor in job details.</p>
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                    No vendor assigned to job. Set vendor in job details first.
                  </div>
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

            {/* Margin Calculation */}
            {(() => {
              const newPOCost = poManualCost && parseFloat(poManualCost) > 0 ? parseFloat(poManualCost) : selectedTotal;
              const existingPOCosts = (job.purchaseOrders || [])
                .filter((po: any) => po.originCompanyId === 'impact-direct')
                .reduce((sum: number, po: any) => sum + (po.buyCost || 0), 0);
              const totalCostAfter = existingPOCosts + newPOCost;
              const sellPrice = Number(job.sellPrice) || 0;
              const margin = sellPrice - totalCostAfter;
              const marginPercent = sellPrice > 0 ? (margin / sellPrice) * 100 : 0;
              const isNegative = margin < 0;
              const isLow = marginPercent > 0 && marginPercent < 10;

              return (
                <div className={`p-3 rounded-lg border ${isNegative ? 'bg-red-50 border-red-200' : isLow ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="text-xs text-gray-500 mb-1">After this PO:</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Sell:</span>
                      <span className="font-medium ml-1">{formatCurrency(sellPrice)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Cost:</span>
                      <span className="font-medium ml-1">{formatCurrency(totalCostAfter)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Margin:</span>
                      <span className={`font-bold ml-1 ${isNegative ? 'text-red-600' : isLow ? 'text-yellow-600' : 'text-green-600'}`}>
                        {formatCurrency(margin)} ({marginPercent.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  {isNegative && (
                    <div className="text-xs text-red-600 mt-2 font-medium">Warning: Negative margin - you will lose money on this job!</div>
                  )}
                  {isLow && !isNegative && (
                    <div className="text-xs text-yellow-600 mt-2">Low margin - verify pricing is correct</div>
                  )}
                </div>
              );
            })()}

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
                disabled={isSaving || (poType === 'impact-vendor' && !job.vendor?.id) || (selectedLineItems.size === 0 && (!poManualCost || parseFloat(poManualCost) <= 0))}
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

  const tabs: { id: TabType; label: string; badge?: number }[] = [
    { id: 'details', label: 'Details' },
    { id: 'vendors-costs', label: 'Vendors & Costs' },
    { id: 'communications', label: 'Communications', badge: pendingCommCount },
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
                          job.purchaseOrders.map((po: any) => {
                            const hasEmail = getPOEmailStatus(po);
                            const vendorDisplayName = po.vendor?.name || po.targetCompany?.name || job.vendor?.name || 'Vendor';
                            return hasEmail ? (
                              <button
                                key={po.id}
                                onClick={() => {
                                  setEmailType('po');
                                  setSelectedPOForEmail({
                                    id: po.id,
                                    jobId: job.id,
                                    poNumber: po.poNumber,
                                    vendorName: vendorDisplayName,
                                    vendorEmail: po.vendor?.email || po.targetCompany?.email || job.vendor?.email,
                                    vendorContacts: po.vendor?.contacts || job.vendor?.contacts || [],
                                  });
                                  setShowEmailDropdown(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                              >
                                <FileText className="w-4 h-4 text-gray-500" />
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">PO to {vendorDisplayName.slice(0, 15)}</div>
                                  <div className="text-xs text-gray-500">PO #{po.poNumber}</div>
                                </div>
                                {po.emailedAt && (
                                  <span className="text-xs text-green-600 flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    Sent
                                  </span>
                                )}
                              </button>
                            ) : (
                              <div
                                key={po.id}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm bg-gray-50 border-b border-gray-100 last:border-b-0 cursor-not-allowed"
                                title="Vendor has no email address"
                              >
                                <FileText className="w-4 h-4 text-gray-300" />
                                <div className="flex-1">
                                  <div className="font-medium text-gray-400">PO to {vendorDisplayName.slice(0, 15)}</div>
                                  <div className="text-xs text-red-400">No email address</div>
                                </div>
                              </div>
                            );
                          })
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
                  {/* Invoice payment status toggle - shows when invoice has been sent */}
                  {job.invoiceEmailedAt && (
                    <select
                      value={job.customerPaymentDate ? 'paid' : 'unpaid'}
                      onChange={async (e) => {
                        try {
                          const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/jobs/${job.id}/customer-paid`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: e.target.value }),
                          });
                          if (!response.ok) throw new Error('Failed to update');
                          onRefresh?.();
                        } catch (err) {
                          console.error('Failed to update payment status:', err);
                        }
                      }}
                      className={`text-xs px-2 py-1 rounded border cursor-pointer ${
                        job.customerPaymentDate
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                      }`}
                      title={job.sellPrice ? `$${Number(job.sellPrice).toFixed(2)}` : 'Payment status'}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
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
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.id === 'communications' && <MessageSquare className="h-4 w-4" />}
                  {tab.label}
                  {tab.id === 'purchase-orders' && job.purchaseOrders && job.purchaseOrders.length > 0 && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                      {job.purchaseOrders.length}
                    </span>
                  )}
                  {tab.badge && tab.badge > 0 && (
                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full font-semibold">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-6 overflow-y-auto flex-1">
            {activeTab === 'details' && (
              <>
                {OverviewTab()}
                {/* Notes Section */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Notes</h3>
                  {job?.notes ? (
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{job.notes}</p>
                    </div>
                  ) : (
                    <p className="text-gray-400 italic text-sm">No notes for this job</p>
                  )}
                </div>
              </>
            )}
            {activeTab === 'vendors-costs' && (
              <div className="space-y-6">
                {/* Visual Vendor Cards - At a glance vendor/cost overview */}
                {VendorCardsSection()}

                {/* Detailed Cost Breakdown */}
                <div className="pt-4 border-t border-gray-200">
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900 py-2">
                      <span>Detailed Cost Breakdown</span>
                      <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="pt-4">
                      {PricingTab()}
                    </div>
                  </details>
                </div>

                {/* Purchase Orders Management */}
                <div className="pt-4 border-t border-gray-200">
                  {PurchaseOrdersTab()}
                </div>
              </div>
            )}
            {activeTab === 'communications' && job && (
              <CommunicationThread
                jobId={job.id}
                jobNo={job.jobNo || job.number || ''}
                customerName={job.customer?.name}
                customerEmail={job.customer?.email}
                vendorName={job.vendor?.name}
                vendorEmail={job.vendor?.email}
              />
            )}
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
          jobId={selectedPOForEmail.jobId}
          poId={selectedPOForEmail.id}
          poNumber={selectedPOForEmail.poNumber}
          defaultEmail={selectedPOForEmail.vendorEmail || ''}
          recipientName={selectedPOForEmail.vendorName}
          vendorInfo={{
            email: selectedPOForEmail.vendorEmail,
            name: selectedPOForEmail.vendorName,
            contacts: selectedPOForEmail.vendorContacts,
          }}
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

      {/* Send Proof to Customer Modal */}
      {showSendProofModal && job && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80]">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Send Proof to Customer</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipient</label>
                <p className="text-sm bg-gray-50 p-2 rounded border border-gray-200">
                  <span className="font-medium">{job.customer?.name}</span>
                  <span className="text-gray-500 ml-2">({job.customer?.email || 'No email'})</span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Files to Send ({selectedProofFiles.length})</label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedProofFiles.map(file => (
                    <div key={file.id} className="flex items-center justify-between text-sm bg-purple-50 p-2 rounded border border-purple-200">
                      <span className="truncate">{file.fileName}</span>
                      <button
                        onClick={() => setSelectedProofFiles(prev => prev.filter(f => f.id !== file.id))}
                        className="text-gray-400 hover:text-red-500 ml-2"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message (optional)
                </label>
                <textarea
                  value={proofMessage}
                  onChange={(e) => setProofMessage(e.target.value)}
                  placeholder="Add a personal message to the customer..."
                  className="w-full h-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  The customer will receive a branded email with the proof files attached and instructions to approve or request changes.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSendProofModal(false);
                  setSelectedProofFiles([]);
                  setProofMessage('');
                }}
                disabled={isSendingProof}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!job.customer?.email || selectedProofFiles.length === 0) return;
                  setIsSendingProof(true);
                  try {
                    await emailApi.sendProofToCustomer(
                      job.id,
                      job.customer.email,
                      selectedProofFiles.map(f => f.id),
                      proofMessage || undefined
                    );
                    setShowSendProofModal(false);
                    setSelectedProofFiles([]);
                    setProofMessage('');
                    onRefresh?.();
                  } catch (error: any) {
                    alert(error.message || 'Failed to send proof');
                  } finally {
                    setIsSendingProof(false);
                  }
                }}
                disabled={isSendingProof || !job.customer?.email || selectedProofFiles.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:bg-gray-400 flex items-center gap-2"
              >
                {isSendingProof ? (
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
                    Send Proof
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {previewFile && (
        <PDFPreviewModal
          fileId={previewFile.id}
          fileName={previewFile.fileName}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
}
