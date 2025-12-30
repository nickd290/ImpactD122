import React, { useState, useMemo } from 'react';
import { Mail, Loader2, X, Send, CheckCircle, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui';
import { Input } from './ui';
import { emailApi } from '../lib/api';

type EmailType = 'invoice' | 'po';

interface Contact {
  id: string;
  name: string;
  email: string;
  title?: string;
  isPrimary?: boolean;
}

interface SendEmailModalProps {
  type: EmailType;
  jobId?: string;
  poId?: string;
  jobNo?: string;
  poNumber?: string;
  defaultEmail?: string;
  recipientName?: string;
  // Vendor info for PO emails - includes contacts
  vendorInfo?: {
    email?: string;
    name?: string;
    contacts?: Contact[];
  };
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
  vendorInfo,
  onClose,
  onSuccess,
}: SendEmailModalProps) {
  // Build list of available recipients from vendor info (deduplicated by email)
  const availableRecipients = useMemo(() => {
    const recipients: Array<{ id: string; email: string; label: string; isPrimary?: boolean }> = [];
    const seenEmails = new Set<string>();

    if (vendorInfo?.email) {
      const normalizedEmail = vendorInfo.email.toLowerCase().trim();
      seenEmails.add(normalizedEmail);
      recipients.push({
        id: 'main',
        email: vendorInfo.email,
        label: `${vendorInfo.name || 'Vendor'} (Main)`,
        isPrimary: true,
      });
    }

    if (vendorInfo?.contacts) {
      for (const contact of vendorInfo.contacts) {
        if (contact.email) {
          const normalizedEmail = contact.email.toLowerCase().trim();
          // Skip if we've already added this email
          if (!seenEmails.has(normalizedEmail)) {
            seenEmails.add(normalizedEmail);
            recipients.push({
              id: contact.id,
              email: contact.email,
              label: `${contact.name}${contact.title ? ` (${contact.title})` : ''}`,
              isPrimary: contact.isPrimary,
            });
          }
        }
      }
    }

    return recipients;
  }, [vendorInfo]);

  // Selected recipients (checkboxes)
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(() => {
    // Default: select main email or first contact
    const defaultSet = new Set<string>();
    if (availableRecipients.length > 0) {
      const primary = availableRecipients.find(r => r.isPrimary);
      if (primary) {
        defaultSet.add(primary.id);
      } else {
        defaultSet.add(availableRecipients[0].id);
      }
    }
    return defaultSet;
  });

  // Manual email input (for when no contacts or additional recipients)
  const [manualEmail, setManualEmail] = useState(availableRecipients.length === 0 ? defaultEmail : '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // PO-specific fields
  const [specialInstructions, setSpecialInstructions] = useState('');

  const documentLabel = type === 'invoice' ? 'Invoice' : 'Purchase Order';
  const documentNumber = type === 'invoice' ? jobNo : poNumber;

  // Toggle recipient selection
  const toggleRecipient = (id: string) => {
    setSelectedRecipients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Get all selected emails (deduplicated, case-insensitive)
  const getSelectedEmails = (): string[] => {
    const emails: string[] = [];
    const seenEmails = new Set<string>();

    // Add selected recipients
    for (const recipient of availableRecipients) {
      if (selectedRecipients.has(recipient.id)) {
        const normalized = recipient.email.toLowerCase().trim();
        if (!seenEmails.has(normalized)) {
          seenEmails.add(normalized);
          emails.push(recipient.email);
        }
      }
    }

    // Add manual email if valid and not duplicate
    if (manualEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim())) {
      const normalized = manualEmail.toLowerCase().trim();
      if (!seenEmails.has(normalized)) {
        emails.push(manualEmail.trim());
      }
    }

    return emails;
  };

  const selectedEmails = getSelectedEmails();
  const hasValidRecipient = selectedEmails.length > 0;

  const handleSend = async () => {
    if (!hasValidRecipient) {
      setError('Please select at least one recipient or enter a valid email address');
      return;
    }

    try {
      setLoading(true);
      setError('');

      if (type === 'invoice' && jobId) {
        // Invoice only supports single recipient for now
        await emailApi.sendInvoice(jobId, selectedEmails[0]);
      } else if (type === 'po' && jobId && poId) {
        // Send PO with portal link - one email per recipient
        for (const email of selectedEmails) {
          await emailApi.sendPO(jobId, poId, email, {
            specialInstructions: specialInstructions || undefined,
          });
        }
      } else {
        throw new Error('Invalid configuration - jobId required for PO emails');
      }

      setSuccess(true);
      toast.success(`${documentLabel} sent successfully`, {
        description: `Sent to ${selectedEmails.length} recipient${selectedEmails.length > 1 ? 's' : ''}`,
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

          {/* Recipients Section */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Recipients
              {selectedEmails.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {selectedEmails.length} selected
                </span>
              )}
            </label>

            {/* Available Recipients (Checkboxes) */}
            {availableRecipients.length > 0 && (
              <div className="space-y-2 mb-3">
                {availableRecipients.map((recipient) => (
                  <label
                    key={recipient.id}
                    className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                      selectedRecipients.has(recipient.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRecipients.has(recipient.id)}
                      onChange={() => toggleRecipient(recipient.id)}
                      disabled={loading || success}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {recipient.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {recipient.email}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Manual Email Input */}
            <div className="relative">
              <Input
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder={availableRecipients.length > 0 ? "Add another email (optional)..." : "Enter email address..."}
                disabled={loading || success}
                className="w-full"
              />
              {manualEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail) && (
                <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
              )}
            </div>

            {/* Validation message */}
            {!hasValidRecipient && (
              <p className="mt-2 text-xs text-amber-600">
                Select at least one contact or enter an email address
              </p>
            )}
          </div>

          {/* PO-specific fields */}
          {type === 'po' && (
            <>
              {/* Special Instructions */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Special Instructions
                  <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                </label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="Vendor-specific notes, handling requirements, shipping instructions..."
                  disabled={loading || success}
                  rows={3}
                  className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {/* Info about portal link */}
              <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded">
                Vendor will receive a portal link to view job details, files, and PO.
                <br />
                <span className="text-gray-500">CC: nick@jdgraphic.com</span>
              </div>
            </>
          )}

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
              {documentLabel} sent to {selectedEmails.length} recipient{selectedEmails.length > 1 ? 's' : ''}!
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
            disabled={loading || success || !hasValidRecipient}
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
                Send to {selectedEmails.length || 0} Recipient{selectedEmails.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
