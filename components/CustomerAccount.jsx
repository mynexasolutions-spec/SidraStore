"use client";

import { LogOut, MapPin, PackageCheck, ShoppingBag, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
}

function formatAddress(address) {
  if (!address) return "Address unavailable";
  return [address.address_line_1, address.address_line_2, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(", ");
}

export default function CustomerAccount({ user, customer, address, orders }) {
  async function signOut() {
    const { error } = await createClient().auth.signOut();
    if (!error) window.location.assign("/");
  }

  return (
    <main className="min-h-[68vh] overflow-x-clip bg-cream px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-dark">My account</p><h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">Welcome, {customer?.full_name || "Sidra customer"}</h1><p className="mt-2 text-stone-500">{user.email}</p></div>
          <button type="button" onClick={signOut} className="flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold transition hover:border-gold"><LogOut size={16} /> Sign Out</button>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold-dark"><UserRound size={21} /></span><div><h2 className="font-bold">Customer details</h2><p className="text-sm text-stone-500">{customer?.phone || "Phone number not saved"}</p></div></div></article>
          <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-dark"><MapPin size={21} /></span><div><h2 className="font-bold">Default delivery address</h2><p className="mt-1 text-sm leading-6 text-stone-500">{formatAddress(address)}</p></div></div></article>
        </div>

        <section className="mt-8 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b px-5 py-5 sm:px-7"><div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-dark">Purchase history</p><h2 className="mt-1 text-2xl font-bold">Your orders</h2></div><ShoppingBag className="text-gold-dark" /></div>
          {orders.length === 0 ? <div className="p-10 text-center"><PackageCheck size={42} className="mx-auto text-stone-300" /><p className="mt-3 text-stone-500">You have not placed an order yet.</p><a href="/shop" className="btn-gold mt-5 inline-flex">Start Shopping</a></div> : <div className="divide-y divide-stone-100">{orders.map((order) => <article key={order.id} className="p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-bold">{order.order_number}</p><p className="mt-1 text-xs text-stone-500">{new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · {order.payment_method === "razorpay" ? "Paid online" : "Cash on Delivery"}</p></div><div className="text-right"><span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-bold capitalize text-gold-dark">{order.status}</span><p className="mt-2 text-lg font-bold">{formatCurrency(order.total)}</p></div></div><div className="mt-5 divide-y rounded-2xl border border-stone-100 bg-cream/50">{order.order_items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><div><p className="font-semibold">{item.product_name}{item.variant_label ? ` (${item.variant_label})` : ""}</p><p className="text-xs text-stone-500">Quantity {item.quantity} × {formatCurrency(item.unit_price)}</p></div><p className="font-bold">{formatCurrency(item.line_total)}</p></div>)}</div></article>)}</div>}
        </section>
      </div>
    </main>
  );
}
