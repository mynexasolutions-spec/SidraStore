import { NextResponse } from "next/server";
import { createAdminCatalogClient, isAuthorizedAdminRequest } from "@/lib/adminCatalog";
import {
  ShipmozoApiError,
  buildShipmozoOrderPayload,
  extractLabel,
  extractShipmentFields,
  normalizePackageDimensions,
  shipmozoRequest,
} from "@/lib/shipmozo";
import { syncShipmentTracking } from "@/lib/shipmozoSync";

const actions = new Set(["push", "auto_assign", "schedule", "label", "track", "sync", "cancel"]);
const activeStatuses = new Set(["pushed", "assigned", "pickup_scheduled"]);

function errorResponse(error) {
  const status = error instanceof ShipmozoApiError ? error.status : 500;
  return NextResponse.json({ error: error.message || "Shipmozo action failed." }, { status });
}

async function getOrder(supabase, orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,customer_email,shipping_address,payment_method,total,created_at,customers(full_name,phone),order_items(id,product_id,product_name,unit_price,quantity)")
    .eq("id", orderId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function getShipment(supabase, orderId) {
  const { data, error } = await supabase
    .from("shipmozo_shipments")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function createOrUpdateShipment(supabase, orderId, changes) {
  const { data, error } = await supabase
    .from("shipmozo_shipments")
    .upsert({ order_id: orderId, ...changes, updated_at: new Date().toISOString() }, { onConflict: "order_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateShipment(supabase, orderId, changes) {
  const { data, error } = await supabase
    .from("shipmozo_shipments")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function syncImmediatelyWhenAvailable(supabase, shipment) {
  if (!shipment?.awb_number) return shipment;
  try {
    return (await syncShipmentTracking(supabase, shipment)).shipment;
  } catch (error) {
    try {
      return await updateShipment(supabase, shipment.order_id, { last_error: `Tracking sync failed: ${error.message}` });
    } catch {
      return shipment;
    }
  }
}

async function runWithErrorRecord(supabase, orderId, currentStatus, operation) {
  try {
    return await operation();
  } catch (error) {
    const { error: recordError } = await supabase
      .from("shipmozo_shipments")
      .upsert({
        order_id: orderId,
        status: currentStatus || "pending",
        last_error: error.message,
        updated_at: new Date().toISOString(),
      }, { onConflict: "order_id" });
    if (recordError) throw new Error(`${error.message} Local shipment error could not be saved: ${recordError.message}`);
    throw error;
  }
}

export async function GET(request, { params }) {
  if (!isAuthorizedAdminRequest(request)) return NextResponse.json({ error: "Administrator authentication is required." }, { status: 401 });

  try {
    const shipment = await getShipment(createAdminCatalogClient(), params.id);
    return NextResponse.json({ shipment });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request, { params }) {
  if (!isAuthorizedAdminRequest(request)) return NextResponse.json({ error: "Administrator authentication is required." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid Shipmozo action is required." }, { status: 400 });
  }

  if (!actions.has(body.action)) return NextResponse.json({ error: "Unsupported Shipmozo action." }, { status: 400 });

  const supabase = createAdminCatalogClient();
  try {
    const orderId = params.id;
    let shipment = await getShipment(supabase, orderId);

    if (body.action === "push") {
      if (shipment && shipment.status !== "pending") return NextResponse.json({ shipment });
      const order = await getOrder(supabase, orderId);
      const dimensions = normalizePackageDimensions(body.dimensions);
      const payload = buildShipmozoOrderPayload(order, dimensions);
      const response = await runWithErrorRecord(supabase, orderId, "pending", () => shipmozoRequest("POST", "push-order", payload));
      const fields = extractShipmentFields(response);
      shipment = await createOrUpdateShipment(supabase, orderId, {
        status: "pushed",
        package_weight_kg: dimensions.weightKg,
        package_length_cm: dimensions.lengthCm,
        package_width_cm: dimensions.widthCm,
        package_height_cm: dimensions.heightCm,
        provider_order_id: fields.providerOrderId || payload.order_id,
        warehouse_id: payload.warehouse_id,
        awb_number: fields.awbNumber,
        courier_id: fields.courierId,
        courier_name: fields.courierName,
        tracking_status: fields.trackingStatus,
        tracking_url: fields.trackingUrl,
        last_error: null,
        provider_response: response,
      });

      if (!shipment.awb_number && shipment.provider_order_id) {
        try {
          const assignmentResponse = await runWithErrorRecord(supabase, orderId, shipment.status, () => shipmozoRequest("POST", "auto-assign-order", { order_id: shipment.provider_order_id }));
          const assignmentFields = extractShipmentFields(assignmentResponse);
          shipment = await updateShipment(supabase, orderId, {
            status: "assigned",
            awb_number: assignmentFields.awbNumber || shipment.awb_number,
            courier_id: assignmentFields.courierId || shipment.courier_id,
            courier_name: assignmentFields.courierName || shipment.courier_name,
            tracking_status: assignmentFields.trackingStatus || shipment.tracking_status,
            tracking_url: assignmentFields.trackingUrl || shipment.tracking_url,
            last_error: null,
            provider_response: { push: response, auto_assign: assignmentResponse },
          });
        } catch (assignmentError) {
          shipment = await updateShipment(supabase, orderId, { last_error: `Courier assignment pending: ${assignmentError.message}` });
        }
      }
      shipment = await syncImmediatelyWhenAvailable(supabase, shipment);
      return NextResponse.json({ shipment });
    }

    if (!shipment) throw new ShipmozoApiError("Push the order to Shipmozo before running this action.", 400);
    if (shipment.status === "cancelled") throw new ShipmozoApiError("This Shipmozo shipment is cancelled.", 409);

    if (body.action === "auto_assign") {
      if (!activeStatuses.has(shipment.status)) throw new ShipmozoApiError("Push the order to Shipmozo before assigning a courier.", 400);
      if (shipment.status === "assigned" || shipment.status === "pickup_scheduled") return NextResponse.json({ shipment });
      const response = await runWithErrorRecord(supabase, orderId, shipment.status, () => shipmozoRequest("POST", "auto-assign-order", { order_id: shipment.provider_order_id }));
      const fields = extractShipmentFields(response);
      shipment = await updateShipment(supabase, orderId, {
        status: "assigned",
        awb_number: fields.awbNumber || shipment.awb_number,
        courier_id: fields.courierId || shipment.courier_id,
        courier_name: fields.courierName || shipment.courier_name,
        tracking_status: fields.trackingStatus || shipment.tracking_status,
        tracking_url: fields.trackingUrl || shipment.tracking_url,
        last_error: null,
        provider_response: response,
      });
      shipment = await syncImmediatelyWhenAvailable(supabase, shipment);
      return NextResponse.json({ shipment });
    }

    if (body.action === "schedule") {
      if (shipment.status === "pickup_scheduled") return NextResponse.json({ shipment });
      if (shipment.status !== "assigned") throw new ShipmozoApiError("Assign a courier before scheduling pickup.", 400);
      const response = await runWithErrorRecord(supabase, orderId, shipment.status, () => shipmozoRequest("POST", "schedule-pickup", { order_id: shipment.provider_order_id }));
      shipment = await updateShipment(supabase, orderId, { status: "pickup_scheduled", last_error: null, provider_response: response });
      shipment = await syncImmediatelyWhenAvailable(supabase, shipment);
      return NextResponse.json({ shipment });
    }

    if (body.action === "label") {
      if (!shipment.awb_number) throw new ShipmozoApiError("A courier must be assigned before downloading the label.", 400);
      const response = await runWithErrorRecord(supabase, orderId, shipment.status, () => shipmozoRequest("GET", `get-order-label/${encodeURIComponent(shipment.awb_number)}`));
      return NextResponse.json({ shipment, label: extractLabel(response) });
    }

    if (body.action === "track" || body.action === "sync") {
      if (!shipment.awb_number) throw new ShipmozoApiError("An AWB is required before tracking the shipment.", 400);
      shipment = (await syncShipmentTracking(supabase, shipment)).shipment;
      return NextResponse.json({ shipment });
    }

    if (body.action === "cancel") {
      if (shipment.status === "cancelled") return NextResponse.json({ shipment });
      const response = await runWithErrorRecord(supabase, orderId, shipment.status, () => shipmozoRequest("POST", "cancel-order", {
        order_id: shipment.provider_order_id,
        awb_number: shipment.awb_number || "",
      }));
      shipment = await updateShipment(supabase, orderId, { status: "cancelled", last_error: null, provider_response: response });
      return NextResponse.json({ shipment });
    }

    throw new ShipmozoApiError("Unsupported Shipmozo action.", 400);
  } catch (error) {
    return errorResponse(error);
  }
}
