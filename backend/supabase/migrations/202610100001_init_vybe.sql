-- Vybe starter schema. Run in Supabase SQL Editor or with Supabase CLI.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  verified boolean not null default false,
  verification_tier smallint not null default 0 check (verification_tier between 0 and 3),
  community_name text,
  women_only_preference boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  origin text not null,
  destination text not null,
  departure_at timestamptz not null,
  seats_available smallint not null check (seats_available between 1 and 8),
  vehicle text not null default '',
  fare_per_seat numeric(8,2) not null default 0 check (fare_per_seat >= 0),
  women_only boolean not null default false,
  community_name text,
  notes text,
  status text not null default 'open' check (status in ('open','full','cancelled','completed')),
  created_at timestamptz not null default now()
);
create index if not exists rides_departure_open_idx on public.rides (departure_at) where status = 'open';

create table if not exists public.ride_requests (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','completed')),
  message text,
  created_at timestamptz not null default now(),
  unique (ride_id, rider_id)
);

create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  ride_id uuid references public.rides(id) on delete set null,
  category text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.rides enable row level security;
alter table public.ride_requests enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.reports enable row level security;

create policy "Profiles are visible to signed-in commuters" on public.profiles for select to authenticated using (true);
create policy "Users can update their profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "Signed-in users can view open rides" on public.rides for select to authenticated using (status = 'open' or driver_id = auth.uid());
create policy "Drivers can offer rides" on public.rides for insert to authenticated with check (driver_id = auth.uid());
create policy "Drivers can update their rides" on public.rides for update to authenticated using (driver_id = auth.uid()) with check (driver_id = auth.uid());
create policy "Drivers can delete their rides" on public.rides for delete to authenticated using (driver_id = auth.uid());

create policy "Riders and ride owners can view requests" on public.ride_requests for select to authenticated
  using (rider_id = auth.uid() or exists (select 1 from public.rides where rides.id = ride_id and rides.driver_id = auth.uid()));
create policy "Verified riders can request seats" on public.ride_requests for insert to authenticated
  with check (rider_id = auth.uid()
    and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.verified)
    and exists (select 1 from public.rides join public.profiles on profiles.id = rides.driver_id
      where rides.id = ride_id and rides.status = 'open' and rides.driver_id <> auth.uid() and profiles.verified));
create policy "Riders can cancel their own requests" on public.ride_requests for update to authenticated
  using (rider_id = auth.uid()) with check (rider_id = auth.uid() and status = 'cancelled');
create policy "Drivers can respond to requests for their rides" on public.ride_requests for update to authenticated
  using (exists (select 1 from public.rides where rides.id = ride_id and rides.driver_id = auth.uid()))
  with check (exists (select 1 from public.rides where rides.id = ride_id and rides.driver_id = auth.uid()) and status in ('accepted','declined','completed'));

create policy "Users manage their own trusted contacts" on public.trusted_contacts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can submit reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "Reporters can read their reports" on public.reports for select to authenticated using (reporter_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.rides, public.ride_requests, public.trusted_contacts, public.reports to authenticated;
-- Verification state is changed only by trusted server-side/admin workflows, never by browser clients.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, avatar_url, women_only_preference) on public.profiles to authenticated;
drop policy if exists "Drivers can offer rides" on public.rides;
create policy "Verified drivers can offer rides" on public.rides for insert to authenticated
  with check (driver_id = auth.uid() and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.verified));
