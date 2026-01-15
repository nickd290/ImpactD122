import React from 'react';
import { BarChart3, Briefcase, Users, Building2, DollarSign, MessageSquare, FileQuestion, Search, AlertCircle, Factory, Inbox, LayoutGrid } from 'lucide-react';
import { cn } from '../lib/utils';

type View = 'DASHBOARD' | 'ACTION_ITEMS' | 'JOBS' | 'JOB_BOARD' | 'PRODUCTION_BOARD' | 'CUSTOMERS' | 'VENDORS' | 'FINANCIALS' | 'PARTNER_STATS' | 'PAPER_INVENTORY' | 'ACCOUNTING' | 'COMMUNICATIONS' | 'VENDOR_RFQS';

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

      {/* Navigation */}
      <nav className="flex-1 px-1 overflow-y-auto">
        {/* Inbox - Action Items First */}
        <div className="mb-6">
          <p className="px-3 mb-2 text-xs font-medium text-zinc-400">
            Inbox
          </p>
          <NavItem
            icon={<Inbox />}
            label="Action Items"
            active={currentView === 'ACTION_ITEMS'}
            onClick={() => onViewChange('ACTION_ITEMS')}
            badge={actionItemsCount}
            shortcut="I"
          />
          <NavItem
            icon={<MessageSquare />}
            label="Communications"
            active={currentView === 'COMMUNICATIONS'}
            onClick={() => onViewChange('COMMUNICATIONS')}
            badge={pendingCommunicationsCount}
            shortcut="M"
          />
        </div>

        <div className="mb-6">
          <p className="px-3 mb-2 text-xs font-medium text-zinc-400">
            Jobs
          </p>
          <NavItem
            icon={<BarChart3 />}
            label="Dashboard"
            active={currentView === 'DASHBOARD'}
            onClick={() => onViewChange('DASHBOARD')}
            shortcut="D"
          />
          <NavItem
            icon={<Briefcase />}
            label="All Jobs"
            active={currentView === 'JOBS'}
            onClick={() => onViewChange('JOBS')}
            badge={jobsCount}
            shortcut="J"
          />
          <NavItem
            icon={<LayoutGrid />}
            label="Job Kanban"
            active={currentView === 'JOB_BOARD'}
            onClick={() => onViewChange('JOB_BOARD')}
            shortcut="K"
          />
          <NavItem
            icon={<Factory />}
            label="Production"
            active={currentView === 'PRODUCTION_BOARD'}
            onClick={() => onViewChange('PRODUCTION_BOARD')}
            shortcut="P"
          />
        </div>

        <div className="mb-6">
          <p className="px-3 mb-2 text-xs font-medium text-zinc-400">
            Entities
          </p>
          <NavItem
            icon={<Users />}
            label="Customers"
            active={currentView === 'CUSTOMERS'}
            onClick={() => onViewChange('CUSTOMERS')}
            badge={customersCount}
            shortcut="C"
          />
          <NavItem
            icon={<Building2 />}
            label="Vendors"
            active={currentView === 'VENDORS'}
            onClick={() => onViewChange('VENDORS')}
            badge={vendorsCount}
            shortcut="V"
          />
        </div>

        <div className="mb-6">
          <p className="px-3 mb-2 text-xs font-medium text-zinc-400">
            Analytics
          </p>
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
