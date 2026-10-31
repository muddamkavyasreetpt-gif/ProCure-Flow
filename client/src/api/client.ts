import axios from 'axios';
import {
  RunDetailResponse,
  PurchaseRequest,
  Vendor,
  Approval,
  AuditLog,
  Department
} from '../types';

export type { RunDetailResponse };

const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Typed API helper functions
export async function apiGetRun(runId: string): Promise<RunDetailResponse> {
  const res = await api.get(`/runs/${runId}`);
  return res.data;
}

export async function apiGetRequests(): Promise<PurchaseRequest[]> {
  const res = await api.get('/requests');
  return res.data.requests;
}

export async function apiCreateRequest(data: {
  requestText: string;
  urgency: 'low' | 'normal' | 'high';
  justification?: string;
}): Promise<{ requestId: string; runId: string }> {
  const res = await api.post('/requests', data);
  return res.data;
}

export async function apiGetApprovals(): Promise<Approval[]> {
  const res = await api.get('/approvals');
  return res.data.approvals;
}

export async function apiDecideApproval(
  approvalId: string,
  decision: 'approved' | 'rejected',
  comment: string
): Promise<void> {
  await api.post(`/approvals/${approvalId}/decide`, { decision, comment });
}

export async function apiGetVendors(): Promise<Vendor[]> {
  const res = await api.get('/vendors');
  return res.data.vendors;
}

export async function apiGetAuditLogs(): Promise<{ chainValid: boolean; logs: AuditLog[] }> {
  const res = await api.get('/audit');
  return res.data;
}

export async function apiGetAnalytics(): Promise<any> {
  const res = await api.get('/analytics');
  return res.data;
}

export async function apiPreviewRequest(data: {
  requestText: string;
  justification?: string;
}): Promise<{
  category: string | null;
  primaryItem: { name: string; quantity: number } | null;
  estimatedCostRange: { min: number; max: number } | null;
  expectedRoute: 'auto' | 'manager' | 'finance' | 'blocked' | null;
  budgetAvailable: number;
  warnings: string[];
  disclaimer: string;
}> {
  const res = await api.post('/requests/preview', data);
  return res.data;
}

export async function apiGetDepartments(): Promise<Department[]> {
  const res = await api.get('/meta/departments');
  return res.data.departments;
}
