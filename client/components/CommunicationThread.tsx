import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communicationsApi } from '../lib/api';
import { toast } from 'sonner';
import {
  Mail,
  Send,
  ArrowRight,
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Paperclip,
  MessageSquare,
  User,
  Building,
  ChevronDown,
  ChevronUp,
  Edit2,
  SkipForward,
  RefreshCw,
  Plus,
  FileText,
} from 'lucide-react';

interface Communication {
  id: string;
  jobId: string;
  direction: 'CUSTOMER_TO_VENDOR' | 'VENDOR_TO_CUSTOMER' | 'INTERNAL_NOTE';
  senderType: 'CUSTOMER' | 'VENDOR' | 'INTERNAL';
  originalFrom: string;
  originalTo: string;
  originalSubject: string;
  maskedFrom: string | null;
  maskedSubject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  status: 'RECEIVED' | 'PENDING_REVIEW' | 'FORWARDED' | 'FAILED' | 'SKIPPED';
  forwardedAt: string | null;
  forwardedTo: string | null;
  forwardedBy: string | null;
  internalNotes: string | null;
  receivedAt: string;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    size: number;
  }>;
  job?: {
    jobNo: string;
    Company?: { name: string; email: string };
    Vendor?: { name: string; email: string };
  };
}

interface CommunicationThreadProps {
  jobId: string;
  jobNo: string;
  customerName?: string;
  customerEmail?: string;
  vendorName?: string;
  vendorEmail?: string;
}

const statusConfig = {
  RECEIVED: { label: 'Received', color: 'bg-blue-100 text-blue-800', icon: Mail },
  PENDING_REVIEW: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  FORWARDED: { label: 'Forwarded', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  FAILED: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: XCircle },
  SKIPPED: { label: 'Skipped', color: 'bg-gray-100 text-gray-800', icon: SkipForward },
};

