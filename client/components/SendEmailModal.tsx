import React, { useState } from 'react';
import { Mail, Loader2, X, Send, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui';
import { Input } from './ui';
import { emailApi } from '../lib/api';

type EmailType = 'invoice' | 'po';

interface SendEmailModalProps {
  type: EmailType;
  jobId?: string;
  poId?: string;
  jobNo?: string;
  poNumber?: string;
  defaultEmail?: string;
  recipientName?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SendEmailModal({
  type,
  jobId,
  poId,
  jobNo,
  poNumber,
  defaultEmail = '',
  recipientName = '',
  onClose,
  onSuccess,
}: SendEmailModalProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const documentLabel = type === 'invoice' ? 'Invoice' : 'Purchase Order';
  const documentNumber = type === 'invoice' ? jobNo : poNumber;

  const handleSend = async () => {
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      setError('');

      if (type === 'invoice' && jobId) {
        await emailApi.sendInvoice(jobId, email);
      } else if (type === 'po' && poId) {
        await emailApi.sendPO(poId, email);
      } else {
        throw new Error('Invalid configuration');
      }

      setSuccess(true);
      toast.success(`${documentLabel} sent successfully to ${email}`, {
        description: `${documentLabel} #${documentNumber} has been emailed.`,
      });
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      const errorMsg = err.message || `Failed to send ${documentLabel.toLowerCase()}`;
      setError(errorMsg);
      toast.error(`Failed to send ${documentLabel}`, {
        description: errorMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              Email {documentLabel}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Document Info */}
          <div className="bg-muted rounded-lg p-3">
            <p className="text-sm text-muted-foreground">
              {documentLabel}:{' '}
              <span className="font-medium text-foreground">
                #{documentNumber || 'N/A'}
              </span>
            </p>
            {recipientName && (
              <p className="text-sm text-muted-foreground mt-1">
                To: <span className="font-medium text-foreground">{recipientName}</span>
              </p>
            )}
          </div>

          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Recipient Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              disabled={loading || success}
              className="w-full"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-md p-2">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-md p-2">
              <CheckCircle className="w-4 h-4" />
              {documentLabel} sent successfully!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-muted/30">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={loading || success || !email.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : success ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Sent!
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
