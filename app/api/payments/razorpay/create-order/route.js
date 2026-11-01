import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRazorpayOrder, getRazorpayKeyId, rupeesToPaise } from "@/lib/razorpay";
import { parseGuestCheckoutPayload } from "@/lib/guestCheckout";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export async function POST(request) {
  try {
    const body = await request.json();
    const supabase = createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    if (!user) {
      const parsed = parseGuestCheckoutPayload(body?.guestCheckout);
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

      const admin = createAdminClient();
      const { data: quote, error: quoteError } = await admin.rpc("get_guest_checkout_quote", {
        p_items: parsed.data.items,
        p_payment_method: "razorpay",
        p_require_enabled: true,
      });
      if (quoteError) throw quoteError;

      const amountInPaise = rupeesToPaise(quote?.amount);
      const attemptId = randomUUID();
      const razorpayOrder = await createRazorpayOrder({
        amountInPaise,
        receipt: `sidra_${attemptId.replaceAll("-", "").slice(0, 32)}`,
        notes: { checkout_type: "guest", payment_attempt_id: attemptId },
      });

      const { error: attemptError } = await admin.from("payment_attempts").insert({
        id: attemptId,
        auth_user_id: null,
        address_id: null,
        razorpay_order_id: razorpayOrder.id,
        amount: quote.amount,
        currency: "INR",
        status: "created",
        guest_checkout: {
          full_name: parsed.data.fullName,
          email: parsed.data.email,
          phone: parsed.data.phone,
          address: parsed.data.address,
          items: parsed.data.items,
        },
      });
      if (attemptError) throw attemptError;

      return NextResponse.json({
        keyId: getRazorpayKeyId(),
        orderId: razorpayOrder.id,
        amount: amountInPaise,
        currency: "INR",
        attemptId,
      });
    }

    const addressId = String(body?.addressId || "");
    if (!isUuid(addressId)) return NextResponse.json({ error: "A valid delivery address is required." }, { status: 400 });

    const { data: quote, error: quoteError } = await supabase.rpc("get_customer_checkout_quote_for_payment", {
      p_auth_user_id: user.id,
      p_address_id: addressId,
      p_payment_method: "razorpay",
      p_require_enabled: true,
    });
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
