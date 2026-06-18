alter table hotels
  add column if not exists meal_plan_rates jsonb not null default '{}'::jsonb;
