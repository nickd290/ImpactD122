import React from 'react';
import { cn } from '../../lib/utils';

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  return (
    <div className={cn('border-b border-border', className)}>
      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium tracking-wide transition-colors',
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            )}
          >
            <span className={cn(
              'uppercase text-[11px] tracking-[0.08em]',
              activeTab === tab.id && 'font-semibold'
            )}>
              {tab.label}
            </span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'ml-2 rounded-full py-0.5 px-2 text-[10px] font-medium tabular-nums',
                  activeTab === tab.id
                    ? 'bg-primary/10 text-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default Tabs;
