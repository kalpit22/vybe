-- Route distance, driver ratings, two-sided completion, and server-controlled payouts.
alter table public.rides
  add column if not exists distance_km numeric(8,2)
  check (distance_km is null or distance_km between 0.1 and 5000);

alter table public.profiles
  add column if not exists driver_rating_average numeric(3,2) not null default 0
    check (driver_rating_average between 0 and 5),
  add column if not exists driver_rating_count integer not null default 0
    check (driver_rating_count >= 0);

alter table public.ride_requests
  add column if not exists rider_completed_at timestamptz,
  add column if not exists driver_completed_at timestamptz;

create table if not exists public.driver_reviews (
  id uuid primary key default gen_random_uuid(),
  ride_request_id uuid not null unique references public.ride_requests(id) on delete cascade,
  ride_id uuid not null references public.rides(id) on delete cascade,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists driver_reviews_driver_created_idx
  on public.driver_reviews (driver_id, created_at desc);

alter table public.driver_reviews enable row level security;
drop policy if exists "Verified commuters can read driver reviews" on public.driver_reviews;
create policy "Verified commuters can read driver reviews" on public.driver_reviews
  for select to authenticated using (true);
drop policy if exists "Riders can rate completed paid rides once" on public.driver_reviews;
create policy "Riders can rate completed paid rides once" on public.driver_reviews
  for insert to authenticated with check (
    rider_id = auth.uid()
    and exists (
      select 1 from public.ride_requests rr
      join public.rides r on r.id = rr.ride_id
      where rr.id = ride_request_id
        and rr.ride_id = driver_reviews.ride_id
        and rr.rider_id = auth.uid()
        and rr.status = 'completed'
        and r.driver_id = driver_reviews.driver_id
    )
    and exists (
      select 1 from public.vybe_payments p
      where p.ride_request_id = driver_reviews.ride_request_id and p.status = 'paid'
    )
  );
revoke all on public.driver_reviews from anon;
grant select, insert on public.driver_reviews to authenticated;

create or replace function public.refresh_driver_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_driver uuid;
begin
  if tg_op = 'DELETE' then
    target_driver := old.driver_id;
  else
    target_driver := new.driver_id;
  end if;
  update public.profiles p
  set driver_rating_average = coalesce((
        select round(avg(dr.rating)::numeric, 2)
        from public.driver_reviews dr where dr.driver_id = target_driver
      ), 0),
      driver_rating_count = (
        select count(*)::integer from public.driver_reviews dr where dr.driver_id = target_driver
      ),
      updated_at = now()
  where p.id = target_driver;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists driver_reviews_refresh_rating on public.driver_reviews;
create trigger driver_reviews_refresh_rating
after insert or delete on public.driver_reviews
for each row execute function public.refresh_driver_rating();

-- Completion must be acknowledged by both participants after a captured fare.
create or replace function public.confirm_ride_completion(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row record;
  next_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to confirm this ride.' using errcode = '28000';
  end if;

  select rr.*, r.driver_id
  into request_row
  from public.ride_requests rr
  join public.rides r on r.id = rr.ride_id
  where rr.id = p_request_id
  for update of rr;

  if not found then
    raise exception 'Ride request not found.' using errcode = 'P0002';
  end if;
  if auth.uid() <> request_row.rider_id and auth.uid() <> request_row.driver_id then
    raise exception 'You are not part of this ride.' using errcode = '42501';
  end if;
  if request_row.status = 'completed' then
    return 'completed';
  end if;
  if request_row.status <> 'accepted' then
    raise exception 'Only an accepted ride can be completed.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.vybe_payments p
    where p.ride_request_id = p_request_id and p.status = 'paid'
  ) then
    raise exception 'A captured ride payment is required before completion.' using errcode = '22023';
  end if;

  update public.ride_requests rr
  set rider_completed_at = case
        when auth.uid() = request_row.rider_id then coalesce(rr.rider_completed_at, now())
        else rr.rider_completed_at end,
      driver_completed_at = case
        when auth.uid() = request_row.driver_id then coalesce(rr.driver_completed_at, now())
        else rr.driver_completed_at end,
      status = case
        when (rr.rider_completed_at is not null or auth.uid() = request_row.rider_id)
         and (rr.driver_completed_at is not null or auth.uid() = request_row.driver_id)
        then 'completed' else rr.status end
  where rr.id = p_request_id
  returning rr.status into next_status;

  return next_status;
end;
$$;
revoke all on function public.confirm_ride_completion(uuid) from public;
grant execute on function public.confirm_ride_completion(uuid) to authenticated;

-- Only RazorpayX provider IDs and a masked destination are stored here; raw bank/UPI
-- details are sent to RazorpayX by a Supabase Edge Function and are not persisted.
create table if not exists public.driver_payout_accounts (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  provider_contact_id text not null,
  provider_fund_account_id text not null,
  payout_method text not null check (payout_method in ('upi', 'bank_account')),
  account_holder_name text not null,
  destination_mask text not null,
  updated_at timestamptz not null default now()
);
alter table public.driver_payout_accounts enable row level security;
drop policy if exists "Drivers can read their payout account summary" on public.driver_payout_accounts;
create policy "Drivers can read their payout account summary" on public.driver_payout_accounts
  for select to authenticated using (driver_id = auth.uid());
revoke all on public.driver_payout_accounts from anon, authenticated;
grant select (driver_id, payout_method, account_holder_name, destination_mask, updated_at)
  on public.driver_payout_accounts to authenticated;

create table if not exists public.driver_payouts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete restrict,
  ride_request_id uuid not null references public.ride_requests(id) on delete restrict,
  amount_paise integer not null check (amount_paise >= 100),
  currency text not null default 'INR' check (currency = 'INR'),
  provider text not null default 'razorpayx' check (provider = 'razorpayx'),
  provider_payout_id text unique,
  reference_id text not null unique,
  status text not null default 'created' check (status in (
    'created', 'pending', 'queued', 'processing', 'processed',
    'rejected', 'failed', 'reversed', 'cancelled'
  )),
  utr text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists driver_payouts_driver_created_idx
  on public.driver_payouts (driver_id, created_at desc);
create unique index if not exists driver_payouts_one_live_or_paid_per_request_idx
  on public.driver_payouts (ride_request_id)
  where status in ('created', 'pending', 'queued', 'processing', 'processed');
alter table public.driver_payouts enable row level security;
drop policy if exists "Drivers can read their payouts" on public.driver_payouts;
create policy "Drivers can read their payouts" on public.driver_payouts
  for select to authenticated using (driver_id = auth.uid());
revoke all on public.driver_payouts from anon, authenticated;
grant select (id, ride_request_id, amount_paise, currency, status, utr, failure_reason, created_at)
  on public.driver_payouts to authenticated;

create or replace view public.driver_earnings
with (security_invoker = true)
as
select
  rr.id as ride_request_id,
  r.driver_id,
  r.origin,
  r.destination,
  r.departure_at,
  round(r.fare_per_seat * 100)::integer as amount_paise,
  p.id as payment_id,
  latest.id as payout_id,
  latest.status as payout_status,
  latest.utr,
  latest.created_at as payout_created_at
from public.ride_requests rr
join public.rides r on r.id = rr.ride_id
join public.vybe_payments p on p.ride_request_id = rr.id and p.status = 'paid'
left join lateral (
  select dp.id, dp.status, dp.utr, dp.created_at
  from public.driver_payouts dp
  where dp.ride_request_id = rr.id
  order by dp.created_at desc
  limit 1
) latest on true
where rr.status = 'completed'
  and r.driver_id = auth.uid();
revoke all on public.driver_earnings from anon;
grant select on public.driver_earnings to authenticated;
