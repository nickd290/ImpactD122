import React from 'react';
import { Specs } from '../types';
import { getBradfordSizes } from '../../../utils/bradfordPricing';

interface SpecsTabProps {
  specs: Specs;
  setSpecs: React.Dispatch<React.SetStateAction<Specs>>;
  useCustomSize: boolean;
  setUseCustomSize: (value: boolean) => void;
  customSizeValue: string;
  setCustomSizeValue: (value: string) => void;
}

export function SpecsTab({
  specs,
  setSpecs,
  useCustomSize,
  setUseCustomSize,
  customSizeValue,
  setCustomSizeValue,
}: SpecsTabProps) {
  const bradfordSizes = getBradfordSizes();

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Product Specifications</h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Product Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Product Type
          </label>
          <select
            value={specs.productType}
            onChange={(e) => setSpecs({ ...specs, productType: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="OTHER">Other</option>
            <option value="BOOK">Book</option>
            <option value="FLAT">Flat</option>
            <option value="FOLDED">Folded</option>
          </select>
        </div>

        {/* Paper Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Paper Type
          </label>
          <input
            type="text"
            value={specs.paperType}
            onChange={(e) => setSpecs({ ...specs, paperType: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., 80# Gloss Text"
          />
        </div>

        {/* Colors */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Colors
          </label>
          <input
            type="text"
            value={specs.colors}
            onChange={(e) => setSpecs({ ...specs, colors: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., 4/4, 4/1, 1/1"
          />
        </div>

        {/* Coating */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Coating
          </label>
          <input
            type="text"
            value={specs.coating}
            onChange={(e) => setSpecs({ ...specs, coating: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., UV, Aqueous, None"
          />
        </div>

        {/* Finishing */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Finishing
          </label>
          <input
            type="text"
            value={specs.finishing}
            onChange={(e) => setSpecs({ ...specs, finishing: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Cut, Fold, Die Cut"
          />
        </div>

        {/* Flat Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Flat Size
          </label>
          <input
            type="text"
            value={specs.flatSize}
            onChange={(e) => setSpecs({ ...specs, flatSize: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., 8.5 x 11"
          />
        </div>

        {/* Finished Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Finished Size
          </label>
          <div className="flex items-center gap-2">
            {!useCustomSize ? (
              <select
                value={specs.finishedSize}
                onChange={(e) => {
                  if (e.target.value === 'CUSTOM') {
                    setUseCustomSize(true);
                    setSpecs({ ...specs, finishedSize: '' });
                  } else {
                    setSpecs({ ...specs, finishedSize: e.target.value });
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select size...</option>
                {bradfordSizes.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
                <option value="CUSTOM">Custom Size...</option>
              </select>
            ) : (
              <>
                <input
                  type="text"
                  value={customSizeValue}
                  onChange={(e) => {
                    setCustomSizeValue(e.target.value);
                    setSpecs({ ...specs, finishedSize: e.target.value });
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 6 x 9"
                />
                <button
                  type="button"
                  onClick={() => {
                    setUseCustomSize(false);
                    setCustomSizeValue('');
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Bradford sizes
                </button>
              </>
            )}
          </div>
        </div>

        {/* Folds */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Folds
          </label>
          <input
            type="text"
            value={specs.folds}
            onChange={(e) => setSpecs({ ...specs, folds: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Half fold, Tri-fold"
          />
        </div>
      </div>

      {/* Book-Specific Fields */}
      {specs.productType === 'BOOK' && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Book Details</h4>
          <div className="grid grid-cols-2 gap-4">
            {/* Page Count */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Page Count
              </label>
              <input
                type="number"
                value={specs.pageCount}
                onChange={(e) => setSpecs({ ...specs, pageCount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 32"
              />
            </div>

            {/* Binding Style */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Binding Style
              </label>
              <select
                value={specs.bindingStyle}
                onChange={(e) => setSpecs({ ...specs, bindingStyle: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select...</option>
                <option value="SADDLE_STITCH">Saddle Stitch</option>
                <option value="PERFECT_BIND">Perfect Bind</option>
                <option value="SPIRAL">Spiral</option>
                <option value="WIRE_O">Wire-O</option>
              </select>
            </div>

            {/* Cover Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cover Type
              </label>
              <select
                value={specs.coverType}
                onChange={(e) => setSpecs({ ...specs, coverType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="SELF">Self Cover</option>
                <option value="PLUS">Plus Cover</option>
              </select>
            </div>

            {/* Cover Paper Type */}
            {specs.coverType === 'PLUS' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cover Paper Type
                </label>
                <input
                  type="text"
                  value={specs.coverPaperType}
                  onChange={(e) => setSpecs({ ...specs, coverPaperType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 100# Gloss Cover"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
