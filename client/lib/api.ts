const API_BASE_URL = '/api';

// Generic fetch wrapper
async function apiFetch(url: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// Jobs API
export const jobsApi = {
  getAll: (tab?: 'active' | 'completed' | 'paid') => {
    const query = tab ? `?tab=${tab}` : '';
    return apiFetch(`/jobs${query}`);
  },
  getWorkflowView: () => apiFetch('/jobs/workflow-view'),
  getById: (id: string) => apiFetch(`/jobs/${id}`),
  create: (data: any) => apiFetch('/jobs', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => apiFetch(`/jobs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => apiFetch(`/jobs/${id}`, {
    method: 'DELETE',
  }),
  updateStatus: (id: string, status: string) => apiFetch(`/jobs/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  toggleLock: (id: string) => apiFetch(`/jobs/${id}/lock`, {
    method: 'PATCH',
  }),
  updateBradfordRef: (id: string, refNumber: string) => apiFetch(`/jobs/${id}/bradford-ref`, {
    method: 'PATCH',
    body: JSON.stringify({ bradfordRefNumber: refNumber }),
  }),
  importBatch: (jobs: any[], entityMappings: any) => apiFetch('/jobs/import', {
    method: 'POST',
    body: JSON.stringify({ jobs, entityMappings }),
  }),

  // Multi-step Payment Workflow (4-step process)
  // Step 0: Mark Invoice Sent (manual tracking)
  markInvoiceSent: (id: string, data: { status?: string; email?: string }) => apiFetch(`/jobs/${id}/invoice-sent`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  // Step 1: Mark Customer Paid (Customer → Impact)
  markCustomerPaid: (id: string, data?: { date?: string; status?: string }) => apiFetch(`/jobs/${id}/customer-paid`, {
    method: 'PATCH',
    body: JSON.stringify(data || {}),
  }),
  // Step 1.5: Mark Vendor Paid (Impact → Vendor) - for non-Bradford vendors
  markVendorPaid: (id: string, data?: { date?: string; amount?: number; status?: string }) => apiFetch(`/jobs/${id}/vendor-paid`, {
    method: 'PATCH',
    body: JSON.stringify(data || {}),
  }),
  // Step 2: Mark Bradford Paid (Impact → Bradford) - triggers JD Invoice
  markBradfordPaid: (id: string, data?: { date?: string; sendInvoice?: boolean; status?: string }) => apiFetch(`/jobs/${id}/bradford-paid`, {
    method: 'PATCH',
    body: JSON.stringify(data || {}),
  }),
  // Step 3: Send JD Invoice manually (can resend)
  sendJDInvoice: (id: string) => apiFetch(`/jobs/${id}/send-jd-invoice`, {
    method: 'POST',
  }),
  // Step 4: Mark JD Paid (Bradford → JD)
  markJDPaid: (id: string, data?: { date?: string; status?: string }) => apiFetch(`/jobs/${id}/jd-paid`, {
    method: 'PATCH',
    body: JSON.stringify(data || {}),
  }),
  // Download JD Invoice PDF
  downloadJDInvoicePDF: (id: string) => {
    window.open(`${API_BASE_URL}/jobs/${id}/jd-invoice-pdf`, '_blank');
  },
  // Bulk generate JD invoice numbers (one-time operation)
  bulkGenerateJDInvoices: () => apiFetch('/jobs/bulk-generate-jd-invoices', {
    method: 'POST',
  }),
  // QC Overrides
  updateQCOverrides: (id: string, overrides: {
    artOverride?: boolean;
    artOverrideNote?: string;
    clearArtOverride?: boolean;
    dataOverride?: 'SENT' | 'NA' | null;
    dataOverrideNote?: string;
    vendorConfirmOverride?: boolean;
    vendorConfirmOverrideNote?: string;
    clearVendorOverride?: boolean;
    proofOverride?: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | null;
    proofOverrideNote?: string;
    trackingOverride?: string | null;
    trackingCarrierOverride?: string;
  }) => apiFetch(`/jobs/${id}/qc-overrides`, {
    method: 'PATCH',
    body: JSON.stringify(overrides),
  }),
  // Workflow status override
  updateWorkflowStatus: (id: string, status: string | null, clearOverride?: boolean) =>
    apiFetch(`/jobs/${id}/workflow-status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, clearOverride }),
    }),
  // Active tasks (production meeting action items)
  setTask: (id: string, task: string) =>
    apiFetch(`/jobs/${id}/task`, {
      method: 'PATCH',
      body: JSON.stringify({ task }),
    }),
  completeTask: (id: string) =>
    apiFetch(`/jobs/${id}/task/complete`, {
      method: 'PATCH',
    }),
  // Mailing type detection (for job creation preview)
  detectMailingType: (data: {
    mailDate?: string | Date | null;
    inHomesDate?: string | Date | null;
    matchType?: string | null;
    notes?: string | null;
    mailing?: {
      isDirectMail?: boolean;
      mailDate?: string | Date | null;
      inHomesDate?: string | Date | null;
      dropLocation?: string | null;
      mailClass?: string | null;
      presortType?: string | null;
      mailProcess?: string | null;
    } | null;
    timeline?: {
      mailDate?: string | Date | null;
      inHomesDate?: string | Date | null;
    } | null;
    components?: Array<{ name?: string; description?: string }> | null;
    versions?: Array<{ name?: string; quantity?: number }> | null;
    specs?: Record<string, unknown> | string | null;
    title?: string | null;
  }) => apiFetch('/jobs/detect-mailing-type', {
    method: 'POST',
    body: JSON.stringify(data),
  }) as Promise<{
    isMailing: boolean;
    suggestedFormat: 'SELF_MAILER' | 'POSTCARD' | 'ENVELOPE' | null;
    confidence: 'high' | 'medium' | 'low';
    signals: string[];
    envelopeComponents?: number;
  }>,
};

// Entities API
export const entitiesApi = {
  getAll: (type?: 'CUSTOMER' | 'VENDOR') => {
    const query = type ? `?type=${type}` : '';
    return apiFetch(`/entities${query}`);
  },
  getById: (id: string) => apiFetch(`/entities/${id}`),
  create: (data: any) => apiFetch('/entities', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: any) => apiFetch(`/entities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => apiFetch(`/entities/${id}`, {
    method: 'DELETE',
  }),
};

// AI API
export const aiApi = {
  parseSpecs: (text: string) => apiFetch('/ai/parse-specs', {
    method: 'POST',
    body: JSON.stringify({ text }),
  }),
  parsePO: async (file: File, jobId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (jobId) {
      formData.append('jobId', jobId);
    }

    const response = await fetch(`${API_BASE_URL}/ai/parse-po`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to parse PO');
    }

    return response.json();
  },
  generateEmail: (jobData: any, recipientName: string, type: string, senderIdentity?: string) =>
    apiFetch('/ai/generate-email', {
      method: 'POST',
      body: JSON.stringify({ jobData, recipientName, type, senderIdentity }),
    }),
};

// Files API
export const filesApi = {
  getJobFiles: (jobId: string) => apiFetch(`/files/jobs/${jobId}/files`),
  downloadFile: (fileId: string) => {
    window.open(`${API_BASE_URL}/files/files/${fileId}/download`, '_blank');
  },
};

// PDF API
export const pdfApi = {
  generateQuote: (jobId: string) => {
    window.open(`${API_BASE_URL}/pdf/quote/${jobId}`, '_blank');
  },
  generateInvoice: (jobId: string) => {
    window.open(`${API_BASE_URL}/pdf/invoice/${jobId}`, '_blank');
  },
  generateVendorPO: (jobId: string) => {
    window.open(`${API_BASE_URL}/pdf/vendor-po/${jobId}`, '_blank');
  },
  generatePO: (poId: string) => {
    window.open(`${API_BASE_URL}/pdf/po/${poId}`, '_blank');
  },
  generateStatement: (companyId: string, filter: 'all' | 'unpaid' = 'all') => {
    window.open(`${API_BASE_URL}/pdf/statement/${companyId}?filter=${filter}`, '_blank');
  },
};

// Invoice API
export const invoiceApi = {
  updateStatus: (invoiceId: string, status: 'paid' | 'unpaid') =>
    apiFetch(`/jobs/invoices/${invoiceId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

// Email API
export const emailApi = {
  sendInvoice: (jobId: string, recipientEmail: string) =>
    apiFetch(`/email/invoice/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ recipientEmail }),
    }),
  // Send PO to vendor with portal link (always uses portal endpoint)
  sendPO: (
    jobId: string,
    poId: string,
    recipientEmails: string | string[],
    options?: {
      specialInstructions?: string;
    }
  ) =>
    apiFetch(`/email/po-portal/${jobId}/${poId}`, {
      method: 'POST',
      body: JSON.stringify({
        recipientEmail: Array.isArray(recipientEmails) ? recipientEmails[0] : recipientEmails,
        ...options,
      }),
    }),
  sendArtworkNotification: (jobId: string, artworkUrl: string) =>
    apiFetch(`/email/artwork/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ artworkUrl }),
    }),
  sendProofToCustomer: (jobId: string, recipientEmail: string, fileIds: string[], message?: string) =>
    apiFetch(`/email/proof/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ recipientEmail, fileIds, message }),
    }),
};

