-- Travel Ideate tenant-aware PostgreSQL schema proposal.
-- This is the target relational model for moving from local JSON fixtures to
-- a multi-tenant SaaS database. It is not applied by the current app yet.

create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  email text,
  phone text,
  logo_url text,
  legal_name text,
  billing_address text,
  gstin text,
  state_name text,
  state_code text,
  invoice_prefix text not null default 'INV',
  default_sac text not null default '998555',
  default_tax_percent numeric(5,2) not null default 5,
  signature_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, slug)
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text,
  is_platform_owner boolean not null default false,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  created_by_user_id uuid references users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  session_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table password_setup_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  content bytea not null,
  file_name text,
  mime_type text,
  file_size bigint,
  width int,
  height int,
  aspect_ratio text,
  focal_point text not null default 'center',
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table destinations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  slug text not null,
  name text not null,
  region text,
  summary text,
  is_active boolean not null default true,
  archived_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id)
);

create table destination_images (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  destination_id uuid not null,
  media_asset_id uuid not null,
  image_key text not null,
  label text not null,
  aspect_ratio text not null default '4:3',
  focal_point text not null default 'center',
  is_active boolean not null default true,
  archived_at timestamptz,
  sort_order int not null default 0,
  unique (tenant_id, id),
  foreign key (tenant_id, destination_id) references destinations(tenant_id, id) on delete cascade,
  foreign key (tenant_id, media_asset_id) references media_assets(tenant_id, id)
);

create table hotels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  destination_id uuid not null,
  slug text not null,
  name text not null,
  category text,
  room_type text,
  default_room_night_rate numeric(12,2) not null default 0,
  room_type_rates jsonb not null default '{}'::jsonb,
  meal_plan_rates jsonb not null default '{}'::jsonb,
  summary text,
  is_active boolean not null default true,
  archived_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id),
  foreign key (tenant_id, destination_id) references destinations(tenant_id, id)
);

create table hotel_images (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  hotel_id uuid not null,
  media_asset_id uuid not null,
  image_key text not null,
  label text not null,
  aspect_ratio text not null default '4:3',
  focal_point text not null default 'center',
  is_active boolean not null default true,
  archived_at timestamptz,
  sort_order int not null default 0,
  unique (tenant_id, id),
  foreign key (tenant_id, hotel_id) references hotels(tenant_id, id) on delete cascade,
  foreign key (tenant_id, media_asset_id) references media_assets(tenant_id, id)
);

create table background_images (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  media_asset_id uuid not null,
  image_key text not null,
  label text not null,
  usage_type text not null default 'cover',
  aspect_ratio text not null default '16:9',
  focal_point text not null default 'center',
  is_active boolean not null default true,
  archived_at timestamptz,
  sort_order int not null default 0,
  unique (tenant_id, id),
  foreign key (tenant_id, media_asset_id) references media_assets(tenant_id, id)
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  capacity text,
  best_for text,
  default_day_rate numeric(12,2) not null default 0,
  default_note text,
  is_active boolean not null default true,
  archived_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  destination_id uuid,
  name text not null,
  is_active boolean not null default true,
  archived_at timestamptz,
  sort_order int not null default 0,
  unique (tenant_id, id),
  foreign key (tenant_id, destination_id) references destinations(tenant_id, id)
);

create table destination_day_plans (
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

create table tenant_payment_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  payment_terms text not null,
  bank_account_name text,
  bank_account_number text,
  ifsc_code text,
  upi_id text,
  qr_media_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id),
  foreign key (tenant_id, qr_media_asset_id) references media_assets(tenant_id, id)
);

create table tenant_contact_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_name text not null,
  role_title text,
  phone text,
  whatsapp text,
  email text,
  website text,
  instagram_url text,
  facebook_url text,
  google_maps_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table tenant_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_name text not null,
  rating int not null default 5 check (rating between 1 and 5),
  review_text text not null,
  source_label text not null default 'Direct',
  is_active boolean not null default true,
  archived_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table proposal_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, template_key)
);

create table tenant_template_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  template_id uuid not null references proposal_templates(id),
  is_enabled boolean not null default true,
  sort_order int not null default 0,
  unique (tenant_id, template_id),
  unique (tenant_id, id)
);

create table leads (
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

create table saved_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  created_by_user_id uuid references users(id),
  lead_id uuid,
  title text not null,
  customer_name text not null,
  trip_start_date date,
  duration text,
  traveler_count int,
  destinations_summary text,
  total_amount numeric(12,2) not null default 0,
  proposal_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, lead_id) references leads(tenant_id, id)
);

create table invoice_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  financial_year text not null,
  next_number int not null default 1,
  primary key (tenant_id, financial_year)
);

create table invoices (
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

create index idx_destinations_tenant on destinations(tenant_id);
create index idx_hotels_tenant_destination on hotels(tenant_id, destination_id);
create index idx_media_assets_tenant on media_assets(tenant_id);
create index idx_tenant_memberships_user on tenant_memberships(user_id);
create index idx_sessions_hash on sessions(session_hash);
create index idx_password_setup_tokens_hash on password_setup_tokens(token_hash);
create index idx_leads_tenant_status on leads(tenant_id, status);
create index idx_leads_tenant_assigned on leads(tenant_id, assigned_user_id);
create index idx_leads_tenant_dates on leads(tenant_id, expected_start_date, expected_end_date);
create index idx_saved_proposals_tenant_search on saved_proposals(tenant_id, trip_start_date, customer_name);
create index idx_saved_proposals_tenant_amount on saved_proposals(tenant_id, total_amount);
create index idx_saved_proposals_tenant_lead on saved_proposals(tenant_id, lead_id);
create index idx_invoices_tenant_date on invoices(tenant_id, invoice_date desc);
create unique index idx_invoices_one_per_source_proposal
  on invoices(tenant_id, source_proposal_id)
  where source_proposal_id is not null;

-- Tenant isolation should be enforced in application services and with RLS.
-- The application should set this per request:
--   set local app.tenant_id = '<tenant uuid>';
-- Policies below are examples for the first production migration.
alter table media_assets enable row level security;
alter table destinations enable row level security;
alter table destination_images enable row level security;
alter table hotels enable row level security;
alter table hotel_images enable row level security;
alter table background_images enable row level security;
alter table vehicles enable row level security;
alter table activities enable row level security;
alter table destination_day_plans enable row level security;
alter table tenant_payment_profiles enable row level security;
alter table tenant_contact_profiles enable row level security;
alter table tenant_reviews enable row level security;
alter table tenant_template_settings enable row level security;
alter table leads enable row level security;
alter table saved_proposals enable row level security;
alter table invoice_counters enable row level security;
alter table invoices enable row level security;
create policy tenant_media_assets on media_assets
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_destinations on destinations
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_destination_images on destination_images
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_hotels on hotels
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_hotel_images on hotel_images
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_background_images on background_images
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_vehicles on vehicles
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_activities on activities
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_destination_day_plans on destination_day_plans
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_payment_profiles on tenant_payment_profiles
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_contact_profiles on tenant_contact_profiles
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_reviews on tenant_reviews
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_template_settings on tenant_template_settings
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_leads on leads
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_saved_proposals on saved_proposals
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_invoice_counters on invoice_counters
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_invoices on invoices
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
