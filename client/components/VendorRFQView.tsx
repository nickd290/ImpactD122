import React, { useState, useEffect, useMemo } from 'react';
import {
  FileQuestion,
  Plus,
  Send,
  Award,
  ArrowRightCircle,
  Trash2,
  Edit2,
  X,
  Check,
  Clock,
  Users,
  DollarSign,
  Calendar,
  Mail,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { vendorRfqApi, entitiesApi } from '../lib/api';

// Types
interface Vendor {
  id: string;
  name: string;
  email?: string;
  isPartner?: boolean;
}

interface VendorQuote {
  id: string;
  vendorId: string;
  quoteAmount: number;
  turnaroundDays?: number;
  notes?: string;
  status: 'PENDING' | 'RECEIVED' | 'DECLINED';
  isAwarded: boolean;
  respondedAt?: string;
  emailContent?: string;
  Vendor: Vendor;
}

interface VendorRFQVendor {
  id: string;
  vendorId: string;
  sentAt?: string;
  Vendor: Vendor;
}

interface VendorRFQ {
  id: string;
  rfqNumber: string;
  title: string;
  specs: string;
  dueDate: string;
  status: 'DRAFT' | 'PENDING' | 'QUOTED' | 'AWARDED' | 'CONVERTED' | 'CANCELLED';
  notes?: string;
  jobId?: string;
  createdAt: string;
  updatedAt: string;
  vendors: VendorRFQVendor[];
  quotes: VendorQuote[];
}

// Status badge colors
const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  QUOTED: 'bg-blue-100 text-blue-700',
  AWARDED: 'bg-green-100 text-green-700',
  CONVERTED: 'bg-purple-100 text-purple-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const quoteStatusColors: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  RECEIVED: 'bg-blue-100 text-blue-700',
  DECLINED: 'bg-red-100 text-red-700',
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export function VendorRFQView() {
  const [rfqs, setRfqs] = useState<VendorRFQ[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRfq, setSelectedRfq] = useState<VendorRFQ | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [selectedVendorForQuote, setSelectedVendorForQuote] = useState<Vendor | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'DRAFT' | 'PENDING' | 'QUOTED' | 'AWARDED'>('all');

  useEffect(() => {
    loadRfqs();
    loadVendors();
  }, []);

  const loadRfqs = async () => {
    try {
      setLoading(true);
      const data = await vendorRfqApi.getAll();
      setRfqs(data.rfqs || []);
    } catch (error) {
      console.error('Failed to load RFQs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVendors = async () => {
    try {
      const data = await entitiesApi.getAll('VENDOR');
      console.log('Loaded vendors:', data);
      setVendors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load vendors:', error);
    }
  };

  // Stats
  const stats = useMemo(() => {
    return {
      draft: rfqs.filter(r => r.status === 'DRAFT').length,
      pending: rfqs.filter(r => r.status === 'PENDING').length,
      quoted: rfqs.filter(r => r.status === 'QUOTED').length,
      awarded: rfqs.filter(r => r.status === 'AWARDED').length,
    };
  }, [rfqs]);

  // Filtered RFQs
  const filteredRfqs = useMemo(() => {
    if (activeTab === 'all') return rfqs;
    return rfqs.filter(r => r.status === activeTab);
  }, [rfqs, activeTab]);

  const handleSendRfq = async (rfqId: string) => {
    if (!confirm('Send RFQ emails to all assigned vendors?')) return;
    try {
      await vendorRfqApi.send(rfqId);
      loadRfqs();
    } catch (error: any) {
      alert(error.message || 'Failed to send RFQ');
    }
  };

  const handleAwardVendor = async (rfqId: string, vendorId: string) => {
    if (!confirm('Award this RFQ to the selected vendor?')) return;
    try {
      await vendorRfqApi.award(rfqId, vendorId);
      loadRfqs();
      if (selectedRfq?.id === rfqId) {
        const updated = await vendorRfqApi.getById(rfqId);
        setSelectedRfq(updated);
      }
    } catch (error: any) {
      alert(error.message || 'Failed to award vendor');
    }
  };

  const handleConvertToJob = async (rfqId: string) => {
    if (!confirm('Convert this RFQ to a new job?')) return;
    try {
      const result = await vendorRfqApi.convertToJob(rfqId);
      alert(`Job created: ${result.job.jobNo}`);
      loadRfqs();
    } catch (error: any) {
      alert(error.message || 'Failed to convert to job');
    }
  };

  const handleDeleteRfq = async (rfqId: string) => {
    if (!confirm('Delete this RFQ? This cannot be undone.')) return;
    try {
      await vendorRfqApi.delete(rfqId);
      if (selectedRfq?.id === rfqId) {
        setSelectedRfq(null);
      }
      loadRfqs();
    } catch (error: any) {
      alert(error.message || 'Failed to delete RFQ');
    }
  };

  const handleRecordQuote = async (rfqId: string, vendorId: string, data: { quoteAmount: number; turnaroundDays?: number; notes?: string }) => {
    try {
      await vendorRfqApi.recordQuote(rfqId, { vendorId, ...data });
      if (selectedRfq?.id === rfqId) {
        const updated = await vendorRfqApi.getById(rfqId);
        setSelectedRfq(updated);
      }
      loadRfqs();
      setIsQuoteModalOpen(false);
      setSelectedVendorForQuote(null);
    } catch (error: any) {
      alert(error.message || 'Failed to record quote');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor RFQs</h1>
          <p className="text-gray-500 mt-1">Request quotes from vendors and track responses</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New RFQ
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Draft"
          value={stats.draft}
          icon={<Edit2 className="h-5 w-5 text-gray-400" />}
          onClick={() => setActiveTab('DRAFT')}
          active={activeTab === 'DRAFT'}
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={<Clock className="h-5 w-5 text-yellow-500" />}
          onClick={() => setActiveTab('PENDING')}
          active={activeTab === 'PENDING'}
        />
        <StatCard
          label="Quoted"
          value={stats.quoted}
          icon={<DollarSign className="h-5 w-5 text-blue-500" />}
          onClick={() => setActiveTab('QUOTED')}
          active={activeTab === 'QUOTED'}
        />
        <StatCard
          label="Awarded"
          value={stats.awarded}
          icon={<Award className="h-5 w-5 text-green-500" />}
          onClick={() => setActiveTab('AWARDED')}
          active={activeTab === 'AWARDED'}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(['all', 'DRAFT', 'PENDING', 'QUOTED', 'AWARDED'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'all' ? 'All RFQs' : tab.charAt(0) + tab.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex gap-6">
        {/* RFQ List */}
        <div className={`${selectedRfq ? 'w-1/2' : 'w-full'} space-y-3`}>
          {filteredRfqs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileQuestion className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No RFQs found</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-4 text-orange-500 hover:text-orange-600"
              >
                Create your first RFQ
              </button>
            </div>
          ) : (
            filteredRfqs.map(rfq => (
              <RfqListItem
                key={rfq.id}
                rfq={rfq}
                isSelected={selectedRfq?.id === rfq.id}
                onClick={() => setSelectedRfq(rfq)}
                onSend={() => handleSendRfq(rfq.id)}
                onDelete={() => handleDeleteRfq(rfq.id)}
              />
            ))
          )}
        </div>

        {/* RFQ Detail Panel */}
        {selectedRfq && (
          <RfqDetailPanel
            rfq={selectedRfq}
            onClose={() => setSelectedRfq(null)}
            onAward={(vendorId) => handleAwardVendor(selectedRfq.id, vendorId)}
            onConvertToJob={() => handleConvertToJob(selectedRfq.id)}
            onRecordQuote={(vendor) => {
              setSelectedVendorForQuote(vendor);
              setIsQuoteModalOpen(true);
            }}
          />
        )}
      </div>

      {/* Create RFQ Modal */}
      {isCreateModalOpen && (
        <CreateRfqModal
          vendors={vendors}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={() => {
            setIsCreateModalOpen(false);
            loadRfqs();
          }}
        />
      )}

      {/* Record Quote Modal */}
      {isQuoteModalOpen && selectedVendorForQuote && selectedRfq && (
        <RecordQuoteModal
          vendor={selectedVendorForQuote}
          onClose={() => {
            setIsQuoteModalOpen(false);
            setSelectedVendorForQuote(null);
          }}
          onSubmit={(data) => handleRecordQuote(selectedRfq.id, selectedVendorForQuote.id, data)}
        />
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  icon,
  onClick,
  active,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border transition-all ${
        active
          ? 'border-orange-500 bg-orange-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between">
        {icon}
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-sm text-gray-500 mt-2 text-left">{label}</p>
    </button>
  );
}

// RFQ List Item Component
function RfqListItem({
  rfq,
  isSelected,
  onClick,
  onSend,
  onDelete,
}: {
  rfq: VendorRFQ;
  isSelected: boolean;
  onClick: () => void;
  onSend: () => void;
  onDelete: () => void;
}) {
  const quotesReceived = rfq.quotes.filter(q => q.status === 'RECEIVED').length;
  const vendorCount = rfq.vendors.length;

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'border-orange-500 bg-orange-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-gray-500">{rfq.rfqNumber}</span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors[rfq.status]}`}>
              {rfq.status}
            </span>
          </div>
          <h3 className="font-medium text-gray-900 mt-1">{rfq.title}</h3>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {vendorCount} vendor{vendorCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              {quotesReceived}/{vendorCount} quotes
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Due {formatDate(rfq.dueDate)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {rfq.status === 'DRAFT' && (
            <>
              <button
                onClick={onSend}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                title="Send to vendors"
              >
                <Send className="h-4 w-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// RFQ Detail Panel Component
function RfqDetailPanel({
  rfq,
  onClose,
  onAward,
  onConvertToJob,
  onRecordQuote,
}: {
  rfq: VendorRFQ;
  onClose: () => void;
  onAward: (vendorId: string) => void;
  onConvertToJob: () => void;
  onRecordQuote: (vendor: Vendor) => void;
}) {
  // Sort quotes by amount (high to low)
  const sortedQuotes = useMemo(() => {
    return [...rfq.quotes].sort((a, b) => Number(b.quoteAmount) - Number(a.quoteAmount));
  }, [rfq.quotes]);

  const awardedQuote = rfq.quotes.find(q => q.isAwarded);

  return (
    <div className="w-1/2 bg-white border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-gray-500">{rfq.rfqNumber}</span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors[rfq.status]}`}>
              {rfq.status}
            </span>
          </div>
          <h2 className="font-semibold text-lg mt-1">{rfq.title}</h2>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto">
        {/* Specs */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Specifications</h3>
          <div className="bg-gray-50 p-3 rounded-lg whitespace-pre-wrap text-sm">
            {rfq.specs}
          </div>
        </div>

        {/* Meta Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Due Date:</span>
            <span className="ml-2 font-medium">{formatDate(rfq.dueDate)}</span>
          </div>
          <div>
            <span className="text-gray-500">Created:</span>
            <span className="ml-2 font-medium">{formatDate(rfq.createdAt)}</span>
          </div>
        </div>

        {rfq.notes && (
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Notes</h3>
            <p className="text-sm text-gray-700">{rfq.notes}</p>
          </div>
        )}

        {/* Vendor Quotes Table */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">
            Vendor Quotes ({sortedQuotes.length}/{rfq.vendors.length})
          </h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium">Vendor</th>
                  <th className="text-left p-3 font-medium">Amount</th>
                  <th className="text-left p-3 font-medium">Turnaround</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rfq.vendors.map(v => {
                  const quote = rfq.quotes.find(q => q.vendorId === v.vendorId);
                  return (
                    <tr key={v.id} className="border-t">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {quote?.isAwarded && (
                            <Award className="h-4 w-4 text-green-500" />
                          )}
                          <span className={quote?.isAwarded ? 'font-medium text-green-700' : ''}>
                            {v.Vendor.name}
                          </span>
                          {v.Vendor.isPartner && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                              Partner
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {quote && Number(quote.quoteAmount) > 0 ? (
                          <span className="font-medium">{formatCurrency(Number(quote.quoteAmount))}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        {quote?.turnaroundDays ? (
                          <span>{quote.turnaroundDays} days</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          quoteStatusColors[quote?.status || 'PENDING']
                        }`}>
                          {quote?.status || 'PENDING'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {quote?.status === 'RECEIVED' && Number(quote.quoteAmount) === 0 && (
                            <button
                              onClick={() => onRecordQuote(v.Vendor)}
                              className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                            >
                              Enter Amount
                            </button>
                          )}
                          {!quote && (
                            <button
                              onClick={() => onRecordQuote(v.Vendor)}
                              className="text-xs px-2 py-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
                            >
                              Record Quote
                            </button>
                          )}
                          {rfq.status === 'QUOTED' && quote && Number(quote.quoteAmount) > 0 && !quote.isAwarded && (
                            <button
                              onClick={() => onAward(v.vendorId)}
                              className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100"
                            >
                              Award
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Convert to Job Button */}
        {rfq.status === 'AWARDED' && !rfq.jobId && (
          <div className="pt-4 border-t">
            <button
              onClick={onConvertToJob}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              <ArrowRightCircle className="h-5 w-5" />
              Convert to Job
            </button>
          </div>
        )}

        {rfq.jobId && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
              <Check className="h-5 w-5" />
              <span>Converted to Job</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Create RFQ Modal Component
function CreateRfqModal({
  vendors,
  onClose,
  onCreated,
}: {
  vendors: Vendor[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [specs, setSpecs] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Group vendors by partner status
  const partnerVendors = vendors.filter(v => v.isPartner);
  const regularVendors = vendors.filter(v => !v.isPartner);

  console.log('CreateRfqModal vendors:', { total: vendors.length, partners: partnerVendors.length, regular: regularVendors.length });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!specs.trim()) {
      setError('Specifications are required');
      return;
    }
    if (!dueDate) {
      setError('Due date is required');
      return;
    }
    if (selectedVendorIds.length === 0) {
      setError('Select at least one vendor');
      return;
    }

    try {
      setIsSubmitting(true);
      await vendorRfqApi.create({
        title,
        specs,
        dueDate,
        vendorIds: selectedVendorIds,
        notes: notes || undefined,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create RFQ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleVendor = (vendorId: string) => {
    setSelectedVendorIds(prev =>
      prev.includes(vendorId)
        ? prev.filter(id => id !== vendorId)
        : [...prev, vendorId]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create New RFQ</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-130px)]">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Business Cards - ABC Corp"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Specifications *
            </label>
            <textarea
              value={specs}
              onChange={e => setSpecs(e.target.value)}
              placeholder="Enter full job specifications..."
              rows={8}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quote Due Date *
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes for vendors..."
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Vendors * ({selectedVendorIds.length} selected)
            </label>
            <div className="border rounded-lg max-h-48 overflow-y-auto">
              {partnerVendors.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium sticky top-0">
                    Partner Vendors
                  </div>
                  {partnerVendors.map(vendor => (
                    <VendorCheckbox
                      key={vendor.id}
                      vendor={vendor}
                      checked={selectedVendorIds.includes(vendor.id)}
                      onToggle={() => toggleVendor(vendor.id)}
                    />
                  ))}
                </>
              )}
              {regularVendors.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-gray-50 text-gray-600 text-xs font-medium sticky top-0">
                    Other Vendors
                  </div>
                  {regularVendors.map(vendor => (
                    <VendorCheckbox
                      key={vendor.id}
                      vendor={vendor}
                      checked={selectedVendorIds.includes(vendor.id)}
                      onToggle={() => toggleVendor(vendor.id)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create RFQ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Vendor Checkbox Component
function VendorCheckbox({
  vendor,
  checked,
  onToggle,
}: {
  vendor: Vendor;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
      />
      <span className="flex-1">{vendor.name}</span>
      {vendor.email && (
        <span className="text-sm text-gray-400">{vendor.email}</span>
      )}
    </label>
  );
}

// Record Quote Modal Component
function RecordQuoteModal({
  vendor,
  onClose,
  onSubmit,
}: {
  vendor: Vendor;
  onClose: () => void;
  onSubmit: (data: { quoteAmount: number; turnaroundDays?: number; notes?: string }) => void;
}) {
  const [quoteAmount, setQuoteAmount] = useState('');
  const [turnaroundDays, setTurnaroundDays] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteAmount || isNaN(parseFloat(quoteAmount))) {
      alert('Please enter a valid quote amount');
      return;
    }

    setIsSubmitting(true);
    await onSubmit({
      quoteAmount: parseFloat(quoteAmount),
      turnaroundDays: turnaroundDays ? parseInt(turnaroundDays) : undefined,
      notes: notes || undefined,
    });
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Record Quote - {vendor.name}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quote Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={quoteAmount}
                onChange={e => setQuoteAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Turnaround Time (days)
            </label>
            <input
              type="number"
              min="1"
              value={turnaroundDays}
              onChange={e => setTurnaroundDays(e.target.value)}
              placeholder="e.g., 5"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Quote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
