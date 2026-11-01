import { NextResponse } from "next/server";
import { createAdminCatalogClient, isAuthorizedAdminRequest } from "@/lib/adminCatalog";

function unauthorized() {
  return NextResponse.json({ error: "Administrator authentication is required." }, { status: 401 });
}

function parseBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

export async function GET(request) {
  if (!isAuthorizedAdminRequest(request)) return unauthorized();
  const { data, error } = await createAdminCatalogClient().from("delivery_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PUT(request) {
  if (!isAuthorizedAdminRequest(request)) return unauthorized();
  const body = await request.json();
  const legacyThreshold = Number(body.free_shipping_threshold);
  const legacyShipping = Number(body.standard_shipping_amount);
  const prepaidShippingValue = Number(body.prepaid_shipping_amount);
  const prepaidThresholdValue = Number(body.prepaid_free_shipping_threshold);
  const codShippingValue = Number(body.cod_shipping_amount);
  const codThresholdValue = Number(body.cod_free_shipping_threshold);
  const prepaidShipping = Number.isFinite(prepaidShippingValue) ? prepaidShippingValue : legacyShipping;
  const prepaidThreshold = Number.isFinite(prepaidThresholdValue) ? prepaidThresholdValue : legacyThreshold;
  const codShipping = Number.isFinite(codShippingValue) ? codShippingValue : legacyShipping;
  const codThreshold = Number.isFinite(codThresholdValue) ? codThresholdValue : legacyThreshold;
  const threshold = prepaidThreshold;
  const shipping = prepaidShipping;
  const prepaidEnabled = parseBoolean(body.prepaid_enabled, true);
  const codEnabled = parseBoolean(body.cod_enabled, true);
  const currency = String(body.currency_code || "").trim().toUpperCase();
  const message = String(body.delivery_message || "").trim();
  if (![prepaidShipping, prepaidThreshold, codShipping, codThreshold, threshold, shipping].every((value) => Number.isFinite(value) && value >= 0)) return NextResponse.json({ error: "Delivery amounts must be valid non-negative numbers." }, { status: 400 });
  if (!prepaidEnabled && !codEnabled) return NextResponse.json({ error: "At least one delivery option must remain enabled." }, { status: 400 });
  if (!/^[A-Z]{3}$/.test(currency) || !message) return NextResponse.json({ error: "Currency and delivery message are required." }, { status: 400 });

  const supabase = createAdminCatalogClient();
  const { data: existing, error: readError } = await supabase.from("delivery_settings").select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  const payload = {
    free_shipping_threshold: threshold,
    standard_shipping_amount: shipping,
    prepaid_enabled: prepaidEnabled,
    prepaid_shipping_amount: prepaidShipping,
    prepaid_free_shipping_threshold: prepaidThreshold,
    cod_enabled: codEnabled,
    cod_shipping_amount: codShipping,
    cod_free_shipping_threshold: codThreshold,
    currency_code: currency,
    delivery_message: message,
  };
  const query = existing ? supabase.from("delivery_settings").update(payload).eq("id", existing.id) : supabase.from("delivery_settings").insert(payload);
  const { data, error } = await query.select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ settings: data });
}
