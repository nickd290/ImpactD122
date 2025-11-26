import React, { useState } from 'react';
import { X, Calendar, DollarSign, FileText, Package, User, Edit2, Check, XIcon, Save } from 'lucide-react';

interface Job {
  id: string;
  number: string;
  title: string;
  customer: { name: string; email: string };
  vendor: { name: string; email: string };
  status: string;
  dateCreated: string;
  dueDate?: string;
  customerPONumber?: string;
  vendorPONumber?: string;
  invoiceNumber?: string;
  quoteNumber?: string;
  notes?: string;
  specs?: any;
  lineItems?: any[];
  financials?: any;
}

interface JobDrawerProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onGenerateEmail?: () => void;
  onDownloadPO?: () => void;
  onDownloadInvoice?: () => void;
  onDownloadQuote?: () => void;
  onUpdateBradfordRef?: (jobId: string, refNumber: string) => void;
  onUpdateJob?: (jobId: string, jobData: any) => Promise<void>;
  customers?: any[];
  vendors?: any[];
}

export const JobDrawer: React.FC<JobDrawerProps> = ({
  job,
  isOpen,
  onClose,
  onEdit,
  onGenerateEmail,
  onDownloadPO,
  onDownloadInvoice,
  onDownloadQuote,
  onUpdateBradfordRef,
  onUpdateJob,
  customers = [],
  vendors = []
}) => {
  const [isEditingBradfordRef, setIsEditingBradfordRef] = useState(false);
  const [bradfordRefValue, setBradfordRefValue] = useState('');
  const [isEditingLineItems, setIsEditingLineItems] = useState(false);
  const [editedLineItems, setEditedLineItems] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingEntities, setIsEditingEntities] = useState(false);
  const [editedCustomerId, setEditedCustomerId] = useState('');
  const [editedVendorId, setEditedVendorId] = useState('');
  const [isEditingBradfordFinancials, setIsEditingBradfordFinancials] = useState(false);
  const [bradfordFinancials, setBradfordFinancials] = useState({
    impactCustomerTotal: 0,
    jdServicesTotal: 0,
    bradfordPaperCost: 0,
    paperMarkupAmount: 0,
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isEditingCustomerInfo, setIsEditingCustomerInfo] = useState(false);
  const [isEditingVendorInfo, setIsEditingVendorInfo] = useState(false);
  const [editedCustomerInfo, setEditedCustomerInfo] = useState({
    email: '',
    phone: '',
    address: '',
    contactPerson: '',
  });
  const [editedVendorInfo, setEditedVendorInfo] = useState({
    email: '',
    phone: '',
    address: '',
    contactPerson: '',
  });

  if (!job) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleEditBradfordRef = () => {
    setBradfordRefValue(job.bradfordRefNumber || '');
    setIsEditingBradfordRef(true);
  };

  const handleSaveBradfordRef = async () => {
    if (onUpdateBradfordRef) {
      await onUpdateBradfordRef(job.id, bradfordRefValue);
      setIsEditingBradfordRef(false);
    }
  };

  const handleCancelBradfordRef = () => {
    setIsEditingBradfordRef(false);
    setBradfordRefValue('');
  };

  const handleEditTitle = () => {
    setEditedTitle(job.title);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (!onUpdateJob) return;

    setIsSaving(true);
    try {
      await onUpdateJob(job.id, { title: editedTitle });
      setIsEditingTitle(false);
    } catch (error) {
      console.error('Failed to save title:', error);
      alert('Failed to save title. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelTitle = () => {
    setIsEditingTitle(false);
  };

  const handleEditCustomerInfo = () => {
    setEditedCustomerInfo({
      email: job.customer?.email || '',
      phone: job.customer?.phone || '',
      address: job.customer?.address || '',
      contactPerson: job.customer?.contactPerson || '',
    });
    setIsEditingCustomerInfo(true);
  };

  const handleSaveCustomerInfo = async () => {
    if (!job.customer?.id) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/entities/${job.customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedCustomerInfo),
      });

      if (!response.ok) throw new Error('Failed to update customer');

      // Refresh the page or update local state
      window.location.reload();
    } catch (error) {
      console.error('Failed to save customer info:', error);
      alert('Failed to save customer information. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelCustomerInfo = () => {
    setIsEditingCustomerInfo(false);
  };

  const handleEditVendorInfo = () => {
    setEditedVendorInfo({
      email: job.vendor?.email || '',
      phone: job.vendor?.phone || '',
      address: job.vendor?.address || '',
      contactPerson: job.vendor?.contactPerson || '',
    });
    setIsEditingVendorInfo(true);
  };

  const handleSaveVendorInfo = async () => {
    if (!job.vendor?.id) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/entities/${job.vendor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedVendorInfo),
      });

      if (!response.ok) throw new Error('Failed to update vendor');

      // Refresh the page or update local state
      window.location.reload();
    } catch (error) {
      console.error('Failed to save vendor info:', error);
      alert('Failed to save vendor information. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelVendorInfo = () => {
    setIsEditingVendorInfo(false);
  };

  const handleEditLineItems = () => {
    setEditedLineItems(job.lineItems || []);
    setIsEditingLineItems(true);
  };

  const handleSaveLineItems = async () => {
    if (!onUpdateJob) return;

    setIsSaving(true);
    try {
      await onUpdateJob(job.id, {
        lineItems: editedLineItems,
      });
      setIsEditingLineItems(false);
    } catch (error) {
      console.error('Failed to save line items:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEditLineItems = () => {
    setIsEditingLineItems(false);
    setEditedLineItems([]);
  };

  const handleLineItemChange = (index: number, field: string, value: any) => {
    const updated = [...editedLineItems];
    const item = { ...updated[index] };

    if (field === 'description') {
      item[field] = value;
    } else {
      const numValue = parseFloat(value) || 0;

      // Auto-calculate based on what field changed
      const quantity = field === 'quantity' ? numValue : (item.quantity || 1);

      if (field === 'totalCost') {
        // User entered total cost, calculate unit cost
        item.unitCost = quantity > 0 ? numValue / quantity : 0;
      } else if (field === 'totalPrice') {
        // User entered total price, calculate unit price
        item.unitPrice = quantity > 0 ? numValue / quantity : 0;
      } else if (field === 'quantity') {
        // Quantity changed, keep unit prices same (totals will update)
        item.quantity = numValue;
      } else if (field === 'unitCost') {
        // Unit cost changed manually
        item.unitCost = numValue;
      } else if (field === 'unitPrice') {
        // Unit price changed manually
        item.unitPrice = numValue;
      } else if (field === 'markupPercent') {
        // Markup changed manually
        item.markupPercent = numValue;
      }

      // Always recalculate markup percentage when cost or price changes
      if (field !== 'markupPercent' && item.unitCost > 0) {
        item.markupPercent = ((item.unitPrice - item.unitCost) / item.unitCost) * 100;
      } else if (field !== 'markupPercent' && item.unitCost === 0) {
        item.markupPercent = 0;
      }
    }

    updated[index] = item;
    setEditedLineItems(updated);
  };

  const handleEditEntities = () => {
    setEditedCustomerId(job.customer?.id || job.customerId || '');
    setEditedVendorId(job.vendor?.id || job.vendorId || '');
    setIsEditingEntities(true);
  };

  const handleSaveEntities = async () => {
    if (!onUpdateJob) return;

    setIsSaving(true);
    try {
      await onUpdateJob(job.id, {
        customerId: editedCustomerId,
        vendorId: editedVendorId,
      });
      setIsEditingEntities(false);
    } catch (error) {
      console.error('Failed to save entities:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEditEntities = () => {
    setIsEditingEntities(false);
    setEditedCustomerId('');
    setEditedVendorId('');
  };

  const handleEditBradfordFinancials = () => {
    // Calculate customer total from line items if not already set
    const lineItemsTotal = job.lineItems?.reduce(
      (sum: number, item: any) => sum + item.unitPrice * item.quantity,
      0
    ) || 0;

    setBradfordFinancials({
      impactCustomerTotal: job.financials?.impactCustomerTotal || lineItemsTotal,
      jdServicesTotal: job.financials?.jdServicesTotal || 0,
      bradfordPaperCost: job.financials?.bradfordPaperCost || 0,
      paperMarkupAmount: job.financials?.paperMarkupAmount || 0,
    });
    setIsEditingBradfordFinancials(true);
  };

  const handleSaveBradfordFinancials = async () => {
    if (!onUpdateJob) return;

    setIsSaving(true);
    try {
      await onUpdateJob(job.id, {
        financials: bradfordFinancials,
      });
      setIsEditingBradfordFinancials(false);
    } catch (error) {
      console.error('Failed to save Bradford financials:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelBradfordFinancials = () => {
    setIsEditingBradfordFinancials(false);
  };

  const calculateBradfordValues = () => {
    const { impactCustomerTotal, jdServicesTotal, bradfordPaperCost, paperMarkupAmount } = bradfordFinancials;
    const impactBaseCost = (bradfordPaperCost + paperMarkupAmount) + jdServicesTotal;
    const spread = impactCustomerTotal - impactBaseCost;
    const bradfordShare = spread * 0.5;
    const impactCostFromBradford = impactBaseCost + bradfordShare;
    const bradfordProfit = paperMarkupAmount + bradfordShare;
    const impactProfit = impactCustomerTotal - impactCostFromBradford;

    return {
      spread,
      bradfordShare,
      impactCostFromBradford,
      bradfordProfit,
      impactProfit,
    };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-800',
      QUOTED: 'bg-blue-100 text-blue-800',
      APPROVED: 'bg-green-100 text-green-800',
      PO_ISSUED: 'bg-purple-100 text-purple-800',
      IN_PRODUCTION: 'bg-yellow-100 text-yellow-800',
      SHIPPED: 'bg-indigo-100 text-indigo-800',
      INVOICED: 'bg-impact-orange text-white',
      PAID: 'bg-emerald-100 text-emerald-800',
      CANCELLED: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black transition-opacity duration-300 z-[60] ${
          isOpen ? 'opacity-50' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleBackdropClick}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-[70] overflow-y-auto ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-impact-navy">{job.number}</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                {job.status.replace('_', ' ')}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              {isEditingTitle ? (
                <>
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red text-gray-900"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    disabled={isSaving}
                    className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                    title="Save"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelTitle}
                    disabled={isSaving}
                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                    title="Cancel"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-600">{job.title}</p>
                  <button
                    onClick={handleEditTitle}
                    className="p-1 text-gray-400 hover:text-impact-red hover:bg-gray-100 rounded transition-colors"
                    title="Edit job title"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="px-4 py-2 bg-impact-red text-white rounded-lg hover:bg-impact-orange transition-colors font-medium"
              >
                Edit Job
              </button>
            )}
            {onGenerateEmail && (
              <button
                onClick={onGenerateEmail}
                className="px-4 py-2 border border-impact-red text-impact-red rounded-lg hover:bg-impact-cream transition-colors font-medium"
              >
                Generate Email
              </button>
            )}
            {onDownloadPO && (
              <button
                onClick={onDownloadPO}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center gap-2"
                title={`Download Purchase Order for ${job.vendor.name}`}
              >
                <FileText className="w-4 h-4" />
                PO PDF
              </button>
            )}
            {onDownloadInvoice && (
              <button
                onClick={onDownloadInvoice}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
                title={`Download Invoice for ${job.customer.name}`}
              >
                <FileText className="w-4 h-4" />
                Invoice PDF
              </button>
            )}
            {onDownloadQuote && (
              <button
                onClick={onDownloadQuote}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                title={`Download Quote for ${job.customer.name}`}
              >
                <FileText className="w-4 h-4" />
                Quote PDF
              </button>
            )}
          </div>

          {/* Customer & Vendor Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-impact-navy">Customer & Vendor</h3>
              {!isEditingEntities ? (
                <button
                  onClick={handleEditEntities}
                  className="px-3 py-1.5 bg-impact-red text-white rounded hover:bg-impact-orange transition-colors text-sm flex items-center gap-2"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelEditEntities}
                    disabled={isSaving}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEntities}
                    disabled={isSaving}
                    className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-impact-cream p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-impact-navy" />
                    <h3 className="font-semibold text-impact-navy text-sm">Customer</h3>
                  </div>
                  {!isEditingEntities && !isEditingCustomerInfo && (
                    <button
                      onClick={handleEditCustomerInfo}
                      className="p-1 text-gray-400 hover:text-impact-red hover:bg-white rounded transition-colors"
                      title="Edit customer info"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {isEditingEntities ? (
                  <select
                    value={editedCustomerId}
                    onChange={(e) => setEditedCustomerId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                  >
                    <option value="">Select customer...</option>
                    {customers.map((customer: any) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                ) : isEditingCustomerInfo ? (
                  <div className="space-y-2">
                    <p className="font-medium text-gray-900 mb-2">{job.customer.name}</p>
                    <div>
                      <label className="text-xs text-gray-600">Contact Person</label>
                      <input
                        type="text"
                        value={editedCustomerInfo.contactPerson}
                        onChange={(e) => setEditedCustomerInfo({ ...editedCustomerInfo, contactPerson: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Email</label>
                      <input
                        type="email"
                        value={editedCustomerInfo.email}
                        onChange={(e) => setEditedCustomerInfo({ ...editedCustomerInfo, email: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Phone</label>
                      <input
                        type="tel"
                        value={editedCustomerInfo.phone}
                        onChange={(e) => setEditedCustomerInfo({ ...editedCustomerInfo, phone: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Address</label>
                      <textarea
                        value={editedCustomerInfo.address}
                        onChange={(e) => setEditedCustomerInfo({ ...editedCustomerInfo, address: e.target.value })}
                        rows={2}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSaveCustomerInfo}
                        disabled={isSaving}
                        className="flex-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancelCustomerInfo}
                        disabled={isSaving}
                        className="flex-1 px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-gray-900">{job.customer.name}</p>
                    {job.customer.contactPerson && <p className="text-sm text-gray-600">{job.customer.contactPerson}</p>}
                    <p className="text-sm text-gray-600">{job.customer.email}</p>
                    {job.customer.phone && <p className="text-sm text-gray-600">{job.customer.phone}</p>}
                    {job.customer.address && <p className="text-xs text-gray-500 mt-1">{job.customer.address}</p>}
                  </>
                )}
              </div>
              <div className="bg-impact-cream p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-impact-navy" />
                    <h3 className="font-semibold text-impact-navy text-sm">Vendor</h3>
                  </div>
                  {!isEditingEntities && !isEditingVendorInfo && (
                    <button
                      onClick={handleEditVendorInfo}
                      className="p-1 text-gray-400 hover:text-impact-red hover:bg-white rounded transition-colors"
                      title="Edit vendor info"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {isEditingEntities ? (
                  <select
                    value={editedVendorId}
                    onChange={(e) => setEditedVendorId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                  >
                    <option value="">Select vendor...</option>
                    {vendors.map((vendor: any) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                ) : isEditingVendorInfo ? (
                  <div className="space-y-2">
                    <p className="font-medium text-gray-900 mb-2">{job.vendor.name}</p>
                    <div>
                      <label className="text-xs text-gray-600">Contact Person</label>
                      <input
                        type="text"
                        value={editedVendorInfo.contactPerson}
                        onChange={(e) => setEditedVendorInfo({ ...editedVendorInfo, contactPerson: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Email</label>
                      <input
                        type="email"
                        value={editedVendorInfo.email}
                        onChange={(e) => setEditedVendorInfo({ ...editedVendorInfo, email: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Phone</label>
                      <input
                        type="tel"
                        value={editedVendorInfo.phone}
                        onChange={(e) => setEditedVendorInfo({ ...editedVendorInfo, phone: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Address</label>
                      <textarea
                        value={editedVendorInfo.address}
                        onChange={(e) => setEditedVendorInfo({ ...editedVendorInfo, address: e.target.value })}
                        rows={2}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSaveVendorInfo}
                        disabled={isSaving}
                        className="flex-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancelVendorInfo}
                        disabled={isSaving}
                        className="flex-1 px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-gray-900">{job.vendor.name}</p>
                    {job.vendor.contactPerson && <p className="text-sm text-gray-600">{job.vendor.contactPerson}</p>}
                    <p className="text-sm text-gray-600">{job.vendor.email}</p>
                    {job.vendor.phone && <p className="text-sm text-gray-600">{job.vendor.phone}</p>}
                    {job.vendor.address && <p className="text-xs text-gray-500 mt-1">{job.vendor.address}</p>}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Dates & Documents */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-impact-navy mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Dates & Documents
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Created:</span>
                <p className="font-medium text-gray-900">
                  {new Date(job.dateCreated).toLocaleDateString()}
                </p>
              </div>
              {job.dueDate && (
                <div>
                  <span className="text-gray-600">Due Date:</span>
                  <p className="font-medium text-gray-900">
                    {new Date(job.dueDate).toLocaleDateString()}
                  </p>
                </div>
              )}
              {job.customerPONumber && (
                <div>
                  <span className="text-gray-600">Customer PO:</span>
                  <p className="font-medium text-gray-900">{job.customerPONumber}</p>
                </div>
              )}
              {job.vendorPONumber && (
                <div>
                  <span className="text-gray-600">Vendor PO:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                      {job.vendorPONumber}
                    </span>
                    <span className="text-xs text-gray-500">Generated</span>
                  </div>
                </div>
              )}
              {job.invoiceNumber && (
                <div>
                  <span className="text-gray-600">Invoice:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                      {job.invoiceNumber}
                    </span>
                    <span className="text-xs text-gray-500">Generated</span>
                  </div>
                </div>
              )}
              {job.quoteNumber && (
                <div>
                  <span className="text-gray-600">Quote:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                      {job.quoteNumber}
                    </span>
                    <span className="text-xs text-gray-500">Generated</span>
                  </div>
                </div>
              )}
              {(job.bradfordRefNumber || onUpdateBradfordRef) && (
                <div className="col-span-2">
                  <span className="text-gray-600">Bradford Reference:</span>
                  {isEditingBradfordRef ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={bradfordRefValue}
                        onChange={(e) => setBradfordRefValue(e.target.value)}
                        placeholder="Enter Bradford PO number"
                        className="px-3 py-1.5 border border-orange-300 rounded-md text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveBradfordRef}
                        className="p-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCancelBradfordRef}
                        className="p-1.5 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
                        title="Cancel"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      {job.bradfordRefNumber ? (
                        <span className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-bold bg-orange-100 text-orange-800 border-2 border-orange-300">
                          {job.bradfordRefNumber}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Not assigned</span>
                      )}
                      <span className="text-xs text-gray-500 font-medium">Partner PO Number</span>
                      {onUpdateBradfordRef && (
                        <button
                          onClick={handleEditBradfordRef}
                          className="p-1 text-orange-600 hover:bg-orange-50 rounded transition-colors ml-2"
                          title="Edit Bradford Reference"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Specifications */}
          {job.specs && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-impact-navy mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Specifications
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {job.specs.productType && (
                  <div>
                    <span className="text-gray-600">Product Type:</span>
                    <p className="font-medium text-gray-900">{job.specs.productType}</p>
                  </div>
                )}
                {job.specs.colors && (
                  <div>
                    <span className="text-gray-600">Colors:</span>
                    <p className="font-medium text-gray-900">{job.specs.colors}</p>
                  </div>
                )}
                {job.specs.flatSize && (
                  <div>
                    <span className="text-gray-600">Flat Size:</span>
                    <p className="font-medium text-gray-900">{job.specs.flatSize}</p>
                  </div>
                )}
                {job.specs.finishedSize && (
                  <div>
                    <span className="text-gray-600">Finished Size:</span>
                    <p className="font-medium text-gray-900">{job.specs.finishedSize}</p>
                  </div>
                )}
                {job.specs.paperType && (
                  <div>
                    <span className="text-gray-600">Paper:</span>
                    <p className="font-medium text-gray-900">{job.specs.paperType}</p>
                  </div>
                )}
                {job.specs.paperLbs && (
                  <div>
                    <span className="text-gray-600">Paper Usage:</span>
                    <p className="font-medium text-orange-700">{parseFloat(job.specs.paperLbs).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lbs</p>
                  </div>
                )}
                {job.specs.coating && (
                  <div>
                    <span className="text-gray-600">Coating:</span>
                    <p className="font-medium text-gray-900">{job.specs.coating}</p>
                  </div>
                )}
                {job.specs.finishing && (
                  <div>
                    <span className="text-gray-600">Finishing:</span>
                    <p className="font-medium text-gray-900">{job.specs.finishing}</p>
                  </div>
                )}
                {job.specs.bindingStyle && (
                  <div>
                    <span className="text-gray-600">Binding:</span>
                    <p className="font-medium text-gray-900">{job.specs.bindingStyle}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Line Items */}
          {job.lineItems && job.lineItems.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-impact-navy flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Line Items
                </h3>
                {!isEditingLineItems ? (
                  <button
                    onClick={handleEditLineItems}
                    className="px-3 py-1.5 bg-impact-red text-white rounded hover:bg-impact-orange transition-colors text-sm flex items-center gap-2"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelEditLineItems}
                      disabled={isSaving}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveLineItems}
                      disabled={isSaving}
                      className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200">
                    <tr className="text-left">
                      <th className="pb-2 font-semibold text-gray-700">Description</th>
                      <th className="pb-2 font-semibold text-gray-700 text-right">Qty</th>
                      <th className="pb-2 font-semibold text-gray-700 text-right">
                        {isEditingLineItems ? 'Total Cost' : 'Unit Cost'}
                      </th>
                      <th className="pb-2 font-semibold text-gray-700 text-right">Markup %</th>
                      <th className="pb-2 font-semibold text-gray-700 text-right">
                        {isEditingLineItems ? 'Total Price' : 'Unit Price'}
                      </th>
                      <th className="pb-2 font-semibold text-gray-700 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(isEditingLineItems ? editedLineItems : job.lineItems).map((item: any, index: number) => (
                      <React.Fragment key={index}>
                        <tr>
                          <td className="py-2">
                            {isEditingLineItems ? (
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red"
                              />
                            ) : (
                              item.description
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {isEditingLineItems ? (
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                                className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red text-right"
                              />
                            ) : (
                              item.quantity.toLocaleString()
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {isEditingLineItems ? (
                              <input
                                type="number"
                                step="0.01"
                                value={Math.round((item.unitCost * item.quantity) * 100) / 100}
                                onChange={(e) => handleLineItemChange(index, 'totalCost', e.target.value)}
                                className="w-32 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red text-right"
                              />
                            ) : (
                              formatCurrency(item.unitCost)
                            )}
                          </td>
                          <td className="py-2 text-right">
                            <span className={isEditingLineItems ? "text-gray-600 font-medium" : ""}>
                              {item.markupPercent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            {isEditingLineItems ? (
                              <input
                                type="number"
                                step="0.01"
                                value={Math.round((item.unitPrice * item.quantity) * 100) / 100}
                                onChange={(e) => handleLineItemChange(index, 'totalPrice', e.target.value)}
                                className="w-32 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-impact-red text-right"
                              />
                            ) : (
                              formatCurrency(item.unitPrice)
                            )}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {formatCurrency(item.unitPrice * item.quantity)}
                          </td>
                        </tr>
                        {isEditingLineItems && (
                          <tr className="bg-gray-50">
                            <td colSpan={2} className="py-1 px-2 text-xs text-gray-500 italic">
                              Per piece:
                            </td>
                            <td className="py-1 text-right text-xs text-gray-600">
                              {formatCurrency(item.unitCost)}
                            </td>
                            <td className="py-1 text-right text-xs text-gray-500">
                              (auto-calculated)
                            </td>
                            <td className="py-1 text-right text-xs text-gray-600">
                              {formatCurrency(item.unitPrice)}
                            </td>
                            <td className="py-1"></td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    <tr className="font-bold border-t-2 border-impact-red">
                      <td colSpan={5} className="py-2 text-right">Total:</td>
                      <td className="py-2 text-right">
                        {formatCurrency(
                          (isEditingLineItems ? editedLineItems : job.lineItems).reduce(
                            (sum: number, item: any) => sum + item.unitPrice * item.quantity,
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bradford Partner Financials */}
          {job.vendor?.isPartner && (
            <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-orange-600" />
                  <h3 className="font-semibold text-impact-navy">Bradford Partner Pricing</h3>
                  <span className="px-2 py-0.5 bg-orange-600 text-white text-xs font-bold rounded">PARTNER</span>
                </div>
                {!isEditingBradfordFinancials ? (
                  <button
                    onClick={handleEditBradfordFinancials}
                    className="px-3 py-1.5 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors text-sm flex items-center gap-2"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelBradfordFinancials}
                      disabled={isSaving}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveBradfordFinancials}
                      disabled={isSaving}
                      className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              {isEditingBradfordFinancials ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Total
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={bradfordFinancials.impactCustomerTotal}
                        onChange={(e) => setBradfordFinancials({
                          ...bradfordFinancials,
                          impactCustomerTotal: parseFloat(e.target.value) || 0
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        JD Services Total
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={bradfordFinancials.jdServicesTotal}
                        onChange={(e) => setBradfordFinancials({
                          ...bradfordFinancials,
                          jdServicesTotal: parseFloat(e.target.value) || 0
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bradford Paper Cost
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={bradfordFinancials.bradfordPaperCost}
                        onChange={(e) => setBradfordFinancials({
                          ...bradfordFinancials,
                          bradfordPaperCost: parseFloat(e.target.value) || 0
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Paper Markup Amount
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={bradfordFinancials.paperMarkupAmount}
                        onChange={(e) => setBradfordFinancials({
                          ...bradfordFinancials,
                          paperMarkupAmount: parseFloat(e.target.value) || 0
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  {/* Real-time calculations */}
                  <div className="border-t border-orange-300 pt-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Calculated Values</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Spread:</span>
                        <span className="font-medium">{formatCurrency(calculateBradfordValues().spread)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Bradford's Share (50%):</span>
                        <span className="font-medium text-orange-600">{formatCurrency(calculateBradfordValues().bradfordShare)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Impact Cost from Bradford:</span>
                        <span className="font-medium">{formatCurrency(calculateBradfordValues().impactCostFromBradford)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Bradford Profit:</span>
                        <span className="font-medium text-green-600">{formatCurrency(calculateBradfordValues().bradfordProfit)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Impact Profit:</span>
                        <span className="font-medium text-blue-600">{formatCurrency(calculateBradfordValues().impactProfit)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {job.financials?.impactCustomerTotal ? (
                    <>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Customer Total:</span>
                          <p className="font-medium text-gray-900">{formatCurrency(job.financials.impactCustomerTotal)}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">JD Services:</span>
                          <p className="font-medium text-gray-900">{formatCurrency(job.financials.jdServicesTotal || 0)}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Bradford Paper Cost:</span>
                          <p className="font-medium text-gray-900">{formatCurrency(job.financials.bradfordPaperCost || 0)}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Paper Markup:</span>
                          <p className="font-medium text-gray-900">{formatCurrency(job.financials.paperMarkupAmount || 0)}</p>
                        </div>
                      </div>
                      <div className="border-t border-orange-300 pt-3 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Spread:</span>
                          <p className="font-medium text-gray-900">{formatCurrency(job.financials.calculatedSpread || 0)}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Bradford's Share:</span>
                          <p className="font-medium text-orange-600">{formatCurrency(job.financials.bradfordShareAmount || 0)}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Impact Cost from Bradford:</span>
                          <p className="font-medium text-gray-900">{formatCurrency(job.financials.impactCostFromBradford || 0)}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Bradford Profit:</span>
                          <p className="font-medium text-green-600">
                            {formatCurrency((job.financials.paperMarkupAmount || 0) + (job.financials.bradfordShareAmount || 0))}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Impact Profit:</span>
                          <p className="font-medium text-blue-600">
                            {formatCurrency((job.financials.impactCustomerTotal || 0) - (job.financials.impactCostFromBradford || 0))}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-gray-600 text-sm">No Bradford financials entered yet</p>
                      <p className="text-gray-500 text-xs mt-1">Click Edit to add pricing details</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {job.notes && (
            <div className="bg-impact-cream p-4 rounded-lg">
              <h3 className="font-semibold text-impact-navy mb-2">Notes</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
