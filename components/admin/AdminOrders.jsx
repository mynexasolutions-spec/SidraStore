"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Mail, MapPin, Package, Phone, RefreshCw, Truck, XCircle } from "lucide-react";
import CatalogDialog from "./CatalogDialog";
import SmartImage from "@/components/SmartImage";

const orderStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const defaultPackageDimensions = { weightKg: "0.5", lengthCm: "10", widthCm: "10", heightCm: "10" };
const statusStyles = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  processing: "bg-violet-50 text-violet-700",
  shipped: "bg-cyan-50 text-cyan-700",
  delivered: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function titleCase(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAddress(address) {
  return [address?.address_line_1, address?.address_line_2, address?.city, address?.state, address?.postal_code, address?.country].filter(Boolean).join(", ") || "Address unavailable";
}

function paymentLabel(order) {
  return order.payment_method === "razorpay" ? "Prepaid / Razorpay" : "Cash on Delivery";
}

function paymentStatusLabel(status) {
  return status === "paid" ? "Paid" : titleCase(status);
}

function shipmentStatus(shipment) {
  if (!shipment) return "Shipment pending";
  if (shipment.tracking_status) return titleCase(shipment.tracking_status);
  return titleCase(shipment.status);
}

function SummaryBlock({ label, children }) {
  return (
    <div className="border-b border-stone-100 px-1 py-4 sm:px-5 lg:border-b-0 lg:border-l lg:first:border-l-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-dark">{label}</p>
      <div className="mt-2 text-sm text-ink">{children}</div>
    </div>
  );
}

function ActionButton({ children, onClick, disabled, tone = "secondary" }) {
  const toneClass = tone === "primary"
    ? "bg-ink text-white hover:bg-gold hover:text-ink"
    : tone === "danger"
      ? "border-red-200 text-red-600 hover:bg-red-50"
      : "border-stone-200 text-ink hover:border-gold hover:bg-cream";

  return <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}>{children}</button>;
}

function OrderSummary({ order, shipment }) {
  return (
    <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryBlock label="Customer">
        <p className="font-semibold">{order.customers?.full_name || "Guest customer"}</p>
        <a href={`mailto:${order.customer_email}`} className="mt-1 block truncate text-xs text-stone-500 hover:text-gold-dark">{order.customer_email}</a>
        {(order.customers?.phone || order.shipping_address?.phone) && <a href={`tel:${order.customers?.phone || order.shipping_address.phone}`} className="mt-1 block text-xs text-stone-500 hover:text-gold-dark">{order.customers?.phone || order.shipping_address.phone}</a>}
      </SummaryBlock>
      <SummaryBlock label="Payment">
        <p className="font-semibold">{paymentLabel(order)}</p>
        <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${order.payment_status === "paid" ? "bg-emerald-50 text-emerald-700" : order.payment_status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{paymentStatusLabel(order.payment_status)}</span>
      </SummaryBlock>
      <SummaryBlock label="Delivery">
        <p className="font-semibold">{shipment?.courier_name || "Courier not assigned"}</p>
        <p className="mt-1 text-xs text-stone-500">AWB: {shipment?.awb_number || "Not assigned"}</p>
        <p className="mt-1 text-xs text-stone-500">{shipmentStatus(shipment)}</p>
      </SummaryBlock>
      <SummaryBlock label="Shipping address">
        <p className="flex gap-2 leading-5 text-stone-700"><MapPin size={15} className="mt-0.5 shrink-0 text-gold-dark" />{formatAddress(order.shipping_address)}</p>
      </SummaryBlock>
    </div>
  );
}

function OrderedProducts({ order }) {
  const items = order.order_items || [];

  return (
    <section className="border-t border-stone-200 px-5 py-5 sm:px-8">
      <div className="flex items-center gap-2 text-sm font-bold text-ink"><Package size={16} className="text-gold-dark" /> Ordered products</div>
      <div className="mt-3 grid gap-4 border-y border-stone-100 sm:grid-cols-[minmax(0,1fr)_240px]">
        <div className="divide-y divide-stone-100">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 py-3">
            <SmartImage
              src={item.products?.image_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg border border-gold/15 bg-cream"
              imgClassName="h-full w-full object-cover"
              fallback={<Package size={17} className="mx-auto mt-3.5 text-gold-dark/60" />}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.product_name}{item.variant_label ? ` (${item.variant_label})` : ""}</p>
              <p className="mt-1 text-xs text-stone-500">Quantity {item.quantity} <span className="mx-1">×</span> {formatCurrency(item.unit_price)} each</p>
            </div>
            <p className="text-sm font-bold">{formatCurrency(item.line_total)}</p>
          </div>
        ))}
        </div>
        <div className="space-y-1.5 border-t border-stone-100 py-3 text-sm sm:border-l sm:border-t-0 sm:pl-5">
        <p className="flex justify-between gap-4 text-stone-500"><span>Items subtotal</span><span>{formatCurrency(order.subtotal)}</span></p>
        <p className="flex justify-between gap-4 text-stone-500"><span>Shipping</span><span>{Number(order.shipping_amount) > 0 ? formatCurrency(order.shipping_amount) : "Free"}</span></p>
        <p className="flex justify-between gap-4 border-t border-stone-200 pt-3 text-base font-bold"><span>Order total</span><span>{formatCurrency(order.total)}</span></p>
        </div>
      </div>
    </section>
  );
}

