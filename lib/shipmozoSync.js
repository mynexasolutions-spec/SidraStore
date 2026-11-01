import { createHash } from "node:crypto";
import { extractTrackingData, shipmozoRequest } from "@/lib/shipmozo";

const orderStatusRank = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
  cancelled: 5,
};

function normalizeStatus(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ").trim();
}

function orderStatusFromTracking(value) {
  const status = normalizeStatus(value);
  if (status.includes("delivered") && !status.includes("rto")) return "delivered";
  if (status.includes("out for delivery") || status.includes("in transit") || status.includes("shipped") || status.includes("dispatched") || status.includes("picked") || status.includes("pickup scheduled")) return "shipped";
  return null;
}

function trackingEventKey(shipmentId, event) {
  return createHash("sha256")
    .update(`${shipmentId}:${JSON.stringify(event.rawEvent)}:${event.status}:${event.eventAt || ""}:${event.location || ""}`)
    .digest("hex");
}

function shouldAdvanceOrderStatus(currentStatus, nextStatus) {
  if (!nextStatus || currentStatus === "cancelled") return false;
  return orderStatusRank[nextStatus] > orderStatusRank[currentStatus];
}

async function updateOrderStatusFromTracking(supabase, orderId, trackingStatus, events) {
  const candidateStatuses = [trackingStatus, ...events.map((event) => event.status)]
    .map(orderStatusFromTracking)
    .filter(Boolean)
    .sort((left, right) => orderStatusRank[right] - orderStatusRank[left]);
  const nextStatus = candidateStatuses[0];
  if (!nextStatus) return;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id,status")
    .eq("id", orderId)
    .single();
  if (orderError) throw new Error(`Unable to read order status for shipment sync: ${orderError.message}`);
  if (!shouldAdvanceOrderStatus(order.status, nextStatus)) return;

  const { error } = await supabase
    .from("orders")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw new Error(`Unable to sync order status from Shipmozo: ${error.message}`);
}

export async function syncShipmentTracking(supabase, shipment) {
  if (!shipment?.id || !shipment.order_id || !shipment.awb_number) {
    throw new Error("A shipment with an AWB number is required for tracking sync.");
  }

  const response = await shipmozoRequest("GET", `track-order?awb_number=${encodeURIComponent(shipment.awb_number)}`);
  const tracking = extractTrackingData(response);
  const now = new Date().toISOString();
  const nextShipmentStatus = orderStatusFromTracking(tracking.trackingStatus) === "delivered" ? "delivered" : shipment.status;

  const { data: updatedShipment, error: shipmentError } = await supabase
    .from("shipmozo_shipments")
    .update({
      status: nextShipmentStatus,
      awb_number: tracking.awbNumber || shipment.awb_number,
      courier_id: tracking.courierId || shipment.courier_id,
      courier_name: tracking.courierName || shipment.courier_name,
      tracking_status: tracking.trackingStatus || shipment.tracking_status,
      tracking_url: tracking.trackingUrl || shipment.tracking_url,
      expected_delivery_at: tracking.expectedDeliveryAt || shipment.expected_delivery_at,
      delivered_at: tracking.deliveredAt || shipment.delivered_at,
      last_synced_at: now,
      last_error: null,
      tracking_response: response,
      updated_at: now,
    })
    .eq("id", shipment.id)
    .select("*")
    .single();
  if (shipmentError) throw new Error(`Unable to save Shipmozo tracking data: ${shipmentError.message}`);

  if (tracking.events.length) {
    const eventRows = tracking.events.map((event) => ({
      shipment_id: shipment.id,
      event_key: trackingEventKey(shipment.id, event),
      status: event.status,
      description: event.description,
      location: event.location,
      event_at: event.eventAt,
      raw_event: event.rawEvent,
    }));
    const { error: eventError } = await supabase
      .from("shipmozo_tracking_events")
      .upsert(eventRows, { onConflict: "shipment_id,event_key" });
    if (eventError) throw new Error(`Unable to save Shipmozo tracking history: ${eventError.message}`);
  }

  await updateOrderStatusFromTracking(supabase, shipment.order_id, tracking.trackingStatus, tracking.events);
  return { shipment: updatedShipment, tracking };
}

export function isShipmentTrackable(shipment) {
  return Boolean(shipment?.awb_number && ["pushed", "assigned", "pickup_scheduled"].includes(shipment.status));
}
