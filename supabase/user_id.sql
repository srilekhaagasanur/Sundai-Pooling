-- Run in Supabase SQL Editor (existing projects).
-- Adds Google-auth user identity to rides. No lat/lng/place_id yet.
--
-- If the unique index fails, clear duplicate open rides first, e.g.:
--   delete from public.rides where status = 'open';
-- or keep one row per user_id and cancel the rest.

alter table public.rides
  add column if not exists user_id uuid references auth.users (id);

create index if not exists rides_user_id_idx
  on public.rides (user_id);

-- At most one open listing per signed-in user
create unique index if not exists rides_one_open_per_user_idx
  on public.rides (user_id)
  where status = 'open' and user_id is not null;

-- Prefer auth.uid() when the ride has a user_id; keep name check for legacy rows.
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

grant execute on function public.cancel_ride(bigint, text) to anon, authenticated;
