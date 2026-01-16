import React from 'react';
import { BarChart3, Briefcase, Users, DollarSign, Search, LayoutGrid } from 'lucide-react';
import { cn } from '../lib/utils';

type View = 'DASHBOARD' | 'ACTION_ITEMS' | 'JOBS' | 'JOB_BOARD' | 'PRODUCTION_BOARD' | 'CUSTOMERS' | 'VENDORS' | 'FINANCIALS' | 'PARTNER_STATS' | 'PAPER_INVENTORY' | 'ACCOUNTING' | 'COMMUNICATIONS' | 'VENDOR_RFQS' | 'ENTITIES';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  jobsCount: number;
  customersCount: number;
  vendorsCount: number;
  partnerJobsCount: number;
  pendingCommunicationsCount: number;
  actionItemsCount: number;
  onShowSpecParser: () => void;
  onCreateJob: () => void;
  onShowSearch: () => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  shortcut?: string;
}

function NavItem({ icon, label, active, onClick, badge, shortcut }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full flex items-center justify-between px-3 py-2 transition-colors",
        active
          ? "text-zinc-900 font-medium border-l-2 border-zinc-900 -ml-px bg-zinc-50"
          : "text-zinc-500 hover:text-zinc-900"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "transition-colors",
          active ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"
        )}>
          {React.cloneElement(icon as React.ReactElement, { className: "w-4 h-4", strokeWidth: 1.5 })}
        </div>
        <span className="text-sm">{label}</span>
      </div>

      <div className="flex items-center gap-2">
        {badge !== undefined && badge > 0 && (
          <span className="text-xs tabular-nums text-zinc-400">
            {badge}
          </span>
        )}
        {shortcut && (
          <span className="hidden lg:block text-[10px] text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity">
            {shortcut}
          </span>
        )}
      </div>
    </button>
  );
}

export function Sidebar({
  currentView,
  onViewChange,
  jobsCount,
  customersCount,
  vendorsCount,
  partnerJobsCount,
  pendingCommunicationsCount,
  actionItemsCount,
  onShowSpecParser,
  onCreateJob,
  onShowSearch,
}: SidebarProps) {
  return (
    <div className="w-60 bg-white border-r border-zinc-100 flex flex-col h-screen">
      {/* Logo Header - Clean */}
      <div className="px-4 py-5">
        <h1 className="text-base font-semibold text-zinc-900">Impact Direct</h1>
        <p className="text-xs text-zinc-400 mt-0.5">Print Brokerage</p>
      </div>

      {/* Search */}
      <div className="px-3 pb-4">
        <button
          onClick={onShowSearch}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-600 bg-zinc-50 rounded-md transition-colors"
        >
          <Search className="w-4 h-4" strokeWidth={1.5} />
          <span>Search...</span>
          <kbd className="ml-auto text-[10px] text-zinc-300">⌘K</kbd>
        </button>
      </div>

      {/* Navigation - Simplified to 5 main tabs */}
      <nav className="flex-1 px-1 overflow-y-auto">
        <div className="mb-2">
          <NavItem
            icon={<BarChart3 />}
            label="Dashboard"
            active={currentView === 'DASHBOARD'}
            onClick={() => onViewChange('DASHBOARD')}
            badge={actionItemsCount > 0 ? actionItemsCount : undefined}
            shortcut="D"
          />
          <NavItem
            icon={<Briefcase />}
            label="Jobs"
            active={currentView === 'JOBS' || currentView === 'ACTION_ITEMS'}
            onClick={() => onViewChange('JOBS')}
            badge={jobsCount}
            shortcut="J"
          />
          <NavItem
            icon={<LayoutGrid />}
            label="Kanban"
            active={currentView === 'JOB_BOARD' || currentView === 'PRODUCTION_BOARD'}
            onClick={() => onViewChange('JOB_BOARD')}
            shortcut="K"
          />
          <NavItem
            icon={<Users />}
            label="Entities"
            active={currentView === 'CUSTOMERS' || currentView === 'VENDORS' || currentView === 'ENTITIES'}
            onClick={() => onViewChange('CUSTOMERS')}
            badge={customersCount + vendorsCount}
            shortcut="E"
          />
          <NavItem
            icon={<DollarSign />}
            label="Financials"
            active={currentView === 'FINANCIALS' || currentView === 'PARTNER_STATS' || currentView === 'ACCOUNTING'}
            onClick={() => onViewChange('FINANCIALS')}
            shortcut="F"
          />
        </div>
      </nav>
    </div>
  );
}
