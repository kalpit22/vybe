<p align="center">
  <img src="frontend/public/vybe-logo.jpeg" alt="Vybe — share the ride, catch the vibe" width="720" />
</p>

<h1 align="center">Vybe Carpool</h1>

<p align="center">A rider and driver carpool app built with React, TypeScript, and Supabase.</p>

**GitHub repository:** [kalpit22/vybe](https://github.com/kalpit22/vybe) · **Prototype:** [Open the Vybe MagicPath prototype](https://designs.magicpath.ai/v1/daring-air-2821) · **Product concept:** [Under 2 hours before](docs/under-2-hours-before.pdf)
 
 
 
 
 problem statement:-
Carpooling that people will actually use
   Submitted by Akshita. Most commuters drive alone, and carpooling stays rare because matching routes is awkward, splitting costs fairly is awkward, and riding with a stranger requires trust nobody has built. Build a platform that matches people by how much of their route and timing genuinely overlap, handles recurring trips, splits the cost by distance automatically, and takes safety seriously — verification, ratings, live tracking, women-only options.




TEAM: 2392608069-404 glitch found
2392608069 Aditya Ranjan
2392608047 Akash Nand sinha
2392608061 Rohit Tanaji Durgale 
2392608120 kalpit manoj kshirsagar
2392608032 mohammed asrar afzal sayed
2392608016 Jeevan mahadev durgale


   
## Project overview

Vybe helps people share planned rides. Riders can search routes and request seats; drivers can publish rides, choose fares, and manage requests. The app includes Supabase authentication and data, Google Maps route estimates, driver ratings, trusted contacts, SOS shortcuts, Razorpay checkout, and RazorpayX driver payout workflows.

The web app supports a demo mode so it can run before credentials are configured. Real accounts, saved bookings, maps, payments, and payouts require the corresponding provider setup described below.

## Product concept deck

The [six-page concept deck](docs/under-2-hours-before.pdf) describes Vybe's proposed product direction, including safety, fare policies, verified communities, and the business model. It is a concept document; not every proposal is implemented in the current app. In particular, the current SOS flow opens a message draft or phone dialer and requires the user to take action. It does not automatically call emergency services or send live-location alerts.

## Features

- **Rider and driver accounts:** Sign up as a Rider, Driver, or Both. Drivers can also request seats.
- **Ride search and booking:** Search routes, view open rides, request seats, and manage requests.
- **Ride offers and fares:** Drivers can publish available seats and set the final per-seat fare. A route-distance-based suggestion can help estimate the fare.
- **Recurring commutes and wallet:** Save recurring commute schedules and view wallet reward history when Supabase is configured.
- **Community options:** Search can apply women-only and community ride preferences.
- **Maps:** Google Maps can calculate a driving route and display estimated distance and travel time.
- **Driver ratings:** Riders can review drivers after a paid trip is completed.
- **Safety tools:** Save trusted contacts, prepare an SOS message with optional location, or open the emergency-call dialer. The app asks the user to send the message or place the call; it does not do so automatically.
- **Payments:** Razorpay Checkout collects payment after a driver accepts a booking request.
- **Driver payouts:** Verified drivers can save a payout destination with RazorpayX and request eligible payouts.
- **Android:** An Android Studio WebView wrapper uses the same frontend and native Razorpay checkout.


## Technology

| Area | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite |
| Backend and database | Supabase Auth, PostgreSQL, Row Level Security, Edge Functions |
| Maps | Google Maps JavaScript API and Routes API |
| Payments | Razorpay Standard Checkout and RazorpayX Payouts |
| Android | Android Studio, Java WebView wrapper, Razorpay Android SDK |
| CI | GitHub Actions: TypeScript check and production build |

## Repository layout

```text
vybe/
├── .github/workflows/build.yml
├── backend/
│   ├── README.md
│   └── supabase/
│       ├── functions/       # Payment, webhook, and payout Edge Functions
│       └── migrations/      # PostgreSQL schema and Row Level Security
├── docs/
│   └── under-2-hours-before.pdf  # Product concept deck
├── frontend/
│   ├── android/             # Android Studio wrapper
│   ├── public/              # Logo and static assets
│   ├── src/                 # React screens, components, and API client
│   ├── .env.example
│   └── package.json
├── FRONTEND_BACKEND.md
└── README.md
```

`frontend/src/lib/backend.ts` is the frontend-to-backend adapter. Supabase database access is governed by the policies in `backend/supabase/migrations/`; payment and payout operations that need private credentials run in `backend/supabase/functions/`. See [FRONTEND_BACKEND.md](FRONTEND_BACKEND.md) for the file-by-file connection map.

## Requirements

- macOS, Windows, or Linux
- [Node.js LTS](https://nodejs.org/en/download/) and npm
- [Visual Studio Code](https://code.visualstudio.com/Download) (recommended)
- A Supabase project for live authentication and database use
- Optional: a Google Cloud project with Maps billing enabled for live routes
- Optional: Razorpay and RazorpayX accounts for live payment and payout workflows
- Optional: Android Studio and Android SDK for the Android app

## Setup and run on macOS

1. Clone the repository and open its frontend folder in Terminal:

   ```sh
   git clone https://github.com/kalpit22/vybe.git
   cd vybe/frontend
   npm install
   cp .env.example .env
   ```

2. Open the repository in VS Code. From `vybe/frontend`, run `code ..` to open the repository root. If the `code` command is unavailable, open VS Code and choose **File → Open Folder…**.
3. For demo mode, leave the Supabase entries in `frontend/.env` empty. For live data, fill in the Supabase URL and publishable key as described in [Connect Supabase](#connect-supabase).
4. Start the app:

   ```sh
   npm run dev
   ```

5. Open the local address Vite prints, normally `http://localhost:5173`.

The project uses Vite environment variables prefixed with `VITE_`. Copying `.env.example` is optional for demo mode, but required before adding local provider settings.

## Environment variables

Set frontend values in `frontend/.env`. `.env` is ignored by Git. Do not commit real credentials.

| Variable | Required for | Where it comes from |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Live Supabase data | Supabase project URL in the project dashboard |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Live Supabase data | Supabase publishable key; a legacy anon key can use `VITE_SUPABASE_ANON_KEY` |
| `VITE_GOOGLE_MAPS_API_KEY` | Live route calculations | Restricted Google Maps browser key |
| `VITE_VYBE_RATE_PER_KM` | Optional fare suggestion default | Editable rupees per passenger per route kilometre; defaults to `12` |

The Supabase publishable/anon key is intended to be used in the browser. Database safety depends on correct Row Level Security policies. Never put a Supabase `service_role` key, Razorpay secret, or RazorpayX secret in `frontend/.env`.

## Connect Supabase

1. Create or open your project at [Supabase](https://supabase.com/).
2. In the Supabase dashboard, open **Connect** or **Settings → API Keys** and copy the project URL and publishable key into `frontend/.env`.
3. In **SQL Editor**, apply the migration files in this order for a new project:

   1. `backend/supabase/migrations/202610100001_init_vybe.sql`
   2. `backend/supabase/migrations/202610100002_razorpay_payments.sql`
   3. `backend/supabase/migrations/202610100003_driver_rider_accounts.sql`
   4. `backend/supabase/migrations/202610100004_connect_schedule_wallet.sql`
   5. `backend/supabase/migrations/202610100005_driver_map_fares_payouts.sql`

   If migrations 001–004 have already been applied, apply only 005. Avoid rerunning earlier migrations against an existing database without reviewing their effects.
4. In **Authentication → URL Configuration → Redirect URLs**, add `http://localhost:5173/**` and `vybe://auth/callback`.
5. Restart the frontend with `npm run dev`. With valid values, the app header shows **SUPABASE CONNECTED**.

Supabase accounts begin unverified. Booking and publishing are blocked until a trusted administrator verifies an account. Identity document checks and an administrator KYC workflow are not implemented in this project.

## Google Maps setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and select a project with Maps billing enabled.
2. Enable **Maps JavaScript API** and **Routes API**.
3. Create a browser API key. Restrict it to your local website origin (`http://localhost:5173/*`) and those two APIs. For the Android WebView, also allow `https://localhost/*`.
4. Set `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env` and restart Vite.

Vybe requests a route when a user selects the route or fare calculation action. Google Maps Platform usage may be billable; set usage limits and budgets in Google Cloud.

## Payments and driver payouts

### Razorpay Checkout

1. Create a Razorpay account and start with **Test Mode** API keys.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli). On macOS with Homebrew, run `brew install supabase/tap/supabase`. Then open Terminal in `backend/` and link the Supabase project.
3. In Supabase **Project Settings → Edge Functions → Secrets**, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` using the matching test credentials.
4. From `backend/`, log in, link the project, and deploy the payment functions:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy create-payment-order
   supabase functions deploy verify-payment
   supabase functions deploy razorpay-webhook
   ```

5. In Razorpay, configure a webhook to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/razorpay-webhook` with the same webhook secret. Enable `payment.authorized`, `payment.captured`, and `payment.failed` events.

The web or Android client receives only the public Razorpay key ID and a server-created order. Payment verification runs in Supabase before the ride is marked paid.

### RazorpayX driver payouts

1. Enable RazorpayX Payouts for the business account.
2. Add `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER`, and `RAZORPAYX_WEBHOOK_SECRET` as Supabase Edge Function secrets.
3. From `backend/`, deploy `save-driver-payout-account`, `request-driver-payout`, and `razorpayx-webhook`.
4. Configure a RazorpayX webhook to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/razorpayx-webhook` with the matching secret and payout events supported by your account, such as `payout.pending`, `payout.rejected`, `payout.queued`, `payout.initiated`, `payout.processed`, `payout.updated`, `payout.reversed`, and `payout.failed`.

Razorpay checkout and RazorpayX payouts are separate services. The business must fund the RazorpayX payout balance; capturing a rider payment does not automatically fund or split-settle a payout. Use test credentials and test destinations before considering live payments.

## Usage

1. Create an account as **Rider**, **Driver**, or **Both**. Email confirmation may be required by Supabase settings.
2. For a driver account, publish a ride with route, departure time, available seats, vehicle, and your final fare. The route calculator can suggest a distance-based fare, which the driver can edit.
3. For a rider, search for a route and request an available seat. The request appears in **My Rides**; the driver can accept or decline it.
4. After a driver accepts, the rider can pay through Razorpay when it is configured.
5. At the end of a paid trip, both participants confirm completion. The rider can then leave a driver rating; eligible driver earnings can be requested as a payout.
6. Add trusted contacts in the safety area. SOS opens the system messaging app with a draft; the user reviews and sends it. The emergency number shortcut opens the dialer and requires the user to place the call.

Supabase mode requires administrator verification for booking and ride publishing. The app has no automated KYC provider. Demo mode data is temporary and is not visible to other users.

## Android app

The Android Studio project is in `frontend/android/`. Install Android Studio and the Android SDK, configure Supabase redirect URL `vybe://auth/callback`, and build from `frontend/`:

```sh
npm install
npm run android:sync
npm run android:apk
```

The debug APK is written to `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. `npm run android:open` opens the project in Android Studio. The generated Android web assets are ignored and recreated by `android:sync`.

## Development and build commands

Run these commands from `frontend/`:

```sh
npm run dev         # Start Vite development server
npm run typecheck   # TypeScript project check
npm run build       # Typecheck and create production web assets
npm run preview     # Preview the production build locally
npm run android:sync
npm run android:apk
```

GitHub Actions runs `npm ci`, `npm run typecheck`, and `npm run build` for pushes and pull requests to `main`. A production build was verified for this repository layout.

## Troubleshooting

- **The app stays in demo mode:** Check that both Supabase values in `frontend/.env` are set, then stop and restart `npm run dev`.
- **Email confirmation or password reset does not return to Vybe:** Add `http://localhost:5173/**` and `vybe://auth/callback` to Supabase Auth redirect URLs.
- **Ride actions show a database or permission error:** Apply the migrations and keep Row Level Security enabled. Booking and ride publishing require an administrator-verified profile.
- **The map does not load:** Check Maps billing, enabled APIs, the browser key restrictions, and the current website origin.
- **Payments or payouts are unavailable:** Check the Supabase Edge Function secrets, deployed functions, webhook configuration, and provider test-mode account.

## Security and privacy

- Never commit `.env`, service-role keys, Razorpay/RazorpayX secrets, webhook secrets, passwords, or signing keystores.
- The root `.gitignore` excludes local environment files, dependency folders, build output, Android local settings, and generated Android web assets. `frontend/.env.example` contains blank values and is safe to commit.
- Database policies in the migrations restrict access. Do not remove or weaken Row Level Security to make a query work; fix the policy or request instead.
- The SOS action does not silently send an SMS or call emergency services.
- Do not use live payments until provider onboarding, webhook signatures, payout funding, identity verification, and production redirect URLs are configured.

## Status and known limitations

The source includes a runnable web frontend, Supabase schema and Edge Functions, Android wrapper, and CI build workflow. Live integrations remain dependent on owner-managed credentials and third-party project setup. Automated identity verification, a complete admin/KYC console, production app signing, and app-store release materials are not included.

| Readiness item | Status |
| --- | --- |
| Project description, feature list, and technology stack | Documented above |
| macOS setup, environment variables, and usage | Documented above |
| Frontend/backend folder map and integration flow | Included in `FRONTEND_BACKEND.md` |
| Local credentials template | Included as `frontend/.env.example`; values are blank |
| Typecheck, production build, and GitHub Actions workflow | Included and build verified |
| Live Supabase, Maps, Razorpay, and RazorpayX credentials | Must be configured by the project owner; no private keys are committed |
| Identity verification and production app signing | Not implemented; required before a public production launch |

## Links

- [GitHub repository](https://github.com/kalpit22/vybe)
- [Vybe prototype](https://designs.magicpath.ai/v1/daring-air-2821)
- [Supabase dashboard](https://supabase.com/dashboard)
- [Supabase CLI documentation](https://supabase.com/docs/guides/cli)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Google Maps Platform documentation](https://developers.google.com/maps/documentation)
- [Razorpay documentation](https://razorpay.com/docs/)
- [RazorpayX payout documentation](https://razorpay.com/docs/api/x/payouts/)
- [Node.js downloads](https://nodejs.org/en/download/)
- [Visual Studio Code for macOS](https://code.visualstudio.com/Download)
- [Android Studio](https://developer.android.com/studio)

## Contributing and support

Report bugs and request improvements in [GitHub Issues](https://github.com/kalpit22/vybe/issues). For larger changes, open an issue before starting implementation. Keep provider secrets out of commits and use demo mode or provider test credentials during development.

## License

No `LICENSE` file is included yet. Until the repository owner adds a license, standard copyright applies and reuse or redistribution is not granted by this README.
