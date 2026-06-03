create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by_user_id uuid references users(id),
  assigned_user_id uuid references users(id),
  customer_name text not null,
  phone text,
  whatsapp text,
  email text,
  traveler_count int not null default 1,
  trip_type text,
  destination_interest text,
  expected_start_date date,
  expected_end_date date,
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  source text,
  status text not null default 'new' check (
    status in ('new', 'contacted', 'proposal_sent', 'negotiating', 'won', 'arriving', 'completed', 'lost')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, assigned_user_id) references tenant_memberships(tenant_id, user_id)
);

alter table saved_proposals
  add column if not exists lead_id uuid;

alter table saved_proposals
  drop constraint if exists saved_proposals_tenant_lead_id_fkey;

alter table saved_proposals
  add constraint saved_proposals_tenant_lead_id_fkey
  foreign key (tenant_id, lead_id) references leads(tenant_id, id);

create index if not exists idx_leads_tenant_status on leads(tenant_id, status);
create index if not exists idx_leads_tenant_assigned on leads(tenant_id, assigned_user_id);
create index if not exists idx_leads_tenant_dates on leads(tenant_id, expected_start_date, expected_end_date);
create index if not exists idx_saved_proposals_tenant_lead on saved_proposals(tenant_id, lead_id);

alter table leads enable row level security;

drop policy if exists tenant_leads on leads;
create policy tenant_leads on leads
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
