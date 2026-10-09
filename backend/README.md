# Vybe backend

This folder contains the Supabase PostgreSQL migrations, Edge Functions, and CLI configuration.

## Database

Apply these SQL files in order in the Supabase SQL Editor:

1. `supabase/migrations/202610100001_init_vybe.sql`
2. `supabase/migrations/202610100002_razorpay_payments.sql`
3. `supabase/migrations/202610100003_driver_rider_accounts.sql`
4. `supabase/migrations/202610100004_connect_schedule_wallet.sql`
5. `supabase/migrations/202610100005_driver_map_fares_payouts.sql`

If migrations 001–004 were already applied, apply only 005. Do not rerun earlier migrations on an existing project unless you have reviewed their effects.

## Edge Functions

Run Supabase CLI commands from this `backend/` directory:

```sh
supabase login
supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
supabase functions deploy create-payment-order
supabase functions deploy verify-payment
supabase functions deploy razorpay-webhook
supabase functions deploy save-driver-payout-account
supabase functions deploy request-driver-payout
supabase functions deploy razorpayx-webhook
```

Store Razorpay and RazorpayX private keys and webhook secrets in Supabase **Project Settings → Edge Functions → Secrets**. Use provider test credentials before enabling live payments. The frontend must never receive these private values.
