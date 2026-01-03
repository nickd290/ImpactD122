import React from 'react';
import { Mail, Package, Truck, CheckCircle, Clock, Send } from 'lucide-react';
import { MailingData, MailingVersion, MailingComponent } from '../types';

interface MailingTabProps {
  mailingData: MailingData;
  setMailingData: React.Dispatch<React.SetStateAction<MailingData>>;
  source?: string;
  jobNo?: string;
  customerJobNumber?: string;
  poNumber?: string;
}

export function MailingTab({
  mailingData,
  setMailingData,
  source,
  jobNo,
  customerJobNumber,
  poNumber,
}: MailingTabProps) {
  const isLahlouh = source === 'lahlouh';
  const hasMailing = !!mailingData.mailingVendorId;
  const poSent = !!mailingData.mailingVendorPOSent;

  // Helper to format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Not set';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Calculate total quantity from versions
  const totalQuantity = mailingData.versions?.reduce((sum, v) => sum + (v.quantity || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Mail className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Mailing Details</h3>
            <p className="text-sm text-gray-500">
              {isLahlouh ? 'Lahlouh mail package → Three Z' : 'Mailing vendor coordination'}
            </p>
          </div>
        </div>
        {poSent && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            PO Sent
          </div>
        )}
      </div>

      {/* Job Numbers Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">JD Job #</div>
          <div className="text-lg font-semibold text-gray-900">{jobNo || 'TBD'}</div>
        </div>
        {isLahlouh && (
          <>
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-xs text-orange-600 uppercase tracking-wide mb-1">Lahlouh Job #</div>
              <div className="text-lg font-semibold text-gray-900">{customerJobNumber || 'TBD'}</div>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-xs text-orange-600 uppercase tracking-wide mb-1">Lahlouh PO #</div>
              <div className="text-lg font-semibold text-gray-900">{poNumber || 'TBD'}</div>
            </div>
          </>
        )}
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="text-xs text-blue-600 uppercase tracking-wide mb-1">Three Z Job #</div>
          <input
            type="text"
            value={mailingData.mailingVendorJobNo || ''}
            onChange={(e) =>
              setMailingData((prev) => ({ ...prev, mailingVendorJobNo: e.target.value }))
            }
            placeholder="J-####"
            className="w-full bg-transparent text-lg font-semibold text-gray-900 border-none p-0 focus:ring-0 placeholder-gray-400"
          />
        </div>
      </div>

      {/* Dates Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Mail Date</span>
          </div>
          <input
            type="date"
            value={mailingData.mailDate || ''}
            onChange={(e) =>
              setMailingData((prev) => ({ ...prev, mailDate: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div className="p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">In-Homes Date</span>
          </div>
          <input
            type="date"
            value={mailingData.inHomesDate || ''}
            onChange={(e) =>
              setMailingData((prev) => ({ ...prev, inHomesDate: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div className="p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Match Type</span>
          </div>
          <select
            value={mailingData.matchType || ''}
            onChange={(e) =>
              setMailingData((prev) => ({
                ...prev,
                matchType: e.target.value as '2-WAY' | '3-WAY' | undefined,
              }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">Select...</option>
            <option value="2-WAY">2-Way Match</option>
            <option value="3-WAY">3-Way Match</option>
          </select>
        </div>
      </div>

      {/* Versions Table */}
      {mailingData.versions && mailingData.versions.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">Version Breakdown</h4>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3">Phone Number</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {mailingData.versions.map((version, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {version.version || `Version ${idx + 1}`}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {(version.quantity || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-sm">
                    {version.phone || '-'}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-3 text-gray-900">TOTAL</td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {totalQuantity.toLocaleString()}
                </td>
                <td className="px-4 py-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Components Table */}
      {mailingData.components && mailingData.components.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">
              Components ({mailingData.matchType || 'Match'})
            </h4>
          </div>
          <div className="divide-y divide-gray-200">
            {mailingData.components.map((component, idx) => (
              <div key={idx} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                <span
                  className={`px-2 py-1 text-xs font-semibold rounded ${
                    component.supplier === 'JD'
                      ? 'bg-blue-100 text-blue-700'
                      : component.supplier === 'LAHLOUH'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {component.supplier || 'TBD'}
                </span>
                <div>
                  <div className="font-medium text-gray-900">{component.name}</div>
                  {component.specs && (
                    <div className="text-sm text-gray-500">{component.specs}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PO Status */}
      {hasMailing && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Send className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">PO Status</span>
          </div>
          {poSent ? (
            <div className="text-sm text-gray-600">
              <span className="text-green-600 font-medium">Sent</span> on{' '}
              {formatDate(mailingData.mailingVendorPOSent)} to{' '}
              <span className="font-mono">{mailingData.mailingVendorPOSentTo}</span>
            </div>
          ) : (
            <div className="text-sm text-amber-600">
              PO will be sent automatically when job is created from Lahlouh email
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!hasMailing && !isLahlouh && (
        <div className="text-center py-12 text-gray-500">
          <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-600 mb-2">No Mailing Vendor Assigned</p>
          <p className="text-sm">
            Mailing details will appear here for jobs that require a mailing vendor like Three Z.
          </p>
        </div>
      )}
    </div>
  );
}
