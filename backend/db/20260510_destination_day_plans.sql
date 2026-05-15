create table if not exists destination_day_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  destination_id uuid not null,
  plan_key text not null,
  title text not null,
  summary text not null,
  is_active boolean not null default true,
  archived_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, destination_id, plan_key),
  unique (tenant_id, id),
  foreign key (tenant_id, destination_id) references destinations(tenant_id, id) on delete cascade
);
