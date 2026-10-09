# Vybe frontend

This is the React + TypeScript web app and Android WebView wrapper.

## Local setup

```sh
npm install
cp .env.example .env
npm run dev
```

Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` for Supabase mode. Leave them blank to use demo mode. Add a restricted `VITE_GOOGLE_MAPS_API_KEY` if you want live Google Maps routes. Never put Supabase service-role or payment-provider secrets here.

Use `npm run typecheck` and `npm run build` for local checks. Android commands are documented in the root [README](../README.md).
