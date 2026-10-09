export type Ride = {
  id: string; driver_id: string; origin: string; destination: string; departure_at: string;
  seats_available: number; vehicle: string; fare_per_seat: number; distance_km?: number | null; women_only: boolean;
  community_name: string | null; notes: string | null; status: string;
  profiles?: { full_name: string | null; avatar_url: string | null; verified: boolean; driver_rating_average?: number; driver_rating_count?: number } | null;
};
export type Payment = { id: string; status: string; amount_paise: number; currency: string; created_at?: string };
export type DriverReview = { id: string; ride_request_id: string; rating: number; comment: string | null };
export type RideRequest = {
  id: string; ride_id: string; status: string; rider_completed_at?: string | null; driver_completed_at?: string | null;
  rides?: Ride | null; payments?: Payment[]; driver_reviews?: DriverReview[];
};
export type AccountType = 'rider' | 'driver' | 'both';
export type RecurringCommute = {
  id: string;
  user_id: string;
  origin: string;
  destination: string;
  departure_time: string;
  weekday_mask: number;
  active: boolean;
  created_at: string;
};
export type WalletTransaction = {
  id: string;
  coin_delta: number;
  description: string;
  created_at: string;
  ride_request_id: string | null;
};
export type DriverEarning = {
  ride_request_id: string;
  driver_id: string;
  origin: string;
  destination: string;
  departure_at: string;
  amount_paise: number;
  payout_id: string | null;
  payout_status: string | null;
  utr: string | null;
  payout_created_at: string | null;
};
export type DriverPayout = {
  id: string;
  ride_request_id: string;
  amount_paise: number;
  currency: string;
  status: string;
  utr: string | null;
  failure_reason: string | null;
  created_at: string;
};
export type DriverPayoutAccount = {
  driver_id: string;
  payout_method: 'upi' | 'bank_account';
  account_holder_name: string;
  destination_mask: string;
  updated_at: string;
};
