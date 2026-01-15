import React from 'react';
import { Filter, AlertTriangle, Truck, Clock, Bell } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ProductionFilters as FilterType, ProductionStats } from '../../hooks/useProductionBoard';

interface ProductionFiltersProps {
  filters: FilterType;
  stats: ProductionStats;
  filterOptions: {
    vendors: Array<{ id: string; name: string }>;
    customers: Array<{ id: string; name: string }>;
  };
  onFilterChange: (updates: Partial<FilterType>) => void;
}

const DUE_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
];

export function ProductionFilters({
  filters,
  stats,
  filterOptions,
  onFilterChange,
}: ProductionFiltersProps) {
  return (
    <div className="bg-white border-b border-slate-200">
      {/* Header Row */}
      <div className="px-6 py-4 flex flex-wrap items-center gap-4">
        {/* Page Title */}
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-slate-500" />
          <h1 className="text-lg font-bold text-slate-900">Production Board</h1>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap ml-auto">
          {/* Due Window Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Due:</label>
            <select
              value={filters.dueDays}
              onChange={(e) => onFilterChange({ dueDays: Number(e.target.value) })}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {DUE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Vendor Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Vendor:</label>
            <select
              value={filters.vendorId || ''}
              onChange={(e) => onFilterChange({ vendorId: e.target.value || null })}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[150px]"
            >
              <option value="">All Vendors</option>
              {filterOptions.vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Customer Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Customer:</label>
            <select
              value={filters.customerId || ''}
              onChange={(e) => onFilterChange({ customerId: e.target.value || null })}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[150px]"
            >
              <option value="">All Customers</option>
              {filterOptions.customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Blocked Only Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.blockedOnly}
              onChange={(e) => onFilterChange({ blockedOnly: e.target.checked })}
              className="w-4 h-4 text-red-600 border-slate-300 rounded focus:ring-red-500"
            />
            <span className="text-sm text-slate-700">Blocked only</span>
          </label>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-6 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-6 text-sm">
        {/* Total Jobs */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Total:</span>
          <span className="font-semibold text-slate-900">{stats.totalJobs} jobs</span>
        </div>

        {/* Blocked */}
        {stats.blocked > 0 && (
          <div className="flex items-center gap-1.5 text-red-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">{stats.blocked} blocked</span>
          </div>
        )}

        {/* Shipping Today */}
        {stats.shippingToday > 0 && (
          <div className="flex items-center gap-1.5 text-blue-600">
            <Truck className="w-4 h-4" />
            <span className="font-medium">{stats.shippingToday} shipping</span>
          </div>
        )}

        {/* Overdue */}
        {stats.overdue > 0 && (
          <div className="flex items-center gap-1.5 text-red-500">
            <Clock className="w-4 h-4" />
            <span className="font-medium">{stats.overdue} overdue</span>
          </div>
        )}

        {/* New Proofs */}
        {stats.newProofs > 0 && (
          <div className="flex items-center gap-1.5 text-purple-600">
            <Bell className="w-4 h-4" />
            <span className="font-medium">{stats.newProofs} new proofs</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductionFilters;
