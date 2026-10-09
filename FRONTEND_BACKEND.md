# Frontend and backend files

The repository separates the browser/mobile app from the Supabase server code. The frontend calls a small adapter, while PostgreSQL Row Level Security and Edge Functions enforce backend rules.

## Frontend — `frontend/`

| File or folder | Role |
| --- | --- |
| `src/App.tsx` | App screens, rider and driver flows, booking, safety, wallet, payment and payout UI. |
| `src/components/` | Reusable interface components, including the route map. |
| `src/lib/backend.ts` | Frontend-to-backend API for auth, profiles, rides, requests, payments and payouts. |
| `src/lib/supabase.ts` | Browser client created from Vite environment variables; stays unset for demo mode. |
| `src/lib/googleMaps.ts` | Google Maps loader and driving-route requests. |
| `public/` | Static assets, including the Vybe logo. |
| `android/` | Android Studio wrapper for the same frontend. |
| `.env.example` | Safe template for public browser settings. Copy to `.env` for local use. |

## Backend — `backend/`

| File or folder | Role |
| --- | --- |
| `supabase/migrations/` | PostgreSQL tables, constraints, database functions and Row Level Security policies. |
| `supabase/functions/` | Server-side payment order, verification, webhook and driver payout handlers. |
| `supabase/functions/_shared/` | Shared server-side Supabase and payment provider helpers. |
| `supabase/config.toml` | Supabase CLI project configuration. |

## How a request flows

```text
frontend/src/App.tsx
       │
       ▼
frontend/src/lib/backend.ts ─────► Supabase Auth / PostgreSQL
       │                            (Row Level Security)
       └─────────────────────────► Supabase Edge Functions
                                    (payment/payout secrets stay server-side)
```

The browser may use the Supabase publishable key. It must never contain a Supabase `service_role` key or Razorpay/RazorpayX secret. Add provider secrets only in Supabase **Project Settings → Edge Functions → Secrets**.