function ShipmozoManagement({ order, shipment, packageDimensions, setPackageDimensions, shippingLoading, shippingError, label, runShippingAction }) {
  const dimensionsLocked = Boolean(shipment && shipment.status !== "pending");

  function updateDimension(field, value) {
    setPackageDimensions((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="border-t border-stone-200 pt-5 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-dark">Shipping partner</p><h3 className="mt-1 text-lg font-bold">Shipmozo fulfilment</h3></div>
        {shipment && <span className="text-[10px] font-bold uppercase tracking-wide text-gold-dark">{titleCase(shipment.status)}</span>}
      </div>
      {shippingError && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{shippingError}</p>}
      <div className="mt-5 border-y border-gold/15 py-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-dark">Package dimensions</p>
            <p className="mt-1 text-xs text-stone-500">Enter the packed parcel size before creating the shipment.</p>
          </div>
          {dimensionsLocked && <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Locked after creation</span>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[ ["weightKg", "Weight (kg)", "0.001"], ["lengthCm", "Length (cm)", "0.01"], ["widthCm", "Width (cm)", "0.01"], ["heightCm", "Height (cm)", "0.01"] ].map(([field, labelText, step]) => (
            <label key={field} className="block text-xs font-semibold text-stone-600">
              {labelText}
              <input
                type="number"
                min="0.001"
                step={step}
                value={packageDimensions[field]}
                disabled={dimensionsLocked || shippingLoading}
                onChange={(event) => updateDimension(field, event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-normal text-ink outline-none transition focus:border-gold disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400"
              />
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 border-y border-gold/15 py-4 sm:grid-cols-3">
        <div><p className="text-[10px] uppercase tracking-[0.16em] text-stone-400">Shipmozo reference</p><p className="mt-1 text-sm font-semibold">{shipment?.provider_order_id || "Not assigned"}</p></div>
        <div><p className="text-[10px] uppercase tracking-[0.16em] text-stone-400">Courier</p><p className="mt-1 text-sm font-semibold">{shipment?.courier_name || "Not assigned"}</p></div>
        <div><p className="text-[10px] uppercase tracking-[0.16em] text-stone-400">AWB / tracking number</p><p className="mt-1 text-sm font-semibold">{shipment?.awb_number || "Not assigned"}</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton tone="primary" disabled={shippingLoading || (shipment && shipment.status !== "pending")} onClick={() => runShippingAction("push", packageDimensions)}><Truck size={14} />{shippingLoading ? "Working..." : "Create & assign AWB"}</ActionButton>
        {shipment?.status === "pushed" && <ActionButton disabled={shippingLoading} onClick={() => runShippingAction("auto_assign")}><Truck size={14} />Auto-assign courier</ActionButton>}
        {shipment?.status === "assigned" && <ActionButton disabled={shippingLoading} onClick={() => runShippingAction("schedule")}><Truck size={14} />Schedule pickup</ActionButton>}
        {shipment?.awb_number && <><ActionButton disabled={shippingLoading} onClick={() => runShippingAction("track")}><RefreshCw size={14} />Sync tracking</ActionButton><ActionButton disabled={shippingLoading} onClick={() => runShippingAction("label")}><Download size={14} />Get label</ActionButton></>}
        {shipment && shipment.status !== "cancelled" && <ActionButton tone="danger" disabled={shippingLoading} onClick={() => runShippingAction("cancel")}><XCircle size={14} />Cancel shipment</ActionButton>}
      </div>
      {label && <a href={`data:${label.mimeType};base64,${label.base64}`} download={`sidra-${order.order_number}-label.png`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gold-dark hover:underline"><Download size={15} />Download shipping label</a>}
      {shipment?.last_error && <p className="mt-4 text-xs text-red-600">Last update: {shipment.last_error}</p>}
    </div>
  );
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [shipment, setShipment] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState("");
  const [label, setLabel] = useState(null);
  const [packageDimensions, setPackageDimensions] = useState(defaultPackageDimensions);

  async function loadOrders(preferredId) {
    setLoading(true);
    const response = await fetch("/api/admin/orders", { cache: "no-store" });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error || "Unable to load orders.");
    setOrders(result.orders);
    setSelected((current) => result.orders.find((order) => order.id === (preferredId || current?.id)) || null);
    setError("");
  }

  useEffect(() => { loadOrders(); }, []);

  useEffect(() => {
    if (!selected?.id) {
      setShipment(null);
      setLabel(null);
      setShippingError("");
      setPackageDimensions(defaultPackageDimensions);
      return;
    }

    async function loadShipment() {
      setShipment(null);
      setLabel(null);
      setShippingError("");
      const response = await fetch(`/api/admin/orders/${selected.id}/shipmozo`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) return setShippingError(result.error || "Unable to load Shipmozo shipment state.");
      setShipment(result.shipment);
      setPackageDimensions({
        weightKg: String(result.shipment?.package_weight_kg ?? defaultPackageDimensions.weightKg),
        lengthCm: String(result.shipment?.package_length_cm ?? defaultPackageDimensions.lengthCm),
        widthCm: String(result.shipment?.package_width_cm ?? defaultPackageDimensions.widthCm),
        heightCm: String(result.shipment?.package_height_cm ?? defaultPackageDimensions.heightCm),
      });
    }

    loadShipment();
  }, [selected?.id]);

  const visibleOrders = useMemo(() => filter === "all" ? orders : orders.filter((order) => order.status === filter), [filter, orders]);

  async function updateOrder(field, value) {
    const nextOrder = { ...selected, [field]: value };
    setSaving(true);
    const response = await fetch(`/api/admin/orders/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextOrder.status }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setError(result.error || "Unable to update the order.");
    setSelected({ ...selected, ...result.order });
    setOrders((current) => current.map((order) => order.id === selected.id ? { ...order, ...result.order } : order));
    setError("");
  }

  async function runShippingAction(action, dimensions) {
    if (action === "cancel" && !window.confirm("Cancel this Shipmozo shipment?")) return;
    setShippingLoading(true);
    setShippingError("");
    const response = await fetch(`/api/admin/orders/${selected.id}/shipmozo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(action === "push" ? { dimensions } : {}) }),
    });
    const result = await response.json();
    setShippingLoading(false);
    if (!response.ok) return setShippingError(result.error || "Unable to complete the Shipmozo action.");
    setShipment(result.shipment);
    setPackageDimensions({
      weightKg: String(result.shipment?.package_weight_kg ?? packageDimensions.weightKg),
      lengthCm: String(result.shipment?.package_length_cm ?? packageDimensions.lengthCm),
      widthCm: String(result.shipment?.package_width_cm ?? packageDimensions.widthCm),
      heightCm: String(result.shipment?.package_height_cm ?? packageDimensions.heightCm),
    });
    setLabel(result.label || null);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-dark">Sales</p><h2 className="mt-1 text-2xl font-bold">Orders</h2><p className="mt-1 text-sm text-stone-500">Review purchases and manage fulfilment and order status.</p></div>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-gold"><option value="all">All orders</option>{orderStatuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select>
      </div>
      {error && <p role="alert" className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-7">{error}</p>}
      {loading ? <p className="p-8 text-sm text-stone-500">Loading orders...</p> : visibleOrders.length === 0 ? <div className="m-7 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center"><Package className="mx-auto text-stone-300" /><p className="mt-3 text-sm text-stone-500">No orders found.</p></div> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="bg-stone-50 text-[11px] uppercase tracking-[0.14em] text-stone-500"><tr><th className="px-7 py-3">Order</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Status</th><th className="px-7 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-stone-100">{visibleOrders.map((order) => <tr key={order.id} className="text-sm hover:bg-cream/60"><td className="px-7 py-4 font-semibold">{order.order_number}</td><td className="px-5 py-4"><p className="font-semibold">{order.customers?.full_name || "Guest customer"}</p><p className="mt-0.5 text-xs text-stone-400">{order.customer_email}</p></td><td className="px-5 py-4 text-stone-500">{formatDate(order.created_at)}</td><td className="px-5 py-4 font-semibold">{formatCurrency(order.total)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>{titleCase(order.status)}</span></td><td className="px-7 py-4 text-right"><button onClick={() => setSelected(order)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold hover:border-gold hover:bg-cream"><Eye size={14} /> View & Manage</button></td></tr>)}</tbody></table></div>
      )}

      {selected && <CatalogDialog title="Order details" subtitle={`${selected.order_number} · Placed ${formatDate(selected.created_at)}`} wide onClose={() => setSelected(null)}>
        <div className="bg-[#fbf6ee]">
          <div className="border-b border-stone-200 bg-white px-5 py-6 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-dark">Order reference</p><h3 className="mt-2 text-xl font-bold text-ink">{selected.customers?.full_name || "Guest customer"}</h3><p className="mt-1 text-sm text-stone-500">{selected.customer_email}</p></div>
              <div className="grid gap-5 sm:grid-cols-2 sm:text-right"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Payment</p><p className="mt-2 text-sm font-semibold">{paymentLabel(selected)}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Order total</p><p className="mt-2 text-lg font-bold">{formatCurrency(selected.total)}</p></div></div>
              <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${statusStyles[selected.status] || "bg-stone-100 text-stone-600"}`}>{titleCase(selected.status)}</span>
            </div>
          </div>
          <OrderSummary order={selected} shipment={shipment} />
          <OrderedProducts order={selected} />
          <div className="border-t border-stone-200 px-5 py-5 sm:px-8">
            <p className="text-sm font-bold text-ink">Order management</p>
            <div className="mt-4 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
              <div className="max-w-sm">
                <label className="block text-sm font-semibold">Order status<select disabled={saving} value={selected.status} onChange={(event) => updateOrder("status", event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-stone-200 bg-white px-3 font-normal outline-none focus:border-gold">{orderStatuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label>
                <p className="mt-2 text-xs leading-5 text-stone-500">Payment status is updated automatically from verified customer payment activity.</p>
              </div>
              <ShipmozoManagement order={selected} shipment={shipment} packageDimensions={packageDimensions} setPackageDimensions={setPackageDimensions} shippingLoading={shippingLoading} shippingError={shippingError} label={label} runShippingAction={runShippingAction} />
            </div>
          </div>
        </div>
      </CatalogDialog>}
    </section>
  );
}
