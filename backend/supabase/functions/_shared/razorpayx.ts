export function razorpayXCredentials() {
  const keyId = Deno.env.get('RAZORPAYX_KEY_ID') || '';
  const keySecret = Deno.env.get('RAZORPAYX_KEY_SECRET') || '';
  const accountNumber = Deno.env.get('RAZORPAYX_ACCOUNT_NUMBER') || '';
  if (!keyId || !keySecret || !accountNumber) {
    throw new Error('RazorpayX payout credentials are not configured in Supabase Edge Function secrets.');
  }
  return { keyId, keySecret, accountNumber };
}

export function razorpayXWebhookSecret() {
  const secret = Deno.env.get('RAZORPAYX_WEBHOOK_SECRET') || '';
  if (!secret) throw new Error('RazorpayX webhook secret is not configured.');
  return secret;
}

export async function razorpayXRequest(path: string, method = 'GET', body?: unknown, idempotencyKey?: string) {
  const { keyId, keySecret } = razorpayXCredentials();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'X-Payout-Idempotency': idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.description || 'RazorpayX could not process the payout request.';
    throw new Error(message);
  }
  return payload;
}
