import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Circle, Loader2 } from 'lucide-react';
import { jobsApi } from '../lib/api';
import { toast } from 'sonner';

interface PaymentStageDropdownProps {
  jobId: string;
  invoiceSent: boolean;
  invoiceSentDate?: string;
  customerPaid: boolean;
  customerPaidDate?: string;
  bradfordPaid: boolean;
  bradfordPaidDate?: string;
  jdPaid: boolean;
  jdPaidDate?: string;
  bradfordShare?: number;
  onUpdate: () => void;
}

const STAGES = [
  { key: 'invoice', label: 'Invoice Sent', shortLabel: 'Invoiced' },
  { key: 'customer', label: 'Customer Paid', shortLabel: 'Cust. Paid' },
  { key: 'bradford', label: 'Impact → Bradford', shortLabel: 'Bradford' },
  { key: 'jd', label: 'Bradford → JD', shortLabel: 'JD Paid' },
] as const;

type StageKey = typeof STAGES[number]['key'];

export function PaymentStageDropdown({
  jobId,
  invoiceSent,
  invoiceSentDate,
  customerPaid,
  customerPaidDate,
  bradfordPaid,
  bradfordPaidDate,
  jdPaid,
  jdPaidDate,
  bradfordShare,
  onUpdate,
}: PaymentStageDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState<StageKey | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get stage completion status
  const getStageStatus = (key: StageKey): boolean => {
    switch (key) {
      case 'invoice': return invoiceSent;
      case 'customer': return customerPaid;
      case 'bradford': return bradfordPaid;
      case 'jd': return jdPaid;
    }
  };

  // Get stage date
  const getStageDate = (key: StageKey): string | undefined => {
    switch (key) {
      case 'invoice': return invoiceSentDate;
      case 'customer': return customerPaidDate;
      case 'bradford': return bradfordPaidDate;
      case 'jd': return jdPaidDate;
    }
  };

  // Calculate completion count
  const completedCount = [invoiceSent, customerPaid, bradfordPaid, jdPaid].filter(Boolean).length;

  // Get current stage (first incomplete)
  const getCurrentStage = (): StageKey | 'done' => {
    if (!invoiceSent) return 'invoice';
    if (!customerPaid) return 'customer';
    if (!bradfordPaid) return 'bradford';
    if (!jdPaid) return 'jd';
    return 'done';
  };

  // Handle stage click - toggle status
  const handleStageClick = async (key: StageKey) => {
    const isCompleted = getStageStatus(key);
    setLoading(key);

    try {
      switch (key) {
        case 'invoice':
          await jobsApi.markInvoiceSent(jobId, {
            status: isCompleted ? 'unsent' : 'sent',
          });
          toast.success(isCompleted ? 'Invoice marked as not sent' : 'Invoice marked as sent');
          break;

        case 'customer':
          await jobsApi.markCustomerPaid(jobId, {
            status: isCompleted ? 'unpaid' : 'paid',
          });
          toast.success(isCompleted ? 'Customer payment cleared' : 'Customer payment recorded');
          break;

        case 'bradford':
          const result = await jobsApi.markBradfordPaid(jobId, {
            status: isCompleted ? 'unpaid' : 'paid',
          });
          if (!isCompleted && result.jdInvoiceSent) {
            toast.success('Bradford Payment Recorded', {
              description: 'JD Invoice Email Sent to steve.gustafson@bgeltd.com',
              duration: 5000,
            });
          } else {
            toast.success(isCompleted ? 'Bradford payment cleared' : 'Bradford payment recorded');
          }
          break;

        case 'jd':
          await jobsApi.markJDPaid(jobId, {
            status: isCompleted ? 'unpaid' : 'paid',
          });
          toast.success(isCompleted ? 'JD payment cleared' : 'JD payment recorded');
          break;
      }
      onUpdate();
    } catch (error) {
      console.error(`Failed to update ${key} status:`, error);
      toast.error(`Failed to update payment status`);
    } finally {
      setLoading(null);
    }
  };

  const currentStage = getCurrentStage();
  const isDone = currentStage === 'done';

  // Get button styling based on completion
  const getButtonStyle = () => {
    if (isDone) return 'bg-green-100 text-green-700 border-green-200';
    if (completedCount === 0) return 'bg-zinc-100 text-zinc-600 border-zinc-200';
    if (completedCount <= 2) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  // Format date for display
  const formatDate = (date?: string) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border transition-colors hover:opacity-80 ${getButtonStyle()}`}
      >
        {isDone ? (
          <>
            <Check className="w-3 h-3" />
            Done
          </>
        ) : (
          <>
            <span className="tabular-nums">{completedCount}/4</span>
            <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-200">
            <p className="text-xs font-medium text-zinc-500">Payment Progress</p>
            {bradfordShare !== undefined && (
              <p className="text-sm font-medium text-zinc-900 tabular-nums">
                ${bradfordShare.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* Stages */}
          <div className="py-1">
            {STAGES.map((stage, index) => {
              const isCompleted = getStageStatus(stage.key);
              const isCurrent = currentStage === stage.key;
              const date = getStageDate(stage.key);
              const isLoading = loading === stage.key;

              return (
                <button
                  key={stage.key}
                  onClick={() => handleStageClick(stage.key)}
                  disabled={isLoading}
                  className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                    isCurrent ? 'bg-blue-50' : 'hover:bg-zinc-50'
                  }`}
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                    ) : isCompleted ? (
                      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    ) : isCurrent ? (
                      <div className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-500/10" />
                    ) : (
                      <Circle className="w-4 h-4 text-zinc-300" />
                    )}
                  </div>

                  {/* Label and Date */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${isCompleted ? 'text-zinc-900' : isCurrent ? 'text-blue-700 font-medium' : 'text-zinc-500'}`}>
                      {stage.label}
                    </p>
                    {date && (
                      <p className="text-xs text-zinc-400">{formatDate(date)}</p>
                    )}
                  </div>

                  {/* Step number */}
                  <span className={`text-xs tabular-nums ${isCompleted ? 'text-green-600' : 'text-zinc-400'}`}>
                    {index + 1}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 bg-zinc-50 border-t border-zinc-100">
            <p className="text-xs text-zinc-400">Click any stage to toggle</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentStageDropdown;
