import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  ExternalLink,
  Forward,
  X,
  Clock,
  User,
  Building2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Inbox,
  Briefcase,
} from 'lucide-react';
import { communicationsApi } from '../lib/api';
import { toast } from 'sonner';
import { CommunicationThread } from './CommunicationThread';

interface Communication {
  id: string;
  jobId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: 'CUSTOMER' | 'VENDOR' | 'INTERNAL';
  status: 'PENDING_REVIEW' | 'FORWARDED' | 'SKIPPED' | 'DELIVERED' | 'FAILED';
  fromEmail: string;
  toEmail: string;
  originalSubject: string;
  maskedSubject: string;
  textBody: string;
  htmlBody: string | null;
  internalNotes: string | null;
  createdAt: string;
  job: {
    id: string;
    jobNo: string;
    title: string;
    Company?: {
      id: string;
      name: string;
      email?: string;
    };
    Vendor?: {
      id: string;
      name: string;
      email?: string;
      contacts?: Array<{ email: string }>;
    };
  };
}

interface CommunicationsViewProps {
  onGoToJob: (jobId: string) => void;
  onRefreshCount: () => void;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
};

export function CommunicationsView({ onGoToJob, onRefreshCount }: CommunicationsViewProps) {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedComm, setSelectedComm] = useState<Communication | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadCommunications();
  }, []);

  const loadCommunications = async () => {
    try {
      setLoading(true);
      const data = await communicationsApi.getPending();
      setCommunications(data);
    } catch (error) {
      console.error('Failed to load communications:', error);
      toast.error('Failed to load communications');
    } finally {
      setLoading(false);
    }
  };

  const handleForward = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setActionLoading(id);
      await communicationsApi.forward(id, undefined, 'manual');
      toast.success('Message forwarded');
      setCommunications(communications.filter(c => c.id !== id));
      if (selectedComm?.id === id) {
        setSelectedComm(null);
      }
      onRefreshCount();
    } catch (error) {
      console.error('Failed to forward:', error);
      toast.error('Failed to forward message');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkip = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setActionLoading(id);
      await communicationsApi.skip(id, 'Skipped from pending review', 'manual');
      toast.success('Message skipped');
      setCommunications(communications.filter(c => c.id !== id));
      if (selectedComm?.id === id) {
        setSelectedComm(null);
      }
      onRefreshCount();
    } catch (error) {
      console.error('Failed to skip:', error);
      toast.error('Failed to skip message');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelectComm = (comm: Communication) => {
    setSelectedComm(comm);
  };

  const closeDrawer = () => {
    setSelectedComm(null);
  };

  // Get vendor email from contacts or direct email
  const getVendorEmail = (vendor?: Communication['job']['Vendor']) => {
    if (!vendor) return undefined;
    if (vendor.email) return vendor.email;
    if (vendor.contacts && vendor.contacts.length > 0) {
      return vendor.contacts[0].email;
    }
    return undefined;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Left Panel - Communications List */}
      <div className={`flex-1 overflow-hidden flex flex-col transition-all duration-300 ${selectedComm ? 'mr-[500px]' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Communications</h1>
              <p className="text-sm text-muted-foreground">
                {communications.length} pending review
              </p>
            </div>
          </div>
          <button
            onClick={loadCommunications}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Empty State */}
        {communications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 bg-card rounded-lg border border-border">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">No pending messages</h3>
            <p className="text-sm text-muted-foreground">
              All communications have been reviewed
            </p>
          </div>
        )}

        {/* Communications List */}
        {communications.length > 0 && (
          <div className="bg-card rounded-lg border border-border overflow-hidden flex-1 overflow-y-auto">
            <div className="divide-y divide-border">
              {communications.map((comm) => (
                <div
                  key={comm.id}
                  onClick={() => handleSelectComm(comm)}
                  className={`hover:bg-muted/50 transition-colors cursor-pointer ${
                    selectedComm?.id === comm.id ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                  }`}
                >
                  {/* Main Row */}
                  <div className="p-4 flex items-center gap-4">
                    {/* Direction Icon */}
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      comm.senderType === 'CUSTOMER'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-orange-100 text-orange-600'
                    }`}>
                      {comm.senderType === 'CUSTOMER' ? (
                        <User className="h-5 w-5" />
                      ) : (
                        <Building2 className="h-5 w-5" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground truncate">
                          {comm.maskedSubject || comm.originalSubject}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                          comm.senderType === 'CUSTOMER'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {comm.senderType === 'CUSTOMER' ? 'Customer' : 'Vendor'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          <span className="font-medium">{comm.job.jobNo}</span>
                          <span className="text-muted-foreground/60">·</span>
                          <span className="truncate max-w-[200px]">{comm.job.title}</span>
                        </span>
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <Clock className="h-3 w-3" />
                          {formatDate(comm.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => handleForward(comm.id, e)}
                        disabled={actionLoading === comm.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50"
                        title={`Forward to ${comm.senderType === 'CUSTOMER' ? 'Vendor' : 'Customer'}`}
                      >
                        <Forward className="h-4 w-4" />
                        <span className="hidden sm:inline">Forward</span>
                      </button>
                      <button
                        onClick={(e) => handleSkip(comm.id, e)}
                        disabled={actionLoading === comm.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
                        title="Skip"
                      >
                        <X className="h-4 w-4" />
                        <span className="hidden sm:inline">Skip</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Drawer - Job Communication Thread */}
      {selectedComm && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 bg-black/20 lg:hidden z-40"
            onClick={closeDrawer}
          />

          {/* Drawer */}
          <div className="fixed right-0 top-0 h-full w-[500px] bg-card border-l border-border shadow-xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">{selectedComm.job.jobNo}</span>
                    <button
                      onClick={() => {
                        onGoToJob(selectedComm.jobId);
                        closeDrawer();
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                      title="Go to Job"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                    {selectedComm.job.title}
                  </p>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Job Info */}
            <div className="p-4 bg-muted/30 border-b border-border space-y-2">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-600" />
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium text-foreground">
                    {selectedComm.job.Company?.name || 'N/A'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-orange-600" />
                  <span className="text-muted-foreground">Vendor:</span>
                  <span className="font-medium text-foreground">
                    {selectedComm.job.Vendor?.name || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Communication Thread */}
            <div className="flex-1 overflow-y-auto p-4">
              <CommunicationThread
                jobId={selectedComm.jobId}
                jobNo={selectedComm.job.jobNo}
                customerName={selectedComm.job.Company?.name}
                customerEmail={selectedComm.job.Company?.email}
                vendorName={selectedComm.job.Vendor?.name}
                vendorEmail={getVendorEmail(selectedComm.job.Vendor)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
