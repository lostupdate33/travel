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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, slug)
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

create index idx_destinations_tenant on destinations(tenant_id);
create index idx_hotels_tenant_destination on hotels(tenant_id, destination_id);
create index idx_media_assets_tenant on media_assets(tenant_id);

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
