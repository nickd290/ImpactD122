import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown, Circle, Loader2 } from 'lucide-react';
import { jobsApi } from '../lib/api';
import { toast } from 'sonner';

export type PaperSourceKey = 'BRADFORD' | 'VENDOR' | 'CUSTOMER' | string | null | undefined;

interface PaymentStageDropdownProps {
  jobId: string;
  paperSource?: PaperSourceKey;
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

type StageKey = 'invoice' | 'customer' | 'production' | 'secondary';

interface StageDef {
  key: StageKey;
  label: string;
  shortLabel: string;
  /** Maps to API field */
  mapsTo: 'invoice' | 'customer' | 'bradford' | 'jd';
}

function isJdPaper(paperSource: PaperSourceKey): boolean {
  return paperSource === 'VENDOR' || paperSource === 'CUSTOMER';
}

function stagesForPaper(paperSource: PaperSourceKey): StageDef[] {
  // No BGE→JD mfg tracking. JD paper adds Impact→Bradford commission.
  if (isJdPaper(paperSource)) {
    return [
      { key: 'invoice', label: 'Invoice Sent', shortLabel: 'Invoiced', mapsTo: 'invoice' },
      { key: 'customer', label: 'Customer Paid', shortLabel: 'Cust. Paid', mapsTo: 'customer' },
      { key: 'production', label: 'Impact → JD', shortLabel: 'JD Paid', mapsTo: 'jd' },
      { key: 'secondary', label: 'Impact → Bradford (commission)', shortLabel: 'Commission', mapsTo: 'bradford' },
    ];
  }
  return [
    { key: 'invoice', label: 'Invoice Sent', shortLabel: 'Invoiced', mapsTo: 'invoice' },
    { key: 'customer', label: 'Customer Paid', shortLabel: 'Cust. Paid', mapsTo: 'customer' },
    { key: 'production', label: 'Impact → BGE', shortLabel: 'BGE Paid', mapsTo: 'bradford' },
  ];
}

export function PaymentStageDropdown({
  jobId,
  paperSource = 'BRADFORD',
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

  const stages = useMemo(() => stagesForPaper(paperSource), [paperSource]);
  const jdPaper = isJdPaper(paperSource);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fieldDone = (mapsTo: StageDef['mapsTo']): boolean => {
    switch (mapsTo) {
      case 'invoice': return invoiceSent;
      case 'customer': return customerPaid;
      case 'bradford': return bradfordPaid;
      case 'jd': return jdPaid;
    }
  };

  const fieldDate = (mapsTo: StageDef['mapsTo']): string | undefined => {
    switch (mapsTo) {
      case 'invoice': return invoiceSentDate;
      case 'customer': return customerPaidDate;
      case 'bradford': return bradfordPaidDate;
      case 'jd': return jdPaidDate;
    }
  };

  const completedCount = stages.filter((s) => fieldDone(s.mapsTo)).filter(Boolean).length;

  const getCurrentStage = (): StageKey | 'done' => {
    for (const s of stages) {
      if (!fieldDone(s.mapsTo)) return s.key;
    }
    return 'done';
  };

  const handleStageClick = async (stage: StageDef) => {
    const isCompleted = fieldDone(stage.mapsTo);
    setLoading(stage.key);

    try {
      switch (stage.mapsTo) {
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

        case 'bradford': {
          const result = await jobsApi.markBradfordPaid(jobId, {
            status: isCompleted ? 'unpaid' : 'paid',
            // Only auto-send JD invoice when Bradford is production payee
            sendInvoice: !jdPaper,
          });
          if (!isCompleted && result.jdInvoiceSent) {
            toast.success('Bradford Payment Recorded', {
              description: `JD Invoice Email Sent to ${result.emailedTo || 'Bradford'}`,
              duration: 5000,
            });
          } else {
            toast.success(
              isCompleted
                ? 'Bradford payment cleared'
                : jdPaper
                  ? 'Bradford margin share recorded'
                  : 'Bradford payment recorded'
            );
          }
          break;
        }

        case 'jd':
          await jobsApi.markJDPaid(jobId, {
            status: isCompleted ? 'unpaid' : 'paid',
          });
          toast.success(
            isCompleted ? 'JD payment cleared' : 'Impact → JD payment recorded — job complete if client paid'
          );
          break;
      }
      onUpdate();
    } catch (error: any) {
      console.error(`Failed to update ${stage.key} status:`, error);
      const msg = error?.message || error?.error || 'Failed to update payment status';
      toast.error(typeof msg === 'string' ? msg : 'Failed to update payment status');
    } finally {
      setLoading(null);
    }
  };

  const currentStage = getCurrentStage();
  const isDone = currentStage === 'done';

  const getButtonLabel = (): string => {
    if (isDone) return 'Done';
    const current = stages.find((s) => s.key === currentStage);
    // Show last completed short label
    const completed = stages.filter((s) => fieldDone(s.mapsTo));
    if (completed.length === 0) return 'Not Invoiced';
    return completed[completed.length - 1].shortLabel;
  };

  const getButtonStyle = () => {
    if (isDone) return 'bg-green-100 text-green-700 border-green-200';
    if (completedCount === 0) return 'bg-zinc-100 text-zinc-600 border-zinc-200';
    if (completedCount <= 2) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  const formatDate = (date?: string) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border transition-colors hover:opacity-80 ${getButtonStyle()}`}
      >
        {isDone && <Check className="w-3 h-3" />}
        <span>{getButtonLabel()}</span>
        {!isDone && <ChevronDown className="w-3 h-3" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-200">
            <p className="text-xs font-medium text-zinc-500">
              {jdPaper ? 'JD paper · Impact pays JD' : 'Bradford paper · Impact pays Bradford'}
            </p>
            {bradfordShare !== undefined && (
              <p className="text-sm font-medium text-zinc-900 tabular-nums">
                Bradford share ${bradfordShare.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div className="py-1">
            {stages.map((stage, index) => {
              const isCompleted = fieldDone(stage.mapsTo);
              const isCurrent = currentStage === stage.key;
              const date = fieldDate(stage.mapsTo);
              const isLoading = loading === stage.key;

              return (
                <button
                  key={stage.key}
                  onClick={() => handleStageClick(stage)}
                  disabled={isLoading}
                  className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                    isCurrent ? 'bg-blue-50' : 'hover:bg-zinc-50'
                  }`}
                >
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

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        isCompleted
                          ? 'text-zinc-900'
                          : isCurrent
                            ? 'text-blue-700 font-medium'
                            : 'text-zinc-500'
                      }`}
                    >
                      {stage.label}
                    </p>
                    {date && <p className="text-xs text-zinc-400">{formatDate(date)}</p>}
                  </div>

                  <span
                    className={`text-xs tabular-nums ${isCompleted ? 'text-green-600' : 'text-zinc-400'}`}
                  >
                    {index + 1}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="px-3 py-2 bg-zinc-50 border-t border-zinc-100">
            <p className="text-xs text-zinc-400">Click any stage to toggle</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default PaymentStageDropdown;
