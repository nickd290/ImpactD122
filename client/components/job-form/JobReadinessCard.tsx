import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Circle,
  FileImage,
  Database,
  Mail,
  Package,
  Layers,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Truck,
} from 'lucide-react';

type ReadinessStatus = 'INCOMPLETE' | 'READY' | 'SENT';
type QcArtworkStatus = 'RECEIVED' | 'PENDING' | 'NA';
type QcDataFilesStatus = 'IN_ARTWORK' | 'SEPARATE_FILE' | 'PENDING' | 'NA';
type QcMailingStatus = 'COMPLETE' | 'INCOMPLETE' | 'NA';
type QcSuppliedMaterialsStatus = 'RECEIVED' | 'PENDING' | 'NA';
type QcVersionsStatus = 'COMPLETE' | 'INCOMPLETE' | 'NA';
type ComponentArtworkStatus = 'RECEIVED' | 'PENDING';
type ComponentMaterialStatus = 'RECEIVED' | 'IN_TRANSIT' | 'PENDING' | 'NA';

interface JobComponent {
  id: string;
  name: string;
  description?: string;
  supplier: 'JD' | 'LAHLOUH' | 'THIRD_PARTY';
  supplierName?: string;
  artworkStatus: ComponentArtworkStatus;
  artworkLink?: string;
  materialStatus: ComponentMaterialStatus;
  trackingNumber?: string;
  trackingCarrier?: string;
  expectedArrival?: string;
}

interface ReadinessData {
  jobId: string;
  jobNo: string;
  readinessStatus: ReadinessStatus;
  blockers: string[];
  warnings: string[];
  qcFlags: {
    artwork: QcArtworkStatus;
    dataFiles: QcDataFilesStatus;
    mailing: QcMailingStatus;
    suppliedMaterials: QcSuppliedMaterialsStatus;
    versions: QcVersionsStatus;
  };
  notes: {
    artwork?: string;
    dataFiles?: string;
    mailing?: string;
    suppliedMaterials?: string;
    versions?: string;
  };
  isMailing: boolean;
  componentCount: number;
}

interface JobReadinessCardProps {
  jobId: string;
  onStatusChange?: () => void;
  compact?: boolean;
}

const statusConfig = {
  INCOMPLETE: {
    label: 'Incomplete',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: AlertCircle,
    iconColor: 'text-amber-500',
    borderAccent: 'border-l-amber-500',
  },
  READY: {
    label: 'Ready for PO',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle2,
    iconColor: 'text-green-500',
    borderAccent: 'border-l-green-500',
  },
  SENT: {
    label: 'PO Sent',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: CheckCircle2,
    iconColor: 'text-blue-500',
    borderAccent: 'border-l-blue-500',
  },
};

const qcFlagConfig = {
  artwork: {
    label: 'Artwork',
    icon: FileImage,
    options: {
      RECEIVED: { label: 'Received', color: 'bg-green-100 text-green-700' },
      PENDING: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
      NA: { label: 'N/A', color: 'bg-gray-100 text-gray-500' },
    },
  },
  dataFiles: {
    label: 'Data Files',
    icon: Database,
    options: {
      IN_ARTWORK: { label: 'In Artwork', color: 'bg-green-100 text-green-700' },
      SEPARATE_FILE: { label: 'Separate File', color: 'bg-green-100 text-green-700' },
      PENDING: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
      NA: { label: 'N/A', color: 'bg-gray-100 text-gray-500' },
    },
  },
  mailing: {
    label: 'Mailing Info',
    icon: Mail,
    options: {
      COMPLETE: { label: 'Complete', color: 'bg-green-100 text-green-700' },
      INCOMPLETE: { label: 'Incomplete', color: 'bg-amber-100 text-amber-700' },
      NA: { label: 'N/A', color: 'bg-gray-100 text-gray-500' },
    },
  },
  suppliedMaterials: {
    label: 'Supplied Materials',
    icon: Package,
    options: {
      RECEIVED: { label: 'Received', color: 'bg-green-100 text-green-700' },
      PENDING: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
      NA: { label: 'N/A', color: 'bg-gray-100 text-gray-500' },
    },
  },
  versions: {
    label: 'Versions',
    icon: Layers,
    options: {
      COMPLETE: { label: 'Complete', color: 'bg-green-100 text-green-700' },
      INCOMPLETE: { label: 'Incomplete', color: 'bg-amber-100 text-amber-700' },
      NA: { label: 'N/A', color: 'bg-gray-100 text-gray-500' },
    },
  },
};

