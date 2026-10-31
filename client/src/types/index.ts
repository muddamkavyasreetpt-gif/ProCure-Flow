export type RunStatus = 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'rejected';

export type UserRole = 'employee' | 'manager' | 'finance';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  departmentId: string;
}

export interface Department {
  id: string;
  name: string;
  budgetTotal?: number;
  totalAmount?: number;
  reservedAmount?: number;
  spentAmount?: number;
  available?: number;
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

export interface Vendor {
  id: string;
  name: string;
  approved: boolean;
  rating: number;
  risk_level: 'low' | 'medium' | 'high';
  payment_terms: string;
  contact_email: string;
  categories: string[];
  catalog?: VendorCatalogItem[];
}

export interface PurchaseRequest {
  id: string;
  requester_id: string;
  user_id?: string;
  department_id: string;
  department_name?: string;
  raw_text: string;
  request_text: string;
  urgency: 'low' | 'normal' | 'high';
  justification?: string | null;
  parsed?: any;
  estimated_total?: number | null;
  status: 'submitted' | 'processing' | 'awaiting_approval' | 'completed' | 'rejected' | 'failed';
  run_id?: string | null;
  latestRun?: AgentRun | null;
  created_at: string;
  updated_at?: string;
}

export interface PlanStep {
  id: string;
  agent: string;
  goal: string;
}

export interface AgentRun {
  id: string;
  request_id: string;
  status: RunStatus;
  plan: Array<PlanStep | string> | null;
  replan_count: number;
  replans?: number;
  state: Record<string, any>;
  final_decision?: string | null;
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
  agent: string;
  kind:
    | 'plan'
    | 'thought'
    | 'tool_call'
    | 'tool_result'
    | 'decision'
    | 'replan'
    | 'error'
    | 'summary'
    | 'human';
  title?: string;
  input: Record<string, any> | null;
  output: Record<string, any> | null;
  rationale?: string | null;
  confidence: number | null;
  duration_ms: number;
  error?: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  run_id: string;
  request_id: string;
  requested_by?: string | null;
  requester_name?: string;
  requester_email?: string;
  department_name?: string;
  required_role: 'manager' | 'finance';
  decided_by: string | null;
  reason: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  decision: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  decided_at: string | null;
  created_at: string;
  request?: PurchaseRequest | null;
  vendorPreview?: {
    vendorId: string;
    vendorName: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    total: number;
    leadTimeDays: number;
    riskLevel: string;
    expectedDelivery: string;
    confidence?: number;
  } | null;
  savings?: {
    selectedTotal: number;
    highestApprovedTotal: number;
    nextBestTotal: number;
    savingsVsHighest: number;
    savingsVsNextBest: number;
  } | null;
}

export interface LineItem {
  item_name?: string;
  description?: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  run_id: string;
  request_id: string;
  vendor_id: string;
  vendor_name?: string;
  line_items: LineItem[];
  total_amount: number;
  total?: number;
  expected_delivery?: string | null;
  status: string;
  created_at: string;
}

export interface AuditLog {
  id: string | number;
  run_id: string | null;
  actor_type: 'user' | 'agent' | 'system';
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, any>;
  prev_hash: string | null;
  hash: string;
  created_at: string;
}

export interface RunDetailResponse {
  run: AgentRun;
  request: PurchaseRequest;
  steps: AgentStep[];
  approvals: Approval[];
  purchaseOrder: PurchaseOrder | null;
  notifications?: any[];
  auditLogs: AuditLog[];
}
