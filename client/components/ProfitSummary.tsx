import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Building2, Handshake } from 'lucide-react';

interface ProfitSummaryProps {
  sellPrice: number;
  totalCost: number;
  paperMarkup: number;
  onEditSellPrice?: () => void;
}

export function ProfitSummary({ sellPrice, totalCost, paperMarkup, onEditSellPrice }: ProfitSummaryProps) {
  const spread = sellPrice - totalCost;
  const bradfordSpreadShare = spread * 0.5;
  const impactSpreadShare = spread * 0.5;
  const bradfordTotal = paperMarkup + bradfordSpreadShare;
  const impactTotal = impactSpreadShare;
  const margin = sellPrice > 0 ? (spread / sellPrice) * 100 : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-4 py-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Profit Summary
        </h3>
      </div>

      {/* Main Numbers */}
      <div className="p-4 space-y-4">
        {/* Sell Price & Total Cost */}
        <div className="grid grid-cols-2 gap-4">
          <div
            className={`p-3 rounded-lg ${onEditSellPrice ? 'cursor-pointer hover:bg-gray-50' : ''} bg-green-50 border border-green-200`}
            onClick={onEditSellPrice}
          >
            <div className="text-xs text-green-600 font-medium uppercase tracking-wider">Sell Price</div>
            <div className="text-2xl font-bold text-green-700">{formatCurrency(sellPrice)}</div>
          </div>
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <div className="text-xs text-red-600 font-medium uppercase tracking-wider">Total Cost</div>
            <div className="text-2xl font-bold text-red-700">{formatCurrency(totalCost)}</div>
          </div>
        </div>

        {/* Spread */}
        <div className={`p-4 rounded-lg ${spread >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'} border`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-xs font-medium uppercase tracking-wider ${spread >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                Spread (Profit)
              </div>
              <div className={`text-3xl font-bold ${spread >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {formatCurrency(spread)}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-medium ${margin >= 20 ? 'text-green-600' : margin >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                {margin.toFixed(1)}% margin
              </div>
              {spread >= 0 ? (
                <TrendingUp className="w-8 h-8 text-blue-500 ml-auto" />
              ) : (
                <TrendingDown className="w-8 h-8 text-orange-500 ml-auto" />
              )}
            </div>
          </div>
        </div>

        {/* Partner Split */}
        <div className="border-t border-gray-200 pt-4">
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">
            50/50 Partner Split
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Bradford Share */}
            <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-orange-600" />
                <span className="text-xs text-orange-600 font-medium">Bradford</span>
              </div>
              <div className="text-xl font-bold text-orange-700">{formatCurrency(bradfordTotal)}</div>
              {paperMarkup > 0 && (
                <div className="text-xs text-orange-500 mt-1">
                  Includes {formatCurrency(paperMarkup)} paper markup
                </div>
              )}
            </div>

            {/* Impact Share */}
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <Handshake className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-blue-600 font-medium">Impact</span>
              </div>
              <div className="text-xl font-bold text-blue-700">{formatCurrency(impactTotal)}</div>
              <div className="text-xs text-blue-500 mt-1">
                50% of spread
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
