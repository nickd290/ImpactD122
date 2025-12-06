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
  getAll: () => apiFetch('/jobs'),
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
  // Step 1: Mark Customer Paid (Customer → Impact)
  markCustomerPaid: (id: string, date?: string) => apiFetch(`/jobs/${id}/customer-paid`, {
    method: 'PATCH',
    body: JSON.stringify({ date }),
  }),
  // Step 2: Mark Bradford Paid (Impact → Bradford) - triggers JD Invoice
  markBradfordPaid: (id: string, date?: string, sendInvoice?: boolean) => apiFetch(`/jobs/${id}/bradford-paid`, {
    method: 'PATCH',
    body: JSON.stringify({ date, sendInvoice }),
  }),
  // Step 3: Send JD Invoice manually (can resend)
  sendJDInvoice: (id: string) => apiFetch(`/jobs/${id}/send-jd-invoice`, {
    method: 'POST',
  }),
  // Step 4: Mark JD Paid (Bradford → JD)
  markJDPaid: (id: string, date?: string) => apiFetch(`/jobs/${id}/jd-paid`, {
    method: 'PATCH',
    body: JSON.stringify({ date }),
  }),
  // Download JD Invoice PDF
  downloadJDInvoicePDF: (id: string) => {
    window.open(`${API_BASE_URL}/jobs/${id}/jd-invoice-pdf`, '_blank');
  },
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
  parsePO: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

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
};

// Email API
export const emailApi = {
  sendInvoice: (jobId: string, recipientEmail: string) =>
    apiFetch(`/email/invoice/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ recipientEmail }),
    }),
  sendPO: (poId: string, recipientEmail: string) =>
    apiFetch(`/email/po/${poId}`, {
      method: 'POST',
      body: JSON.stringify({ recipientEmail }),
    }),
  sendArtworkNotification: (jobId: string, artworkUrl: string) =>
    apiFetch(`/email/artwork/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ artworkUrl }),
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
};