// Financials API
export const financialsApi = {
  getSummary: () => apiFetch('/financials/summary'),
  getByCustomer: () => apiFetch('/financials/by-customer'),
  getByVendor: () => apiFetch('/financials/by-vendor'),
};

// Communications API - Email Relay System
export const communicationsApi = {
  // Get all communications for a job
  getByJob: (jobId: string) => apiFetch(`/communications/job/${jobId}`),

  // Get pending communications across all jobs
  getPending: () => apiFetch('/communications/pending'),

  // Get count of pending communications (for badge)
  getPendingCount: () => apiFetch('/communications/pending/count'),

  // Get single communication
  getById: (id: string) => apiFetch(`/communications/${id}`),

  // Forward a communication to the other party
  forward: (id: string, customMessage?: string, forwardedBy?: string) =>
    apiFetch(`/communications/${id}/forward`, {
      method: 'POST',
      body: JSON.stringify({ customMessage, forwardedBy }),
    }),

  // Skip a communication (don't forward)
  skip: (id: string, reason?: string, skippedBy?: string) =>
    apiFetch(`/communications/${id}/skip`, {
      method: 'POST',
      body: JSON.stringify({ reason, skippedBy }),
    }),

  // Update communication before forwarding
  update: (id: string, data: { textBody?: string; htmlBody?: string; maskedSubject?: string; internalNotes?: string }) =>
    apiFetch(`/communications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Add internal note to a job's thread
  addNote: (jobId: string, note: string, addedBy?: string) =>
    apiFetch(`/communications/job/${jobId}/note`, {
      method: 'POST',
      body: JSON.stringify({ note, addedBy }),
    }),

  // Send new outbound communication
  send: (jobId: string, to: 'customer' | 'vendor', subject: string, body: string, createdBy?: string) =>
    apiFetch(`/communications/job/${jobId}/send`, {
      method: 'POST',
      body: JSON.stringify({ to, subject, body, createdBy }),
    }),

  // Thread initiation - manually trigger welcome emails
  initiateCustomerThread: (jobId: string, customMessage?: string) =>
    apiFetch(`/communications/job/${jobId}/initiate-customer`, {
      method: 'POST',
      body: JSON.stringify({ customMessage }),
    }),

  initiateVendorThread: (jobId: string, customMessage?: string) =>
    apiFetch(`/communications/job/${jobId}/initiate-vendor`, {
      method: 'POST',
      body: JSON.stringify({ customMessage }),
    }),

  initiateBothThreads: (jobId: string, customMessage?: string) =>
    apiFetch(`/communications/job/${jobId}/initiate-both`, {
      method: 'POST',
      body: JSON.stringify({ customMessage }),
    }),
};

// Portal API - Public vendor job portal (no auth required)
export const portalApi = {
  // Get portal data by token
  getPortalData: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/portal/${token}`);
    if (response.status === 410) {
      throw new Error('expired');
    }
    if (!response.ok) {
      throw new Error('Portal not found');
    }
    return response.json();
  },
  // Download PO (opens in new tab)
  downloadPO: (token: string) => {
    window.open(`${API_BASE_URL}/portal/${token}/po`, '_blank');
  },
  // Download file (opens in new tab)
  downloadFile: (token: string, fileId: string) => {
    window.open(`${API_BASE_URL}/portal/${token}/files/${fileId}`, '_blank');
  },
};

