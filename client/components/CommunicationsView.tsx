import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  ArrowRight,
  ArrowLeft,
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
} from 'lucide-react';
import { communicationsApi } from '../lib/api';
import { toast } from 'sonner';

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
    };
    Vendor?: {
      id: string;
      name: string;
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const handleForward = async (id: string) => {
    try {
      setActionLoading(id);
      await communicationsApi.forward(id, undefined, 'manual');
      toast.success('Message forwarded');
      setCommunications(communications.filter(c => c.id !== id));
      onRefreshCount();
    } catch (error) {
      console.error('Failed to forward:', error);
      toast.error('Failed to forward message');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkip = async (id: string) => {
    try {
      setActionLoading(id);
      await communicationsApi.skip(id, 'Skipped from pending review', 'manual');
      toast.success('Message skipped');
      setCommunications(communications.filter(c => c.id !== id));
      onRefreshCount();
    } catch (error) {
      console.error('Failed to skip:', error);
      toast.error('Failed to skip message');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {communications.map((comm) => (
              <div key={comm.id} className="hover:bg-muted/50 transition-colors">
                {/* Main Row */}
                <div className="p-4 flex items-center gap-4">
                  {/* Direction Icon */}
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        comm.senderType === 'CUSTOMER'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        From {comm.senderType === 'CUSTOMER' ? 'Customer' : 'Vendor'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="font-medium">{comm.job.jobNo}</span>
                        <span className="text-muted-foreground/60">·</span>
                        <span className="truncate max-w-[200px]">{comm.job.title}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(comm.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onGoToJob(comm.jobId)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                      title="Go to Job"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="hidden sm:inline">Job</span>
                    </button>
                    <button
                      onClick={() => handleForward(comm.id)}
                      disabled={actionLoading === comm.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50"
                      title={`Forward to ${comm.senderType === 'CUSTOMER' ? 'Vendor' : 'Customer'}`}
                    >
                      <Forward className="h-4 w-4" />
                      <span className="hidden sm:inline">Forward</span>
                    </button>
                    <button
                      onClick={() => handleSkip(comm.id)}
                      disabled={actionLoading === comm.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
                      title="Skip"
                    >
                      <X className="h-4 w-4" />
                      <span className="hidden sm:inline">Skip</span>
                    </button>
                    <button
                      onClick={() => toggleExpand(comm.id)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                      title={expandedId === comm.id ? 'Collapse' : 'Expand'}
                    >
                      {expandedId === comm.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedId === comm.id && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="ml-14 p-4 bg-muted/50 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-2">
                        From: {comm.fromEmail}
                      </div>
                      <div className="text-sm text-foreground whitespace-pre-wrap">
                        {comm.textBody || '(No text content)'}
                      </div>
                      {comm.internalNotes && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="text-xs font-medium text-muted-foreground mb-1">Internal Notes:</div>
                          <div className="text-sm text-muted-foreground">{comm.internalNotes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
