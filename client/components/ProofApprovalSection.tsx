import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, MessageSquare, ChevronDown, ChevronUp, FileText, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { proofsApi, filesApi } from '../lib/api';
import { format } from 'date-fns';

interface ProofFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface ProofApproval {
  id: string;
  proofId: string;
  approved: boolean;
  comments: string | null;
  approvedBy: string | null;
  createdAt: string;
}

interface Proof {
  id: string;
  jobId: string;
  version: number;
  status: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  fileId: string;
  adminNotes: string | null;
  adminComments: string | null;
  createdAt: string;
  File: ProofFile;
  ProofApproval: ProofApproval[];
}

interface ProofApprovalSectionProps {
  jobId: string;
  onProofStatusChange?: () => void;
}

export function ProofApprovalSection({ jobId, onProofStatusChange }: ProofApprovalSectionProps) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingProofId, setApprovingProofId] = useState<string | null>(null);
  const [showCommentFor, setShowCommentFor] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  useEffect(() => {
    fetchProofs();
  }, [jobId]);

  const fetchProofs = async () => {
    try {
      setLoading(true);
      const data = await proofsApi.getJobProofs(jobId);
      setProofs(data);
    } catch (error) {
      console.error('Failed to fetch proofs:', error);
      toast.error('Failed to load proofs');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (proofId: string) => {
    try {
      setApprovingProofId(proofId);
      await proofsApi.approve(proofId, true, undefined, 'Staff');
      toast.success('Proof approved!');
      await fetchProofs();
      onProofStatusChange?.();
    } catch (error) {
      console.error('Failed to approve proof:', error);
      toast.error('Failed to approve proof');
    } finally {
      setApprovingProofId(null);
    }
  };

  const handleRequestChanges = async (proofId: string) => {
    if (!comment.trim()) {
      toast.error('Please enter a comment explaining what changes are needed');
      return;
    }

    try {
      setApprovingProofId(proofId);
      await proofsApi.approve(proofId, false, comment, 'Staff');
      toast.success('Changes requested');
      setShowCommentFor(null);
      setComment('');
      await fetchProofs();
      onProofStatusChange?.();
    } catch (error) {
      console.error('Failed to request changes:', error);
      toast.error('Failed to request changes');
    } finally {
      setApprovingProofId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            Approved
          </span>
        );
      case 'CHANGES_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" />
            Changes Requested
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading proofs...</span>
        </div>
      </div>
    );
  }

  if (proofs.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="text-center py-8 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No proofs uploaded yet</p>
          <p className="text-sm mt-1">Proofs will appear here when uploaded by the vendor</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Proofs</h3>
        <p className="text-sm text-gray-500 mt-1">Review and approve proofs from the vendor</p>
      </div>

      <div className="divide-y divide-gray-100">
        {proofs.map((proof) => (
          <div key={proof.id} className="p-6">
            {/* Proof header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{proof.File.fileName}</span>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">v{proof.version}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {formatFileSize(proof.File.size)} &middot; {format(new Date(proof.createdAt), 'MMM d, yyyy h:mm a')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {getStatusBadge(proof.status)}
                <button
                  onClick={() => filesApi.downloadFile(proof.fileId)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Actions for pending proofs */}
            {proof.status === 'PENDING' && (
              <div className="mt-4">
                {showCommentFor === proof.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Describe what changes are needed..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRequestChanges(proof.id)}
                        disabled={approvingProofId === proof.id}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {approvingProofId === proof.id && <Loader2 className="w-3 h-3 animate-spin" />}
                        Submit Changes
                      </button>
                      <button
                        onClick={() => { setShowCommentFor(null); setComment(''); }}
                        className="px-3 py-1.5 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(proof.id)}
                      disabled={approvingProofId === proof.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {approvingProofId === proof.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => setShowCommentFor(proof.id)}
                      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Request Changes
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Latest approval info for approved/changes requested */}
            {proof.status !== 'PENDING' && proof.ProofApproval.length > 0 && (
              <div className="mt-4">
                <div className={`p-3 rounded-lg ${proof.status === 'APPROVED' ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-2">
                    {proof.status === 'APPROVED' ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span className={`text-sm font-medium ${proof.status === 'APPROVED' ? 'text-green-800' : 'text-red-800'}`}>
                      {proof.status === 'APPROVED' ? 'Approved' : 'Changes Requested'} by {proof.ProofApproval[0].approvedBy || 'Staff'}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {format(new Date(proof.ProofApproval[0].createdAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                  {proof.ProofApproval[0].comments && (
                    <div className="mt-2 text-sm text-gray-700 flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span>{proof.ProofApproval[0].comments}</span>
                    </div>
                  )}
                </div>

                {/* Approval history toggle */}
                {proof.ProofApproval.length > 1 && (
                  <button
                    onClick={() => setExpandedHistory(expandedHistory === proof.id ? null : proof.id)}
                    className="mt-2 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    {expandedHistory === proof.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {expandedHistory === proof.id ? 'Hide' : 'Show'} approval history ({proof.ProofApproval.length - 1} previous)
                  </button>
                )}

                {/* Expanded approval history */}
                {expandedHistory === proof.id && (
                  <div className="mt-3 space-y-2 border-l-2 border-gray-200 pl-3 ml-2">
                    {proof.ProofApproval.slice(1).map((approval) => (
                      <div key={approval.id} className="text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          {approval.approved ? (
                            <CheckCircle className="w-3 h-3 text-green-500" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-500" />
                          )}
                          <span>{approval.approved ? 'Approved' : 'Changes Requested'} by {approval.approvedBy || 'Staff'}</span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {format(new Date(approval.createdAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        {approval.comments && (
                          <p className="text-gray-500 mt-1 ml-5">{approval.comments}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
