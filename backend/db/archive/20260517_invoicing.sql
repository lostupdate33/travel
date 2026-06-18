alter table tenants
  add column if not exists legal_name text,
  add column if not exists billing_address text,
  add column if not exists gstin text,
  add column if not exists state_name text,
  add column if not exists state_code text,
  add column if not exists invoice_prefix text not null default 'INV',
  add column if not exists default_sac text not null default '998555',
  add column if not exists default_tax_percent numeric(5,2) not null default 5,
  add column if not exists signature_label text;

create table if not exists saved_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by_user_id uuid references users(id),
  title text not null,
  customer_name text not null,
  trip_start_date date,
  total_amount numeric(12,2) not null default 0,
  proposal_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table if not exists invoice_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  financial_year text not null,
  next_number int not null default 1,
  primary key (tenant_id, financial_year)
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by_user_id uuid references users(id),
  source_proposal_id uuid,
  invoice_number text not null,
  financial_year text not null,
  invoice_date date not null,
  due_date date,
  customer_name text not null,
  customer_gstin text,
  customer_state_code text,
  taxable_value numeric(12,2) not null default 0,
  cgst_amount numeric(12,2) not null default 0,
  sgst_amount numeric(12,2) not null default 0,
  igst_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  invoice_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, financial_year, invoice_number),
  foreign key (tenant_id, source_proposal_id) references saved_proposals(tenant_id, id)
);

create index if not exists idx_saved_proposals_tenant_search
  on saved_proposals(tenant_id, trip_start_date, customer_name);
create index if not exists idx_invoices_tenant_date
  on invoices(tenant_id, invoice_date desc);
create unique index if not exists idx_invoices_one_per_source_proposal
  on invoices(tenant_id, source_proposal_id)
  where source_proposal_id is not null;

alter table saved_proposals enable row level security;
alter table invoice_counters enable row level security;
alter table invoices enable row level security;

drop policy if exists tenant_saved_proposals on saved_proposals;
create policy tenant_saved_proposals on saved_proposals
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

drop policy if exists tenant_invoice_counters on invoice_counters;
create policy tenant_invoice_counters on invoice_counters
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

drop policy if exists tenant_invoices on invoices;
create policy tenant_invoices on invoices
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
