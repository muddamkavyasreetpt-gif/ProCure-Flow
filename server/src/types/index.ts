// Master Prompt TypeScript definitions for server

export type UserRole = 'employee' | 'manager' | 'finance';

export interface User {
  id: string;
  email: string;
  password_hash?: string;
  full_name: string;
  role: UserRole;
  department_id: string;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  created_at?: string;
}

export interface Budget {
  id: string;
  department_id: string;
  fiscal_year: number;
  total_amount: number;
  reserved_amount: number;
  spent_amount: number;
  updated_at: string;
}

export interface Policy {
  id: string;
  category: string;
  description: string;
  auto_approve_limit: number;
  manager_limit: number;
  min_quotes: number;
  requires_justification_above: number;
  is_blocked: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  approved: boolean;
  rating: number;
  risk_level: 'low' | 'medium' | 'high';
  payment_terms: string;
  contact_email: string;
  categories: string[];
}

export interface VendorCatalogItem {
  id: string;
  vendor_id: string;
  category: string;
  item_name: string;
  spec: string;
  unit_price: number;
  stock_qty: number;
  lead_time_days: number;
}

export interface PurchaseRequest {
  id: string;
  requester_id: string;
  department_id: string;
  raw_text: string;
  urgency: 'low' | 'normal' | 'high';
  justification?: string | null;
  parsed?: any;
  estimated_total?: number | null;
  status: 'submitted' | 'processing' | 'awaiting_approval' | 'completed' | 'rejected' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface AgentRun {
  id: string;
  request_id: string;
  status: 'running' | 'awaiting_approval' | 'completed' | 'rejected' | 'failed';
  plan: any[] | null;
  replan_count: number;
  state: Record<string, unknown>;
  final_decision: string | null;
  summary: string | null;
  active_ms: number;
  time_saved_minutes: number;
  started_at: string;
  finished_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AgentStep {
  id: string;
  run_id: string;
  seq: number;
  step_index?: number;
  agent: 'orchestrator' | 'policy' | 'budget' | 'vendor' | 'approval' | 'execution' | 'auditor' | 'human' | 'system';
  kind: 'plan' | 'thought' | 'tool_call' | 'tool_result' | 'decision' | 'replan' | 'error' | 'summary' | 'human';
  title: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  rationale?: string | null;
  confidence?: number | null;
  duration_ms?: number | null;
  created_at: string;
}

export interface Approval {
  id: string;
  run_id: string;
  request_id: string;
  required_role: 'manager' | 'finance';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decided_by?: string | null;
  comment?: string | null;
  created_at: string;
  decided_at?: string | null;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  request_id: string;
  run_id: string;
  vendor_id: string;
  vendor_name?: string;
  line_items: Array<{
    item_name?: string;
    description?: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  total_amount: number;
  expected_delivery?: string | null;
  status: string;
  created_at: string;
}

export interface AuditLog {
  id: number | string;
  run_id?: string | null;
  actor_type: 'user' | 'agent' | 'system';
  actor: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details: Record<string, unknown>;
  prev_hash?: string | null;
  hash: string;
  created_at: string;
}

export interface Notification {
  id: string;
  run_id?: string | null;
  recipient_email: string;
  subject: string;
  body: string;
  created_at: string;
}

export interface RunContext {
  runId: string;
  requestId: string;
  requesterId: string;
  requesterEmail: string;
  departmentId: string;
  departmentName?: string;
  rawText: string;
  urgency: 'low' | 'normal' | 'high';
  justification?: string;
  parsed?: {
    category: string;
    items: Array<{ name: string; quantity: number; specHint: string }>;
    statedBudget: number | null;
    neededByDays: number | null;
    summary: string;
  };
  plan?: any[];
  policy?: any;
  budgetStatus?: any;
  reservedAmount?: number;
  quotes?: any[];
  selectedQuote?: any;
  approvalRequired?: boolean;
  approvalRoute?: 'auto' | 'manager' | 'finance';
  approvalId?: string;
  purchaseOrder?: any;
  summary?: string;
  replans?: number;
  excludeVendorIds?: string[];
  activeMs?: number;
}
