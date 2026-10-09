import { adminClient, requireUser } from "../_shared/clients.ts";
import { handleOptions, jsonResponse } from "../_shared/response.ts";
import { razorpayCredentials, razorpayRequest } from "../_shared/razorpay.ts";

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return jsonResponse({ error: "Use POST." }, 405);

  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    const requestId = typeof body.ride_request_id === "string" ? body.ride_request_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return jsonResponse({ error: "A valid accepted ride request is required." }, 400);

    const admin = adminClient();
    const { data: rideRequest, error: requestError } = await admin
      .from("ride_requests")
      .select("id,rider_id,status,rides!inner(id,origin,destination,fare_per_seat,status)")
      .eq("id", requestId)
      .eq("rider_id", user.id)
      .maybeSingle();
    if (requestError || !rideRequest) return jsonResponse({ error: "Ride request not found." }, 404);
    if (rideRequest.status !== "accepted") return jsonResponse({ error: "Payment is available after the driver accepts your request." }, 409);

    const ride = Array.isArray(rideRequest.rides) ? rideRequest.rides[0] : rideRequest.rides;
    const amountPaise = Math.round(Number(ride?.fare_per_seat) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 100 || amountPaise > 100000000) {
      return jsonResponse({ error: "This ride fare cannot be charged. Update the fare to an amount between ₹1 and ₹1,000,000." }, 400);
    }

    const { data: paid } = await admin.from("vybe_payments").select("id,status").eq("ride_request_id", requestId).eq("status", "paid").maybeSingle();
    if (paid) return jsonResponse({ error: "This ride request is already paid.", status: "paid" }, 409);

    const { keyId } = razorpayCredentials();
    const { data: active } = await admin
      .from("vybe_payments")
      .select("id,provider_order_id,amount_paise,currency,status")
      .eq("ride_request_id", requestId)
      .in("status", ["created", "authorized"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active) {
      return jsonResponse({ key_id: keyId, order_id: active.provider_order_id, amount: active.amount_paise, currency: active.currency, payment_id: active.id });
    }

    const paymentId = crypto.randomUUID();
    const order = await razorpayRequest("/orders", "POST", {
      amount: amountPaise,
      currency: "INR",
      receipt: paymentId,
      notes: { payment_id: paymentId, ride_request_id: requestId },
    });
    const { error: insertError } = await admin.from("vybe_payments").insert({
      id: paymentId,
      ride_request_id: requestId,
      rider_id: user.id,
      provider: "razorpay",
      provider_order_id: order.id,
      amount_paise: amountPaise,
      currency: "INR",
      status: "created",
    });
    if (insertError) {
      console.error("Could not persist Razorpay order", insertError.message);
      return jsonResponse({ error: "The payment order could not be saved. Please retry." }, 500);
    }
    return jsonResponse({ key_id: keyId, order_id: order.id, amount: amountPaise, currency: "INR", payment_id: paymentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start payment.";
    return jsonResponse({ error: message }, message.includes("Sign in") || message.includes("session") ? 401 : 500);
  }
});
