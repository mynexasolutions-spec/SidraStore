"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, LogOut, MapPin, Package, PackageCheck, ShoppingBag, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import SmartImage from "./SmartImage";

const fulfillmentSteps = [
  { label: "Order placed", description: "Order received" },
  { label: "Confirmed", description: "Order confirmed" },
  { label: "Packed", description: "Preparing your order" },
  { label: "Shipped", description: "Handed to courier" },
  { label: "Out for delivery", description: "Courier is on the way" },
  { label: "Delivered", description: "Delivered to you" },
];

const orderStatusStyles = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  processing: "bg-violet-50 text-violet-700",
  shipped: "bg-cyan-50 text-cyan-700",
  delivered: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function titleCase(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAddress(address) {
  if (!address) return "Address unavailable";
  return [address.address_line_1, address.address_line_2, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(", ");
}

function getShipment(order) {
  return order.shipmozo_shipments?.[0] || null;
}

function getShipmentLabel(shipment) {
  if (!shipment) return "Not created";
  if (shipment.status === "cancelled") return "Cancelled";
  if (shipment.status === "delivered") return "Delivered";
  if (shipment.tracking_status) return titleCase(shipment.tracking_status);
  if (shipment.status === "pickup_scheduled") return "Pickup scheduled";
  if (shipment.status === "assigned") return "Courier assigned";
  if (shipment.status === "pushed") return "Courier assignment pending";
  return "Awaiting fulfilment";
}

function getFulfillmentIndex(order, shipment) {
  if (order.status === "cancelled" || shipment?.status === "cancelled") return -1;

  const trackingStatus = String(shipment?.tracking_status || "").toLowerCase();
  if (order.status === "delivered" || shipment?.status === "delivered" || trackingStatus.includes("delivered")) return 5;
  if (trackingStatus.includes("out for delivery") || trackingStatus.includes("out_for_delivery")) return 4;
  if (order.status === "shipped" || shipment?.status === "pickup_scheduled" || trackingStatus.includes("transit") || trackingStatus.includes("picked")) return 3;
  if (order.status === "processing" || shipment?.status === "assigned") return 2;
  if (order.status === "confirmed" || shipment?.status === "pushed") return 1;
  return 0;
}

function getPaymentLabel(order) {
  return order.payment_method === "razorpay" ? "Prepaid / Razorpay" : "Cash on Delivery";
}

function getPaymentMeta(order) {
  if (order.payment_status === "paid") return "Payment confirmed";
  if (order.payment_status === "failed") return "Payment failed";
  if (order.payment_status === "refunded") return "Payment refunded";
  return "Awaiting payment";
}

function getTrackingEvents(shipment) {
  return [...(shipment?.shipmozo_tracking_events || [])].sort((left, right) => {
    const leftTime = new Date(left.event_at || left.created_at || 0).getTime();
    const rightTime = new Date(right.event_at || right.created_at || 0).getTime();
    return rightTime - leftTime;
  });
}

function InfoTile({ label, value, meta }) {
  return (
    <div className="min-w-0 px-1 py-1">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gold-dark">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-ink" title={value}>{value}</p>
      <p className="mt-1 text-[10px] text-stone-400">{meta}</p>
    </div>
  );
}

function FulfillmentProgress({ order, shipment }) {
  const activeIndex = getFulfillmentIndex(order, shipment);
  const cancelled = activeIndex === -1;

  return (
    <section className="border-t border-gold/20 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-dark">Live fulfilment progress</p>
          <p className="mt-1 text-sm text-stone-500">Follow every milestone from confirmation to delivery.</p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide ${cancelled ? "text-red-600" : "text-emerald-700"}`}>
          {cancelled ? "Cancelled" : activeIndex === 5 ? "Delivered" : "In progress"}
        </span>
      </div>

      <div className="mt-7 overflow-x-auto pb-1">
        <div className="min-w-[700px] px-2">
          <div className="relative">
            <div className="absolute left-[8.33%] right-[8.33%] top-1.5 h-px bg-stone-200" />
            <div className="relative grid grid-cols-6 gap-2">
              {fulfillmentSteps.map((step, index) => {
                const complete = !cancelled && index <= activeIndex;
                const current = complete && index === activeIndex;
                return (
                  <div key={step.label} className="text-center">
                    <div className={`mx-auto flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white ring-1 ${complete ? "bg-gold ring-gold/40" : "bg-stone-200 ring-stone-200"}`}>
                      {complete && <Check size={9} strokeWidth={3} className="text-white" />}
                    </div>
                    <p className={`mt-3 text-[10px] font-semibold ${current ? "text-gold-dark" : "text-ink"}`}>{step.label}</p>
                    <p className="mt-1 text-[9px] leading-4 text-stone-400">{cancelled ? "Order cancelled" : complete && !current ? "Complete" : current ? step.description : "Awaiting update"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ShipmentTracking({ order, shipment }) {
  const cancelled = order.status === "cancelled" || shipment?.status === "cancelled";
  const trackingEvents = getTrackingEvents(shipment);
  const heading = cancelled ? "Shipment cancelled" : shipment?.awb_number ? `${shipment.courier_name || "Courier"} shipment` : "Courier assignment pending";
  const message = cancelled
    ? "Shipment has not been created or was cancelled."
    : shipment?.awb_number
      ? shipment.tracking_status ? `Latest carrier update: ${titleCase(shipment.tracking_status)}.` : "Your AWB has been assigned and tracking is ready."
      : "Tracking will be available once a courier and AWB number are assigned.";

  return (
    <section className="border-t border-gold/20 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-dark">Shipment tracking</p>
          <h4 className="mt-2 font-serif text-xl font-semibold text-ink">{heading}</h4>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide ${cancelled ? "text-red-600" : shipment?.awb_number ? "text-emerald-700" : "text-stone-500"}`}>
          {cancelled ? "Cancelled" : shipment?.awb_number ? "Tracking available" : "Not assigned"}
        </span>
      </div>

      <div className={`mt-5 flex items-center justify-between gap-3 border-y px-1 py-3 text-[11px] ${cancelled ? "border-red-100 text-red-700" : "border-gold/20 text-stone-600"}`}>
        <span className="font-semibold uppercase tracking-wide">{cancelled ? "Shipment cancelled" : shipment?.awb_number ? "Shipment active" : "Shipment pending"}</span>
        <span className="text-right text-stone-400">{message}</span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:divide-x sm:divide-gold/15 lg:grid-cols-4">
        <InfoTile label="Shipmozo reference" value={shipment?.provider_order_id || "Not assigned"} meta="Partner order reference" />
        <InfoTile label="Courier" value={shipment?.courier_name || "Not assigned"} meta={shipment?.courier_id ? `Courier ID ${shipment.courier_id}` : "Awaiting courier assignment"} />
        <InfoTile label="AWB number" value={shipment?.awb_number || "Not assigned"} meta={shipment?.awb_number ? "Use this number to track" : "Tracking unavailable yet"} />
        <InfoTile label="Expected delivery" value={shipment?.expected_delivery_at ? formatDate(shipment.expected_delivery_at) : "Not provided"} meta={shipment?.last_synced_at ? `Synced ${formatDateTime(shipment.last_synced_at)}` : "Awaiting carrier estimate"} />
      </div>

      {shipment?.tracking_url && !cancelled && <a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-gold hover:text-ink"><ExternalLink size={14} /> Track shipment</a>}

      {trackingEvents.length > 0 && <div className="mt-6 border-t border-gold/20 pt-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-dark">Tracking history</p>
        <div className="mt-4 divide-y divide-gold/10">
          {trackingEvents.map((event) => <div key={event.id || event.event_key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold text-ink">{titleCase(event.status)}</p>
                {event.event_at && <time dateTime={event.event_at} className="text-[10px] text-stone-400">{formatDateTime(event.event_at)}</time>}
              </div>
              {event.description && event.description !== event.status && <p className="mt-1 text-xs text-stone-500">{event.description}</p>}
              {event.location && <p className="mt-1 text-xs text-stone-400">{event.location}</p>}
            </div>
          </div>)}
        </div>
      </div>}
    </section>
  );
}

function OrderCard({ order }) {
  const shipment = getShipment(order);
  const status = String(order.status || "pending");
  const items = order.order_items || [];

  return (
    <article className="overflow-hidden rounded-[24px] border border-gold/25 bg-white shadow-[0_18px_55px_-38px_rgba(50,35,20,0.5)]">
      <header className="border-b border-gold/20 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-dark">Order reference</p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h3 className="font-serif text-2xl font-semibold text-ink">{order.order_number}</h3>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${orderStatusStyles[status] || "bg-stone-100 text-stone-600"}`}>{titleCase(status)}</span>
            </div>
            <p className="mt-1 text-xs text-stone-400">Placed {formatDate(order.created_at)} <span className="mx-1">·</span> {order.payment_method === "razorpay" ? getPaymentMeta(order) : `Cash on Delivery · ${getPaymentMeta(order)}`}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xl font-bold text-ink">{formatCurrency(order.total)}</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-stone-400">Order total</p>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-5 sm:p-7">
        <div className="divide-y border-y border-stone-100">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 py-4">
              <SmartImage
                src={item.products?.image_url}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl border border-gold/15 bg-white"
                imgClassName="h-full w-full object-cover"
                fallback={<Package size={20} className="mx-auto mt-4 text-gold-dark/60" />}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{item.product_name}{item.variant_label ? ` (${item.variant_label})` : ""}</p>
                <p className="mt-1 text-xs text-stone-500">Quantity {item.quantity} <span className="mx-1">×</span> {formatCurrency(item.unit_price)}</p>
              </div>
              <p className="text-sm font-bold text-ink">{formatCurrency(item.line_total)}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 border-y border-gold/15 py-4 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-gold/15">
          <InfoTile label="Payment" value={getPaymentLabel(order)} meta={getPaymentMeta(order)} />
          <InfoTile label="Delivery status" value={titleCase(status)} meta={getShipmentLabel(shipment)} />
          <InfoTile label="Shipping" value={Number(order.shipping_amount) > 0 ? formatCurrency(order.shipping_amount) : "Free"} meta="Delivery charge" />
          <InfoTile label="Reference" value={order.order_number} meta="Sidra Store order" />
        </div>

        <FulfillmentProgress order={order} shipment={shipment} />
        <ShipmentTracking order={order} shipment={shipment} />
      </div>
    </article>
  );
}

export default function CustomerAccount({ user, customer, address, orders }) {
  const [liveOrders, setLiveOrders] = useState(orders);

  useEffect(() => {
    setLiveOrders(orders);
  }, [orders]);

  useEffect(() => {
    if (!customer?.id) return undefined;
    const supabase = createClient();
    const channel = supabase
      .channel(`customer-order-sync-${customer.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${customer.id}` }, (payload) => {
        setLiveOrders((current) => {
          if (payload.eventType === "DELETE") return current.filter((order) => order.id !== payload.old.id);
          const exists = current.some((order) => order.id === payload.new.id);
          if (!exists) return current;
          return current.map((order) => order.id === payload.new.id ? { ...order, ...payload.new } : order);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shipmozo_shipments" }, (payload) => {
        const shipment = payload.eventType === "DELETE" ? payload.old : payload.new;
        setLiveOrders((current) => current.map((order) => {
          if (order.id !== shipment.order_id) return order;
          const existingShipments = order.shipmozo_shipments || [];
          if (payload.eventType === "DELETE") return { ...order, shipmozo_shipments: existingShipments.filter((item) => item.id !== shipment.id) };
          const nextShipments = existingShipments.some((item) => item.id === shipment.id)
            ? existingShipments.map((item) => item.id === shipment.id ? { ...item, ...shipment } : item)
            : [shipment, ...existingShipments];
          return { ...order, shipmozo_shipments: nextShipments };
        }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shipmozo_tracking_events" }, (payload) => {
        const event = payload.eventType === "DELETE" ? payload.old : payload.new;
        setLiveOrders((current) => current.map((order) => {
          const shipments = order.shipmozo_shipments || [];
          if (!shipments.some((shipment) => shipment.id === event.shipment_id)) return order;
          return {
            ...order,
            shipmozo_shipments: shipments.map((shipment) => {
              if (shipment.id !== event.shipment_id) return shipment;
              const events = shipment.shipmozo_tracking_events || [];
              if (payload.eventType === "DELETE") return { ...shipment, shipmozo_tracking_events: events.filter((item) => item.id !== event.id) };
              const nextEvents = events.some((item) => item.id === event.id)
                ? events.map((item) => item.id === event.id ? { ...item, ...event } : item)
                : [event, ...events];
              return { ...shipment, shipmozo_tracking_events: nextEvents };
            }),
          };
        }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [customer?.id]);

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

        <div className="mt-8 grid gap-5 border-y border-gold/15 py-5 md:grid-cols-2 md:divide-x md:divide-gold/15">
          <div className="flex items-center gap-3 md:pr-6"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-dark"><UserRound size={19} /></span><div><h2 className="text-sm font-bold">Customer details</h2><p className="mt-1 text-sm text-stone-500">{customer?.phone || "Phone number not saved"}</p></div></div>
          <div className="flex items-start gap-3 md:pl-6"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-dark"><MapPin size={19} /></span><div><h2 className="text-sm font-bold">Default delivery address</h2><p className="mt-1 text-sm leading-6 text-stone-500">{formatAddress(address)}</p></div></div>
        </div>

        <section className="mx-auto mt-10 max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-5 border-b border-gold/15 pb-6">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.28em] text-gold-dark">Your fragrance journey</p><h2 className="mt-2 font-serif text-3xl font-semibold text-ink sm:text-4xl">Order History</h2><p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">Review every purchase, payment confirmation, fulfilment milestone, and live shipment update in one place.</p></div>
            <div className="flex items-center gap-2.5 text-right"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" /><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Live order sync</p><p className="mt-1 text-[10px] text-stone-400">Shipment updates appear here</p></div></div>
          </div>

          {liveOrders.length === 0 ? <div className="border-y border-gold/15 px-5 py-14 text-center"><PackageCheck size={44} className="mx-auto text-stone-300" /><p className="mt-4 font-serif text-2xl font-semibold text-ink">Your journey starts here.</p><p className="mt-2 text-sm text-stone-500">You have not placed an order yet.</p><a href="/shop" className="btn-gold mt-6">Explore the collection</a></div> : <div className="space-y-6 pt-6">{liveOrders.map((order) => <OrderCard key={order.id} order={order} />)}</div>}
        </section>
      </div>
    </main>
  );
}
