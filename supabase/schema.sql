-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query)

create table if not exists public.rides (
  id bigserial primary key,
  name text not null,
  source text not null,
  destination text not null,
  status text not null default 'open'
    check (status in ('open', 'pending', 'joined', 'locked', 'cancelled')),
  members jsonb not null default '[]'::jsonb,
  joined_ride_id bigint references public.rides(id),
  created_at timestamptz not null default now()
);

create index if not exists rides_status_destination_idx
  on public.rides (status, destination);

alter table public.rides enable row level security;

drop policy if exists "Public read rides" on public.rides;
drop policy if exists "Public insert rides" on public.rides;
drop policy if exists "Public update rides" on public.rides;

-- Hackathon-friendly: anyone with the anon key can read/write rides.
-- Tighten this after the demo if the project stays live.
create policy "Public read rides"
  on public.rides for select
  using (true);

create policy "Public insert rides"
  on public.rides for insert
  with check (true);

create policy "Public update rides"
  on public.rides for update
  using (true)
  with check (true);

-- Realtime so open tabs update without relying only on polling
do $$
begin
  alter publication supabase_realtime add table public.rides;
exception
  when duplicate_object then null;
end $$;

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

  if target.status <> 'open' or joiner.status <> 'open' then
    raise exception 'Ride is no longer available';
  end if;

  if target.destination <> joiner.destination then
    raise exception 'Destinations do not match';
  end if;

  if jsonb_array_length(target.members) >= 2 then
    raise exception 'Ride is full';
  end if;

  update public.rides
  set
    members = target.members || jsonb_build_array(
      jsonb_build_object('name', joiner.name, 'confirmed', false)
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
  rider_name text
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
    where member->>'name' = rider_name
  ) then
    raise exception 'You are not part of this ride';
  end if;

  select jsonb_agg(
    case
      when member->>'name' = rider_name then
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

-- Cancel an open solo listing
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

  if ride.name <> rider_name then
    raise exception 'You can only cancel your own ride';
  end if;

  update public.rides
  set status = 'cancelled'
  where id = ride_id
  returning * into ride;

  return ride;
end;
$$;

-- Either person leaves a pending pair; both go back to open alone.
-- Returns the ride the leaving person should keep using.
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

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.rides to anon, authenticated;
grant usage, select on sequence public.rides_id_seq to anon, authenticated;
grant execute on function public.join_ride(bigint, bigint) to anon, authenticated;
grant execute on function public.confirm_ride(bigint, text) to anon, authenticated;
grant execute on function public.cancel_ride(bigint, text) to anon, authenticated;
grant execute on function public.leave_pair(bigint, text) to anon, authenticated;
