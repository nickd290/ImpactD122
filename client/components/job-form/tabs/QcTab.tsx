import React from 'react';
import { AlertCircle } from 'lucide-react';
import { JobReadinessCard } from '../JobReadinessCard';

interface QcTabProps {
  jobId?: string;
  onStatusChange?: () => void;
}

export function QcTab({ jobId, onStatusChange }: QcTabProps) {
  if (!jobId) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600 font-medium">Save job first</p>
        <p className="text-sm text-gray-500 mt-1">
          QC status tracking will be available after the job is created.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <JobReadinessCard jobId={jobId} onStatusChange={onStatusChange} />

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800 mb-2">About Job Readiness</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Track whether all required information has been received</li>
          <li>• Ensure POs only go to vendors when job is complete</li>
          <li>• Click on any QC flag to update its status</li>
          <li>• Blockers prevent the job from being marked as "Ready"</li>
        </ul>
      </div>
    </div>
  );
}

export default QcTab;
