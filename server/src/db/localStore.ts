import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const DEMO_PW_HASH = bcrypt.hashSync('Demo@1234', 12);

const INITIAL_BUDGETS = [
  { id: 'b1111111-1111-4111-8111-111111111111', department_id: '11111111-1111-4111-8111-111111111111', fiscal_year: 2026, total_amount: 4000000, reserved_amount: 0, spent_amount: 1200000 },
  { id: 'b2222222-2222-4222-8222-222222222222', department_id: '22222222-2222-4222-8222-222222222222', fiscal_year: 2026, total_amount: 2000000, reserved_amount: 0, spent_amount: 500000 },
  { id: 'b3333333-3333-4333-8333-333333333333', department_id: '33333333-3333-4333-8333-333333333333', fiscal_year: 2026, total_amount: 800000, reserved_amount: 0, spent_amount: 700000 },
  { id: 'b4444444-4444-4444-8444-444444444444', department_id: '44444444-4444-4444-8444-444444444444', fiscal_year: 2026, total_amount: 600000, reserved_amount: 0, spent_amount: 100000 },
  { id: 'b5555555-5555-4555-8555-555555555555', department_id: '55555555-5555-4555-8555-555555555555', fiscal_year: 2026, total_amount: 1000000, reserved_amount: 0, spent_amount: 200000 }
];

export class LocalDatabase {
  departments: any[] = [];
  budgets: any[] = [];
  policies: any[] = [];
  vendors: any[] = [];
  vendor_catalog: any[] = [];
  users: any[] = [];
  purchase_requests: any[] = [];
  agent_runs: any[] = [];
  agent_steps: any[] = [];
  approvals: any[] = [];
  purchase_orders: any[] = [];
  notifications: any[] = [];
  audit_logs: any[] = [];
  lastAuditHash: string = '';

  constructor() {
    this.init();
  }

  init() {
    const now = new Date().toISOString();
    this.departments = [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Engineering', created_at: now },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Design', created_at: now },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Marketing', created_at: now },
      { id: '44444444-4444-4444-8444-444444444444', name: 'HR', created_at: now },
      { id: '55555555-5555-4555-8555-555555555555', name: 'Operations', created_at: now }
    ];

    this.budgets = INITIAL_BUDGETS.map((b) => ({ ...b, updated_at: now }));

    this.policies = [
      { id: 'p1', category: 'IT Hardware', description: 'Laptops, monitors, peripherals, networking gear.', auto_approve_limit: 50000, manager_limit: 500000, min_quotes: 2, requires_justification_above: 100000, is_blocked: false },
      { id: 'p2', category: 'Software Licenses', description: 'SaaS and perpetual software licenses.', auto_approve_limit: 25000, manager_limit: 300000, min_quotes: 1, requires_justification_above: 100000, is_blocked: false },
      { id: 'p3', category: 'Office Supplies', description: 'Stationery, consumables, pantry items.', auto_approve_limit: 20000, manager_limit: 200000, min_quotes: 1, requires_justification_above: 100000, is_blocked: false },
      { id: 'p4', category: 'Furniture', description: 'Chairs, desks, storage.', auto_approve_limit: 30000, manager_limit: 400000, min_quotes: 2, requires_justification_above: 100000, is_blocked: false },
      { id: 'p5', category: 'Marketing Services', description: 'Agencies, campaigns, creative services.', auto_approve_limit: 10000, manager_limit: 250000, min_quotes: 2, requires_justification_above: 50000, is_blocked: false },
      { id: 'p6', category: 'Travel & Events', description: 'Event bookings, group travel, venues.', auto_approve_limit: 15000, manager_limit: 200000, min_quotes: 1, requires_justification_above: 50000, is_blocked: false },
      { id: 'p7', category: 'Prohibited Items', description: 'Gift cards, cash equivalents, cryptocurrency, personal items. Never purchasable.', auto_approve_limit: 0, manager_limit: 0, min_quotes: 1, requires_justification_above: 0, is_blocked: true }
    ];