// Change Orders API
export const changeOrdersApi = {
  // List all COs for a job (sorted by version desc)
  list: (jobId: string) => apiFetch(`/jobs/${jobId}/change-orders`),

  // Get single CO details
  get: (id: string) => apiFetch(`/jobs/change-orders/${id}`),

  // Create draft CO
  create: (jobId: string, data: {
    summary: string;
    changes?: Record<string, unknown>;
    affectsVendors?: string[];
    requiresNewPO?: boolean;
    requiresReprice?: boolean;
  }) => apiFetch(`/jobs/${jobId}/change-orders`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Update draft CO
  update: (id: string, data: {
    summary?: string;
    changes?: Record<string, unknown>;
    affectsVendors?: string[];
    requiresNewPO?: boolean;
    requiresReprice?: boolean;
  }) => apiFetch(`/jobs/change-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),

  // Delete draft CO
  delete: (id: string) => apiFetch(`/jobs/change-orders/${id}`, {
    method: 'DELETE',
  }),

  // Submit CO for approval (DRAFT → PENDING_APPROVAL)
  submit: (id: string) => apiFetch(`/jobs/change-orders/${id}/submit`, {
    method: 'POST',
  }),

  // Approve CO (PENDING_APPROVAL → APPROVED)
  approve: (id: string, approvedBy?: string) => apiFetch(`/jobs/change-orders/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approvedBy }),
  }),

  // Reject CO (PENDING_APPROVAL → REJECTED)
  reject: (id: string, rejectionReason?: string) => apiFetch(`/jobs/change-orders/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ rejectionReason }),
  }),

  // Get effective job state with approved COs applied
  getEffectiveState: (jobId: string) => apiFetch(`/jobs/${jobId}/effective-state`),
};

// Vendor RFQ API - Request for Quotes from vendors
export const vendorRfqApi = {
  // List all RFQs with optional filters
  getAll: (status?: string) => {
    const query = status ? `?status=${status}` : '';
    return apiFetch(`/vendor-rfqs${query}`);
  },

  // Get single RFQ with vendors and quotes
  getById: (id: string) => apiFetch(`/vendor-rfqs/${id}`),

  // Create new RFQ
  create: (data: {
    title: string;
    specs: string;
    dueDate: string;
    vendorIds: string[];
    notes?: string;
    jobId?: string;
  }) => apiFetch('/vendor-rfqs', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Update RFQ (draft only)
  update: (id: string, data: {
    title?: string;
    specs?: string;
    dueDate?: string;
    vendorIds?: string[];
    notes?: string;
    jobId?: string;
  }) => apiFetch(`/vendor-rfqs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),

  // Delete RFQ (draft only)
  delete: (id: string) => apiFetch(`/vendor-rfqs/${id}`, {
    method: 'DELETE',
  }),

  // Send RFQ emails to vendors
  send: (id: string) => apiFetch(`/vendor-rfqs/${id}/send`, {
    method: 'POST',
  }),

  // Record vendor quote response (manual entry)
  recordQuote: (id: string, data: {
    vendorId: string;
    quoteAmount: number;
    turnaroundDays?: number;
    notes?: string;
  }) => apiFetch(`/vendor-rfqs/${id}/quotes`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Award RFQ to vendor
  award: (id: string, vendorId: string) => apiFetch(`/vendor-rfqs/${id}/award/${vendorId}`, {
    method: 'POST',
  }),

  // Convert awarded RFQ to job
  convertToJob: (id: string) => apiFetch(`/vendor-rfqs/${id}/convert-to-job`, {
    method: 'POST',
  }),
};
