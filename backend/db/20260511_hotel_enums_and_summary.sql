alter table hotels add column if not exists star_rating int;
alter table hotels add column if not exists summary text;

update hotels
set category = '3 Star'
where category is null
   or category not in ('2 Star', '3 Star', '4 Star', '5 Star', 'Luxury');

update hotels
set room_type = 'Double'
where room_type is null
   or room_type not in ('Single', 'Double', 'Twin', 'Triple', 'Family', 'Suite');

update hotels
set star_rating = case
  when category = '2 Star' then 2
  when category = '3 Star' then 3
  when category = '4 Star' then 4
  when category in ('5 Star', 'Luxury') then 5
  else 3
end;
