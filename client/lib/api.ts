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
};

// Financials API
export const financialsApi = {
  getSummary: () => apiFetch('/financials/summary'),
  getByCustomer: () => apiFetch('/financials/by-customer'),
  getByVendor: () => apiFetch('/financials/by-vendor'),
};