const directionConfig = {
  CUSTOMER_TO_VENDOR: {
    label: 'Customer → Vendor',
    bgColor: 'bg-blue-50 border-blue-200',
    icon: ArrowRight,
    fromLabel: 'From Customer',
    toLabel: 'To Vendor',
  },
  VENDOR_TO_CUSTOMER: {
    label: 'Vendor → Customer',
    bgColor: 'bg-orange-50 border-orange-200',
    icon: ArrowLeft,
    fromLabel: 'From Vendor',
    toLabel: 'To Customer',
  },
  INTERNAL_NOTE: {
    label: 'Internal Note',
    bgColor: 'bg-gray-50 border-gray-200',
    icon: MessageSquare,
    fromLabel: 'Internal',
    toLabel: 'Internal',
  },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CommunicationThread({
  jobId,
  jobNo,
  customerName,
  customerEmail,
  vendorName,
  vendorEmail,
}: CommunicationThreadProps) {
  const queryClient = useQueryClient();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [composeData, setComposeData] = useState({
    to: 'vendor' as 'customer' | 'vendor',
    subject: '',
    body: '',
  });
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  // Fetch communications for this job
  const { data: communications = [], isLoading, refetch } = useQuery({
    queryKey: ['communications', jobId],
    queryFn: () => communicationsApi.getByJob(jobId),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Forward mutation
  const forwardMutation = useMutation({
    mutationFn: ({ id, customMessage }: { id: string; customMessage?: string }) =>
      communicationsApi.forward(id, customMessage, 'admin'),
    onSuccess: () => {
      toast.success('Message forwarded successfully');
      queryClient.invalidateQueries({ queryKey: ['communications', jobId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to forward: ${error.message}`);
    },
  });

  // Skip mutation
  const skipMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      communicationsApi.skip(id, reason, 'admin'),
    onSuccess: () => {
      toast.success('Message skipped');
      queryClient.invalidateQueries({ queryKey: ['communications', jobId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to skip: ${error.message}`);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      communicationsApi.update(id, data),
    onSuccess: () => {
      toast.success('Message updated');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['communications', jobId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // Send new message mutation
  const sendMutation = useMutation({
    mutationFn: () =>
      communicationsApi.send(
        jobId,
        composeData.to,
        composeData.subject,
        composeData.body,
        'admin'
      ),
    onSuccess: () => {
      toast.success('Message sent successfully');
      setShowCompose(false);
      setComposeData({ to: 'vendor', subject: '', body: '' });
      queryClient.invalidateQueries({ queryKey: ['communications', jobId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to send: ${error.message}`);
    },
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: () => communicationsApi.addNote(jobId, noteText, 'admin'),
    onSuccess: () => {
      toast.success('Note added');
      setNoteText('');
      setShowNoteInput(false);
      queryClient.invalidateQueries({ queryKey: ['communications', jobId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to add note: ${error.message}`);
    },
  });

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const startEdit = (comm: Communication) => {
    setEditingId(comm.id);
    setEditContent(comm.textBody || comm.htmlBody || '');
  };

  const pendingCount = communications.filter(
    (c: Communication) => c.status === 'PENDING_REVIEW'
  ).length;

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        Loading communications...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Communication Thread</h3>
          {pendingCount > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowNoteInput(!showNoteInput)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            <MessageSquare className="h-4 w-4" />
            Note
          </button>
          <button
            onClick={() => setShowCompose(!showCompose)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            <Plus className="h-4 w-4" />
            New Message
          </button>
        </div>
      </div>

      {/* Add Note Input */}
      {showNoteInput && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Internal Note
          </label>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={3}
            placeholder="Add an internal note (not sent to anyone)..."
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowNoteInput(false);
                setNoteText('');
              }}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => addNoteMutation.mutate()}
              disabled={!noteText.trim() || addNoteMutation.isPending}
              className="px-3 py-1.5 text-sm text-white bg-gray-600 hover:bg-gray-700 rounded-lg disabled:opacity-50"
            >
              {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
            </button>
          </div>
        </div>
      )}

      {/* Compose New Message */}
      {showCompose && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Send to:</label>
            <div className="flex gap-4">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="composeTo"
                  value="vendor"
                  checked={composeData.to === 'vendor'}
                  onChange={() => setComposeData({ ...composeData, to: 'vendor' })}
                  className="mr-2"
                />
                <Building className="h-4 w-4 mr-1 text-orange-600" />
                Vendor ({vendorName || 'N/A'})
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="composeTo"
                  value="customer"
                  checked={composeData.to === 'customer'}
                  onChange={() => setComposeData({ ...composeData, to: 'customer' })}
                  className="mr-2"
                />
                <User className="h-4 w-4 mr-1 text-blue-600" />
                Customer ({customerName || 'N/A'})
              </label>
            </div>
          </div>
          <input
            type="text"
            value={composeData.subject}
            onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Subject"
          />
          <textarea
            value={composeData.body}
            onChange={(e) => setComposeData({ ...composeData, body: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={5}
            placeholder="Message body..."
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowCompose(false);
                setComposeData({ to: 'vendor', subject: '', body: '' });
              }}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => sendMutation.mutate()}
              disabled={
                !composeData.subject.trim() ||
                !composeData.body.trim() ||
                sendMutation.isPending
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sendMutation.isPending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* Communication List */}
      {communications.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <Mail className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <p className="font-medium">No communications yet</p>
          <p className="text-sm mt-1">
            Messages sent to job-{jobNo}@impactdirectprinting.com will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {communications.map((comm: Communication) => {
            const dirConfig = directionConfig[comm.direction];
            const statConfig = statusConfig[comm.status];
            const isExpanded = expandedIds.has(comm.id);
            const isEditing = editingId === comm.id;
            const StatusIcon = statConfig.icon;
            const DirectionIcon = dirConfig.icon;

            return (
              <div
                key={comm.id}
                className={`border rounded-lg overflow-hidden ${dirConfig.bgColor} ${
                  comm.status === 'PENDING_REVIEW' ? 'ring-2 ring-yellow-400' : ''
                }`}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-opacity-80"
                  onClick={() => toggleExpand(comm.id)}
                >
                  <div className="flex items-center gap-3">
                    <DirectionIcon className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {comm.originalSubject}
                        </span>
                        {comm.attachments.length > 0 && (
                          <span className="inline-flex items-center text-xs text-gray-500">
                            <Paperclip className="h-3 w-3 mr-0.5" />
                            {comm.attachments.length}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        From: {comm.originalFrom} • {formatDate(comm.receivedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statConfig.color}`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {statConfig.label}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t p-4 bg-white space-y-4">
                    {/* Message Content */}
                    {isEditing ? (
                      <div className="space-y-3">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          rows={8}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() =>
                              updateMutation.mutate({
                                id: comm.id,
                                data: { textBody: editContent },
                              })
                            }
                            className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        {comm.htmlBody ? (
                          <div
                            dangerouslySetInnerHTML={{ __html: comm.htmlBody }}
                            className="text-gray-700"
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap text-gray-700 font-sans">
                            {comm.textBody || '(No content)'}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Attachments */}
                    {comm.attachments.length > 0 && (
                      <div className="border-t pt-3">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                          Attachments
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {comm.attachments.map((att) => (
                            <div
                              key={att.id}
                              className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm"
                            >
                              <FileText className="h-4 w-4 text-gray-500" />
                              <span>{att.fileName}</span>
                              <span className="text-gray-400">
                                ({formatFileSize(att.size)})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Forwarding Status */}
                    {comm.forwardedAt && (
                      <div className="border-t pt-3 text-sm text-gray-500">
                        Forwarded to {comm.forwardedTo} on{' '}
                        {formatDate(comm.forwardedAt)}
                        {comm.forwardedBy && ` by ${comm.forwardedBy}`}
                      </div>
                    )}

                    {/* Internal Notes */}
                    {comm.internalNotes && (
                      <div className="border-t pt-3">
                        <h4 className="text-sm font-medium text-gray-700 mb-1">
                          Internal Notes
                        </h4>
                        <p className="text-sm text-gray-600 bg-yellow-50 p-2 rounded">
                          {comm.internalNotes}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    {comm.status === 'PENDING_REVIEW' &&
                      comm.direction !== 'INTERNAL_NOTE' && (
                        <div className="border-t pt-3 flex items-center gap-2">
                          <button
                            onClick={() => startEdit(comm)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                          >
                            <Edit2 className="h-4 w-4" />
                            Edit
                          </button>
                          <button
                            onClick={() =>
                              skipMutation.mutate({ id: comm.id, reason: 'Manual skip' })
                            }
                            disabled={skipMutation.isPending}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                          >
                            <SkipForward className="h-4 w-4" />
                            Skip
                          </button>
                          <button
                            onClick={() => forwardMutation.mutate({ id: comm.id })}
                            disabled={forwardMutation.isPending}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg"
                          >
                            <Send className="h-4 w-4" />
                            {forwardMutation.isPending
                              ? 'Forwarding...'
                              : `Forward to ${
                                  comm.direction === 'CUSTOMER_TO_VENDOR'
                                    ? 'Vendor'
                                    : 'Customer'
                                }`}
                          </button>
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CommunicationThread;
