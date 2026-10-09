-- Add rider, driver, and dual-mode account support without recreating tables.
-- Existing accounts default to both so they keep their current app access.
alter table public.profiles
  add column if not exists account_type text not null default 'both';

update public.profiles
set account_type = 'both'
where account_type is null or account_type not in ('rider', 'driver', 'both');

alter table public.profiles
  alter column account_type set default 'both',
  alter column account_type set not null;

alter table public.profiles
  drop constraint if exists profiles_account_type_check;
alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('rider', 'driver', 'both'));

-- The selected account type is saved as signup metadata by Supabase Auth.
-- Keep a safe default for existing or non-app-created auth users.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  selected_account_type text := coalesce(new.raw_user_meta_data ->> 'account_type', 'both');
begin
  if selected_account_type not in ('rider', 'driver', 'both') then
    selected_account_type := 'both';
  end if;

  insert into public.profiles (id, full_name, account_type)
  values (new.id, new.raw_user_meta_data ->> 'full_name', selected_account_type)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Drivers can also request seats. All account types can book, while only
-- driver/both accounts can publish rides; the existing verified checks remain.
drop policy if exists "Verified riders can request seats" on public.ride_requests;
drop policy if exists "Verified commuters can request seats" on public.ride_requests;
create policy "Verified commuters can request seats" on public.ride_requests for insert to authenticated
  with check (rider_id = auth.uid()
    and exists (select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.verified
        and profiles.account_type in ('rider', 'driver', 'both'))
    and exists (select 1 from public.rides join public.profiles on profiles.id = rides.driver_id
      where rides.id = ride_id and rides.status = 'open' and rides.driver_id <> auth.uid() and profiles.verified));

drop policy if exists "Verified drivers can offer rides" on public.rides;
drop policy if exists "Drivers can offer rides" on public.rides;
drop policy if exists "Verified driver accounts can offer rides" on public.rides;
create policy "Verified driver accounts can offer rides" on public.rides for insert to authenticated
  with check (driver_id = auth.uid()
    and exists (select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.verified
        and profiles.account_type in ('driver', 'both')));

grant update (account_type) on public.profiles to authenticated;
