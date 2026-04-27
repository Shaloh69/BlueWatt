import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000, // 60 s — Render cold-starts can take 30-50 s on free tier
  headers: { "Content-Type": "application/json" },
});

// Attach JWT on every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("bw_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("bw_token");
      localStorage.removeItem("bw_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

// ── Helpers ───────────────────────────────────────────────────────────────────
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined;
    return data?.message ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  me: () => api.get("/auth/me"),
  updateProfile: (data: { full_name?: string; email?: string }) =>
    api.put("/auth/profile", data),
  changePassword: (current_password: string, new_password: string) =>
    api.put("/auth/password", { current_password, new_password }),
  uploadProfileImage: (formData: FormData) =>
    api.post("/upload/profile-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
};

// ── Devices ───────────────────────────────────────────────────────────────────
export const devicesApi = {
  list: () => api.get("/devices/"),
  get: (id: number) => api.get(`/devices/${id}`),
  register: (data: object) => api.post("/devices/register", data),
  update: (id: number, data: object) => api.put(`/devices/${id}`, data),
  updateRelay: (id: number, data: object) => api.put(`/devices/${id}/relay`, data),
  issueRelayCommand: (id: number, command: string) =>
    api.post(`/devices/${id}/relay-command`, { command }),
  getRelayHistory: (id: number) => api.get(`/devices/${id}/relay-command/history`),
  getLatestReading: (id: number) =>
    api.get(`/power-data/devices/${id}/power-data/latest`),
  uploadImage: (id: number, formData: FormData) =>
    api.post(`/upload/device/${id}/image`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  delete: (id: number) => api.delete(`/devices/${id}`),
  regenerateKey: (id: number) => api.post(`/devices/${id}/keys/regenerate`, {}),
};

// ── Pads ──────────────────────────────────────────────────────────────────────
export const padsApi = {
  list: () => api.get("/pads/"),
  get: (id: number) => api.get(`/pads/${id}`),
  create: (data: object) => api.post("/pads/", data),
  update: (id: number, data: object) => api.put(`/pads/${id}`, data),
  assign: (id: number, data: object) => api.put(`/pads/${id}/assign`, data),
  unassign: (id: number) => api.put(`/pads/${id}/unassign`, {}),
  delete: (id: number) => api.delete(`/pads/${id}`),
};

// ── Billing ───────────────────────────────────────────────────────────────────
export const billingApi = {
  list: () => api.get("/billing/"),
  getByPad: (padId: number) => api.get(`/billing/pad/${padId}`),
  get: (id: number) => api.get(`/billing/${id}`),
  generate: (data: object) => api.post("/billing/generate", data),
  waive: (id: number) => api.put(`/billing/${id}/waive`, {}),
  delete: (id: number) => api.delete(`/billing/${id}`),
};

// ── Payments ──────────────────────────────────────────────────────────────────
export const paymentsApi = {
  pendingVerification: () => api.get("/payments/pending-verification"),
  all: () => api.get("/payments/admin/all"),
  approve: (id: number) => api.put(`/payments/${id}/approve`, {}),
  reject: (id: number, reason: string) =>
    api.put(`/payments/${id}/reject`, { reason }),
  qrCodes: () => api.get("/payments/qr-codes"),
  qrCodesAll: () => api.get("/payments/qr-codes/all"),
  uploadQr: (formData: FormData) =>
    api.post("/payments/qr-codes", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  toggleQr: (id: number) => api.put(`/payments/qr-codes/${id}/toggle`, {}),
  deleteQr: (id: number) => api.delete(`/payments/qr-codes/${id}`),
};

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportsApi = {
  hourly: (deviceId: number, date?: string) =>
    api.get(`/reports/hourly/${deviceId}`, { params: { date } }),
  daily: (deviceId: number, month?: string) =>
    api.get(`/reports/daily/${deviceId}`, { params: { month } }),
  monthly: (deviceId: number, year?: string) =>
    api.get(`/reports/monthly/${deviceId}`, { params: { year } }),
  padSummary: (month?: string) =>
    api.get("/reports/pad-summary", { params: { month } }),
  anomalies: (deviceId: number, start?: string, end?: string) =>
    api.get(`/reports/anomalies/${deviceId}`, { params: { start, end } }),
  anomalySummary: (month?: string) =>
    api.get("/reports/anomalies/summary", { params: { month } }),
  exportCsv: (deviceId: number, start?: string, end?: string) =>
    api.get(`/reports/export/${deviceId}`, {
      params: { start, end },
      responseType: "blob",
    }),
};

// ── Anomalies ─────────────────────────────────────────────────────────────────
export const anomalyApi = {
  list: (deviceId: number) =>
    api.get(`/anomaly-events/devices/${deviceId}/anomaly-events`),
  unresolved: (deviceId: number) =>
    api.get(`/anomaly-events/devices/${deviceId}/anomaly-events/unresolved`),
  resolve: (id: number) =>
    api.put(`/anomaly-events/${id}/resolve`, {}),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  listTenants: () => api.get("/admin/tenants"),
  createTenant: (data: {
    email: string;
    full_name: string;
    password: string;
    pad_name?: string;
    rate_per_kwh?: number;
    device_id?: number;
  }) => api.post("/admin/tenants", data),
  deleteTenant: (id: number) => api.delete(`/admin/tenants/${id}`),
};

// ── Stays ─────────────────────────────────────────────────────────────────────
export const staysApi = {
  list: () => api.get("/stays/"),
  getByPad: (padId: number) => api.get(`/stays/pad/${padId}`),
  get: (id: number) => api.get(`/stays/${id}`),
  checkIn: (data: {
    pad_id: number;
    tenant_id: number;
    billing_cycle: "daily" | "monthly";
    flat_rate_per_cycle?: number;
    notes?: string;
    check_in_at?: string;
  }) => api.post("/stays/", data),
  checkOut: (id: number, check_out_at?: string) =>
    api.put(`/stays/${id}/checkout`, { check_out_at }),
  delete: (id: number) => api.delete(`/stays/${id}`),
  generateBill: (id: number) => api.post(`/stays/${id}/generate-bill`, {}),
};

// ── Power Data ────────────────────────────────────────────────────────────────
export const powerApi = {
  latest: (deviceId: number) =>
    api.get(`/power-data/devices/${deviceId}/latest`),
  stats: (deviceId: number) =>
    api.get(`/power-data/devices/${deviceId}/stats`),
  todayEnergy: (deviceId: number) =>
    api.get(`/power-data/devices/${deviceId}/today-energy`),
};
