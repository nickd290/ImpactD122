import React, { useState } from 'react';
import { X, Download, Send, FileText, Check, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { jobsApi } from '../lib/api';

interface Job {
  id: string;
  jobNo?: string;
  title?: string;
  sellPrice?: number;
  customer?: { name: string };
  bradfordRefNumber?: string;
  partnerPONumber?: string;
  jdInvoiceNumber?: string;
  jdInvoiceGeneratedAt?: string;
  jdInvoiceEmailedAt?: string;
  jdInvoiceEmailedTo?: string;
  jdPaymentPaid?: boolean;
  jdPaymentDate?: string;
  jdPaymentAmount?: number;
  profit?: {
    sellPrice?: number;
    totalCost?: number;
    spread?: number;
    paperMarkup?: number;
    paperCost?: number;
    bradfordSpreadShare?: number;
    impactSpreadShare?: number;
    bradfordTotal?: number;
    impactTotal?: number;
    bradfordOwesJD?: number;
    impactOwesJD?: number;
    marginPercent?: number;
    poCount?: number;
  };
  purchaseOrders?: Array<{
    id: string;
    poNumber?: string;
    description?: string;
    buyCost?: number;
    originCompanyId?: string;
    targetCompanyId?: string;
    vendor?: { name: string };
  }>;
}

interface JDJobDetailSidebarProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onInvoiceSent?: () => void;
}

