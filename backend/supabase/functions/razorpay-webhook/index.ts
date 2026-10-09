import { adminClient } from "../_shared/clients.ts";
import { jsonResponse } from "../_shared/response.ts";
import { constantTimeHexEqual, hmacHex, webhookSecret } from "../_shared/razorpay.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Use POST." }, 405);
  try {
    const rawBody = await request.text();
    const receivedSignature = request.headers.get("x-razorpay-signature") || "";
    const expectedSignature = await hmacHex(webhookSecret(), rawBody);
    if (!constantTimeHexEqual(expectedSignature, receivedSignature)) return jsonResponse({ error: "Invalid webhook signature." }, 401);

    const event = JSON.parse(rawBody);
    const payment = event?.payload?.payment?.entity;
    if (!payment?.order_id || !payment?.id) return jsonResponse({ received: true });

    const admin = adminClient();
    const { data: row } = await admin.from("vybe_payments")
      .select("id,amount_paise,currency,status")
      .eq("provider_order_id", payment.order_id)
      .maybeSingle();
    if (!row) return jsonResponse({ received: true });
    if (Number(payment.amount) !== row.amount_paise || payment.currency !== row.currency) {
      console.error("Razorpay webhook amount did not match order", payment.order_id);
      return jsonResponse({ error: "Payment amount mismatch." }, 400);
    }

    if (event.event === "payment.captured") {
      await admin.from("vybe_payments").update({
        provider_payment_id: payment.id,
        status: "paid",
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    } else if (event.event === "payment.authorized" && row.status === "created") {
      await admin.from("vybe_payments").update({
        provider_payment_id: payment.id,
        status: "authorized",
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    } else if (event.event === "payment.failed" && row.status !== "paid") {
      await admin.from("vybe_payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", row.id);
    }
    return jsonResponse({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    return jsonResponse({ error: message }, 500);
  }
});
