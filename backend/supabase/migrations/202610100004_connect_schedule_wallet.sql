-- Persist recurring commute preferences and read-only Vybe coin ledger entries.
create table if not exists public.recurring_commutes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  origin text not null check (length(trim(origin)) > 0),
  destination text not null check (length(trim(destination)) > 0),
  departure_time time not null,
  -- Bit 0 is Sunday; bits 1 through 6 are Monday through Saturday.
  weekday_mask smallint not null default 62 check (weekday_mask between 1 and 127),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists recurring_commutes_user_created_idx
  on public.recurring_commutes (user_id, created_at desc);

alter table public.recurring_commutes enable row level security;
drop policy if exists "Users manage their own recurring commutes" on public.recurring_commutes;
create policy "Users manage their own recurring commutes" on public.recurring_commutes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.recurring_commutes to authenticated;

-- Coin balances are calculated from a server-managed ledger. Browser clients
-- can read their own history, but cannot create or alter coin entries.
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  coin_delta integer not null check (coin_delta <> 0),
  description text not null check (length(trim(description)) > 0),
  ride_request_id uuid references public.ride_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

alter table public.wallet_transactions enable row level security;
drop policy if exists "Users can read their own wallet history" on public.wallet_transactions;
create policy "Users can read their own wallet history" on public.wallet_transactions
  for select to authenticated using (user_id = auth.uid());
revoke all on public.wallet_transactions from anon, authenticated;
grant select on public.wallet_transactions to authenticated;
