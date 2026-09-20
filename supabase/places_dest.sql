-- Run in Supabase SQL Editor once.
-- Destination coords from Places Autocomplete (nearby matching comes next).

alter table public.rides
  add column if not exists place_id text,
  add column if not exists dest_lat double precision,
  add column if not exists dest_lng double precision;

create index if not exists rides_place_id_idx
  on public.rides (place_id)
  where place_id is not null;
