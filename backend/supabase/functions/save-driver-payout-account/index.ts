import { adminClient, requireUser } from '../_shared/clients.ts';
import { handleOptions, jsonResponse } from '../_shared/response.ts';
import { razorpayXRequest } from '../_shared/razorpayx.ts';

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST.' }, 405);

  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
    const method = body.payout_method === 'upi' ? 'upi' : body.payout_method === 'bank_account' ? 'bank_account' : '';
    if (name.length < 3 || name.length > 50 || !/^[\p{L}\p{M}0-9 .’'()/_-]+$/u.test(name)) {
      return jsonResponse({ error: 'Enter the account holder name (3–50 characters).' }, 400);
    }
    if (phone.length < 10 || phone.length > 15) return jsonResponse({ error: 'Enter a valid mobile number.' }, 400);
    if (!user.email) return jsonResponse({ error: 'Add and confirm an email address before setting up payouts.' }, 400);
    if (!method) return jsonResponse({ error: 'Choose UPI or bank transfer.' }, 400);

    const admin = adminClient();
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('verified,account_type').eq('id', user.id).maybeSingle();
    if (profileError || !profile) return jsonResponse({ error: 'Driver profile not found.' }, 404);
    if (!profile.verified || !['driver', 'both'].includes(profile.account_type)) {
      return jsonResponse({ error: 'A verified Driver or Both account is required to set up payouts.' }, 403);
    }

    let fundAccountInput: Record<string, unknown>;
    let destinationMask: string;
    if (method === 'upi') {
      const vpa = typeof body.vpa === 'string' ? body.vpa.trim() : '';
      if (!/^[a-z0-9._-]{2,64}@[a-z0-9.-]{2,64}$/i.test(vpa)) {
        return jsonResponse({ error: 'Enter a valid UPI ID, such as name@bank.' }, 400);
      }
      fundAccountInput = { account_type: 'vpa', vpa: { address: vpa } };
      const [, handle] = vpa.split('@');
      destinationMask = `••••••@${handle}`;
    } else {
      const accountNumber = typeof body.account_number === 'string' ? body.account_number.replace(/\s/g, '') : '';
      const ifsc = typeof body.ifsc === 'string' ? body.ifsc.replace(/\s/g, '').toUpperCase() : '';
      if (!/^\d{6,34}$/.test(accountNumber) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        return jsonResponse({ error: 'Enter a valid bank account number and 11-character IFSC code.' }, 400);
      }
      fundAccountInput = { account_type: 'bank_account', bank_account: { name, ifsc_code: ifsc, account_number: accountNumber } };
      destinationMask = `••••${accountNumber.slice(-4)} · ${ifsc}`;
    }

    // Payout details are sent directly to RazorpayX and are never written to our database or logs.
    const contact = await razorpayXRequest('/contacts', 'POST', {
      name,
      email: user.email,
      contact: phone,
      type: 'vendor',
      reference_id: user.id,
    });
    const fundAccount = await razorpayXRequest('/fund_accounts', 'POST', {
      contact_id: contact.id,
      ...fundAccountInput,
    });
    if (typeof contact.id !== 'string' || typeof fundAccount.id !== 'string') {
      return jsonResponse({ error: 'RazorpayX did not return a payout account reference.' }, 502);
    }

    const { error: saveError } = await admin.from('driver_payout_accounts').upsert({
      driver_id: user.id,
      provider_contact_id: contact.id,
      provider_fund_account_id: fundAccount.id,
      payout_method: method,
      account_holder_name: name,
      destination_mask: destinationMask,
      updated_at: new Date().toISOString(),
    });
    if (saveError) {
      console.error('Could not save payout account references', saveError.message);
      return jsonResponse({ error: 'RazorpayX accepted the payout details, but Vybe could not save the account reference. Retry setup or contact support.' }, 500);
    }
    return jsonResponse({
      payout_method: method,
      account_holder_name: name,
      destination_mask: destinationMask,
      message: 'Payout account saved. Raw account details are not stored in Vybe.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the payout account.';
    return jsonResponse({ error: message }, message.includes('Sign in') || message.includes('session') ? 401 : 502);
  }
});
