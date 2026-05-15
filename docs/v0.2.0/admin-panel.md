# Admin Panel Proposal

Version: `v0.2.0`

The admin panel lets each tenant manage the data used by the proposal builder.
The proposal builder should not own master data editing.

## Navigation

```text
Admin
  Destinations
  Hotels
  Backgrounds
  Vehicles
  Activities
  Customers
  Templates
  Media
```

## Destinations

Fields:

- name
- slug
- region
- summary
- active state
- sort order

Actions:

- add destination
- edit destination
- archive destination
- manage destination images
- choose image labels, focal points, and sort order

## Hotels

Fields:

- destination
- name
- slug
- category
- room type
- meal plan
- summary
- active state
- sort order

Actions:

- add hotel
- edit hotel
- archive hotel
- manage hotel images
- choose image labels, focal points, and sort order

## Backgrounds

Background images are proposal cover assets. They are separate from destination
and hotel images.

Fields:

- label
- usage type, usually `cover`
- image
- aspect ratio
- focal point
- active state
- sort order

## Vehicles

Fields:

- name
- capacity
- best for
- default note
- active state
- sort order

## Activities

Fields:

- optional destination
- name
- active state
- sort order

## Customers

Fields:

- name
- email
- phone

Customers are used by proposals but should stay simple in the first database
version.

## Templates

Templates are system-owned code assets. Tenants should be able to enable,
disable, and sort the templates available in their builder.

The first active templates are:

- Kashmir Signature
- Kashmir Luxury
- Kashmir Executive

## Media

The media manager is the upload library. Destination, hotel, and background
image managers should reuse these assets instead of duplicating upload logic.

Fields:

- file name
- image bytes stored in `media_assets.content`
- MIME type
- file size
- width
- height
- aspect ratio
- focal point

## UX Rules

- Archive instead of hard delete for inventory records that should stay hidden
  without losing audit context.
- Keep image focal point editing close to image upload.
- Show active/inactive filters on every admin list.
- Keep proposal-specific copy out of inventory records.
- Show where an entity is used before archive actions.
