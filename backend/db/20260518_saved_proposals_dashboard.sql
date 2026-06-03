alter table saved_proposals
  add column if not exists duration text,
  add column if not exists traveler_count int,
  add column if not exists destinations_summary text;

update saved_proposals
set
  duration = coalesce(duration, proposal_json #>> '{trip,duration}'),
  traveler_count = coalesce(
    traveler_count,
    nullif(proposal_json #>> '{trip,travelers,adults}', '')::int
      + coalesce(nullif(proposal_json #>> '{trip,travelers,children}', '')::int, 0)
  ),
  destinations_summary = coalesce(
    destinations_summary,
    (
      select string_agg(distinct value->>'destination', ', ' order by value->>'destination')
      from jsonb_array_elements(proposal_json->'days') as value
      where coalesce(value->>'destination', '') <> ''
    )
  )
where duration is null
   or traveler_count is null
   or destinations_summary is null;

create index if not exists idx_saved_proposals_tenant_amount
  on saved_proposals(tenant_id, total_amount);
