import { adminClient, requireUser } from '../_shared/clients.ts';
import { handleOptions, jsonResponse } from '../_shared/response.ts';
import { razorpayXCredentials, razorpayXRequest } from '../_shared/razorpayx.ts';

const activeStatuses = ['created', 'pending', 'queued', 'processing', 'processed'];
const terminalStatuses = ['processed', 'reversed', 'failed', 'rejected', 'cancelled'];

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST.' }, 405);

  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    const requestId = typeof body.ride_request_id === 'string' ? body.ride_request_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return jsonResponse({ error: 'A valid completed ride request is required.' }, 400);

    const admin = adminClient();
    const { data: rideRequest, error: requestError } = await admin.from('ride_requests')
      .select('id,status,rides!inner(driver_id,fare_per_seat)')
      .eq('id', requestId).maybeSingle();
    const ride = Array.isArray(rideRequest?.rides) ? rideRequest.rides[0] : rideRequest?.rides;
    if (requestError || !rideRequest || !ride) return jsonResponse({ error: 'Completed ride request not found.' }, 404);
    if (ride.driver_id !== user.id) return jsonResponse({ error: 'Only this ride’s driver can request its payout.' }, 403);
    if (rideRequest.status !== 'completed') return jsonResponse({ error: 'Both rider and driver must confirm the ride is complete first.' }, 409);

    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('verified,account_type').eq('id', user.id).maybeSingle();
    if (profileError || !profile?.verified || !['driver', 'both'].includes(profile.account_type)) {
      return jsonResponse({ error: 'A verified Driver or Both account is required for payouts.' }, 403);
    }

    const { data: payment, error: paymentError } = await admin.from('vybe_payments')
      .select('id,amount_paise,status').eq('ride_request_id', requestId).eq('status', 'paid').maybeSingle();
    const farePaise = Math.round(Number(ride.fare_per_seat) * 100);
    if (paymentError || !payment || payment.amount_paise !== farePaise) {
      return jsonResponse({ error: 'A captured payment matching the current ride fare is required.' }, 409);
    }
    if (!Number.isSafeInteger(farePaise) || farePaise < 100 || farePaise > 100000000) {
      return jsonResponse({ error: 'The driver payout must be between ₹1 and ₹1,000,000.' }, 400);
    }

    const { data: payoutAccount, error: accountError } = await admin.from('driver_payout_accounts')
      .select('provider_fund_account_id,payout_method').eq('driver_id', user.id).maybeSingle();
    if (accountError || !payoutAccount) return jsonResponse({ error: 'Set up a UPI or bank payout account first.' }, 409);

    const { accountNumber } = razorpayXCredentials();
    let { data: payout } = await admin.from('driver_payouts')
      .select('id,provider_payout_id,status,amount_paise')
      .eq('ride_request_id', requestId).in('status', activeStatuses)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (payout?.status === 'processed') return jsonResponse({ status: 'processed', payout_id: payout.provider_payout_id });
    if (payout?.provider_payout_id) return jsonResponse({ status: payout.status, payout_id: payout.provider_payout_id });

    if (!payout) {
      const referenceId = `vybe-${crypto.randomUUID().replaceAll('-', '')}`;
      const { data: inserted, error: insertError } = await admin.from('driver_payouts').insert({
        driver_id: user.id,
        ride_request_id: requestId,
        amount_paise: farePaise,
        currency: 'INR',
        reference_id: referenceId,
        status: 'created',
      }).select('id,provider_payout_id,status,amount_paise').single();
      if (insertError && insertError.code !== '23505') {
        console.error('Could not reserve driver payout', insertError.message);
        return jsonResponse({ error: 'Could not reserve this payout. Refresh and try again.' }, 500);
      }
      if (inserted) payout = inserted;
      else {
        const { data: existing } = await admin.from('driver_payouts')
          .select('id,provider_payout_id,status,amount_paise')
          .eq('ride_request_id', requestId).in('status', activeStatuses)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!existing) return jsonResponse({ error: 'A payout is already being processed. Refresh the Wallet page shortly.' }, 409);
        payout = existing;
      }
    }
    if (payout.amount_paise !== farePaise) return jsonResponse({ error: 'The reserved payout amount no longer matches this fare. Contact support.' }, 409);

    const { data: reservation } = await admin.from('driver_payouts')
      .select('reference_id').eq('id', payout.id).single();
    if (!reservation?.reference_id) return jsonResponse({ error: 'Could not load the payout reference. Retry shortly.' }, 500);

    try {
      const providerPayout = await razorpayXRequest('/payouts', 'POST', {
        account_number: accountNumber,
        fund_account_id: payoutAccount.provider_fund_account_id,
        amount: farePaise,
        currency: 'INR',
        mode: payoutAccount.payout_method === 'upi' ? 'UPI' : 'IMPS',
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: reservation.reference_id,
        narration: 'Vybe Driver Pay',
        notes: { ride_request_id: requestId },
      }, payout.id);
      const status = ['pending', 'queued', 'processing', 'processed', 'rejected', 'failed', 'reversed', 'cancelled'].includes(providerPayout.status)
        ? providerPayout.status : 'processing';
      const { error: updateError } = await admin.from('driver_payouts').update({
        provider_payout_id: providerPayout.id,
        status,
        utr: providerPayout.utr || null,
        failure_reason: providerPayout.failure_reason || null,
        updated_at: new Date().toISOString(),
      }).eq('id', payout.id).not('status', 'in', `(${terminalStatuses.join(',')})`);
      if (updateError) {
        console.error('Provider payout created but local status update failed', updateError.message);
        return jsonResponse({ error: 'Payout was accepted by RazorpayX; its status is syncing. Refresh Wallet shortly.' }, 202);
      }
      const { data: latest } = await admin.from('driver_payouts').select('status,provider_payout_id')
        .eq('id', payout.id).maybeSingle();
      return jsonResponse({ status: latest?.status || status, payout_id: latest?.provider_payout_id || providerPayout.id, amount_paise: farePaise });
    } catch (error) {
      // Keep the same reservation/idempotency key so a retry cannot create a duplicate transfer.
      console.error('RazorpayX payout request needs a safe retry', error instanceof Error ? error.message : 'provider error');
      return jsonResponse({ error: 'Payout status is not confirmed yet. Refresh Wallet in a moment; a retry uses the same protected request.' }, 502);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not request the driver payout.';
    return jsonResponse({ error: message }, message.includes('Sign in') || message.includes('session') ? 401 : 500);
  }
});
