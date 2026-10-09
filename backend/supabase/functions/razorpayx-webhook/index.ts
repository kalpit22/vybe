import { adminClient } from '../_shared/clients.ts';
import { constantTimeHexEqual, hmacHex } from '../_shared/razorpay.ts';
import { razorpayXWebhookSecret } from '../_shared/razorpayx.ts';
import { handleOptions, jsonResponse } from '../_shared/response.ts';

const eventStatuses: Record<string, string> = {
  'payout.pending': 'pending',
  'payout.rejected': 'rejected',
  'payout.queued': 'queued',
  'payout.initiated': 'processing',
  'payout.processed': 'processed',
  'payout.reversed': 'reversed',
  'payout.failed': 'failed',
};
const terminalStatuses = ['processed', 'reversed', 'failed', 'rejected', 'cancelled'];

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST.' }, 405);

  const rawBody = await request.text();
  try {
    const signature = request.headers.get('x-razorpay-signature') || '';
    const expected = await hmacHex(razorpayXWebhookSecret(), rawBody);
    if (!constantTimeHexEqual(expected, signature)) return jsonResponse({ error: 'Invalid webhook signature.' }, 400);

    const event = JSON.parse(rawBody);
    const providerPayout = event?.payload?.payout?.entity;
    if (!providerPayout?.id || typeof providerPayout.id !== 'string') return jsonResponse({ received: true });
    const eventStatus = eventStatuses[event.event] || (event.event === 'payout.updated' ? providerPayout.status : '');
    if (!['pending', 'queued', 'processing', 'processed', 'rejected', 'failed', 'reversed', 'cancelled'].includes(eventStatus)) {
      return jsonResponse({ received: true });
    }

    const admin = adminClient();
    let { data: row } = await admin.from('driver_payouts')
      .select('id,status,provider_payout_id').eq('provider_payout_id', providerPayout.id).maybeSingle();
    const referenceId = typeof providerPayout.reference_id === 'string' ? providerPayout.reference_id : '';
    if (!row && /^[a-z0-9-]{1,40}$/i.test(referenceId)) {
      const result = await admin.from('driver_payouts')
        .select('id,status,provider_payout_id').eq('reference_id', referenceId).maybeSingle();
      row = result.data;
    }
    if (!row) return jsonResponse({ received: true });
    if (terminalStatuses.includes(row.status)) return jsonResponse({ received: true });

    const update: Record<string, unknown> = {
      provider_payout_id: row.provider_payout_id || providerPayout.id,
      status: eventStatus,
      utr: typeof providerPayout.utr === 'string' ? providerPayout.utr : null,
      failure_reason: typeof providerPayout.failure_reason === 'string' ? providerPayout.failure_reason.slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    };
    await admin.from('driver_payouts').update(update)
      .eq('id', row.id)
      .not('status', 'in', `(${terminalStatuses.join(',')})`);
    return jsonResponse({ received: true });
  } catch (error) {
    console.error('RazorpayX webhook could not be processed', error instanceof Error ? error.message : 'webhook error');
    return jsonResponse({ error: 'Webhook could not be processed.' }, 500);
  }
});
