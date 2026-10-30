import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRazorpayOrder, getRazorpayKeyId, rupeesToPaise } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export async function POST(request) {
  try {
    const body = await request.json();
    const addressId = String(body?.addressId || "");
    if (!isUuid(addressId)) return NextResponse.json({ error: "A valid delivery address is required." }, { status: 400 });

    const supabase = createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return NextResponse.json({ error: "You must be signed in to pay." }, { status: 401 });

    const { data: quote, error: quoteError } = await supabase.rpc("get_customer_checkout_quote", { p_address_id: addressId });
    if (quoteError) throw quoteError;
    const amountInPaise = rupeesToPaise(quote?.amount);
    const attemptId = randomUUID();
    const razorpayOrder = await createRazorpayOrder({
      amountInPaise,
      receipt: `sidra_${attemptId.replaceAll("-", "").slice(0, 32)}`,
      notes: { customer_id: user.id, payment_attempt_id: attemptId },
    });

    const admin = createAdminClient();
    const { error: attemptError } = await admin.from("payment_attempts").insert({
      id: attemptId,
      auth_user_id: user.id,
      address_id: addressId,
      razorpay_order_id: razorpayOrder.id,
      amount: quote.amount,
      currency: "INR",
      status: "created",
    });
    if (attemptError) throw attemptError;

    return NextResponse.json({
      keyId: getRazorpayKeyId(),
      orderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: "INR",
      attemptId,
    });
  } catch (error) {
    console.error("[payments/razorpay/create-order] Unable to create payment order", error);
    return NextResponse.json({ error: "We could not start the online payment. Please try again." }, { status: 500 });
  }
}
