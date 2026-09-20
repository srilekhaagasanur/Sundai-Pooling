-- Run in Supabase SQL Editor (replaces name-based confirm/leave).
-- Identity is user_id only. Drop old (bigint, text) overloads first.

drop function if exists public.confirm_ride(bigint, text);
drop function if exists public.leave_pair(bigint, text);

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

  if target.destination <> joiner.destination then
    raise exception 'Destinations do not match';
  end if;

  if jsonb_array_length(target.members) >= 2 then
    raise exception 'Ride is full';
  end if;

  -- Ensure poster member has user_id (repair older open rows)
  if coalesce(target.members->0->>'user_id', '') = '' then
    target.members := jsonb_build_array(
      jsonb_build_object(
        'name', target.name,
        'user_id', target.user_id,
        'confirmed', false
      )
    );
  end if;

  update public.rides
  set
    members = target.members || jsonb_build_array(
      jsonb_build_object(
        'name', joiner.name,
        'user_id', joiner.user_id,
        'confirmed', false
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

create or replace function public.confirm_ride(
  ride_id bigint,
  rider_user_id uuid
)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  ride public.rides;
  updated_members jsonb;
  all_done boolean;
begin
  if auth.uid() is null or auth.uid() <> rider_user_id then
    raise exception 'Not authenticated';
  end if;

  select * into ride from public.rides where id = ride_id for update;
  if not found then
    raise exception 'Ride not found';
  end if;

  if ride.status not in ('pending', 'locked') then
    raise exception 'Ride is not ready to confirm';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(ride.members) as member
    where nullif(member->>'user_id', '')::uuid = rider_user_id
  ) then
    raise exception 'You are not part of this ride';
  end if;

  select jsonb_agg(
    case
      when nullif(member->>'user_id', '')::uuid = rider_user_id then
        jsonb_set(member, '{confirmed}', 'true'::jsonb)
      else member
    end
  )
  into updated_members
  from jsonb_array_elements(ride.members) as member;

  select bool_and((member->>'confirmed')::boolean)
  into all_done
  from jsonb_array_elements(updated_members) as member;

  update public.rides
  set
    members = updated_members,
    status = case
      when jsonb_array_length(updated_members) = 2 and all_done then 'locked'
      else status
    end
  where id = ride_id
  returning * into ride;

  return ride;
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
        'confirmed', false
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
        'confirmed', false
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

create or replace function public.cancel_ride(
  ride_id bigint,
  rider_user_id uuid
)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  ride public.rides;
begin
  if auth.uid() is null or auth.uid() <> rider_user_id then
    raise exception 'Not authenticated';
  end if;

  select * into ride from public.rides where id = ride_id for update;
  if not found then
    raise exception 'Ride not found';
  end if;

  if ride.status <> 'open' then
    raise exception 'Only open rides can be cancelled';
  end if;

  if ride.user_id is distinct from rider_user_id then
    raise exception 'You can only cancel your own ride';
  end if;

  update public.rides
  set status = 'cancelled'
  where id = ride_id
  returning * into ride;

  return ride;
end;
$$;

drop function if exists public.cancel_ride(bigint, text);

grant execute on function public.join_ride(bigint, bigint) to anon, authenticated;
grant execute on function public.confirm_ride(bigint, uuid) to anon, authenticated;
grant execute on function public.leave_pair(bigint, uuid) to anon, authenticated;
grant execute on function public.cancel_ride(bigint, uuid) to anon, authenticated;
