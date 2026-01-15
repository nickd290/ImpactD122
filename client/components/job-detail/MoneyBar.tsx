import React from 'react';
import { cn } from '../../lib/utils';

interface MoneyBarProps {
  sellPrice: number;
  totalCost: number;
  spread: number;
  className?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(0)}%`;
}

export function MoneyBar({ sellPrice, totalCost, spread, className }: MoneyBarProps) {
  const marginPercent = sellPrice > 0 ? spread / sellPrice : 0;
  const isHealthyMargin = marginPercent >= 0.20; // 20%+ is healthy
  const isLowMargin = marginPercent > 0 && marginPercent < 0.15; // Under 15% is concerning

  return (
    <div className={cn(
      'flex items-center justify-between px-4 py-3 bg-slate-900 rounded-lg',
      className
    )}>
      {/* Sell Price */}
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Sell</span>
        <span className="text-lg font-bold text-white font-mono tabular-nums">
          {formatCurrency(sellPrice)}
        </span>
      </div>

      {/* Cost */}
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Cost</span>
        <span className="text-lg font-bold text-slate-300 font-mono tabular-nums">
          {formatCurrency(totalCost)}
        </span>
      </div>

      {/* Spread with margin indicator */}
      <div className="flex flex-col items-end">
        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Spread</span>
        <div className="flex items-baseline gap-2">
          <span className={cn(
            'text-lg font-bold font-mono tabular-nums',
            isHealthyMargin ? 'text-emerald-400' :
            isLowMargin ? 'text-amber-400' :
            spread < 0 ? 'text-red-400' : 'text-white'
          )}>
            {formatCurrency(spread)}
          </span>
          <span className={cn(
            'text-sm font-medium',
            isHealthyMargin ? 'text-emerald-500' :
            isLowMargin ? 'text-amber-500' :
            spread < 0 ? 'text-red-500' : 'text-slate-500'
          )}>
            ({formatPercent(marginPercent)})
          </span>
        </div>
      </div>
    </div>
  );
}

export default MoneyBar;
