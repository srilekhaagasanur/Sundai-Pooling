-- Run this if your rides table already exists from an earlier schema.sql run.

alter table public.rides drop constraint if exists rides_status_check;

alter table public.rides
  add constraint rides_status_check
  check (status in ('open', 'pending', 'joined', 'locked', 'cancelled'));

create or replace function public.cancel_ride(
  ride_id bigint,
  rider_name text
)
returns public.rides
language plpgsql
security definer
set search_path = public
as $$
declare
  ride public.rides;
begin
  select * into ride from public.rides where id = ride_id for update;
  if not found then
    raise exception 'Ride not found';
  end if;

  if ride.status <> 'open' then
    raise exception 'Only open rides can be cancelled';
  end if;

  if ride.user_id is not null then
    if auth.uid() is null or ride.user_id <> auth.uid() then
      raise exception 'You can only cancel your own ride';
    end if;
  elsif ride.name <> rider_name then
    raise exception 'You can only cancel your own ride';
  end if;

  update public.rides
  set status = 'cancelled'
  where id = ride_id
  returning * into ride;

  return ride;
end;
$$;

create or replace function public.leave_pair(
  pair_ride_id bigint,
  rider_name text
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
begin
  select * into pair from public.rides where id = pair_ride_id for update;
  if not found then
    raise exception 'Ride not found';
  end if;

  if pair.status <> 'pending' then
    raise exception 'Only pending pairs can be left';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(pair.members) as member
    where member->>'name' = rider_name
  ) then
    raise exception 'You are not part of this ride';
  end if;

  select * into joiner
  from public.rides
  where joined_ride_id = pair_ride_id and status = 'joined'
  for update;

  if not found then
    raise exception 'Could not find the other rider';
  end if;

  update public.rides
  set
    status = 'open',
    members = jsonb_build_array(
      jsonb_build_object('name', pair.name, 'confirmed', false)
    )
  where id = pair_ride_id
  returning * into poster_ride;

  update public.rides
  set
    status = 'open',
    joined_ride_id = null,
    members = jsonb_build_array(
      jsonb_build_object('name', joiner.name, 'confirmed', false)
    )
  where id = joiner.id
  returning * into joiner;

  if rider_name = pair.name then
    return poster_ride;
  end if;

  return joiner;
end;
$$;

grant execute on function public.cancel_ride(bigint, text) to anon, authenticated;
grant execute on function public.leave_pair(bigint, text) to anon, authenticated;