const formatCurrency = (value: number | undefined) => {
  if (!value && value !== 0) return '-';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateString: string | undefined) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export function JDJobDetailSidebar({ job, isOpen, onClose, onInvoiceSent }: JDJobDetailSidebarProps) {
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  if (!isOpen || !job) {
    return null;
  }

  const profit = job.profit || {};
  const hasBeenEmailed = !!job.jdInvoiceEmailedAt;

  const handleDownloadPDF = async () => {
    const success = await jobsApi.downloadJDInvoicePDF(job.id);
    if (!success) {
      toast.error('JD Invoice PDF not available', {
        description: 'Please generate the invoice first',
      });
    }
  };

  const handleSendInvoice = async () => {
    setIsSending(true);
    setSendError(null);
    try {
      await jobsApi.sendJDInvoice(job.id);
      if (onInvoiceSent) {
        onInvoiceSent();
      }
    } catch (error: any) {
      setSendError(error.message || 'Failed to send invoice');
    } finally {
      setIsSending(false);
    }
  };

  // Categorize POs
  const bradfordJdPOs = (job.purchaseOrders || []).filter(
    (po) => po.originCompanyId === 'bradford' && po.targetCompanyId === 'jd-graphic'
  );
  const impactJdPOs = (job.purchaseOrders || []).filter(
    (po) => po.originCompanyId === 'impact-direct' &&
      (po.targetCompanyId === 'jd-graphic' || po.vendor?.name?.toLowerCase().includes('jd graphic'))
  );
  const otherPOs = (job.purchaseOrders || []).filter(
    (po) => !bradfordJdPOs.includes(po) && !impactJdPOs.includes(po)
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black transition-opacity duration-300 z-40 ${
          isOpen ? 'bg-opacity-50' : 'bg-opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 overflow-y-auto ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">
              {job.jobNo || 'Job'}
            </h2>
            <p className="text-sm text-zinc-500 mt-0.5 truncate max-w-xs">
              {job.title || 'Untitled Job'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Customer Info */}
          <div>
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
              Customer
            </h3>
            <p className="text-sm font-medium text-zinc-900">
              {job.customer?.name || '-'}
            </p>
          </div>

          {/* Invoice Status */}
          <div className="bg-zinc-50 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Invoice Status
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-zinc-500">JD Invoice #</span>
                <p className="font-mono font-medium text-zinc-900">
                  {job.jdInvoiceNumber || '-'}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Bradford PO #</span>
                <p className="font-mono font-medium text-zinc-900">
                  {job.bradfordRefNumber || job.partnerPONumber || '-'}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Generated</span>
                <p className="text-zinc-900">
                  {formatDate(job.jdInvoiceGeneratedAt)}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Emailed</span>
                <p className="text-zinc-900">
                  {formatDate(job.jdInvoiceEmailedAt)}
                </p>
              </div>
              {job.jdInvoiceEmailedTo && (
                <div className="col-span-2">
                  <span className="text-zinc-500">Emailed To</span>
                  <p className="text-zinc-900 truncate">{job.jdInvoiceEmailedTo}</p>
                </div>
              )}
            </div>
            {/* Payment Status */}
            <div className="pt-2 border-t border-zinc-200">
              <div className="flex items-center gap-2">
                {job.jdPaymentPaid ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-600 font-medium">
                      Paid {job.jdPaymentDate ? `on ${formatDate(job.jdPaymentDate)}` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-amber-600 font-medium">Payment Pending</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Calculation Breakdown */}
          <div className="bg-white border border-zinc-200 rounded-lg p-4">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
              Profit Calculation
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-600">Sell Price</span>
                <span className="font-medium text-zinc-900">{formatCurrency(profit.sellPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600">Total Cost</span>
                <span className="font-medium text-zinc-900">{formatCurrency(profit.totalCost)}</span>
              </div>
              <div className="border-t border-zinc-100 my-2" />
              <div className="flex justify-between">
                <span className="text-zinc-600">Spread</span>
                <span className="font-semibold text-zinc-900">{formatCurrency(profit.spread)}</span>
              </div>
              {profit.paperMarkup && profit.paperMarkup > 0 && (
                <div className="flex justify-between">
                  <span className="text-zinc-600">Paper Markup</span>
                  <span className="font-medium text-zinc-900">{formatCurrency(profit.paperMarkup)}</span>
                </div>
              )}
              <div className="border-t border-zinc-100 my-2" />
              <div className="flex justify-between">
                <span className="text-zinc-600">Bradford Share (50%)</span>
                <span className="font-medium text-orange-600">{formatCurrency(profit.bradfordTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600">Impact Share (50%)</span>
                <span className="font-medium text-green-600">{formatCurrency(profit.impactTotal)}</span>
              </div>
              {profit.marginPercent !== undefined && (
                <div className="flex justify-between pt-2 border-t border-zinc-100">
                  <span className="text-zinc-600">Margin %</span>
                  <span className="font-medium text-zinc-900">{profit.marginPercent.toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>

          {/* JD Receivables */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-xs font-medium text-blue-700 uppercase tracking-wider mb-3">
              JD Receivables
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-blue-800">Bradford Owes JD</span>
                  {bradfordJdPOs.length > 0 && (
                    <p className="text-xs text-blue-600">
                      via PO #{bradfordJdPOs[0].poNumber || bradfordJdPOs[0].id.slice(0, 8)}
                    </p>
                  )}
                </div>
                <span className="text-lg font-semibold text-orange-600">
                  {formatCurrency(profit.bradfordOwesJD)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-blue-800">Impact Owes JD</span>
                  {impactJdPOs.length > 0 && (
                    <p className="text-xs text-blue-600">
                      via PO #{impactJdPOs[0].poNumber || impactJdPOs[0].id.slice(0, 8)}
                    </p>
                  )}
                </div>
                <span className="text-lg font-semibold text-blue-600">
                  {formatCurrency(profit.impactOwesJD)}
                </span>
              </div>
              <div className="border-t border-blue-200 pt-2 flex justify-between items-center">
                <span className="text-sm font-medium text-blue-800">Total JD Receivables</span>
                <span className="text-lg font-bold text-blue-900">
                  {formatCurrency((profit.bradfordOwesJD || 0) + (profit.impactOwesJD || 0))}
                </span>
              </div>
            </div>
          </div>

          {/* Purchase Orders */}
          {(job.purchaseOrders?.length || 0) > 0 && (
            <div>
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Purchase Orders ({job.purchaseOrders?.length})
              </h3>
              <div className="space-y-2">
                {job.purchaseOrders?.map((po) => {
                  const isJdPO = bradfordJdPOs.includes(po) || impactJdPOs.includes(po);
                  return (
                    <div
                      key={po.id}
                      className={`p-3 rounded-lg border text-sm ${
                        isJdPO ? 'bg-blue-50 border-blue-200' : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-mono font-medium text-zinc-900">
                            {po.poNumber || po.id.slice(0, 8)}
                          </p>
                          <p className="text-xs text-zinc-600 mt-0.5">
                            {po.vendor?.name || 'Unknown Vendor'}
                          </p>
                        </div>
                        <span className="font-medium text-zinc-900">
                          {formatCurrency(po.buyCost)}
                        </span>
                      </div>
                      {po.description && (
                        <p className="text-xs text-zinc-500 mt-1 truncate">{po.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error Message */}
          {sendError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span className="text-sm text-red-700">{sendError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleDownloadPDF}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
            <button
              onClick={handleSendInvoice}
              disabled={isSending}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                hasBeenEmailed
                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-700'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {hasBeenEmailed ? 'Resend Invoice' : 'Send Invoice'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default JDJobDetailSidebar;
