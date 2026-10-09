import { supabase } from './supabase';
import type { AccountType, DriverPayoutAccount, RecurringCommute } from './types';

/**
 * Frontend API for Vybe's Supabase backend.
 * Keep database queries and Edge Function calls here so React components do
 * not need to know the table names or API details.
 *
 * Razorpay secrets and payment verification live in supabase/functions and
 * must never be added to this browser-side module.
 */
function client() {
  if (!supabase) throw new Error('Supabase is not configured. Add the Vite Supabase values to .env.');
  return supabase;
}

export type Contact = { id: string; name: string; phone: string | null; email: string | null };
export type IncomingRequest = {
  id: string;
  ride_id: string;
  rider_id: string;
  status: string;
  rider_completed_at: string | null;
  driver_completed_at: string | null;
  created_at: string;
  rider?: { full_name: string | null } | null;
  ride?: { origin: string; destination: string; departure_at: string; fare_per_seat: number } | null;
  payments?: { status: string; amount_paise: number }[];
};

export const backend = {
  auth: {
    getUser: () => client().auth.getUser(),
    onAuthStateChange: (callback: (event: string) => void) =>
      client().auth.onAuthStateChange(event => callback(event)),
    exchangeCodeForSession: (code: string) => client().auth.exchangeCodeForSession(code),
    signIn: (email: string, password: string) => client().auth.signInWithPassword({ email, password }),
    signUp: (email: string, password: string, name: string, accountType: AccountType, redirectTo: string) =>
      client().auth.signUp({ email, password, options: { data: { full_name: name, account_type: accountType }, emailRedirectTo: redirectTo } }),
    sendPasswordReset: (email: string, redirectTo: string) =>
      client().auth.resetPasswordForEmail(email, { redirectTo }),
    updatePassword: (password: string) => client().auth.updateUser({ password }),
    signOut: () => client().auth.signOut(),
  },

  profiles: {
    get: (userId: string) => client().from('profiles').select('full_name,verified,account_type,driver_rating_average,driver_rating_count').eq('id', userId).maybeSingle(),
    setAccountType: (userId: string, accountType: AccountType) =>
      client().from('profiles').update({ account_type: accountType }).eq('id', userId).select('account_type').single(),
  },

  rides: {
    listOpen: () => client().from('rides').select('*, profiles!rides_driver_id_fkey(full_name,avatar_url,verified,driver_rating_average,driver_rating_count)').eq('status', 'open').order('departure_at'),
    listIdsForDriver: (driverId: string) => client().from('rides').select('id').eq('driver_id', driverId),
    create: (ride: {
      driver_id: string; origin: string; destination: string; departure_at: string;
      seats_available: number; vehicle: string; fare_per_seat: number; distance_km: number | null; women_only: boolean; community_name: string | null;
    }) => client().from('rides').insert(ride),
  },

  rideRequests: {
    listForRider: (riderId: string) => client().from('ride_requests')
      .select('id,ride_id,status,rider_completed_at,driver_completed_at,rides(*),payments:vybe_payments(id,status,amount_paise,currency,created_at),driver_reviews(id,ride_request_id,rating,comment)')
      .eq('rider_id', riderId).order('created_at', { ascending: false }),
    listForRides: (rideIds: string[]) => client().from('ride_requests')
      .select('id,ride_id,rider_id,status,rider_completed_at,driver_completed_at,created_at,rider:profiles!ride_requests_rider_id_fkey(full_name),ride:rides!ride_requests_ride_id_fkey(origin,destination,departure_at,fare_per_seat),payments:vybe_payments(status,amount_paise)')
      .in('ride_id', rideIds).order('created_at', { ascending: false }),
    create: (rideId: string, riderId: string) =>
      client().from('ride_requests').insert({ ride_id: rideId, rider_id: riderId, message: null }),
    updatePendingStatus: (requestId: string, status: 'accepted' | 'declined') =>
      client().from('ride_requests').update({ status }).eq('id', requestId).eq('status', 'pending').select('id').maybeSingle(),
    confirmCompletion: (requestId: string) =>
      client().rpc('confirm_ride_completion', { p_request_id: requestId }),
  },

  reviews: {
    create: (review: { ride_request_id: string; ride_id: string; rider_id: string; driver_id: string; rating: number; comment: string | null }) =>
      client().from('driver_reviews').insert(review),
  },

  contacts: {
    listForUser: (userId: string) => client().from('trusted_contacts').select('id,name,phone,email').eq('user_id', userId).order('created_at'),
    create: (userId: string, name: string, phone: string | null, email: string | null) =>
      client().from('trusted_contacts').insert({ user_id: userId, name, phone, email }).select('id,name,phone,email').single(),
    remove: (contactId: string) => client().from('trusted_contacts').delete().eq('id', contactId),
  },

  commutes: {
    listForUser: (userId: string) => client().from('recurring_commutes')
      .select('id,user_id,origin,destination,departure_time,weekday_mask,active,created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }),
    create: (commute: Omit<RecurringCommute, 'id' | 'created_at'>) =>
      client().from('recurring_commutes').insert(commute)
        .select('id,user_id,origin,destination,departure_time,weekday_mask,active,created_at').single(),
    remove: (commuteId: string) => client().from('recurring_commutes').delete().eq('id', commuteId),
  },

  wallet: {
    listTransactions: (userId: string) => client().from('wallet_transactions')
      .select('id,coin_delta,description,created_at,ride_request_id')
      .eq('user_id', userId).order('created_at', { ascending: false }),
  },

  payments: {
    createOrder: (requestId: string) => client().functions.invoke('create-payment-order', { body: { ride_request_id: requestId } }),
    verify: (response: RazorpayPaymentResponse) => client().functions.invoke('verify-payment', { body: response }),
  },

  driverPayouts: {
    account: (driverId: string) => client().from('driver_payout_accounts')
      .select('driver_id,payout_method,account_holder_name,destination_mask,updated_at')
      .eq('driver_id', driverId).maybeSingle(),
    earnings: () => client().from('driver_earnings')
      .select('ride_request_id,driver_id,origin,destination,departure_at,amount_paise,payout_id,payout_status,utr,payout_created_at')
      .order('departure_at', { ascending: false }),
    history: (driverId: string) => client().from('driver_payouts')
      .select('id,ride_request_id,amount_paise,currency,status,utr,failure_reason,created_at')
      .eq('driver_id', driverId).order('created_at', { ascending: false }),
    saveAccount: (payload: { name: string; phone: string; payout_method: 'upi' | 'bank_account'; vpa?: string; account_number?: string; ifsc?: string }) =>
      client().functions.invoke('save-driver-payout-account', { body: payload }),
    request: (requestId: string) =>
      client().functions.invoke('request-driver-payout', { body: { ride_request_id: requestId } }),
  },

  reports: {
    create: (report: {
      reporter_id: string; reported_user_id: string; ride_id: string; category: string; details: string | null;
    }) => client().from('reports').insert(report),
  },
};
