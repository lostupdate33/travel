alter table users
  add column if not exists is_platform_owner boolean not null default false;

alter table sessions
  alter column tenant_id drop not null;
