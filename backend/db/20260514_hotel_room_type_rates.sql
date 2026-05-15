alter table hotels
  add column if not exists room_type_rates jsonb not null default '{}'::jsonb;

update hotels
set room_type_rates = jsonb_build_object(room_type, default_room_night_rate)
where room_type is not null
  and room_type <> ''
  and (room_type_rates = '{}'::jsonb or room_type_rates is null);
