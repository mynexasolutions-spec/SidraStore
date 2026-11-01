class ShipmozoApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ShipmozoApiError";
    this.status = status;
  }
}

function getShipmozoConfig() {
  const baseUrl = process.env.SHIPMOZO_API_BASE_URL?.trim();
  const publicKey = process.env.SHIPMOZO_PUBLIC_KEY?.trim();
  const privateKey = process.env.SHIPMOZO_PRIVATE_KEY?.trim();
  const pickupAddressId = process.env.SHIPMOZO_PICKUP_ADDRESS_ID?.trim();

  if (!baseUrl || !publicKey || !privateKey || !pickupAddressId) {
    throw new ShipmozoApiError("Shipmozo server configuration is incomplete.", 500);
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    publicKey,
    privateKey,
    pickupAddressId,
    weight: Number(process.env.SHIPMOZO_DEFAULT_WEIGHT_GRAMS || 500),
    length: Number(process.env.SHIPMOZO_DEFAULT_LENGTH_CM || 10),
    width: Number(process.env.SHIPMOZO_DEFAULT_WIDTH_CM || 10),
    height: Number(process.env.SHIPMOZO_DEFAULT_HEIGHT_CM || 10),
  };
}

function normalizePackageDimensions(input) {
  const config = getShipmozoConfig();
  const weightKg = Number(input?.weightKg ?? config.weight / 1000);
  const lengthCm = Number(input?.lengthCm ?? config.length);
  const widthCm = Number(input?.widthCm ?? config.width);
  const heightCm = Number(input?.heightCm ?? config.height);

  if (![weightKg, lengthCm, widthCm, heightCm].every(Number.isFinite) || [weightKg, lengthCm, widthCm, heightCm].some((value) => value <= 0)) {
    throw new ShipmozoApiError("Package weight and dimensions must be greater than zero.", 400);
  }

  return {
    weightKg: Number(weightKg.toFixed(3)),
    lengthCm: Number(lengthCm.toFixed(2)),
    widthCm: Number(widthCm.toFixed(2)),
    heightCm: Number(heightCm.toFixed(2)),
    weightGrams: Math.round(weightKg * 1000),
  };
}

