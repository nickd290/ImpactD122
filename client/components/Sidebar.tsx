import React from 'react';
import { BarChart3, Briefcase, Users, Building2, TrendingUp, DollarSign, Command, Package, Calculator, MessageSquare, FileQuestion } from 'lucide-react';
import { cn } from '../lib/utils';
import { Badge } from './ui';

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
        "group relative w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200",
        "hover:bg-accent",
        active
          ? "bg-primary/10 text-primary font-medium shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}>
          {icon}
        </div>
        <span className="text-sm">{label}</span>
      </div>

      <div className="flex items-center gap-2">
        {badge !== undefined && badge > 0 && (
          <Badge variant={active ? "default" : "secondary"} className="text-xs px-2 py-0.5">
            {badge}
          </Badge>
        )}
        {shortcut && (
          <kbd className="hidden lg:inline-flex h-5 px-1.5 items-center gap-1 rounded border bg-muted text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
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
    <div className="w-64 bg-card border-r border-border flex flex-col h-screen">
      {/* Logo Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Impact Direct</h1>
            <p className="text-xs text-muted-foreground">Print Brokerage</p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 pt-4 pb-3">
        <Button
          variant="outline"
          onClick={onShowSearch}
          className="w-full justify-start text-muted-foreground hover:text-foreground"
        >
          <Command className="w-4 h-4 mr-2" />
          <span className="text-sm">Search...</span>
          <kbd className="ml-auto hidden lg:inline-flex h-5 px-1.5 items-center gap-1 rounded border bg-muted text-[10px] font-medium">
            ⌘K
          </kbd>
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        <div className="mb-4">
          <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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

        <div className="mb-4">
          <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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

        <div className="mb-4">
          <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
