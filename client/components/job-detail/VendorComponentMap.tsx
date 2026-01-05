import React from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Package, User } from 'lucide-react';

/**
 * Vendor/Component Map for P3 Multi-Vendor Jobs
 *
 * Sprint 3C: Visual grid showing component-vendor assignments
 *
 * Purpose:
 * - Show which vendors are responsible for which components
 * - Highlight errors: vendor-owned components without vendorId
 * - Highlight warnings: vendors with no assigned components (orphan POs)
 *
 * Visual Structure:
 * - Rows = Components
 * - Columns = Vendors
 * - Cell = assigned / not assigned
 */

// Component type from schema
export type ComponentType =
  | 'PRINT'
  | 'FINISHING'
  | 'BINDERY'
  | 'DATA'
  | 'PROOF'
  | 'MAILING'
  | 'SHIPPING'
  | 'SAMPLES'
  | 'OTHER';

// Component owner from schema
export type ComponentOwner = 'INTERNAL' | 'VENDOR' | 'CUSTOMER';

// Component status from schema
export type ComponentStatus = 'NOT_READY' | 'READY' | 'SENT' | 'APPROVED' | 'COMPLETE';

export interface JobComponent {
  id: string;
  name: string;
  description?: string | null;
  componentType?: ComponentType | null;
  owner?: ComponentOwner | null;
  vendorId?: string | null;
  status?: ComponentStatus;
  dueDate?: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  vendorCode?: string | null;
}

export interface PurchaseOrder {
  id: string;
  targetVendorId?: string | null;
  executionId?: string | null;
  status: string;
}

interface VendorComponentMapProps {
  components: JobComponent[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  pathway?: 'P1' | 'P2' | 'P3' | null;
}

// Color coding for component types
const TYPE_COLORS: Record<ComponentType, string> = {
  PRINT: 'bg-blue-100 text-blue-800',
  FINISHING: 'bg-purple-100 text-purple-800',
  BINDERY: 'bg-indigo-100 text-indigo-800',
  DATA: 'bg-green-100 text-green-800',
  PROOF: 'bg-yellow-100 text-yellow-800',
  MAILING: 'bg-orange-100 text-orange-800',
  SHIPPING: 'bg-cyan-100 text-cyan-800',
  SAMPLES: 'bg-pink-100 text-pink-800',
  OTHER: 'bg-gray-100 text-gray-800',
};

// Owner badges
const OWNER_BADGES: Record<ComponentOwner, { label: string; color: string }> = {
  INTERNAL: { label: 'Internal', color: 'bg-gray-100 text-gray-600' },
  VENDOR: { label: 'Vendor', color: 'bg-amber-100 text-amber-700' },
  CUSTOMER: { label: 'Customer', color: 'bg-blue-100 text-blue-700' },
};

export function VendorComponentMap({
  components,
  vendors,
  purchaseOrders,
  pathway,
}: VendorComponentMapProps) {
  // Only show for P3 multi-vendor jobs
  if (pathway !== 'P3' || vendors.length < 2) {
    return null;
  }

  // Get vendor IDs with POs
  const vendorIdsWithPOs = new Set(
    purchaseOrders.map((po) => po.targetVendorId).filter(Boolean)
  );

  // Find issues
  const vendorOwnedWithoutVendor = components.filter(
    (c) => c.owner === 'VENDOR' && !c.vendorId
  );

  const orphanVendors = vendors.filter(
    (v) =>
      vendorIdsWithPOs.has(v.id) &&
      !components.some((c) => c.vendorId === v.id)
  );

  const hasErrors = vendorOwnedWithoutVendor.length > 0;
  const hasWarnings = orphanVendors.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Vendor / Component Map
            </h3>
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 rounded">
              P3
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">{vendors.length} vendors</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">{components.length} components</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(hasErrors || hasWarnings) && (
        <div className="px-4 py-2 space-y-1 bg-gray-50 border-b border-gray-200">
          {vendorOwnedWithoutVendor.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 text-xs text-red-700 bg-red-50 px-2 py-1 rounded"
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                <strong>{c.name}</strong> is vendor-owned but has no vendor
                assigned
              </span>
            </div>
          ))}
          {orphanVendors.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded"
            >
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                <strong>{v.name}</strong> has a PO but no assigned components
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                Component
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                Owner
              </th>
              {vendors.map((vendor) => (
                <th
                  key={vendor.id}
                  className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-l"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate max-w-[100px]">{vendor.name}</span>
                    {vendor.vendorCode && (
                      <span className="text-[10px] text-gray-400 font-mono">
                        {vendor.vendorCode}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {components.map((component) => {
              const isVendorOwned = component.owner === 'VENDOR';
              const hasVendorAssigned = !!component.vendorId;
              const isError = isVendorOwned && !hasVendorAssigned;

              return (
                <tr
                  key={component.id}
                  className={isError ? 'bg-red-50' : 'hover:bg-gray-50'}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {component.name}
                      </span>
                      {component.componentType && (
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                            TYPE_COLORS[component.componentType] || TYPE_COLORS.OTHER
                          }`}
                        >
                          {component.componentType}
                        </span>
                      )}
                    </div>
                    {component.description && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {component.description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {component.owner && (
                      <span
                        className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${
                          OWNER_BADGES[component.owner]?.color || OWNER_BADGES.INTERNAL.color
                        }`}
                      >
                        {OWNER_BADGES[component.owner]?.label || component.owner}
                      </span>
                    )}
                  </td>
                  {vendors.map((vendor) => {
                    const isAssigned = component.vendorId === vendor.id;
                    return (
                      <td
                        key={vendor.id}
                        className={`px-3 py-2 text-center border-l ${
                          isAssigned ? 'bg-green-50' : ''
                        }`}
                      >
                        {isAssigned ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" />
                        ) : isVendorOwned && !hasVendorAssigned ? (
                          <span className="text-red-400 text-xs">?</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            <span>Assigned</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-red-400 font-mono">?</span>
            <span>Needs vendor</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-300">-</span>
            <span>Not applicable</span>
          </div>
        </div>
      </div>
    </div>
  );
}
