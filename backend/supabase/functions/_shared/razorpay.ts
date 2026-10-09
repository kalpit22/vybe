export function razorpayCredentials() {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID") || "";
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
  if (!keyId || !keySecret) throw new Error("Razorpay test or live keys have not been added to Supabase Edge Function secrets.");
  return { keyId, keySecret };
}

export function webhookSecret() {
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") || "";
  if (!secret) throw new Error("Razorpay webhook secret has not been added to Supabase Edge Function secrets.");
  return secret;
}

export async function razorpayRequest(path: string, method = "GET", body?: unknown) {
  const { keyId, keySecret } = razorpayCredentials();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.description || "Razorpay could not complete the payment request.";
    throw new Error(message);
  }
  return payload;
}

export async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeHexEqual(left: string, right: string) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (!/^[a-f0-9]+$/.test(a) || !/^[a-f0-9]+$/.test(b) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
