import { createClient } from "npm:@supabase/supabase-js@2";

function keyFromEnv(mapName: string, legacyNames: string[]) {
  for (const name of legacyNames) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  const raw = Deno.env.get(mapName);
  if (!raw) return "";
  try {
    const values = JSON.parse(raw) as Record<string, string>;
    return values.default || Object.values(values)[0] || "";
  } catch {
    return "";
  }
}

export function supabaseUrl() {
  return Deno.env.get("SUPABASE_URL") || "";
}

export function adminClient() {
  const url = supabaseUrl();
  const secretKey = keyFromEnv("SUPABASE_SECRET_KEYS", ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (!url || !secretKey) throw new Error("Supabase server credentials are unavailable in this function.");
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Sign in to continue.");

  const url = supabaseUrl();
  const publishableKey = keyFromEnv("SUPABASE_PUBLISHABLE_KEYS", ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"]);
  if (!url || !publishableKey) throw new Error("Supabase authentication is not configured for this function.");

  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Your session expired. Sign in again.");
  return data.user;
}
