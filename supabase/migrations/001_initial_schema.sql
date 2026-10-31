-- =====================================================================
-- ProcureFlow: 001_initial_schema.sql
-- Master Prompt Section 10 Specification
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

-- ---------- Core reference tables ----------
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text not null,
  role text not null default 'employee' check (role in ('employee','manager','finance')),
  department_id uuid references departments(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists users_email_lower_idx on users (lower(email));

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  fiscal_year int not null,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  reserved_amount numeric(14,2) not null default 0 check (reserved_amount >= 0),
  spent_amount numeric(14,2) not null default 0 check (spent_amount >= 0),
  updated_at timestamptz not null default now(),
  unique (department_id, fiscal_year),
  check (reserved_amount + spent_amount <= total_amount)
);

create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  description text not null,
  auto_approve_limit numeric(14,2) not null default 0,
  manager_limit numeric(14,2) not null default 0,
  min_quotes int not null default 1,
  requires_justification_above numeric(14,2) not null default 100000,
  is_blocked boolean not null default false
);

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  approved boolean not null default true,
  rating numeric(2,1) not null check (rating between 0 and 5),
  risk_level text not null default 'low' check (risk_level in ('low','medium','high')),
  payment_terms text not null default 'Net 30',
  contact_email text not null,
  categories text[] not null default '{}'
);

create table if not exists vendor_catalog (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  category text not null,
  item_name text not null,
  spec text not null default '',
  unit_price numeric(12,2) not null check (unit_price >= 0),
  stock_qty int not null default 0 check (stock_qty >= 0),
  lead_time_days int not null default 7 check (lead_time_days >= 0),
  unique (vendor_id, item_name)
);

-- ---------- Workflow tables ----------
create table if not exists purchase_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references users(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  raw_text text not null,
  urgency text not null default 'normal' check (urgency in ('low','normal','high')),
  justification text,
  parsed jsonb,
  estimated_total numeric(14,2),
  status text not null default 'submitted'
    check (status in ('submitted','processing','awaiting_approval','completed','rejected','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references purchase_requests(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running','awaiting_approval','completed','rejected','failed')),
  plan jsonb,
  replan_count int not null default 0,
  state jsonb not null default '{}'::jsonb,   -- persisted orchestrator state used to resume after approval
  final_decision text,
  summary text,
  active_ms int not null default 0,            -- agent working time, excludes human wait
  time_saved_minutes int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  seq int not null,
  agent text not null check (agent in ('orchestrator','policy','budget','vendor','approval','execution','auditor','human','system')),
  kind text not null check (kind in ('plan','thought','tool_call','tool_result','decision','replan','error','summary','human')),
  title text not null,
  input jsonb,
  output jsonb,
  rationale text,
  confidence numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  duration_ms int,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  request_id uuid not null references purchase_requests(id) on delete cascade,
  required_role text not null check (required_role in ('manager','finance')),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references users(id),
  comment text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  request_id uuid not null references purchase_requests(id) on delete cascade,
  run_id uuid not null references agent_runs(id) on delete cascade,
  vendor_id uuid not null references vendors(id),
  line_items jsonb not null,
  total_amount numeric(14,2) not null,
  expected_delivery date,
  status text not null default 'issued',
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- Immutable, hash-chained audit log ----------
create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  run_id uuid,
  actor_type text not null check (actor_type in ('user','agent','system')),
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  prev_hash text,
  hash text not null,
  created_at timestamptz not null default now()
);

create or replace function prevent_audit_mutation() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

drop trigger if exists trg_audit_no_update on audit_logs;
create trigger trg_audit_no_update before update or delete on audit_logs
  for each row execute function prevent_audit_mutation();

drop trigger if exists trg_audit_no_truncate on audit_logs;
create trigger trg_audit_no_truncate before truncate on audit_logs
  for each statement execute function prevent_audit_mutation();

