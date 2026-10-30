import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/razorpay";

export const runtime = "nodejs";

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    const payload = JSON.parse(rawBody);
    if (!new Set(["payment.captured", "order.paid"]).has(payload.event)) {
      return NextResponse.json({ received: true });
    }

    const payment = payload.payload?.payment?.entity;
    if (!payment?.id || !payment.order_id || payment.status !== "captured") {
      return NextResponse.json({ received: true });
    }

    const admin = createAdminClient();
    const { data: attempt, error: attemptError } = await admin
      .from("payment_attempts")
      .select("id,amount,currency,status,razorpay_order_id,razorpay_payment_id")
      .eq("razorpay_order_id", payment.order_id)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) return NextResponse.json({ received: true });
    if (Number(payment.amount) !== Math.round(Number(attempt.amount) * 100) || payment.currency !== attempt.currency) {
      throw new Error("Razorpay webhook amount or currency does not match the payment attempt.");
    }
    if (attempt.status === "consumed") return NextResponse.json({ received: true });
    if (attempt.status === "verified" && attempt.razorpay_payment_id !== payment.id) {
      throw new Error("A different payment is already verified for this Razorpay order.");
    }

    const { error: updateError } = await admin
      .from("payment_attempts")
      .update({ status: "verified", razorpay_payment_id: payment.id, verified_at: new Date().toISOString() })
      .eq("id", attempt.id)
      .eq("status", "created");
    if (updateError) throw updateError;

    const { error: finalizeError } = await admin.rpc("finalize_razorpay_payment", {
      p_payment_attempt_id: attempt.id,
    });
    if (finalizeError) throw finalizeError;

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[payments/razorpay/webhook] Unable to process webhook", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
