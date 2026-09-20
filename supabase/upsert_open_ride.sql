-- Atomic open-ride upsert (avoids races on rides_one_open_per_user_idx).
-- Run ALL of this in Supabase SQL Editor, then try the app again.

drop function if exists public.upsert_open_ride(
  uuid, text, text, text, text, double precision, double precision
);

create or replace function public.upsert_open_ride(
  p_user_id uuid,
  p_name text,
  p_source text,
  p_destination text,
  p_place_id text,
  p_dest_lat double precision,
  p_dest_lng double precision
)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  ride public.rides;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Not authenticated';
  end if;

  select * into ride
  from public.rides
  where user_id = p_user_id and status = 'open'
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.rides
    set
      name = p_name,
      source = p_source,
      destination = p_destination,
      place_id = p_place_id,
      dest_lat = p_dest_lat,
      dest_lng = p_dest_lng,
      members = jsonb_build_array(
        jsonb_build_object(
          'name', p_name,
          'user_id', p_user_id,
          'confirmed', false
        )
      )
    where id = ride.id
    returning * into ride;

    return ride;
  end if;

  insert into public.rides (
    user_id,
    name,
    source,
    destination,
    place_id,
    dest_lat,
    dest_lng,
    status,
    members
  )
  values (
    p_user_id,
    p_name,
    p_source,
    p_destination,
    p_place_id,
    p_dest_lat,
    p_dest_lng,
    'open',
    jsonb_build_array(
      jsonb_build_object(
        'name', p_name,
        'user_id', p_user_id,
        'confirmed', false
      )
    )
  )
  returning * into ride;

  return ride;
end;
$$;

grant execute on function public.upsert_open_ride(
  uuid, text, text, text, text, double precision, double precision
) to anon, authenticated;

-- Refresh PostgREST schema cache so the app can see the new RPC
notify pgrst, 'reload schema';

-- Sanity check (should return 1 row):
-- select proname, pg_get_function_identity_arguments(oid)
-- from pg_proc
-- where proname = 'upsert_open_ride';
