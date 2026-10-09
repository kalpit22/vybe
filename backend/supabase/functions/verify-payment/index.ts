import { adminClient, requireUser } from "../_shared/clients.ts";
import { handleOptions, jsonResponse } from "../_shared/response.ts";
import { constantTimeHexEqual, hmacHex, razorpayCredentials, razorpayRequest } from "../_shared/razorpay.ts";

Deno.serve(async (request) => {
  const preflight = handleOptions(request);
  if (preflight) return preflight;
  if (request.method !== "POST") return jsonResponse({ error: "Use POST." }, 405);

  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => ({}));
    const paymentId = typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
    const orderId = typeof body.razorpay_order_id === "string" ? body.razorpay_order_id : "";
    const signature = typeof body.razorpay_signature === "string" ? body.razorpay_signature : "";
    if (!paymentId || !orderId || !signature) return jsonResponse({ error: "Razorpay returned an incomplete payment response." }, 400);

    const admin = adminClient();
    const { data: payment, error: paymentError } = await admin
      .from("vybe_payments")
      .select("id,ride_request_id,rider_id,provider_order_id,amount_paise,currency,status")
      .eq("provider_order_id", orderId)
      .eq("rider_id", user.id)
      .maybeSingle();
    if (paymentError || !payment) return jsonResponse({ error: "Payment order not found for this account." }, 404);
    if (payment.status === "paid") return jsonResponse({ status: "paid" });

    const { keySecret } = razorpayCredentials();
    const expectedSignature = await hmacHex(keySecret, `${payment.provider_order_id}|${paymentId}`);
    if (!constantTimeHexEqual(expectedSignature, signature)) return jsonResponse({ error: "Payment verification failed." }, 400);

    let providerPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
    if (providerPayment.order_id !== payment.provider_order_id
      || Number(providerPayment.amount) !== payment.amount_paise
      || providerPayment.currency !== payment.currency) {
      return jsonResponse({ error: "The payment details do not match this ride request." }, 400);
    }

    if (providerPayment.status === "authorized" && !providerPayment.captured) {
      try {
        providerPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}/capture`, "POST", {
          amount: payment.amount_paise,
          currency: payment.currency,
        });
      } catch {
        providerPayment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
      }
    }
    if (providerPayment.status !== "captured" && !providerPayment.captured) {
      return jsonResponse({ error: "The payment is not captured yet. Please retry shortly or contact support." }, 409);
    }

    const { error: updateError } = await admin.from("vybe_payments").update({
      provider_payment_id: paymentId,
      status: "paid",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", payment.id);
    if (updateError) {
      console.error("Could not persist verified payment", updateError.message);
      return jsonResponse({ error: "Payment was captured, but Vybe could not update its record. Refresh your rides or contact support." }, 500);
    }
    return jsonResponse({ status: "paid" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify payment.";
    return jsonResponse({ error: message }, message.includes("Sign in") || message.includes("session") ? 401 : 500);
  }
});