    this.vendors = [
      { id: 'a1111111-1111-4111-8111-111111111101', name: 'TechNova Systems', approved: true, rating: 4.6, risk_level: 'low', payment_terms: 'Net 30', contact_email: 'sales@technova.example', categories: ['IT Hardware'] },
      { id: 'a1111111-1111-4111-8111-111111111102', name: 'Prime Infotech', approved: true, rating: 4.4, risk_level: 'low', payment_terms: 'Net 45', contact_email: 'orders@primeinfotech.example', categories: ['IT Hardware'] },
      { id: 'a1111111-1111-4111-8111-111111111103', name: 'Globex Distribution', approved: true, rating: 3.6, risk_level: 'medium', payment_terms: 'Net 15', contact_email: 'bulk@globex.example', categories: ['IT Hardware', 'Office Supplies'] },
      { id: 'a1111111-1111-4111-8111-111111111104', name: 'OfficeMart India', approved: true, rating: 4.5, risk_level: 'low', payment_terms: 'Net 30', contact_email: 'care@officemart.example', categories: ['Furniture', 'Office Supplies'] },
      { id: 'a1111111-1111-4111-8111-111111111105', name: 'WorkSpace Interiors', approved: true, rating: 4.2, risk_level: 'low', payment_terms: 'Net 30', contact_email: 'sales@workspace.example', categories: ['Furniture'] },
      { id: 'a1111111-1111-4111-8111-111111111106', name: 'SoftSuite Reseller', approved: true, rating: 4.3, risk_level: 'low', payment_terms: 'Net 30', contact_email: 'licenses@softsuite.example', categories: ['Software Licenses'] },
      { id: 'a1111111-1111-4111-8111-111111111107', name: 'BrightWave Creative', approved: true, rating: 4.4, risk_level: 'low', payment_terms: 'Net 30', contact_email: 'hello@brightwave.example', categories: ['Marketing Services'] },
      { id: 'a1111111-1111-4111-8111-111111111108', name: 'PixelCraft Agency', approved: true, rating: 4.2, risk_level: 'low', payment_terms: 'Net 30', contact_email: 'studio@pixelcraft.example', categories: ['Marketing Services'] },
      { id: 'a1111111-1111-4111-8111-111111111109', name: 'EventSphere India', approved: true, rating: 4.5, risk_level: 'low', payment_terms: 'Net 30', contact_email: 'bookings@eventsphere.example', categories: ['Travel & Events'] },
      { id: 'a1111111-1111-4111-8111-111111111110', name: 'QuickDeals Traders', approved: false, rating: 4.1, risk_level: 'high', payment_terms: 'Advance', contact_email: 'hello@quickdeals.example', categories: ['IT Hardware'] }
    ];

