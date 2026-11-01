"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LogOut, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import SmartImage from "./SmartImage";
import { useCart } from "./CartProvider";
import { createClient } from "@/lib/supabase/client";
import { useStorefrontContent } from "./useStorefrontData";

const fieldClass = "mt-2 h-12 w-full rounded-xl border border-stone-200 bg-white px-4 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/15";

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const scriptUrl = "https://checkout.razorpay.com/v1/checkout.js";
    const existingScript = document.querySelector(`script[src="${scriptUrl}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Razorpay Checkout could not be loaded.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded."));
    document.body.appendChild(script);
  });
}

async function getApiError(response, fallback) {
  try {
    const body = await response.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export default function CustomerCheckout({ user, customer, address }) {
  const { items, subtotal, updateQuantity, removeItem, clearCart } = useCart();
  const { data: storefrontContent, error: settingsError } = useStorefrontContent();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderPaymentMethod, setOrderPaymentMethod] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const deliverySettings = storefrontContent.delivery_settings;
  const prepaidEnabled = deliverySettings?.prepaid_enabled !== false;
  const codEnabled = deliverySettings?.cod_enabled !== false;
  const prepaidShippingAmount = Number(deliverySettings?.prepaid_shipping_amount ?? deliverySettings?.standard_shipping_amount ?? 90);
  const prepaidFreeShippingThreshold = Number(deliverySettings?.prepaid_free_shipping_threshold ?? deliverySettings?.free_shipping_threshold ?? 999);
  const codShippingAmount = Number(deliverySettings?.cod_shipping_amount ?? deliverySettings?.standard_shipping_amount ?? 90);
  const codFreeShippingThreshold = Number(deliverySettings?.cod_free_shipping_threshold ?? deliverySettings?.free_shipping_threshold ?? 999);

  useEffect(() => {
    if (paymentMethod === "cod" && !codEnabled) setPaymentMethod(prepaidEnabled ? "razorpay" : "");
    if (paymentMethod === "razorpay" && !prepaidEnabled) setPaymentMethod(codEnabled ? "cod" : "");
  }, [codEnabled, paymentMethod, prepaidEnabled]);

  const isCod = paymentMethod === "cod";
  const shippingAmount = isCod ? codShippingAmount : prepaidShippingAmount;
  const freeShippingThreshold = isCod ? codFreeShippingThreshold : prepaidFreeShippingThreshold;
  const shipping = subtotal === 0 || (freeShippingThreshold > 0 && subtotal >= freeShippingThreshold) ? 0 : shippingAmount;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/");
  }

  async function placeOrder(event) {
    event.preventDefault();
    if (items.length === 0) {
      setMessage("Your cart is empty.");
      return;
    }
    if (!paymentMethod) {
      setMessage("No delivery option is currently available.");
      return;
    }
    if ((paymentMethod === "cod" && !codEnabled) || (paymentMethod === "razorpay" && !prepaidEnabled)) {
      setMessage("This delivery option is no longer available. Please choose another option.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    const cartItems = items.map((item) => ({ slug: item.productSlug || item.slug, quantity: item.quantity, variant_size: item.variant?.size || null }));
    const guestCheckout = {
      fullName: values.full_name,
      email: values.email,
      phone: values.phone,
      address: {
        address_line_1: values.address_line_1,
        address_line_2: values.address_line_2 || null,
        city: values.city,
        state: values.state,
        postal_code: values.postal_code,
      },
      items: cartItems,
    };
    let paymentRequestBody = { guestCheckout };
    let savedAddressId = address?.id || null;

    if (user) {
      const supabase = createClient();
      const { error: customerError } = await supabase.from("customers").upsert({
        auth_user_id: user.id,
        full_name: values.full_name,
        email: user.email,
        phone: values.phone,
      }, { onConflict: "auth_user_id" });

      if (customerError) {
        setMessage(customerError.message);
        setSubmitting(false);
        return;
      }

      const addressPayload = {
        auth_user_id: user.id,
        label: "Default",
        recipient_name: values.full_name,
        phone: values.phone,
        address_line_1: values.address_line_1,
        address_line_2: values.address_line_2 || null,
        city: values.city,
        state: values.state,
        postal_code: values.postal_code,
        country: "India",
        is_default: true,
      };
      const addressQuery = address?.id
        ? supabase.from("delivery_addresses").update(addressPayload).eq("id", address.id).select("id").single()
        : supabase.from("delivery_addresses").insert(addressPayload).select("id").single();
      const { data: savedAddress, error: addressError } = await addressQuery;

      if (addressError) {
        setMessage(addressError.message);
        setSubmitting(false);
        return;
      }
      savedAddressId = savedAddress.id;

      const { error: cartError } = await supabase.rpc("save_customer_cart", { p_items: cartItems });
      if (cartError) {
        setMessage(cartError.message);
        setSubmitting(false);
        return;
      }
      paymentRequestBody = { addressId: savedAddress.id };
    } else if (paymentMethod === "cod") {
      const guestOrderResponse = await fetch("/api/guest-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guestCheckout }),
      });
      const guestOrderResult = await guestOrderResponse.json().catch(() => ({}));
      setSubmitting(false);
      if (!guestOrderResponse.ok) {
        setMessage(guestOrderResult.error || "We could not place your order.");
        return;
      }
      clearCart();
      setOrderPaymentMethod("cod");
      setOrderNumber(guestOrderResult.orderNumber);
      return;
    }

    if (paymentMethod === "razorpay") {
      try {
        await loadRazorpayScript();
        const createOrderResponse = await fetch("/api/payments/razorpay/create-order", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(paymentRequestBody),
        });
        if (!createOrderResponse.ok) throw new Error(await getApiError(createOrderResponse, "We could not start the online payment."));
        const paymentOrder = await createOrderResponse.json();
        const razorpay = new window.Razorpay({
          key: paymentOrder.keyId,
          amount: paymentOrder.amount,
          currency: paymentOrder.currency,
          name: "Sidra Store",
          description: "Sidra Store purchase",
          order_id: paymentOrder.orderId,
          prefill: {
            name: values.full_name,
            email: user?.email || values.email,
            contact: values.phone,
          },
          notes: { payment_attempt_id: paymentOrder.attemptId },
          theme: { color: "#a87a32" },
          modal: {
            ondismiss: () => {
              setMessage("Payment was cancelled. Your cart is still saved.");
              setSubmitting(false);
            },
          },
          handler: async (paymentResponse) => {
            try {
              const verifyResponse = await fetch("/api/payments/razorpay/verify", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ...paymentResponse, attemptId: paymentOrder.attemptId }),
              });
              if (!verifyResponse.ok) throw new Error(await getApiError(verifyResponse, "Payment verification failed."));
              const result = await verifyResponse.json();
              clearCart();
              setOrderPaymentMethod("razorpay");
              setOrderNumber(result.orderNumber);
            } catch (error) {
              setMessage(error.message || "Payment was received but order confirmation is pending.");
              setSubmitting(false);
            }
          },
        });
        razorpay.on("payment.failed", (failure) => {
          setMessage(failure.error?.description || "Payment failed. Your cart is still saved.");
          setSubmitting(false);
        });
        razorpay.open();
      } catch (error) {
        setMessage(error.message || "We could not start the online payment.");
        setSubmitting(false);
      }
      return;
    }

    const supabase = createClient();
    const { data: createdOrderNumber, error: orderError } = await supabase.rpc("place_customer_order", { p_address_id: savedAddressId });
    setSubmitting(false);
    if (orderError) {
      setMessage(orderError.message);
      return;
    }

    clearCart();
    setOrderPaymentMethod("cod");
    setOrderNumber(createdOrderNumber);
  }

  if (orderNumber) {
    return (
      <main className="min-h-[68vh] bg-cream px-4 py-20">
        <div className="mx-auto max-w-xl rounded-[32px] border border-gold/20 bg-white p-10 text-center shadow-xl">
          <CheckCircle2 size={58} className="mx-auto text-emerald-600" />
          <h1 className="mt-5 font-serif text-4xl font-semibold">Order confirmed</h1>
          <p className="mt-3 text-stone-600">Your order number is <strong>{orderNumber}</strong>. {orderPaymentMethod === "razorpay" ? "Your online payment has been received securely." : "Payment will be collected on delivery."}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">{user && <a href="/account" className="rounded-full border border-gold/50 px-6 py-3 text-sm font-semibold hover:bg-gold/10">View Order History</a>}<a href="/shop" className="btn-gold inline-flex">Continue Shopping</a></div>
        </div>
      </main>
    );
  }

  return (
    <main className="overflow-x-clip bg-cream px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-dark">Secure Checkout</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">Delivery & Order</h1>
            {user ? <p className="mt-2 text-sm text-stone-500">Signed in as {user.email}</p> : <p className="mt-2 text-sm text-stone-500">Checking out as a guest. <a href="/login?next=/checkout" className="font-semibold text-gold-dark hover:underline">Sign in instead</a></p>}
          </div>
          {user && <button type="button" onClick={signOut} className="flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold"><LogOut size={16} /> Sign Out</button>}
        </div>

        <div className="mt-9 grid gap-7 lg:grid-cols-[1.1fr_0.9fr]">
          <form id="checkout-form" onSubmit={placeOrder} className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">Delivery address</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold">Full name<input name="full_name" required minLength={2} defaultValue={address?.recipient_name || customer?.full_name || ""} className={fieldClass} /></label>
              <label className="text-sm font-semibold">Phone number<input name="phone" type="tel" required minLength={7} maxLength={20} pattern="[0-9+() -]{7,20}" defaultValue={address?.phone || customer?.phone || ""} className={fieldClass} /></label>
              <label className="text-sm font-semibold sm:col-span-2">Email address<input name="email" type="email" required defaultValue={user?.email || ""} readOnly={Boolean(user)} className={`${fieldClass} ${user ? "bg-stone-50 text-stone-500" : ""}`} /></label>
              <label className="text-sm font-semibold sm:col-span-2">Address line 1<input name="address_line_1" required minLength={5} defaultValue={address?.address_line_1 || ""} className={fieldClass} /></label>
              <label className="text-sm font-semibold sm:col-span-2">Address line 2 <span className="font-normal text-stone-400">(optional)</span><input name="address_line_2" defaultValue={address?.address_line_2 || ""} className={fieldClass} /></label>
              <label className="text-sm font-semibold">City<input name="city" required minLength={2} defaultValue={address?.city || ""} className={fieldClass} /></label>
              <label className="text-sm font-semibold">State<input name="state" required minLength={2} defaultValue={address?.state || "Madhya Pradesh"} className={fieldClass} /></label>
              <label className="text-sm font-semibold">PIN code<input name="postal_code" inputMode="numeric" pattern="[0-9]{6}" required defaultValue={address?.postal_code || ""} className={fieldClass} /></label>
              <label className="text-sm font-semibold">Country<input value="India" readOnly className={`${fieldClass} bg-stone-50 text-stone-500`} /></label>
            </div>
          </form>

          <section className="h-fit rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2"><ShoppingBag size={20} className="text-gold-dark" /><h2 className="text-xl font-bold">Your cart</h2></div>
            <div className="mt-5 space-y-4">
              {items.length === 0 && <p className="rounded-2xl bg-cream p-5 text-sm text-stone-500">Your cart is empty. <a className="font-semibold text-gold-dark" href="/all-products">Browse products</a></p>}
              {items.map((item) => (
                <div key={item.slug} className="flex gap-3 border-b border-stone-100 pb-4">
                  <SmartImage src={item.src} alt={item.name} className="h-20 w-20 shrink-0 rounded-xl" imgClassName="h-full w-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="mt-1 text-sm text-gold-dark">₹{item.price}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => updateQuantity(item.slug, item.quantity - 1)} className="rounded-full border p-1"><Minus size={13} /></button>
                      <span className="w-5 text-center text-sm">{item.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(item.slug, item.quantity + 1)} className="rounded-full border p-1"><Plus size={13} /></button>
                      <button type="button" onClick={() => removeItem(item.slug)} className="ml-auto text-stone-400 hover:text-red-600" aria-label={`Remove ${item.name}`}><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>₹{subtotal}</span></div>
              <div className="flex justify-between"><span>Shipping ({isCod ? "COD" : "Online"})</span><span>{shipping === 0 ? "Free" : `₹${shipping}`}</span></div>
              <div className="flex justify-between border-t pt-3 text-lg font-bold"><span>Total</span><span>₹{subtotal + shipping}</span></div>
            </div>
            <div className="mt-6 rounded-2xl border border-stone-200 bg-cream/50 p-4">
              <p className="text-sm font-bold">Payment method</p>
              {codEnabled && <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3">
                <input type="radio" name="payment_method" value="cod" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} className="mt-1 accent-gold-dark" />
                <span><span className="block text-sm font-semibold">Cash on Delivery</span><span className="mt-1 block text-xs text-stone-500">Pay when your order arrives.</span></span>
              </label>}
              {prepaidEnabled && <label className={`${codEnabled ? "mt-2" : "mt-3"} flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3`}>
                <input type="radio" name="payment_method" value="razorpay" checked={paymentMethod === "razorpay"} onChange={() => setPaymentMethod("razorpay")} className="mt-1 accent-gold-dark" />
                <span><span className="block text-sm font-semibold">Pay Online</span><span className="mt-1 block text-xs text-stone-500">Cards, UPI, net banking and wallets.</span></span>
              </label>}
              {!codEnabled && !prepaidEnabled && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">Checkout is temporarily unavailable because no delivery option is enabled.</p>}
            </div>
            {settingsError && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Delivery settings synchronization failed: {settingsError}</p>}
            {message && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>}
            <button form="checkout-form" disabled={submitting || items.length === 0 || !paymentMethod} className="btn-gold mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50">{submitting ? paymentMethod === "razorpay" ? "Opening Razorpay..." : "Placing Order..." : paymentMethod === "cod" ? "Place COD Order" : paymentMethod === "razorpay" ? "Place Order" : "Checkout unavailable"}</button>
          </section>
        </div>
      </div>
    </main>
  );
}
