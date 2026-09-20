-- Store each rider's dropoff on members so locked rides can build multi-stop Uber links.
-- Run in Supabase SQL Editor once (replaces join_ride / leave_pair member shape).

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
    if dist_m is not null and dist_m <= 1500 then
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

create or replace function public.leave_pair(
  pair_ride_id bigint,
  rider_user_id uuid
)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  pair public.rides;
  joiner public.rides;
  poster_ride public.rides;
  leaving_is_poster boolean;
begin
  if auth.uid() is null or auth.uid() <> rider_user_id then
    raise exception 'Not authenticated';
  end if;

  select * into pair from public.rides where id = pair_ride_id for update;
  if not found then
    raise exception 'Ride not found';
  end if;

  if pair.status <> 'pending' then
    raise exception 'Only pending pairs can be left';
  end if;

  select * into joiner
  from public.rides
  where joined_ride_id = pair_ride_id and status = 'joined'
  for update;

  if not found then
    raise exception 'Could not find the other rider';
  end if;

  leaving_is_poster := (pair.user_id = rider_user_id);

  if not leaving_is_poster and joiner.user_id is distinct from rider_user_id then
    raise exception 'You are not part of this ride';
  end if;

  update public.rides
  set
    status = 'open',
    members = jsonb_build_array(
      jsonb_build_object(
        'name', pair.name,
        'user_id', pair.user_id,
        'confirmed', false,
        'destination', pair.destination,
        'dest_lat', pair.dest_lat,
        'dest_lng', pair.dest_lng,
        'place_id', pair.place_id
      )
    )
  where id = pair_ride_id
  returning * into poster_ride;

  update public.rides
  set
    status = 'open',
    joined_ride_id = null,
    members = jsonb_build_array(
      jsonb_build_object(
        'name', joiner.name,
        'user_id', joiner.user_id,
        'confirmed', false,
        'destination', joiner.destination,
        'dest_lat', joiner.dest_lat,
        'dest_lng', joiner.dest_lng,
        'place_id', joiner.place_id
      )
    )
  where id = joiner.id
  returning * into joiner;

  if leaving_is_poster then
    return poster_ride;
  end if;

  return joiner;
end;
$$;

grant execute on function public.join_ride(bigint, bigint) to anon, authenticated;
grant execute on function public.leave_pair(bigint, uuid) to anon, authenticated;
notify pgrst, 'reload schema';
