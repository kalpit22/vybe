/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VYBE_RATE_PER_KM?: string;
}

interface Window {
  Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout;
  VybeAndroid?: {
    isNativeApp: () => boolean;
    openSmsComposer: (phone: string, message: string) => boolean;
    openEmergencyDialer: (phone: string) => boolean;
    openRazorpayCheckout: (options: string) => boolean;
  };
}

interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color: string };
  handler: (response: RazorpayPaymentResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayCheckout {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
}
