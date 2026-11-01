"use client";

import { useEffect, useState } from "react";
import { Banknote, CreditCard, Eye, Image as ImageIcon, MessageCircleQuestion, Megaphone, Plus, Save, Star, Trash2, Upload } from "lucide-react";
import SmartImage from "@/components/SmartImage";
import CatalogDialog from "./CatalogDialog";
import { notifyStorefrontUpdate } from "@/lib/storefrontSync";
import { ReviewStars } from "@/components/ReviewSummary";

const inputClass = "mt-2 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-normal outline-none focus:border-gold focus:ring-4 focus:ring-gold/10";

async function uploadHeroImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", "/sidra-store/hero-slides");
  const response = await fetch("/api/admin/upload", { method: "POST", body: formData });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Upload failed");
  return result.url;
}

const contentConfigurations = {
  "hero-slides": {
    eyebrow: "Storefront content", title: "Hero Slides", description: "Create and control homepage hero campaigns.", icon: ImageIcon,
    fields: [
      { name: "title", label: "Title", required: true }, { name: "subtitle", label: "Subtitle" },
      { name: "desktop_image_url", label: "Desktop image URL", required: true, hint: "12:5 · 1920 × 800 px · JPG, PNG, or WebP" }, { name: "mobile_image_url", label: "Mobile image URL", hint: "3:4 · 1080 × 1440 px · JPG, PNG, or WebP" },
      { name: "cta_label", label: "Button label" }, { name: "cta_href", label: "Button link" },
    ],
    primary: "title", secondary: "subtitle", image: "desktop_image_url",
  },
  announcements: {
    eyebrow: "Storefront content", title: "Announcements", description: "Manage messages shown in the storefront header.", icon: Megaphone,
    fields: [{ name: "message", label: "Announcement message", required: true, wide: true }], primary: "message",
  },
  faqs: {
    eyebrow: "Customer support", title: "Global FAQs", description: "Manage reusable storefront shopping and support answers.", icon: MessageCircleQuestion,
    fields: [{ name: "question", label: "Question", required: true, wide: true }, { name: "answer", label: "Answer", required: true, textarea: true, wide: true }], primary: "question", secondary: "answer",
  },
};

