alter table hotels
  add column if not exists default_room_night_rate numeric(12,2) not null default 0;

alter table vehicles
  add column if not exists default_day_rate numeric(12,2) not null default 0;