export function JobReadinessCard({ jobId, onStatusChange, compact = false }: JobReadinessCardProps) {
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [components, setComponents] = useState<JobComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showComponents, setShowComponents] = useState(false);
  const [updatingFlag, setUpdatingFlag] = useState<string | null>(null);

  const fetchReadiness = async () => {
    try {
      setLoading(true);
      const [readinessRes, componentsRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/readiness`),
        fetch(`/api/jobs/${jobId}/components`),
      ]);

      if (!readinessRes.ok) throw new Error('Failed to fetch readiness');

      const readinessData = await readinessRes.json();
      setReadiness(readinessData);

      if (componentsRes.ok) {
        const componentsData = await componentsRes.json();
        setComponents(componentsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) {
      fetchReadiness();
    }
  }, [jobId]);

  const handleFlagChange = async (flag: string, value: string) => {
    if (!readiness) return;

    setUpdatingFlag(flag);
    try {
      const res = await fetch(`/api/jobs/${jobId}/qc`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [`qc${flag.charAt(0).toUpperCase() + flag.slice(1)}`]: value }),
      });

      if (!res.ok) throw new Error('Failed to update');

      await fetchReadiness();
      onStatusChange?.();
    } catch (err) {
      console.error('Failed to update QC flag:', err);
    } finally {
      setUpdatingFlag(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading readiness status...</span>
        </div>
      </div>
    );
  }

  if (error || !readiness) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error || 'Unable to load readiness status'}</span>
        </div>
      </div>
    );
  }

  const status = statusConfig[readiness.readinessStatus];
  const StatusIcon = status.icon;

  // Filter out N/A flags for display
  const activeFlags = Object.entries(readiness.qcFlags).filter(
    ([_, value]) => value !== 'NA'
  );

  if (compact) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg p-3 border-l-4 ${status.borderAccent}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-5 h-5 ${status.iconColor}`} />
            <span className="font-medium text-gray-900">Job Readiness</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
              {status.label}
            </span>
          </div>
          {readiness.blockers.length > 0 && (
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">{readiness.blockers.join(' • ')}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden border-l-4 ${status.borderAccent}`}>
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIcon className={`w-6 h-6 ${status.iconColor}`} />
            <div>
              <h3 className="font-semibold text-gray-900">Job Readiness</h3>
              <p className="text-xs text-gray-500">QC checks before sending to vendor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 text-sm font-medium rounded-full border ${status.color}`}>
              {status.label}
            </span>
            <button
              onClick={fetchReadiness}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Blockers */}
      {readiness.blockers.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Missing Requirements</p>
              <ul className="mt-1 space-y-1">
                {readiness.blockers.map((blocker, i) => (
                  <li key={i} className="text-sm text-amber-700 flex items-center gap-1.5">
                    <Circle className="w-1.5 h-1.5 fill-current" />
                    {blocker}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {readiness.warnings.length > 0 && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <ul className="space-y-0.5">
                {readiness.warnings.map((warning, i) => (
                  <li key={i} className="text-xs text-blue-700">{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* QC Flags */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {activeFlags.map(([key, value]) => {
            const config = qcFlagConfig[key as keyof typeof qcFlagConfig];
            if (!config) return null;

            const Icon = config.icon;
            const optionConfig = config.options[value as keyof typeof config.options];
            const isUpdating = updatingFlag === key;

            return (
              <div
                key={key}
                className="relative group"
              >
                <div className={`flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors ${isUpdating ? 'opacity-50' : ''}`}>
                  <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-600 truncate">{config.label}</p>
                    <span className={`inline-block mt-0.5 px-1.5 py-0.5 text-xs font-medium rounded ${optionConfig?.color || 'bg-gray-100 text-gray-600'}`}>
                      {optionConfig?.label || value}
                    </span>
                  </div>
                  {isUpdating && (
                    <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                  )}
                </div>

                {/* Dropdown on hover */}
                <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block">
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
                    {Object.entries(config.options).map(([optKey, opt]) => (
                      <button
                        key={optKey}
                        onClick={() => handleFlagChange(key, optKey)}
                        className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${value === optKey ? 'font-medium text-blue-600' : 'text-gray-700'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Components Section */}
      {components.length > 0 && (
        <div className="border-t border-gray-200">
          <button
            onClick={() => setShowComponents(!showComponents)}
            className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                Components ({components.length})
              </span>
            </div>
            {showComponents ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showComponents && (
            <div className="px-4 pb-3 space-y-2">
              {components.map((comp) => (
                <div
                  key={comp.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{comp.name}</span>
                    <span className="text-xs text-gray-500">
                      {comp.supplier === 'JD' ? 'JD' : comp.supplierName || comp.supplier}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Artwork Status */}
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      comp.artworkStatus === 'RECEIVED'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      <FileImage className="w-3 h-3 inline mr-1" />
                      {comp.artworkStatus === 'RECEIVED' ? 'Art' : 'No Art'}
                    </span>

                    {/* Material Status (if not NA) */}
                    {comp.materialStatus !== 'NA' && (
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        comp.materialStatus === 'RECEIVED'
                          ? 'bg-green-100 text-green-700'
                          : comp.materialStatus === 'IN_TRANSIT'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        <Truck className="w-3 h-3 inline mr-1" />
                        {comp.materialStatus === 'RECEIVED' ? 'In' : comp.materialStatus === 'IN_TRANSIT' ? 'Transit' : 'Pending'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default JobReadinessCard;
