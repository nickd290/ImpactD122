import React from 'react';
import { FileText, Download, Calendar } from 'lucide-react';

interface GeneratedDocument {
  type: 'INVOICE' | 'PO' | 'QUOTE';
  number: string;
  generatedAt: string;
  generatedBy: string;
  downloadUrl?: string | null;
}

interface DocumentLogProps {
  documents: GeneratedDocument[];
  onDownload?: (document: GeneratedDocument) => void;
}

export const DocumentLog: React.FC<DocumentLogProps> = ({ documents, onDownload }) => {
  if (!documents || documents.length === 0) {
    return (
      <div className="bg-impact-cream border border-gray-200 rounded-lg p-6 text-center">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600">No documents generated yet</p>
        <p className="text-sm text-gray-500 mt-1">
          Documents will appear here once you generate POs, invoices, or quotes
        </p>
      </div>
    );
  }

  const getDocumentTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      INVOICE: 'bg-green-100 text-green-800 border-green-200',
      PO: 'bg-blue-100 text-blue-800 border-blue-200',
      QUOTE: 'bg-purple-100 text-purple-800 border-purple-200',
    };
    return colors[type] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      INVOICE: 'Invoice',
      PO: 'Purchase Order',
      QUOTE: 'Quote',
    };
    return labels[type] || type;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-impact-navy flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Document History
        </h3>
        <span className="text-sm text-gray-600">
          {documents.length} {documents.length === 1 ? 'document' : 'documents'}
        </span>
      </div>

      <div className="space-y-3">
        {documents.map((doc, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 bg-impact-cream rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium border ${getDocumentTypeColor(
                    doc.type
                  )}`}
                >
                  {getDocumentTypeLabel(doc.type)}
                </span>
                <span className="font-semibold text-gray-900">{doc.number}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(doc.generatedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>by {doc.generatedBy}</span>
              </div>
            </div>

            {onDownload && (
              <button
                onClick={() => onDownload(doc)}
                className="ml-4 p-2 text-impact-red hover:bg-impact-red hover:text-white rounded-lg transition-colors"
                title="Download document"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentLog;
