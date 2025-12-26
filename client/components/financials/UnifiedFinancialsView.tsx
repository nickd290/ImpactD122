import React, { useState } from 'react';
import { Users, DollarSign, Package, TrendingUp } from 'lucide-react';

// Import existing views as tab content (temporary - will be refactored to lean tabs)
import { BradfordStatsView } from '../BradfordStatsView';
import { FinancialsView } from '../FinancialsView';
import { PaperInventoryView } from '../PaperInventoryView';
import { AccountingDashboardView } from '../AccountingDashboardView';

interface UnifiedFinancialsViewProps {
  jobs: any[];
  allJobs: any[];
  customers: any[];
  vendors: any[];
  onUpdateStatus: (jobId: string, status: string) => void;
  onRefresh: () => void;
  onShowEmailDraft: (job: any) => void;
}

type FinancialsTab = 'partner' | 'cashflow' | 'inventory' | 'analysis';

const tabs: { id: FinancialsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'partner', label: 'Partner', icon: <Users className="w-4 h-4" /> },
  { id: 'cashflow', label: 'Cash Flow', icon: <DollarSign className="w-4 h-4" /> },
  { id: 'inventory', label: 'Inventory', icon: <Package className="w-4 h-4" /> },
  { id: 'analysis', label: 'Analysis', icon: <TrendingUp className="w-4 h-4" /> },
];

export function UnifiedFinancialsView({
  jobs,
  allJobs,
  customers,
  vendors,
  onUpdateStatus,
  onRefresh,
  onShowEmailDraft,
}: UnifiedFinancialsViewProps) {
  const [activeTab, setActiveTab] = useState<FinancialsTab>('partner');

  // Filter partner jobs for BradfordStatsView
  const partnerJobs = jobs.filter(j => j.vendor?.isPartner);

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="bg-white border-b border-zinc-200 px-6 pt-4">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg
                transition-colors relative
                ${activeTab === tab.id
                  ? 'bg-zinc-100 text-zinc-900 border-b-2 border-blue-600 -mb-[2px]'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'partner' && (
          <BradfordStatsView
            jobs={partnerJobs}
            allJobs={allJobs}
            customers={customers}
            vendors={vendors}
            onUpdateStatus={onUpdateStatus}
            onRefresh={onRefresh}
            onShowEmailDraft={onShowEmailDraft}
          />
        )}

        {activeTab === 'cashflow' && (
          <FinancialsView onRefresh={onRefresh} />
        )}

        {activeTab === 'inventory' && (
          <PaperInventoryView />
        )}

        {activeTab === 'analysis' && (
          <AccountingDashboardView />
        )}
      </div>
    </div>
  );
}
