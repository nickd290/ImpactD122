import { useState, useEffect, useMemo, useCallback } from 'react';
import { jobsApi } from '../lib/api';

export interface ProductionJob {
  id: string;
  jobNo: string;
  title: string;
  customerName: string;
  vendorId: string | null;
  deliveryDate: string | null;
  quantity: number;
  sizeName: string | null;
  specs: {
    paperType?: string;
    colors?: string;
    finishing?: string;
    coating?: string;
    [key: string]: unknown;
  } | null;
  vendorShipToName: string | null;
  vendorShipToCity: string | null;
  vendorShipToState: string | null;
  hasSamples: boolean;
  bradfordPaperType: string | null;
  paperSource: string | null;
  workflowStatus: string;
  proofs: Array<{
    id: string;
    status: string;
    version: number;
    createdAt: string;
  }>;
  portal: {
    vendorStatus: string | null;
    trackingNumber: string | null;
    trackingCarrier: string | null;
    confirmedAt: string | null;
    accessCount: number;
  } | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
  } | null;
  vendor: {
    id: string;
    name: string;
    email: string | null;
    contacts: Array<{ name: string; email: string; role?: string }>;
  } | null;
  qc: {
    artwork: string;
    artworkCount: number;
    data: string;
    proofStatus: string;
    proofVersion: number;
    hasTracking: boolean;
    vendorConfirmed: boolean;
  };
  purchaseOrders: Array<{
    id: string;
    poNumber: string;
    emailedAt: string | null;
  }>;
  files: {
    artwork: Array<{ id: string; name: string }>;
    data: Array<{ id: string; name: string }>;
    proofs: Array<{ id: string; name: string }>;
    po: Array<{ id: string; name: string }>;
  };
}

export interface VendorGroup {
  vendorId: string | null;
  vendorName: string;
  vendorEmail: string | null;
  jobs: ProductionJob[];
  needsAction: number;
  totalJobs: number;
}

export interface ProductionStats {
  totalJobs: number;
  blocked: number;
  shippingToday: number;
  overdue: number;
  newProofs: number;
}

export interface ProductionFilters {
  dueDays: number;
  vendorId: string | null;
  customerId: string | null;
  blockedOnly: boolean;
}

const DEFAULT_FILTERS: ProductionFilters = {
  dueDays: 14,
  vendorId: null,
  customerId: null,
  blockedOnly: false,
};

/**
 * Hook for Production Board data fetching and processing
 * - Fetches jobs due within specified window
 * - Groups by vendor for row-based display
 * - Calculates stats and action counts
 */
export function useProductionBoard(initialFilters?: Partial<ProductionFilters>) {
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProductionFilters>({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });

  // Fetch production data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await jobsApi.getProductionView({
        dueDays: filters.dueDays,
        vendorId: filters.vendorId || undefined,
        customerId: filters.customerId || undefined,
      });

      setJobs(data.jobs || []);
    } catch (err) {
      console.error('Failed to fetch production data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load production data');
    } finally {
      setLoading(false);
    }
  }, [filters.dueDays, filters.vendorId, filters.customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Apply client-side blocked filter
  const filteredJobs = useMemo(() => {
    if (!filters.blockedOnly) return jobs;
    return jobs.filter(job => {
      const missingArt = job.qc.artwork === 'missing';
      const missingData = job.qc.data === 'missing';
      return missingArt || missingData;
    });
  }, [jobs, filters.blockedOnly]);

  // Group jobs by vendor
  const vendorGroups = useMemo((): VendorGroup[] => {
    const groupMap = new Map<string, VendorGroup>();

    filteredJobs.forEach(job => {
      const vendorKey = job.vendorId || 'UNASSIGNED';

      if (!groupMap.has(vendorKey)) {
        groupMap.set(vendorKey, {
          vendorId: job.vendorId,
          vendorName: job.vendor?.name || 'Unassigned',
          vendorEmail: job.vendor?.email || null,
          jobs: [],
          needsAction: 0,
          totalJobs: 0,
        });
      }

      const group = groupMap.get(vendorKey)!;
      group.jobs.push(job);
      group.totalJobs++;

      // Count jobs needing action (missing PO email, pending proof, etc.)
      const needsAction =
        (job.purchaseOrders.length > 0 && !job.purchaseOrders[0]?.emailedAt) ||
        job.qc.proofStatus === 'PENDING' ||
        (!job.qc.vendorConfirmed && job.purchaseOrders.length > 0);

      if (needsAction) {
        group.needsAction++;
      }
    });

    // Sort: Unassigned last, then by job count descending
    return Array.from(groupMap.values()).sort((a, b) => {
      if (!a.vendorId) return 1;
      if (!b.vendorId) return -1;
      return b.totalJobs - a.totalJobs;
    });
  }, [filteredJobs]);

  // Calculate stats
  const stats = useMemo((): ProductionStats => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    let blocked = 0;
    let shippingToday = 0;
    let overdue = 0;
    let newProofs = 0;

    filteredJobs.forEach(job => {
      // Blocked: missing art or data
      if (job.qc.artwork === 'missing' || job.qc.data === 'missing') {
        blocked++;
      }

      // Shipping today: has tracking and vendor marked shipped
      if (job.portal?.vendorStatus === 'SHIPPED' && job.portal?.trackingNumber) {
        // Could add date check here if we had ship date
        shippingToday++;
      }

      // Overdue: past delivery date
      if (job.deliveryDate && job.deliveryDate < today) {
        overdue++;
      }

      // New proofs: pending approval from last 24 hours
      const recentProof = job.proofs[0];
      if (recentProof?.status === 'PENDING') {
        const proofDate = new Date(recentProof.createdAt);
        const hoursSince = (now.getTime() - proofDate.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          newProofs++;
        }
      }
    });

    return {
      totalJobs: filteredJobs.length,
      blocked,
      shippingToday,
      overdue,
      newProofs,
    };
  }, [filteredJobs]);

  // Get unique vendors and customers for filter dropdowns
  const filterOptions = useMemo(() => {
    const vendorMap = new Map<string, string>();
    const customerMap = new Map<string, string>();

    jobs.forEach(job => {
      if (job.vendor) {
        vendorMap.set(job.vendor.id, job.vendor.name);
      }
      if (job.customer) {
        customerMap.set(job.customer.id, job.customer.name);
      }
    });

    return {
      vendors: Array.from(vendorMap.entries()).map(([id, name]) => ({ id, name })),
      customers: Array.from(customerMap.entries()).map(([id, name]) => ({ id, name })),
    };
  }, [jobs]);

  // Update filters
  const updateFilters = useCallback((updates: Partial<ProductionFilters>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

  // Refresh data
  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    // Data
    jobs: filteredJobs,
    vendorGroups,
    stats,
    filterOptions,

    // State
    loading,
    error,
    filters,

    // Actions
    updateFilters,
    refresh,
  };
}

/**
 * Calculate days until due for urgency badge
 */
export function getDaysUntilDue(deliveryDate: string | null): number | null {
  if (!deliveryDate) return null;
  const now = new Date();
  const due = new Date(deliveryDate);
  const diffMs = due.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get urgency level for card styling
 */
export function getUrgencyLevel(daysUntilDue: number | null): 'overdue' | 'critical' | 'soon' | 'ok' {
  if (daysUntilDue === null) return 'ok';
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue <= 3) return 'critical';
  if (daysUntilDue <= 7) return 'soon';
  return 'ok';
}