-- Append to the chain. The advisory lock serialises concurrent appends so the chain never forks.
-- The hash is computed here (not in Node) so jsonb key order and timestamp formatting can never cause a mismatch.
create or replace function append_audit_log(
  p_run_id uuid, p_actor_type text, p_actor text, p_action text,
  p_entity_type text, p_entity_id text, p_details jsonb
) returns audit_logs
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_prev text;
  v_ts timestamptz := clock_timestamp();
  v_ts_text text := to_char(v_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_hash text;
  v_row audit_logs;
begin
  perform pg_advisory_xact_lock(727001);
  select hash into v_prev from audit_logs order by id desc limit 1;
  v_hash := encode(digest(coalesce(v_prev, '') || jsonb_build_object(
    'run_id', p_run_id, 'actor_type', p_actor_type, 'actor', p_actor, 'action', p_action,
    'entity_type', p_entity_type, 'entity_id', p_entity_id, 'details', v_details,
    'created_at', v_ts_text)::text, 'sha256'), 'hex');
  insert into audit_logs (run_id, actor_type, actor, action, entity_type, entity_id, details, prev_hash, hash, created_at)
  values (p_run_id, p_actor_type, p_actor, p_action, p_entity_type, p_entity_id, v_details, v_prev, v_hash, v_ts)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function verify_audit_chain()
returns table (valid boolean, broken_at bigint, checked bigint)
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_prev text := null;
  v_count bigint := 0;
  v_expected text;
begin
  for r in select * from audit_logs order by id loop
    v_count := v_count + 1;
    v_expected := encode(digest(coalesce(v_prev, '') || jsonb_build_object(
      'run_id', r.run_id, 'actor_type', r.actor_type, 'actor', r.actor, 'action', r.action,
      'entity_type', r.entity_type, 'entity_id', r.entity_id, 'details', r.details,
      'created_at', to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text, 'sha256'), 'hex');
    if r.prev_hash is distinct from v_prev or r.hash <> v_expected then
      return query select false, r.id, v_count;
      return;
    end if;
    v_prev := r.hash;
  end loop;
  return query select true, null::bigint, v_count;
end;
$$;

-- ---------- Atomic budget operations (called via supabase.rpc) ----------
create or replace function reserve_budget(p_department_id uuid, p_fiscal_year int, p_amount numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if p_amount <= 0 then return false; end if;
  update budgets set reserved_amount = reserved_amount + p_amount, updated_at = now()
   where department_id = p_department_id and fiscal_year = p_fiscal_year
     and reserved_amount + spent_amount + p_amount <= total_amount;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function release_budget(p_department_id uuid, p_fiscal_year int, p_amount numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  update budgets set reserved_amount = greatest(reserved_amount - p_amount, 0), updated_at = now()
   where department_id = p_department_id and fiscal_year = p_fiscal_year;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function commit_budget_spend(p_department_id uuid, p_fiscal_year int, p_amount numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  update budgets set reserved_amount = reserved_amount - p_amount, spent_amount = spent_amount + p_amount, updated_at = now()
   where department_id = p_department_id and fiscal_year = p_fiscal_year and reserved_amount >= p_amount;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function append_audit_log(uuid,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function verify_audit_chain() from public, anon, authenticated;
revoke all on function reserve_budget(uuid,int,numeric) from public, anon, authenticated;
revoke all on function release_budget(uuid,int,numeric) from public, anon, authenticated;
revoke all on function commit_budget_spend(uuid,int,numeric) from public, anon, authenticated;
grant execute on function append_audit_log(uuid,text,text,text,text,text,jsonb) to service_role;
grant execute on function verify_audit_chain() to service_role;
grant execute on function reserve_budget(uuid,int,numeric) to service_role;
grant execute on function release_budget(uuid,int,numeric) to service_role;
grant execute on function commit_budget_spend(uuid,int,numeric) to service_role;

-- ---------- Indexes ----------
create index if not exists idx_requests_requester on purchase_requests(requester_id, created_at desc);
create index if not exists idx_requests_dept on purchase_requests(department_id, created_at desc);
create index if not exists idx_runs_request on agent_runs(request_id);
create index if not exists idx_steps_run on agent_steps(run_id, seq);
create index if not exists idx_approvals_status on approvals(status, required_role);
create index if not exists idx_audit_run on audit_logs(run_id);
create index if not exists idx_catalog_category on vendor_catalog(category);

-- ---------- Row Level Security ----------
alter table departments enable row level security;
alter table users enable row level security;
alter table budgets enable row level security;
alter table policies enable row level security;
alter table vendors enable row level security;
alter table vendor_catalog enable row level security;
alter table purchase_requests enable row level security;
alter table agent_runs enable row level security;
alter table agent_steps enable row level security;
alter table approvals enable row level security;
alter table purchase_orders enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

-- Explicit deny-all policies for the public Data API roles
do $$
declare t text;
begin
  foreach t in array array['departments','users','budgets','policies','vendors','vendor_catalog',
    'purchase_requests','agent_runs','agent_steps','approvals','purchase_orders','notifications','audit_logs']
  loop
    execute format('drop policy if exists deny_all_client_access on %I', t);
    execute format('create policy deny_all_client_access on %I as restrictive for all to anon, authenticated using (false) with check (false)', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- ---------- Seed data (idempotent) ----------
insert into departments (name) values
  ('Engineering'),('Design'),('Marketing'),('HR'),('Operations')
on conflict (name) do nothing;

insert into budgets (department_id, fiscal_year, total_amount, spent_amount)
select d.id, 2026, b.total, b.spent
from (values
  ('Engineering', 4000000, 1200000),
  ('Design',      2000000,  500000),
  ('Marketing',    800000,  700000),
  ('HR',           600000,  100000),
  ('Operations',  1000000,  200000)
) as b(dept, total, spent)
join departments d on d.name = b.dept
on conflict (department_id, fiscal_year) do nothing;

insert into policies (category, description, auto_approve_limit, manager_limit, min_quotes, requires_justification_above, is_blocked) values
  ('IT Hardware',        'Laptops, monitors, peripherals, networking gear.',      50000, 500000, 2, 100000, false),
  ('Software Licenses',  'SaaS and perpetual software licenses.',                 25000, 300000, 1, 100000, false),
  ('Office Supplies',    'Stationery, consumables, pantry items.',                20000, 200000, 1, 100000, false),
  ('Furniture',          'Chairs, desks, storage.',                               30000, 400000, 2, 100000, false),
  ('Marketing Services', 'Agencies, campaigns, creative services.',               10000, 250000, 2,  50000, false),
  ('Travel & Events',    'Event bookings, group travel, venues.',                 15000, 200000, 1,  50000, false),
  ('Prohibited Items',   'Gift cards, cash equivalents, cryptocurrency, personal items. Never purchasable.', 0, 0, 1, 0, true)
on conflict (category) do nothing;

insert into vendors (name, approved, rating, risk_level, payment_terms, contact_email, categories) values
  ('TechNova Systems',    true,  4.6, 'low',    'Net 30', 'sales@technova.example',        '{"IT Hardware"}'),
  ('Prime Infotech',      true,  4.4, 'low',    'Net 45', 'orders@primeinfotech.example',  '{"IT Hardware"}'),
  ('Globex Distribution', true,  3.6, 'medium', 'Net 15', 'bulk@globex.example',           '{"IT Hardware","Office Supplies"}'),
  ('OfficeMart India',    true,  4.5, 'low',    'Net 30', 'care@officemart.example',       '{"Furniture","Office Supplies"}'),
  ('WorkSpace Interiors', true,  4.2, 'low',    'Net 30', 'sales@workspace.example',       '{"Furniture"}'),
  ('SoftSuite Reseller',  true,  4.3, 'low',    'Net 30', 'licenses@softsuite.example',    '{"Software Licenses"}'),
  ('BrightWave Creative', true,  4.4, 'low',    'Net 30', 'hello@brightwave.example',      '{"Marketing Services"}'),
  ('PixelCraft Agency',   true,  4.2, 'low',    'Net 30', 'studio@pixelcraft.example',     '{"Marketing Services"}'),
  ('EventSphere India',   true,  4.5, 'low',    'Net 30', 'bookings@eventsphere.example',  '{"Travel & Events"}'),
  ('QuickDeals Traders',  false, 4.1, 'high',   'Advance','hello@quickdeals.example',      '{"IT Hardware"}')
on conflict (name) do nothing;

insert into vendor_catalog (vendor_id, category, item_name, spec, unit_price, stock_qty, lead_time_days)
select v.id, c.category, c.item_name, c.spec, c.unit_price, c.stock_qty, c.lead_time_days
from (values
  ('TechNova Systems',    'IT Hardware',        'Business Laptop 14"',   '16GB RAM / 512GB SSD / i7', 98000,   4,  5),
  ('TechNova Systems',    'IT Hardware',        'Monitor 27" 4K',        'IPS, USB-C',                32000,  60,  4),
  ('Prime Infotech',      'IT Hardware',        'Business Laptop 14"',   '16GB RAM / 512GB SSD / i7', 104000, 50,  7),
  ('Prime Infotech',      'IT Hardware',        'Monitor 27" 4K',        'IPS, USB-C',                33500,  80,  6),
  ('Globex Distribution', 'IT Hardware',        'Business Laptop 14"',   '16GB RAM / 512GB SSD / i7', 95000, 100, 21),
  ('Globex Distribution', 'Office Supplies',    'A4 Paper Ream (500)',   '75 GSM',                      280, 5000, 10),
  ('QuickDeals Traders',  'IT Hardware',        'Business Laptop 14"',   '16GB RAM / 512GB SSD / i7', 85000, 500,  3),
  ('OfficeMart India',    'Furniture',          'Ergonomic Office Chair','Mesh back, lumbar support',  8500, 200,  9),
  ('OfficeMart India',    'Furniture',          'Standing Desk',         'Electric, 140cm',           24000,  30, 12),
  ('OfficeMart India',    'Office Supplies',    'A4 Paper Ream (500)',   '75 GSM',                      310, 8000,  3),
  ('WorkSpace Interiors', 'Furniture',          'Ergonomic Office Chair','Mesh back, lumbar support',  9200, 150,  6),
  ('WorkSpace Interiors', 'Furniture',          'Standing Desk',         'Electric, 140cm',           25500,  40, 10),
  ('SoftSuite Reseller',  'Software Licenses',  'Project Management Tool (annual seat)', 'Team plan', 4800, 1000, 1),
  ('SoftSuite Reseller',  'Software Licenses',  'Design Suite (annual seat)',            'Pro plan',  7200, 1000, 1),
  ('BrightWave Creative', 'Marketing Services', 'Social Media Campaign (monthly)', 'Strategy + 12 creatives', 45000, 20, 5),
  ('BrightWave Creative', 'Marketing Services', 'Brand Video Production',          '60-second explainer',    120000,  5, 14),
  ('PixelCraft Agency',   'Marketing Services', 'Social Media Campaign (monthly)', 'Strategy + 12 creatives', 42000, 20, 7),
  ('PixelCraft Agency',   'Marketing Services', 'Brand Video Production',          '60-second explainer',    135000,  5, 12),
  ('EventSphere India',   'Travel & Events',    'Conference Venue Booking (per day)', 'Up to 150 guests',      60000, 10,  7),
  ('EventSphere India',   'Travel & Events',    'Group Travel Package (per person)',  'Return flight + hotel', 18000, 100, 10)
) as c(vendor_name, category, item_name, spec, unit_price, stock_qty, lead_time_days)
join vendors v on v.name = c.vendor_name
on conflict (vendor_id, item_name) do nothing;
