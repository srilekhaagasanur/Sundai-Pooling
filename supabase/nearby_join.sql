-- Allow joining nearby destinations (not only exact address strings).
-- Also stores each rider's dropoff on members for Uber multi-stop links.
-- Run in Supabase SQL Editor once.
-- Note: if you already ran this earlier, also run uber_member_dests.sql
-- (or re-run this file) so join_ride writes destination fields onto members.

create or replace function public.dest_distance_m(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else (
      2 * 6371000 * asin(
        sqrt(
          power(sin(radians(lat2 - lat1) / 2), 2) +
          cos(radians(lat1)) * cos(radians(lat2)) *
          power(sin(radians(lng2 - lng1) / 2), 2)
        )
      )
    )
  end;
$$;

create or replace function public.join_ride(
  target_id bigint,
  joiner_id bigint
)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.rides;
  joiner public.rides;
  nearby_ok boolean := false;
  dist_m double precision;
  poster_member jsonb;
begin
  if target_id = joiner_id then
    raise exception 'Cannot join your own ride';
  end if;

  select * into target from public.rides where id = target_id for update;
  if not found then
    raise exception 'Ride not found';
  end if;

  select * into joiner from public.rides where id = joiner_id for update;
  if not found then
    raise exception 'Your ride was not found';
  end if;

  if target.user_id is null or joiner.user_id is null then
    raise exception 'Both riders must be signed in';
  end if;

  if target.user_id = joiner.user_id then
    raise exception 'Cannot join your own ride';
  end if;

  if target.status <> 'open' or joiner.status <> 'open' then
    raise exception 'Ride is no longer available';
  end if;

  if jsonb_array_length(target.members) >= 2 then
    raise exception 'Ride is full';
  end if;

  if target.place_id is not null
     and joiner.place_id is not null
     and target.place_id = joiner.place_id then
    nearby_ok := true;
  elsif target.destination = joiner.destination then
    nearby_ok := true;
  else
    dist_m := public.dest_distance_m(
      target.dest_lat, target.dest_lng,
      joiner.dest_lat, joiner.dest_lng
    );
    if dist_m is not null and dist_m <= 3219 then
      nearby_ok := true;
    end if;
  end if;

  if not nearby_ok then
    raise exception 'Destinations are too far apart to pair';
  end if;

  poster_member := jsonb_build_object(
    'name', target.name,
    'user_id', target.user_id,
    'confirmed', false,
    'destination', target.destination,
    'dest_lat', target.dest_lat,
    'dest_lng', target.dest_lng,
    'place_id', target.place_id
  );

  update public.rides
  set
    members = jsonb_build_array(poster_member) || jsonb_build_array(
      jsonb_build_object(
        'name', joiner.name,
        'user_id', joiner.user_id,
        'confirmed', false,
        'destination', joiner.destination,
        'dest_lat', joiner.dest_lat,
        'dest_lng', joiner.dest_lng,
        'place_id', joiner.place_id
      )
    ),
    status = 'pending'
  where id = target_id
  returning * into target;

  update public.rides
  set
    status = 'joined',
    joined_ride_id = target_id
  where id = joiner_id;

  return target;
end;
$$;

grant execute on function public.dest_distance_m(double precision, double precision, double precision, double precision)
  to anon, authenticated;
grant execute on function public.join_ride(bigint, bigint) to anon, authenticated;
