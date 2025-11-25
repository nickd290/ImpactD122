import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { aiApi } from '../lib/api';

interface SpecParserProps {
  onParsed: (data: any) => void;
  onCancel: () => void;
}

export function SpecParser({ onParsed, onCancel }: SpecParserProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleParse = async () => {
    if (!text.trim()) {
      setError('Please enter some specifications');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await aiApi.parseSpecs(text);
      onParsed(result);
    } catch (err: any) {
      setError(err.message || 'Failed to parse specifications');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-6 h-6 text-orange-600" />
          <h3 className="text-xl font-bold">AI Spec Parser</h3>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Describe the print job in plain language
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Example: 5000 8-page saddle stitch catalogs, 4/4 color on 100# gloss text, finished size 8.5x11"
            className="w-full h-32 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={loading}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex items-center space-x-3">
          <button
            onClick={handleParse}
            disabled={loading}
            className="flex items-center space-x-2 bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Parsing with AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Parse with AI</span>
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">💡 Tip:</p>
          <p>Include details like quantity, product type, colors, paper stock, binding, and size for best results.</p>
        </div>
      </div>
    </div>
  );
}
