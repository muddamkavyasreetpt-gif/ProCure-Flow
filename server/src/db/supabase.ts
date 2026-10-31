import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from '../config/env';
import { LocalQueryBuilder, localDb } from './localStore';

// Polyfill native WebSocket for Node versions without global.WebSocket (e.g. Node 20 on Render)
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

const isProduction = env.NODE_ENV === 'production';
const hasConfiguredSupabase =
  Boolean(env.SUPABASE_URL) &&
  !env.SUPABASE_URL.includes('your-supabase-project') &&
  !env.SUPABASE_URL.includes('your-project-ref') &&
  !env.SUPABASE_URL.includes('placeholder');

export const isLocalDbForbidden = isProduction || hasConfiguredSupabase;

const hasRealCredentials =
  hasConfiguredSupabase &&
  Boolean(env.SUPABASE_SERVICE_ROLE_KEY) &&
  env.SUPABASE_SERVICE_ROLE_KEY !== 'placeholder' &&
  !env.SUPABASE_SERVICE_ROLE_KEY.includes('your_supabase_service_role_key') &&
  !env.SUPABASE_SERVICE_ROLE_KEY.includes('your_service_role_key');

let realClient: SupabaseClient | null = null;
let forceLocalFallback = !hasRealCredentials && !isLocalDbForbidden;

if (isLocalDbForbidden && !hasRealCredentials) {
  throw new Error(
    `FATAL: Invalid Supabase configuration. In-memory localStore is strictly disabled when NODE_ENV=production or when SUPABASE_URL is set.`
  );
}

