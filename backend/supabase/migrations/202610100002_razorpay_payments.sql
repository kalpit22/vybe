-- Payment records are written only by trusted Edge Functions.
-- Use an app-specific name so an unrelated existing public.payments table is left untouched.
create table if not exists public.vybe_payments (
  id uuid primary key default gen_random_uuid(),
  ride_request_id uuid not null references public.ride_requests(id) on delete restrict,
  rider_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_order_id text not null unique,
  provider_payment_id text unique,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created' check (status in ('created','authorized','paid','failed','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists vybe_payments_rider_created_idx on public.vybe_payments (rider_id, created_at desc);
create index if not exists vybe_payments_request_created_idx on public.vybe_payments (ride_request_id, created_at desc);
create unique index if not exists vybe_payments_one_active_order_per_request_idx
  on public.vybe_payments (ride_request_id) where status in ('created','authorized','paid');

alter table public.vybe_payments enable row level security;
drop policy if exists "Riders and drivers can read Vybe ride payments" on public.vybe_payments;
create policy "Riders and drivers can read Vybe ride payments" on public.vybe_payments
  for select to authenticated using (
    rider_id = auth.uid()
    or exists (
      select 1 from public.ride_requests rr
      join public.rides r on r.id = rr.ride_id
      where rr.id = vybe_payments.ride_request_id and r.driver_id = auth.uid()
    )
  );

revoke all on public.vybe_payments from anon, authenticated;
grant select on public.vybe_payments to authenticated;
