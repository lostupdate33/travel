create table if not exists tenant_payment_profiles (
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

create table if not exists tenant_contact_profiles (
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

create table if not exists tenant_reviews (
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

alter table hotels add column if not exists star_rating int;
alter table hotels add column if not exists summary text;
alter table destinations add column if not exists description text;