async function shipmozoRequest(method, path, body) {
  const config = getShipmozoConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${config.baseUrl}/${path.replace(/^\//, "")}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "public-key": config.publicKey,
        "private-key": config.privateKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new ShipmozoApiError(`Shipmozo returned invalid JSON (HTTP ${response.status}).`, response.status);
    }

    if (!response.ok) {
      throw new ShipmozoApiError(
        responseBody?.message || `Shipmozo request failed (HTTP ${response.status}).`,
        response.status,
      );
    }

    const result = responseBody?.result;
    if (result !== undefined && String(result) !== "1") {
      throw new ShipmozoApiError(responseBody?.message || "Shipmozo rejected the request.", 502);
    }

    return responseBody;
  } catch (error) {
    if (error instanceof ShipmozoApiError) throw error;
    if (error?.name === "AbortError") throw new ShipmozoApiError("Shipmozo request timed out.", 504);
    throw new ShipmozoApiError("Unable to reach Shipmozo.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstValue(value, keys) {
  if (!value || typeof value !== "object") return undefined;
  const normalizedKeys = new Set(keys.map(normalizedKey));
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstValue(item, keys);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  for (const [key, item] of Object.entries(value)) {
    if (normalizedKeys.has(normalizedKey(key)) && item !== null && item !== "") return item;
  }
  for (const item of Object.values(value)) {
    const found = firstValue(item, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = typeof value === "number"
    ? new Date(value < 100000000000 ? value * 1000 : value)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function isMeaningfulTrackingStatus(value) {
  return value && !["0", "1", "ok", "success", "true"].includes(String(value).toLowerCase());
}

function extractShipmentFields(response) {
  return {
    providerOrderId: normalizeValue(firstValue(response, ["order_id", "shipmozo_order_id", "shipment_id"])),
    awbNumber: normalizeValue(firstValue(response, ["awb_number", "awb", "waybill", "awb_no"])),
    courierId: normalizeValue(firstValue(response, ["courier_id", "courier_code"])),
    courierName: normalizeValue(firstValue(response, ["courier_name", "courier"])),
    trackingStatus: normalizeValue(firstValue(response, ["tracking_status", "shipment_status", "status"])),
    trackingUrl: normalizeValue(firstValue(response, ["tracking_url", "tracking_link"])),
  };
}

const trackingCollectionKeys = new Set([
  "data",
  "events",
  "history",
  "scans",
  "scandetails",
  "trackingdata",
  "trackingevents",
  "trackinghistory",
]);

function collectTrackingEventLists(value, lists, parentKey = "") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (trackingCollectionKeys.has(normalizedKey(parentKey))) lists.push(value);
    value.forEach((item) => collectTrackingEventLists(item, lists));
    return;
  }

  Object.entries(value).forEach(([key, item]) => {
    if (Array.isArray(item) && trackingCollectionKeys.has(normalizedKey(key))) lists.push(item);
    collectTrackingEventLists(item, lists, key);
  });
}

function normalizeTrackingEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = normalizeValue(firstValue(value, ["tracking_status", "shipment_status", "current_status", "status", "activity", "action", "event", "scan"]));
  const description = normalizeValue(firstValue(value, ["description", "message", "remarks", "details", "activity_description"]));
  const location = normalizeValue(firstValue(value, ["location", "scan_location", "city", "hub", "facility", "current_location"]));
  const eventAt = normalizeTimestamp(firstValue(value, ["event_time", "event_at", "timestamp", "date_time", "datetime", "scan_date", "date", "updated_at"]));
  if (!status && !description && !location && !eventAt) return null;

  return {
    status: status || description || "Carrier update",
    description: description || status,
    location,
    eventAt,
    rawEvent: value,
  };
}

function extractTrackingData(response) {
  const eventLists = [];
  collectTrackingEventLists(response, eventLists);
  const events = eventLists
    .flatMap((list) => list.map(normalizeTrackingEvent))
    .filter(Boolean)
    .filter((event, index, allEvents) => allEvents.findIndex((candidate) => JSON.stringify(candidate.rawEvent) === JSON.stringify(event.rawEvent)) === index);
  const fields = extractShipmentFields(response);
  const explicitTrackingStatus = normalizeValue(firstValue(response, ["tracking_status", "shipment_status", "current_status", "current_tracking_status"]));
  const trackingStatus = isMeaningfulTrackingStatus(explicitTrackingStatus)
    ? explicitTrackingStatus
    : events.at(-1)?.status || (isMeaningfulTrackingStatus(fields.trackingStatus) ? fields.trackingStatus : null);

  return {
    ...fields,
    trackingStatus,
    expectedDeliveryAt: normalizeTimestamp(firstValue(response, ["expected_delivery_date", "estimated_delivery_date", "expected_delivery", "estimated_delivery", "edd"])),
    deliveredAt: normalizeTimestamp(firstValue(response, ["delivered_at", "delivery_date", "delivered_date"])),
    events,
  };
}

function extractLabel(response) {
  const label = firstValue(response, ["label", "label_data", "base64", "label_base64"]);
  if (typeof label !== "string" || !label.trim()) {
    throw new ShipmozoApiError("Shipmozo did not return a shipping label.", 502);
  }

  const dataUrlMatch = label.match(/^data:([^;]+);base64,(.+)$/);
  return {
    mimeType: dataUrlMatch?.[1] || "image/png",
    base64: dataUrlMatch?.[2] || label,
  };
}

function buildShipmozoOrderPayload(order, dimensions) {
  const config = getShipmozoConfig();
  const packageDimensions = normalizePackageDimensions(dimensions);
  const address = order.shipping_address || {};
  const consigneeName = address.recipient_name || order.customers?.full_name || "Customer";
  const consigneePhone = address.phone || order.customers?.phone || "";
  const postalCode = String(address.postal_code || "").trim();

  if (!consigneePhone || !postalCode || !address.address_line_1 || !address.city || !address.state) {
    throw new ShipmozoApiError("The order is missing a complete shipping address or phone number.", 400);
  }
  if (!order.order_items?.length) throw new ShipmozoApiError("The order has no items to ship.", 400);

  const isCod = order.payment_method === "cod";
  return {
    order_id: order.order_number,
    order_date: new Date(order.created_at).toISOString().slice(0, 10),
    order_type: "ESSENTIALS",
    consignee_name: consigneeName,
    consignee_phone: consigneePhone,
    consignee_alternate_phone: "",
    consignee_email: order.customer_email,
    consignee_address_line_one: address.address_line_1,
    consignee_address_line_two: address.address_line_2 || "",
    consignee_pin_code: Number(postalCode),
    consignee_city: address.city,
    consignee_state: address.state,
    product_detail: order.order_items.map((item) => ({
      name: item.product_name,
      sku_number: item.product_id || item.product_name,
      quantity: item.quantity,
      discount: "",
      hsn: "",
      unit_price: Number(item.unit_price),
      product_category: "Other",
    })),
    payment_type: isCod ? "COD" : "PREPAID",
    cod_amount: isCod ? Number(order.total) : "",
    weight: packageDimensions.weightGrams,
    length: packageDimensions.lengthCm,
    width: packageDimensions.widthCm,
    height: packageDimensions.heightCm,
    warehouse_id: config.pickupAddressId,
    gst_ewaybill_number: "",
    gstin_number: "",
  };
}

export {
  ShipmozoApiError,
  buildShipmozoOrderPayload,
  extractLabel,
  extractShipmentFields,
  extractTrackingData,
  getShipmozoConfig,
  normalizePackageDimensions,
  shipmozoRequest,
};