    this.vendor_catalog = [
      { id: 'c1', vendor_id: 'a1111111-1111-4111-8111-111111111101', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB RAM / 512GB SSD / i7', unit_price: 98000, stock_qty: 4, lead_time_days: 5 },
      { id: 'c2', vendor_id: 'a1111111-1111-4111-8111-111111111101', category: 'IT Hardware', item_name: 'Monitor 27" 4K', spec: 'IPS, USB-C', unit_price: 32000, stock_qty: 60, lead_time_days: 4 },
      { id: 'c3', vendor_id: 'a1111111-1111-4111-8111-111111111102', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB RAM / 512GB SSD / i7', unit_price: 104000, stock_qty: 50, lead_time_days: 7 },
      { id: 'c4', vendor_id: 'a1111111-1111-4111-8111-111111111102', category: 'IT Hardware', item_name: 'Monitor 27" 4K', spec: 'IPS, USB-C', unit_price: 33500, stock_qty: 80, lead_time_days: 6 },
      { id: 'c5', vendor_id: 'a1111111-1111-4111-8111-111111111103', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB RAM / 512GB SSD / i7', unit_price: 95000, stock_qty: 100, lead_time_days: 21 },
      { id: 'c6', vendor_id: 'a1111111-1111-4111-8111-111111111103', category: 'Office Supplies', item_name: 'A4 Paper Ream (500)', spec: '75 GSM', unit_price: 280, stock_qty: 5000, lead_time_days: 10 },
      { id: 'c7', vendor_id: 'a1111111-1111-4111-8111-111111111110', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB RAM / 512GB SSD / i7', unit_price: 85000, stock_qty: 500, lead_time_days: 3 },
      { id: 'c8', vendor_id: 'a1111111-1111-4111-8111-111111111104', category: 'Furniture', item_name: 'Ergonomic Office Chair', spec: 'Mesh back, lumbar support', unit_price: 8500, stock_qty: 200, lead_time_days: 9 },
      { id: 'c9', vendor_id: 'a1111111-1111-4111-8111-111111111104', category: 'Furniture', item_name: 'Standing Desk', spec: 'Electric, 140cm', unit_price: 24000, stock_qty: 30, lead_time_days: 12 },
      { id: 'c10', vendor_id: 'a1111111-1111-4111-8111-111111111104', category: 'Office Supplies', item_name: 'A4 Paper Ream (500)', spec: '75 GSM', unit_price: 310, stock_qty: 8000, lead_time_days: 3 },
      { id: 'c11', vendor_id: 'a1111111-1111-4111-8111-111111111105', category: 'Furniture', item_name: 'Ergonomic Office Chair', spec: 'Mesh back, lumbar support', unit_price: 9200, stock_qty: 150, lead_time_days: 6 },
      { id: 'c12', vendor_id: 'a1111111-1111-4111-8111-111111111105', category: 'Furniture', item_name: 'Standing Desk', spec: 'Electric, 140cm', unit_price: 25500, stock_qty: 40, lead_time_days: 10 },
      { id: 'c13', vendor_id: 'a1111111-1111-4111-8111-111111111106', category: 'Software Licenses', item_name: 'Project Management Tool (annual seat)', spec: 'Team plan', unit_price: 4800, stock_qty: 1000, lead_time_days: 1 },
      { id: 'c14', vendor_id: 'a1111111-1111-4111-8111-111111111106', category: 'Software Licenses', item_name: 'Design Suite (annual seat)', spec: 'Pro plan', unit_price: 7200, stock_qty: 1000, lead_time_days: 1 },
      { id: 'c15', vendor_id: 'a1111111-1111-4111-8111-111111111107', category: 'Marketing Services', item_name: 'Social Media Campaign (monthly)', spec: 'Strategy + 12 creatives', unit_price: 45000, stock_qty: 20, lead_time_days: 5 },
      { id: 'c16', vendor_id: 'a1111111-1111-4111-8111-111111111107', category: 'Marketing Services', item_name: 'Brand Video Production', spec: '60-second explainer', unit_price: 120000, stock_qty: 5, lead_time_days: 14 },
      { id: 'c17', vendor_id: 'a1111111-1111-4111-8111-111111111108', category: 'Marketing Services', item_name: 'Social Media Campaign (monthly)', spec: 'Strategy + 12 creatives', unit_price: 42000, stock_qty: 20, lead_time_days: 7 },
      { id: 'c18', vendor_id: 'a1111111-1111-4111-8111-111111111108', category: 'Marketing Services', item_name: 'Brand Video Production', spec: '60-second explainer', unit_price: 135000, stock_qty: 5, lead_time_days: 12 },
      { id: 'c19', vendor_id: 'a1111111-1111-4111-8111-111111111109', category: 'Travel & Events', item_name: 'Conference Venue Booking (per day)', spec: 'Up to 150 guests', unit_price: 60000, stock_qty: 10, lead_time_days: 7 },
      { id: 'c20', vendor_id: 'a1111111-1111-4111-8111-111111111109', category: 'Travel & Events', item_name: 'Group Travel Package (per person)', spec: 'Return flight + hotel', unit_price: 18000, stock_qty: 100, lead_time_days: 10 }
    ];

    this.users = [
      { id: 'd1111111-1111-4111-8111-111111111101', email: 'employee@procureflow.demo', password_hash: DEMO_PW_HASH, full_name: 'Priya Sharma (Design Employee)', role: 'employee', department_id: '22222222-2222-4222-8222-222222222222', created_at: now },
      { id: 'd1111111-1111-4111-8111-111111111102', email: 'manager@procureflow.demo', password_hash: DEMO_PW_HASH, full_name: 'Rohan Mehta (Design Manager)', role: 'manager', department_id: '22222222-2222-4222-8222-222222222222', created_at: now },
      { id: 'd1111111-1111-4111-8111-111111111103', email: 'finance@procureflow.demo', password_hash: DEMO_PW_HASH, full_name: 'Ananya Iyer (Finance Controller)', role: 'finance', department_id: '55555555-5555-4555-8555-555555555555', created_at: now },
      { id: 'd1111111-1111-4111-8111-111111111104', email: 'eng.employee@procureflow.demo', password_hash: DEMO_PW_HASH, full_name: 'Vikram Rao (Engineering Employee)', role: 'employee', department_id: '11111111-1111-4111-8111-111111111111', created_at: now },
      { id: 'd1111111-1111-4111-8111-111111111105', email: 'mkt.employee@procureflow.demo', password_hash: DEMO_PW_HASH, full_name: 'Neha Kapoor (Marketing Employee)', role: 'employee', department_id: '33333333-3333-4333-8333-333333333333', created_at: now }
    ];

    this.purchase_requests = [];
    this.agent_runs = [];
    this.agent_steps = [];
    this.approvals = [];
    this.purchase_orders = [];
    this.notifications = [];
    this.audit_logs = [];
    this.lastAuditHash = '';
  }

  // Resets demo workflow tables and budgets while NEVER touching audit_logs (immutable)
  resetDemo() {
    const now = new Date().toISOString();
    this.budgets = INITIAL_BUDGETS.map((b) => ({ ...b, updated_at: now }));
    this.purchase_requests = [];
    this.agent_runs = [];
    this.agent_steps = [];
    this.approvals = [];
    this.purchase_orders = [];
    this.notifications = [];
    // audit_logs and lastAuditHash are intentionally preserved (append-only)
  }

  appendAuditLog(args: {
    run_id?: string | null;
    actor_type: string;
    actor: string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    details: any;
  }) {
    const prev = this.lastAuditHash;
    const ts = new Date().toISOString();
    const details = args.details ?? {};
    const payload = (prev || '') + JSON.stringify({
      run_id: args.run_id ?? null,
      actor_type: args.actor_type,
      actor: args.actor,
      action: args.action,
      entity_type: args.entity_type,
      entity_id: args.entity_id ?? null,
      details,
      created_at: ts
    });

    const hash = crypto.createHash('sha256').update(payload).digest('hex');

    const entry = {
      id: this.audit_logs.length + 1,
      run_id: args.run_id ?? null,
      actor_type: args.actor_type,
      actor: args.actor,
      action: args.action,
      entity_type: args.entity_type,
      entity_id: args.entity_id ?? null,
      details,
      prev_hash: prev || null,
      hash,
      created_at: ts
    };

    this.lastAuditHash = hash;
    this.audit_logs.push(entry);
    return entry;
  }

  verifyAuditChain() {
    let prev: string | null = null;
    let checked = 0;
    for (const r of this.audit_logs) {
      checked++;
      const expected = crypto.createHash('sha256').update(
        (prev || '') + JSON.stringify({
          run_id: r.run_id ?? null,
          actor_type: r.actor_type,
          actor: r.actor,
          action: r.action,
          entity_type: r.entity_type,
          entity_id: r.entity_id ?? null,
          details: r.details ?? {},
          created_at: r.created_at
        })
      ).digest('hex');

      if (r.prev_hash !== prev || r.hash !== expected) {
        return { valid: false, broken_at: r.id, checked };
      }
      prev = r.hash;
    }
    return { valid: true, broken_at: null, checked };
  }

  reserveBudget(departmentId: string, fiscalYear: number, amount: number): boolean {
    if (amount <= 0) return false;
    const b = this.budgets.find((x) => x.department_id === departmentId && x.fiscal_year === fiscalYear);
    if (!b) return false;
    if (Number(b.reserved_amount) + Number(b.spent_amount) + amount > Number(b.total_amount)) return false;
    b.reserved_amount = Number(b.reserved_amount) + amount;
    b.updated_at = new Date().toISOString();
    return true;
  }

  releaseBudget(departmentId: string, fiscalYear: number, amount: number): boolean {
    const b = this.budgets.find((x) => x.department_id === departmentId && x.fiscal_year === fiscalYear);
    if (!b) return false;
    b.reserved_amount = Math.max(0, Number(b.reserved_amount) - amount);
    b.updated_at = new Date().toISOString();
    return true;
  }

  commitBudgetSpend(departmentId: string, fiscalYear: number, amount: number): boolean {
    const b = this.budgets.find((x) => x.department_id === departmentId && x.fiscal_year === fiscalYear);
    if (!b || Number(b.reserved_amount) < amount) return false;
    b.reserved_amount = Number(b.reserved_amount) - amount;
    b.spent_amount = Number(b.spent_amount) + amount;
    b.updated_at = new Date().toISOString();
    return true;
  }
}

export const localDb = new LocalDatabase();

export class LocalQueryBuilder {
  private table: string;
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any = null;
  private filters: Array<(item: any) => boolean> = [];
  private orderField?: string;
  private ascending: boolean = true;
  private rangeStart?: number;
  private rangeEnd?: number;
  private limitCount?: number;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private wantCount: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(_fields: string = '*', options?: { count?: 'exact' }) {
    if (this.op === 'select') {
      this.op = 'select';
    }
    if (options?.count === 'exact') {
      this.wantCount = true;
    }
    return this;
  }

  insert(data: any | any[]) {
    this.op = 'insert';
    this.payload = data;
    return this;
  }

  update(updates: any) {
    this.op = 'update';
    this.payload = updates;
    return this;
  }

  upsert(data: any | any[], options?: { onConflict?: string }) {
    this.op = 'insert';
    this.payload = { __upsert: true, data, onConflict: options?.onConflict };
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((item) => item[column] === value);
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push((item) => item[column] !== value);
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push((item) => item[column] > value);
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push((item) => item[column] >= value);
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push((item) => values.includes(item[column]));
    return this;
  }

  contains(column: string, values: any[]) {
    this.filters.push((item) => Array.isArray(item[column]) && values.every((v) => item[column].includes(v)));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderField = column;
    this.ascending = options?.ascending !== false;
    return this;
  }

  range(from: number, to: number) {
    this.rangeStart = from;
    this.rangeEnd = to;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  private executeSync(): { data: any; error: any; count?: number | null } {
    if (this.table === 'audit_logs' && (this.op === 'update' || this.op === 'delete')) {
      return { data: null, error: { message: 'audit_logs is append-only' } };
    }

    const collection: any[] | undefined = (localDb as any)[this.table];
    if (!collection) {
      return { data: null, error: { message: `Table ${this.table} not found in local store.` } };
    }

    if (this.op === 'insert') {
      const isUpsert = this.payload && this.payload.__upsert;
      const rawData = isUpsert ? this.payload.data : this.payload;
      const conflictCol = isUpsert && this.payload.onConflict ? String(this.payload.onConflict).split(',')[0].trim() : null;
      const items = Array.isArray(rawData) ? rawData : [rawData];
      const created: any[] = [];

      for (const item of items) {
        if (conflictCol && item[conflictCol] !== undefined) {
          const existingIdx = collection.findIndex((row) =>
            String(row[conflictCol]).toLowerCase() === String(item[conflictCol]).toLowerCase()
          );
          if (existingIdx >= 0) {
            collection[existingIdx] = { ...collection[existingIdx], ...item };
            created.push(collection[existingIdx]);
            continue;
          }
        }
        const newItem = {
          id: item.id || crypto.randomUUID(),
          created_at: item.created_at || new Date().toISOString(),
          ...item
        };
        collection.push(newItem);
        created.push(newItem);
      }

      if (this.isSingle || this.isMaybeSingle) {
        return { data: created[0] ?? null, error: null };
      }
      return { data: Array.isArray(rawData) ? created : created, error: null };
    }

    if (this.op === 'update') {
      const updatedItems: any[] = [];
      for (let i = 0; i < collection.length; i++) {
        if (this.filters.every((f) => f(collection[i]))) {
          collection[i] = { ...collection[i], ...this.payload };
          updatedItems.push(collection[i]);
        }
      }
      if (this.isSingle) {
        if (updatedItems.length === 0) {
          return { data: null, error: { message: 'Row not found or condition not met' } };
        }
        return { data: updatedItems[0], error: null };
      }
      if (this.isMaybeSingle) {
        return { data: updatedItems[0] ?? null, error: null };
      }
      return { data: updatedItems, error: null };
    }

    if (this.op === 'delete') {
      const removed: any[] = [];
      const kept: any[] = [];
      for (const item of collection) {
        if (this.filters.every((f) => f(item))) {
          removed.push(item);
        } else {
          kept.push(item);
        }
      }
      (localDb as any)[this.table] = kept;
      return { data: removed, count: removed.length, error: null };
    }

    // select
    let results = [...collection];
    for (const filter of this.filters) {
      results = results.filter(filter);
    }

    const totalCount = results.length;

    if (this.orderField) {
      const field = this.orderField;
      const asc = this.ascending;
      results.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
        return 0;
      });
    }

    if (this.rangeStart !== undefined && this.rangeEnd !== undefined) {
      results = results.slice(this.rangeStart, this.rangeEnd + 1);
    } else if (this.limitCount !== undefined) {
      results = results.slice(0, this.limitCount);
    }

    if (this.isSingle) {
      const item = results[0] ?? null;
      return {
        data: item,
        error: item ? null : { message: 'Row not found' },
        count: this.wantCount ? totalCount : undefined
      };
    }

    if (this.isMaybeSingle) {
      return {
        data: results[0] ?? null,
        error: null,
        count: this.wantCount ? totalCount : undefined
      };
    }

    return {
      data: results,
      error: null,
      count: this.wantCount ? totalCount : undefined
    };
  }

  then<TResult1 = { data: any; error: any; count?: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const res = this.executeSync();
      return Promise.resolve(res).then(onfulfilled, onrejected);
    } catch (err) {
      return Promise.reject(err).then(onfulfilled, onrejected);
    }
  }
}
