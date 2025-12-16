import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Plus, Trash2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface PriceTier {
  quantity: number;
  price: number;
}

interface RFQDetails {
  rfq: {
    id: string;
    rfqNumber: string;
    title: string;
    specs: string;
    dueDate: string;
    status: string;
  };
  vendor: {
    id: string;
    name: string;
  };
  hasExistingQuote: boolean;
  existingQuote?: {
    priceTiers: PriceTier[];
    turnaroundDays: number | null;
    notes: string | null;
    submittedAt: string;
  };
}

export default function VendorQuoteForm() {
  const { rfqId, token } = useParams<{ rfqId: string; token: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [rfqDetails, setRfqDetails] = useState<RFQDetails | null>(null);

  // Form state
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([
    { quantity: 500, price: 0 },
    { quantity: 1000, price: 0 },
    { quantity: 2500, price: 0 },
  ]);
  const [turnaroundDays, setTurnaroundDays] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Load RFQ details
  useEffect(() => {
    const loadRFQ = async () => {
      if (!rfqId || !token) {
        setError('Invalid quote link');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/vendor-rfqs/quote/${rfqId}/${token}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load RFQ');
        }

        setRfqDetails(data);

        // If there's an existing quote, pre-fill the form
        if (data.existingQuote) {
          if (data.existingQuote.priceTiers && Array.isArray(data.existingQuote.priceTiers)) {
            setPriceTiers(data.existingQuote.priceTiers);
          }
          if (data.existingQuote.turnaroundDays) {
            setTurnaroundDays(String(data.existingQuote.turnaroundDays));
          }
          if (data.existingQuote.notes) {
            setNotes(data.existingQuote.notes);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load RFQ details');
      } finally {
        setLoading(false);
      }
    };

    loadRFQ();
  }, [rfqId, token]);

  const addTier = () => {
    const lastQty = priceTiers.length > 0 ? priceTiers[priceTiers.length - 1].quantity : 0;
    setPriceTiers([...priceTiers, { quantity: lastQty + 500, price: 0 }]);
  };

  const removeTier = (index: number) => {
    if (priceTiers.length > 1) {
      setPriceTiers(priceTiers.filter((_, i) => i !== index));
    }
  };

  const updateTier = (index: number, field: 'quantity' | 'price', value: string) => {
    const newTiers = [...priceTiers];
    newTiers[index] = {
      ...newTiers[index],
      [field]: parseFloat(value) || 0,
    };
    setPriceTiers(newTiers);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const validTiers = priceTiers.filter(t => t.quantity > 0 && t.price > 0);
    if (validTiers.length === 0) {
      setError('Please enter at least one quantity with a price');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/vendor-rfqs/quote/${rfqId}/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceTiers: validTiers,
          turnaroundDays: turnaroundDays ? parseInt(turnaroundDays) : null,
          notes: notes || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit quote');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit quote');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading RFQ details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !rfqDetails) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Unable to Load Quote Form</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            This link may be invalid or expired. Please contact Impact Direct Printing for assistance.
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Quote Submitted!</h1>
          <p className="text-gray-600 mb-6">
            Thank you for your quote on {rfqDetails?.rfq.rfqNumber}. We'll review it and get back to you soon.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <h3 className="font-medium text-gray-900 mb-2">Summary</h3>
            <div className="text-sm text-gray-600 space-y-1">
              {priceTiers.filter(t => t.price > 0).map((tier, i) => (
                <div key={i} className="flex justify-between">
                  <span>{tier.quantity.toLocaleString()} qty:</span>
                  <span className="font-medium">${tier.price.toLocaleString()}</span>
                </div>
              ))}
              {turnaroundDays && (
                <div className="flex justify-between pt-2 border-t mt-2">
                  <span>Turnaround:</span>
                  <span className="font-medium">{turnaroundDays} days</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-orange-500 rounded-t-lg p-6 text-white text-center">
          <FileText className="w-12 h-12 mx-auto mb-2" />
          <h1 className="text-2xl font-bold">Submit Your Quote</h1>
          <p className="text-orange-100 mt-1">{rfqDetails?.rfq.rfqNumber}</p>
        </div>

        {/* RFQ Details */}
        <div className="bg-white border-x border-gray-200 p-6">
          <div className="mb-4">
            <span className="text-sm text-gray-500">Vendor</span>
            <p className="font-medium text-gray-900">{rfqDetails?.vendor.name}</p>
          </div>

          <div className="mb-4">
            <span className="text-sm text-gray-500">Job Title</span>
            <p className="font-medium text-gray-900">{rfqDetails?.rfq.title}</p>
          </div>

          <div className="mb-4">
            <span className="text-sm text-gray-500">Due Date</span>
            <p className="font-medium text-gray-900">
              {rfqDetails?.rfq.dueDate
                ? new Date(rfqDetails.rfq.dueDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'ASAP'}
            </p>
          </div>

          <div>
            <span className="text-sm text-gray-500">Specifications</span>
            <div className="mt-1 p-4 bg-gray-50 rounded-lg border border-gray-200 whitespace-pre-wrap text-sm text-gray-700">
              {rfqDetails?.rfq.specs}
            </div>
          </div>
        </div>

        {/* Quote Form */}
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-b-lg p-6 shadow-lg">
          {rfqDetails?.hasExistingQuote && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 text-sm">
                <strong>Note:</strong> You have already submitted a quote. Submitting again will update your previous quote.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Price Tiers */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Pricing by Quantity
            </label>
            <div className="space-y-3">
              {priceTiers.map((tier, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="sr-only">Quantity</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={tier.quantity || ''}
                        onChange={(e) => updateTier(index, 'quantity', e.target.value)}
                        placeholder="Quantity"
                        min="1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">qty</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="sr-only">Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                      <input
                        type="number"
                        value={tier.price || ''}
                        onChange={(e) => updateTier(index, 'price', e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTier(index)}
                    disabled={priceTiers.length <= 1}
                    className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addTier}
              className="mt-3 flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700"
            >
              <Plus className="w-4 h-4" />
              Add quantity tier
            </button>
          </div>

          {/* Turnaround Days */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Turnaround Time (business days)
            </label>
            <input
              type="number"
              value={turnaroundDays}
              onChange={(e) => setTurnaroundDays(e.target.value)}
              placeholder="e.g., 5"
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>

          {/* Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional information, questions, or conditions..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Quote'
            )}
          </button>

          <p className="mt-4 text-center text-sm text-gray-500">
            Impact Direct Printing | brandon@impactdirectprinting.com
          </p>
        </form>
      </div>
    </div>
  );
}