if (hasRealCredentials) {
  realClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

class ResilientQueryProxy {
  private table: string;
  private ops: Array<{ method: string; args: any[] }> = [];

  constructor(table: string) {
    this.table = table;
  }

  private record(method: string, ...args: any[]) {
    this.ops.push({ method, args });
    return this;
  }

  select(fields: string = '*', options?: { count?: 'exact' }) {
    return this.record('select', fields, options);
  }
  insert(data: any) {
    return this.record('insert', data);
  }
  update(updates: any) {
    return this.record('update', updates);
  }
  upsert(data: any, options?: { onConflict?: string }) {
    return this.record('upsert', data, options);
  }
  delete() {
    return this.record('delete');
  }
  eq(column: string, value: any) {
    return this.record('eq', column, value);
  }
  neq(column: string, value: any) {
    return this.record('neq', column, value);
  }
  gt(column: string, value: any) {
    return this.record('gt', column, value);
  }
  gte(column: string, value: any) {
    return this.record('gte', column, value);
  }
  in(column: string, values: any[]) {
    return this.record('in', column, values);
  }
  contains(column: string, values: any[]) {
    return this.record('contains', column, values);
  }
  order(column: string, options?: { ascending?: boolean }) {
    return this.record('order', column, options);
  }
  range(from: number, to: number) {
    return this.record('range', from, to);
  }
  limit(count: number) {
    return this.record('limit', count);
  }
  single() {
    return this.record('single');
  }
  maybeSingle() {
    return this.record('maybeSingle');
  }

  private runLocal(): Promise<{ data: any; error: any; count?: number | null }> {
    if (isLocalDbForbidden) {
      throw new Error(
        `FATAL: In-memory localStore cannot be used when NODE_ENV=production or when SUPABASE_URL is set.`
      );
    }
    let builder: any = new LocalQueryBuilder(this.table);
    for (const op of this.ops) {
      builder = builder[op.method](...op.args);
    }
    return Promise.resolve(builder);
  }

  private async execute(): Promise<{ data: any; error: any; count?: number | null }> {
    if (isLocalDbForbidden) {
      if (!realClient) {
        throw new Error(`FATAL: Supabase client is not initialized, and localStore is forbidden.`);
      }
      let query: any = realClient.from(this.table);
      for (const op of this.ops) {
        query = query[op.method](...op.args);
      }
      const res = await query;
      if (res.error) {
        throw new Error(
          `Supabase query failed on "${this.table}": [${res.error.code}] ${res.error.message}`
        );
      }
      return res;
    }

    if (forceLocalFallback || !realClient) {
      return this.runLocal();
    }

    try {
      let query: any = realClient.from(this.table);
      for (const op of this.ops) {
        query = query[op.method](...op.args);
      }
      const res = await query;
      if (
        res.error &&
        (String(res.error.message || '').includes('fetch failed') ||
          String(res.error.message || '').includes('ENOTFOUND') ||
          String(res.error.message || '').includes('ECONNREFUSED') ||
          String(res.error.message || '').includes('Could not find the') ||
          String(res.error.message || '').includes('relation') ||
          String(res.error.message || '').includes('column') ||
          String(res.error.code || '') === '42P01' ||
          String(res.error.code || '') === '42703' ||
          String(res.error.code || '') === 'PGRST204' ||
          String(res.error.code || '') === 'PGRST205')
      ) {
        forceLocalFallback = true;
        return this.runLocal();
      }
      return res;
    } catch {
      forceLocalFallback = true;
      return this.runLocal();
    }
  }

  then<TResult1 = { data: any; error: any; count?: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const supabase = {
  from(table: string) {
    return new ResilientQueryProxy(table);
  },
  async rpc(fn: string, args: Record<string, any> = {}): Promise<{ data: any; error: any }> {
    if (isLocalDbForbidden) {
      if (!realClient) {
        throw new Error(`FATAL: Supabase client is not initialized, and localStore is forbidden.`);
      }
      const res = await realClient.rpc(fn, args);
      if (res.error) {
        throw new Error(`Supabase RPC "${fn}" failed: [${res.error.code}] ${res.error.message}`);
      }
      return res;
    }

    if (!forceLocalFallback && realClient) {
      try {
        const res = await realClient.rpc(fn, args);
        if (!res.error) {
          return res;
        }
        const msg = String(res.error.message || '');
        if (
          msg.includes('fetch failed') ||
          msg.includes('Could not find the function') ||
          msg.includes('relation') ||
          res.error.code === 'PGRST202'
        ) {
          forceLocalFallback = true;
        } else {
          return res;
        }
      } catch {
        forceLocalFallback = true;
      }
    }

    switch (fn) {
      case 'append_audit_log': {
        const row = localDb.appendAuditLog({
          run_id: args.p_run_id ?? null,
          actor_type: args.p_actor_type,
          actor: args.p_actor,
          action: args.p_action,
          entity_type: args.p_entity_type,
          entity_id: args.p_entity_id ?? null,
          details: args.p_details ?? {}
        });
        return { data: row, error: null };
      }
      case 'verify_audit_chain': {
        const result = localDb.verifyAuditChain();
        return { data: [result], error: null };
      }
      case 'reserve_budget': {
        const ok = localDb.reserveBudget(args.p_department_id, Number(args.p_fiscal_year), Number(args.p_amount));
        return { data: ok, error: null };
      }
      case 'release_budget': {
        const ok = localDb.releaseBudget(args.p_department_id, Number(args.p_fiscal_year), Number(args.p_amount));
        return { data: ok, error: null };
      }
      case 'commit_budget_spend': {
        const ok = localDb.commitBudgetSpend(args.p_department_id, Number(args.p_fiscal_year), Number(args.p_amount));
        return { data: ok, error: null };
      }
      default:
        return { data: null, error: new Error(`Unknown RPC function: ${fn}`) };
    }
  }
};

// Typed RPC wrappers
export async function rpcAppendAuditLog(params: {
  runId?: string | null;
  actorType: 'user' | 'agent' | 'system';
  actor: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  return supabase.rpc('append_audit_log', {
    p_run_id: params.runId ?? null,
    p_actor_type: params.actorType,
    p_actor: params.actor,
    p_action: params.action,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId ?? null,
    p_details: params.details ?? {}
  });
}

export async function rpcVerifyAuditChain(): Promise<{ valid: boolean; broken_at: number | null; checked: number }> {
  const { data, error } = await supabase.rpc('verify_audit_chain');
  if (error || !data) {
    return { valid: true, broken_at: null, checked: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    valid: Boolean(row?.valid ?? true),
    broken_at: row?.broken_at ? Number(row.broken_at) : null,
    checked: Number(row?.checked ?? 0)
  };
}

export async function rpcReserveBudget(departmentId: string, amount: number, fiscalYear = 2026): Promise<boolean> {
  const { data, error } = await supabase.rpc('reserve_budget', {
    p_department_id: departmentId,
    p_fiscal_year: fiscalYear,
    p_amount: amount
  });
  if (error) return false;
  return Boolean(data);
}

export async function rpcReleaseBudget(departmentId: string, amount: number, fiscalYear = 2026): Promise<boolean> {
  const { data, error } = await supabase.rpc('release_budget', {
    p_department_id: departmentId,
    p_fiscal_year: fiscalYear,
    p_amount: amount
  });
  if (error) return false;
  return Boolean(data);
}

export async function rpcCommitBudgetSpend(departmentId: string, amount: number, fiscalYear = 2026): Promise<boolean> {
  const { data, error } = await supabase.rpc('commit_budget_spend', {
    p_department_id: departmentId,
    p_fiscal_year: fiscalYear,
    p_amount: amount
  });
  if (error) return false;
  return Boolean(data);
}
