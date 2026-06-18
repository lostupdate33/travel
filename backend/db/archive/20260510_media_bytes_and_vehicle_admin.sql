alter table media_assets
  add column if not exists content bytea,
  add column if not exists file_size bigint;

alter table media_assets
  alter column url drop not null;

alter table destination_images
  alter column url_snapshot drop not null;

alter table hotel_images
  alter column url_snapshot drop not null;

alter table background_images
  alter column url_snapshot drop not null;

alter table hotels
  drop column if exists meal_plan;