function ContentForm({ resource, item, onSaved, onCancel }) {
  const config = contentConfigurations[resource];
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState("");
  const [error, setError] = useState("");

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = { id: item?.id, sort_order: Number(form.get("sort_order")), is_active: form.get("is_active") === "on" };
    for (const field of config.fields) body[field.name] = form.get(field.name);
    const response = await fetch(`/api/admin/content/${resource}`, { method: item ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setError(result.error || "Unable to save this record.");
    notifyStorefrontUpdate("content");
    onSaved();
  }

  async function handleImageUpload(event, fieldName) {
    const file = event.target.files[0];
    if (!file) return;
    setUploadingField(fieldName);
    setError("");
    try {
      const url = await uploadHeroImage(file);
      const input = event.target.form.elements.namedItem(fieldName);
      if (input) input.value = url;
    } catch (uploadError) {
      setError(uploadError.message || "Unable to upload this image.");
    } finally {
      setUploadingField("");
      event.target.value = "";
    }
  }

  const isHeroSlide = resource === "hero-slides";

  return <form onSubmit={save} className="grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
    {item && config.image && <SmartImage src={item[config.image]} alt={item[config.primary]} className="h-52 rounded-2xl sm:col-span-2" imgClassName="h-full w-full object-contain" />}
    {config.fields.map((field) => {
      const isImageField = isHeroSlide && ["desktop_image_url", "mobile_image_url"].includes(field.name);
      return <div key={field.name} className={field.wide ? "sm:col-span-2" : ""}><label htmlFor={field.name} className="text-sm font-semibold">{field.label}</label>{field.textarea ? <textarea id={field.name} name={field.name} required={field.required} defaultValue={item?.[field.name] || ""} rows={4} className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-sm font-normal outline-none focus:border-gold" /> : isImageField ? <div className="mt-2 flex gap-2"><input id={field.name} name={field.name} required={field.required} defaultValue={item?.[field.name] || ""} className={`${inputClass} mt-0 flex-1`} placeholder="Image URL or upload an image" /><label htmlFor={`${field.name}-upload`} className="flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold transition hover:border-gold hover:bg-cream"><Upload size={16} />{uploadingField === field.name ? "Uploading..." : "Upload"}<input id={`${field.name}-upload`} type="file" accept="image/*" onChange={(event) => handleImageUpload(event, field.name)} disabled={Boolean(uploadingField)} className="sr-only" /></label></div> : <input id={field.name} name={field.name} required={field.required} defaultValue={item?.[field.name] || ""} className={inputClass} />}{field.hint && <p className="mt-2 text-xs font-normal leading-relaxed text-stone-500">{field.hint}</p>}</div>;
    })}
    <label className="text-sm font-semibold">Sort order<input name="sort_order" type="number" step="1" defaultValue={item?.sort_order ?? 0} className={inputClass} /></label>
    <label className="flex items-center gap-3 self-end pb-3 text-sm font-semibold"><input name="is_active" type="checkbox" defaultChecked={item?.is_active ?? true} className="h-4 w-4 accent-[#C99A4B]" /> Active on storefront</label>
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
    {isHeroSlide && <p className="text-xs font-normal text-stone-500 sm:col-span-2">Add multiple active slides to rotate them automatically every 2 seconds.</p>}
    <div className="flex justify-end gap-3 sm:col-span-2"><button type="button" onClick={onCancel} className="rounded-xl border px-5 py-3 text-sm font-semibold">Cancel</button><button disabled={saving} className="flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><Save size={16} />{saving ? "Saving..." : "Save"}</button></div>
  </form>;
}

export function AdminContentManager({ resource }) {
  const config = contentConfigurations[resource];
  const Icon = config.icon;
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/admin/content/${resource}`, { cache: "no-store" });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setError(result.error || `Unable to load ${config.title.toLowerCase()}.`);
    setItems(result.items);
    setError("");
  }
  useEffect(() => { load(); }, [resource]);

  async function remove(item) {
    if (!window.confirm(`Delete “${item[config.primary]}”?`)) return;
    const response = await fetch(`/api/admin/content/${resource}?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setError(result.error || "Unable to delete this record.");
    notifyStorefrontUpdate("content");
    setSelected(null);
    await load();
  }

  return <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
    <div className="flex flex-col gap-4 border-b px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7"><div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-dark">{config.eyebrow}</p><h2 className="mt-1 text-2xl font-bold">{config.title}</h2><p className="mt-1 text-sm text-stone-500">{config.description}</p></div><button onClick={() => setCreating(true)} className="flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-gold hover:text-ink"><Plus size={16} /> Add New</button></div>
    {error && <p role="alert" className="m-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-7">{error}</p>}
    {loading ? <p className="p-8 text-sm text-stone-500">Loading...</p> : items.length === 0 ? <div className="m-7 rounded-xl border border-dashed bg-stone-50 p-10 text-center"><Icon className="mx-auto text-stone-300" /><p className="mt-3 text-sm text-stone-500">No records yet.</p></div> : <div className="divide-y">{items.map((item) => <article key={item.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-7">{config.image && <SmartImage src={item[config.image]} alt="" className="h-20 w-full shrink-0 rounded-xl sm:w-32" imgClassName="h-full w-full object-cover" />}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{item[config.primary]}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>{item.is_active ? "Active" : "Hidden"}</span></div>{config.secondary && <p className="mt-1 line-clamp-2 text-sm text-stone-500">{item[config.secondary]}</p>}</div><div className="flex items-center gap-2"><button onClick={() => setSelected(item)} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold hover:border-gold"><Eye size={14} /> View & Edit</button><button onClick={() => remove(item)} aria-label="Delete" className="rounded-xl border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 size={15} /></button></div></article>)}</div>}
    {(selected || creating) && <CatalogDialog title={creating ? `Add ${config.title.replace(/s$/, "")}` : selected[config.primary]} subtitle="Changes are saved to Supabase and published to the storefront." onClose={() => { setSelected(null); setCreating(false); }}><ContentForm resource={resource} item={creating ? null : selected} onCancel={() => { setSelected(null); setCreating(false); }} onSaved={async () => { setSelected(null); setCreating(false); await load(); }} /></CatalogDialog>}
  </section>;
}

export function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/reviews", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load reviews.");
      setReviews(result.reviews || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);
  async function updateStatus(status) {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/reviews/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update review.");
      notifyStorefrontUpdate("reviews");
      setSelected({ ...selected, status, is_approved: status === "approved" });
      await load();
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!window.confirm("Delete this review?")) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/reviews/${selected.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete review.");
      notifyStorefrontUpdate("reviews");
      setSelected(null);
      await load();
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setSaving(false);
    }
  }
  const getStatus = (review) => review.status || (review.is_approved ? "approved" : "pending");
  const pendingCount = reviews.filter((review) => getStatus(review) === "pending").length;
  const approvedCount = reviews.filter((review) => getStatus(review) === "approved").length;
  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-5 py-5 sm:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-dark">Moderation</p>
        <h2 className="mt-1 text-2xl font-bold">Reviews</h2>
        <p className="mt-1 text-sm text-stone-500">Inspect customer feedback and approve or reject what appears publicly.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">{pendingCount} pending</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">{approvedCount} approved</span>
        </div>
      </div>
      {error && <p role="alert" className="m-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="p-8 text-sm text-stone-500">Loading reviews...</p> : reviews.length === 0 ? <div className="m-7 rounded-xl border border-dashed p-10 text-center"><Star className="mx-auto text-stone-300" /><p className="mt-3 text-sm text-stone-500">No reviews found.</p></div> : (
        <div className="divide-y">
          {reviews.map((review) => {
            const status = getStatus(review);
            return <article key={review.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:px-7">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3"><p className="font-semibold">{review.customer_name}</p><ReviewStars rating={review.rating} size={14} /></div>
                <p className="mt-1 text-sm text-stone-500">{review.products?.name} — {review.title || review.body}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === "approved" ? "bg-emerald-50 text-emerald-700" : status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{status}</span>
              <button onClick={() => setSelected(review)} className="rounded-xl border px-3 py-2 text-xs font-semibold hover:border-gold">Inspect</button>
            </article>;
          })}
        </div>
      )}
      {selected && (() => {
        const status = getStatus(selected);
        return <CatalogDialog title={selected.title || "Customer review"} subtitle={`${selected.customer_name} on ${selected.products?.name}`} onClose={() => setSelected(null)}>
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3"><ReviewStars rating={selected.rating} size={20} /><span className={`rounded-full px-3 py-1 text-xs font-semibold ${status === "approved" ? "bg-emerald-50 text-emerald-700" : status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{status}</span></div>
            <p className="mt-4 rounded-2xl bg-stone-50 p-5 text-sm leading-7">{selected.body}</p>
            <p className="mt-3 text-xs text-stone-400">Submitted {new Date(selected.created_at).toLocaleString("en-IN")}</p>
            <div className="mt-6 flex flex-wrap justify-between gap-3"><button disabled={saving} onClick={remove} className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50"><Trash2 size={15} /> Delete</button><div className="flex flex-wrap gap-2"><button disabled={saving || status === "rejected"} onClick={() => updateStatus("rejected")} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50">Reject</button><button disabled={saving || status === "approved"} onClick={() => updateStatus("approved")} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Approve</button></div></div>
          </div>
        </CatalogDialog>;
      })()}
    </section>
  );
}

const defaultDeliverySettings = {
  prepaid_enabled: true,
  prepaid_shipping_amount: 0,
  prepaid_free_shipping_threshold: 999,
  cod_enabled: true,
  cod_shipping_amount: 100,
  cod_free_shipping_threshold: 999,
  currency_code: "INR",
  delivery_message: "Fast & Secure Delivery",
};

function normalizeDeliverySettings(settings) {
  return {
    ...defaultDeliverySettings,
    ...settings,
    prepaid_enabled: settings?.prepaid_enabled !== false,
    cod_enabled: settings?.cod_enabled !== false,
    prepaid_shipping_amount: settings?.prepaid_shipping_amount ?? settings?.standard_shipping_amount ?? defaultDeliverySettings.prepaid_shipping_amount,
    prepaid_free_shipping_threshold: settings?.prepaid_free_shipping_threshold ?? settings?.free_shipping_threshold ?? defaultDeliverySettings.prepaid_free_shipping_threshold,
    cod_shipping_amount: settings?.cod_shipping_amount ?? settings?.standard_shipping_amount ?? defaultDeliverySettings.cod_shipping_amount,
    cod_free_shipping_threshold: settings?.cod_free_shipping_threshold ?? settings?.free_shipping_threshold ?? defaultDeliverySettings.cod_free_shipping_threshold,
  };
}

function DeliveryOptionCard({ icon: Icon, title, description, enabled, toggle, onChange, chargeName, chargeValue, thresholdName, thresholdValue, optionLabel }) {
  return (
    <div className="grid gap-4 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)] lg:items-center">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${enabled ? "bg-blue-50 text-blue-600" : "bg-stone-100 text-stone-400"}`}><Icon size={17} /></span>
          <div><h3 className="text-base font-bold text-ink">{title}</h3><p className="mt-1 text-xs text-stone-500">{description}</p></div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${optionLabel} delivery ${enabled ? "enabled" : "disabled"}`}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? "bg-ink" : "bg-stone-300"}`}
        >
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${enabled ? "left-6" : "left-1"}`} />
        </button>
      </div>
      <div>
        <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-stone-700">Shipping charge (₹)<input name={chargeName} type="number" min="0" step="0.01" required value={chargeValue} onChange={onChange} className={inputClass} /></label>
        <label className="text-sm font-semibold text-stone-700">Free shipping threshold (₹)<input name={thresholdName} type="number" min="0" step="0.01" required value={thresholdValue} onChange={onChange} className={inputClass} /></label>
        </div>
        <p className="mt-2 text-xs text-stone-500">Threshold 0 disables free shipping. {enabled ? "Available at checkout." : "Hidden at checkout."}</p>
      </div>
    </div>
  );
}

export function AdminDeliverySettings() {
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/delivery-settings", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) return setError(result.error || "Unable to load delivery settings.");
    setSettings(normalizeDeliverySettings(result.settings));
  }

  useEffect(() => { load(); }, []);

  function updateSetting(field, value) {
    setSettings((current) => ({ ...current, [field]: value }));
    setMessage("");
    setError("");
  }

  function toggleOption(field) {
    const nextValue = !settings[field];
    const otherField = field === "prepaid_enabled" ? "cod_enabled" : "prepaid_enabled";
    if (!nextValue && !settings[otherField]) {
      setError("Keep at least one delivery option enabled.");
      return;
    }
    updateSetting(field, nextValue);
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    const formValues = Object.fromEntries(new FormData(event.currentTarget));
    const body = { ...settings, ...formValues, prepaid_enabled: settings.prepaid_enabled, cod_enabled: settings.cod_enabled };
    const response = await fetch("/api/admin/delivery-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setError(result.error || "Unable to save delivery settings.");
    notifyStorefrontUpdate("content");
    setSettings(normalizeDeliverySettings(result.settings));
    setMessage("Delivery settings saved and checkout updated.");
  }

  if (!settings) return error ? <p role="alert" className="rounded-xl bg-red-50 p-5 text-sm text-red-700">{error} Run <code>supabase/queries/delivery-settings-options.sql</code> in the Supabase SQL Editor, then reload this page.</p> : <p className="p-8 text-sm text-stone-500">Loading delivery settings...</p>;

  return (
    <section className="max-w-5xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-5 py-5 sm:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-dark">Fulfilment</p>
        <h2 className="mt-1 text-2xl font-bold">Shipping Operations</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">Configure separate delivery charges, free-shipping thresholds, and availability for prepaid and Cash on Delivery orders.</p>
      </div>
      <form onSubmit={save} className="p-5 sm:p-7">
        <div>
          <DeliveryOptionCard
            icon={CreditCard}
            title="Prepaid / Pay Online"
            description="Customers pay securely through Razorpay."
            enabled={settings.prepaid_enabled}
            toggle={() => toggleOption("prepaid_enabled")}
            onChange={(event) => updateSetting(event.target.name, event.target.value)}
            chargeName="prepaid_shipping_amount"
            chargeValue={settings.prepaid_shipping_amount}
            thresholdName="prepaid_free_shipping_threshold"
            thresholdValue={settings.prepaid_free_shipping_threshold}
            optionLabel="prepaid"
          />
          <DeliveryOptionCard
            icon={Banknote}
            title="Cash on Delivery"
            description="Customers pay when the order arrives."
            enabled={settings.cod_enabled}
            toggle={() => toggleOption("cod_enabled")}
            onChange={(event) => updateSetting(event.target.name, event.target.value)}
            chargeName="cod_shipping_amount"
            chargeValue={settings.cod_shipping_amount}
            thresholdName="cod_free_shipping_threshold"
            thresholdValue={settings.cod_free_shipping_threshold}
            optionLabel="COD"
          />
        </div>
        <p className="mt-5 text-sm text-stone-500">Free-shipping thresholds are checked against the item subtotal before any coupon discount. At least one payment option must remain enabled.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-stone-700">Currency code<input name="currency_code" required maxLength={3} value={settings.currency_code} onChange={(event) => updateSetting("currency_code", event.target.value.toUpperCase())} className={inputClass} /></label>
          <label className="text-sm font-semibold text-stone-700">Delivery message<input name="delivery_message" required value={settings.delivery_message} onChange={(event) => updateSetting("delivery_message", event.target.value)} className={inputClass} /></label>
        </div>
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        <button type="submit" disabled={saving} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"><Save size={16} /> {saving ? "Saving..." : "Save delivery settings"}</button>
      </form>
    </section>
  );
}
