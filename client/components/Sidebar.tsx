import React from 'react';
import { BarChart3, Briefcase, Users, Building2, TrendingUp, DollarSign, Command, Package, Calculator, MessageSquare, FileQuestion } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button, Badge } from './ui';

type View = 'DASHBOARD' | 'JOBS' | 'CUSTOMERS' | 'VENDORS' | 'FINANCIALS' | 'PARTNER_STATS' | 'PAPER_INVENTORY' | 'ACCOUNTING' | 'COMMUNICATIONS' | 'VENDOR_RFQS';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  jobsCount: number;
  customersCount: number;
  vendorsCount: number;
  partnerJobsCount: number;
  pendingCommunicationsCount: number;
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
        "group relative w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-all duration-150",
        "hover:bg-accent",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn(
          "transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}>
          {React.cloneElement(icon as React.ReactElement, { className: "w-4 h-4" })}
        </div>
        <span className="text-xs">{label}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {badge !== undefined && badge > 0 && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
            active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
          )}>
            {badge}
          </span>
        )}
        {shortcut && (
          <kbd className="hidden lg:inline-flex h-4 px-1 items-center rounded border bg-muted text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            {shortcut}
          </kbd>
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
  onShowSpecParser,
  onCreateJob,
  onShowSearch,
}: SidebarProps) {
  return (
    <div className="w-56 bg-card border-r border-border flex flex-col h-screen">
      {/* Logo Header - Compact */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Impact Direct</h1>
            <p className="text-[10px] text-muted-foreground">Print Brokerage</p>
          </div>
        </div>
      </div>

      {/* Search Bar - Compact */}
      <div className="px-2 py-2">
        <Button
          variant="outline"
          onClick={onShowSearch}
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground h-8"
        >
          <Command className="w-3.5 h-3.5 mr-2" />
          <span className="text-xs">Search...</span>
          <kbd className="ml-auto hidden lg:inline-flex h-4 px-1 items-center rounded border bg-muted text-[9px] font-medium">
            ⌘K
          </kbd>
        </Button>
      </div>

      {/* Navigation - Compact */}
      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
        <div className="mb-3">
          <p className="px-2 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Main
          </p>
          <NavItem
            icon={<BarChart3 className="w-5 h-5" />}
            label="Dashboard"
            active={currentView === 'DASHBOARD'}
            onClick={() => onViewChange('DASHBOARD')}
            shortcut="D"
          />
          <NavItem
            icon={<Briefcase className="w-5 h-5" />}
            label="Jobs"
            active={currentView === 'JOBS'}
            onClick={() => onViewChange('JOBS')}
            badge={jobsCount}
            shortcut="J"
          />
          <NavItem
            icon={<MessageSquare className="w-5 h-5" />}
            label="Communications"
            active={currentView === 'COMMUNICATIONS'}
            onClick={() => onViewChange('COMMUNICATIONS')}
            badge={pendingCommunicationsCount}
            shortcut="M"
          />
          <NavItem
            icon={<FileQuestion className="w-5 h-5" />}
            label="Vendor RFQs"
            active={currentView === 'VENDOR_RFQS'}
            onClick={() => onViewChange('VENDOR_RFQS')}
            shortcut="R"
          />
        </div>

        <div className="mb-3">
          <p className="px-2 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Entities
          </p>
          <NavItem
            icon={<Users className="w-5 h-5" />}
            label="Customers"
            active={currentView === 'CUSTOMERS'}
            onClick={() => onViewChange('CUSTOMERS')}
            badge={customersCount}
            shortcut="C"
          />
          <NavItem
            icon={<Building2 className="w-5 h-5" />}
            label="Vendors"
            active={currentView === 'VENDORS'}
            onClick={() => onViewChange('VENDORS')}
            badge={vendorsCount}
            shortcut="V"
          />
        </div>

        <div className="mb-3">
          <p className="px-2 mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Analytics
          </p>
          <NavItem
            icon={<DollarSign className="w-5 h-5" />}
            label="Financials"
            active={currentView === 'FINANCIALS'}
            onClick={() => onViewChange('FINANCIALS')}
            shortcut="F"
          />
          <NavItem
            icon={<TrendingUp className="w-5 h-5" />}
            label="Bradford Stats"
            active={currentView === 'PARTNER_STATS'}
            onClick={() => onViewChange('PARTNER_STATS')}
            badge={partnerJobsCount}
          />
          <NavItem
            icon={<Package className="w-5 h-5" />}
            label="Paper Inventory"
            active={currentView === 'PAPER_INVENTORY'}
            onClick={() => onViewChange('PAPER_INVENTORY')}
            shortcut="P"
          />
          <NavItem
            icon={<Calculator className="w-5 h-5" />}
            label="Accounting"
            active={currentView === 'ACCOUNTING'}
            onClick={() => onViewChange('ACCOUNTING')}
            shortcut="A"
          />
        </div>
      </nav>

    </div>
  );
}
