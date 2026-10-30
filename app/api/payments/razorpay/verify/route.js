import { NextResponse } from "next/server";
import { fetchRazorpayPayment, verifyPaymentSignature } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const attemptId = String(body?.attemptId || "");
    const paymentId = String(body?.razorpay_payment_id || "");
    const orderId = String(body?.razorpay_order_id || "");
    const signature = String(body?.razorpay_signature || "");
    if (!attemptId || !paymentId || !orderId || !signature) {
      return NextResponse.json({ error: "The payment response is incomplete." }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return NextResponse.json({ error: "Your session expired. Please sign in and try again." }, { status: 401 });

    const admin = createAdminClient();
    const { data: attempt, error: attemptError } = await admin
      .from("payment_attempts")
      .select("id,auth_user_id,address_id,razorpay_order_id,razorpay_payment_id,amount,currency,status,order_number")
      .eq("id", attemptId)
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) return NextResponse.json({ error: "The payment attempt was not found." }, { status: 404 });
    if (attempt.status === "consumed") return NextResponse.json({ ok: true, orderNumber: attempt.order_number });
    if (attempt.razorpay_order_id !== orderId) return NextResponse.json({ error: "The payment order does not match." }, { status: 400 });

    if (attempt.status === "created") {
      if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
        return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
      }

      const payment = await fetchRazorpayPayment(paymentId);
      if (payment.order_id !== attempt.razorpay_order_id || Number(payment.amount) !== Math.round(Number(attempt.amount) * 100) || payment.currency !== attempt.currency) {
        return NextResponse.json({ error: "The payment details do not match this order." }, { status: 400 });
      }
      if (payment.status !== "captured") {
        return NextResponse.json({ error: "Payment is not captured yet. Please wait and try again." }, { status: 409 });
      }

      const { error: updateError } = await admin
        .from("payment_attempts")
        .update({ status: "verified", razorpay_payment_id: paymentId, verified_at: new Date().toISOString() })
        .eq("id", attempt.id)
        .eq("status", "created");
      if (updateError) throw updateError;
    } else if (attempt.status !== "verified" || attempt.razorpay_payment_id !== paymentId) {
      return NextResponse.json({ error: "This payment attempt cannot be completed." }, { status: 409 });
    }

    const { data: orderNumber, error: finalizeError } = await admin.rpc("finalize_razorpay_payment", {
      p_payment_attempt_id: attempt.id,
    });
    if (finalizeError) throw finalizeError;

    return NextResponse.json({ ok: true, orderNumber });
  } catch (error) {
    console.error("[payments/razorpay/verify] Unable to verify payment", error);
    return NextResponse.json({ error: "Payment was received but order confirmation is still pending. Please contact support if this persists." }, { status: 500 });
  }
}
