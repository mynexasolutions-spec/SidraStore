import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminCatalogClient } from "@/lib/adminCatalog";
import { syncShipmentTracking } from "@/lib/shipmozoSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(request) {
  const configuredSecret = process.env.CRON_SECRET || process.env.SHIPMOZO_SYNC_CRON_SECRET;
  const suppliedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!configuredSecret || !suppliedSecret) return false;

  const expected = Buffer.from(configuredSecret);
  const actual = Buffer.from(suppliedSecret);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Cron authentication is required." }, { status: 401 });

  const supabase = createAdminCatalogClient();
  const { data: shipments, error } = await supabase
    .from("shipmozo_shipments")
    .select("*")
    .in("status", ["pushed", "assigned", "pickup_scheduled"])
    .not("awb_number", "is", null)
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: `Unable to load shipments for sync: ${error.message}` }, { status: 500 });

  const failures = [];
  let processed = 0;
  for (const shipment of shipments || []) {
    try {
      await syncShipmentTracking(supabase, shipment);
      processed += 1;
    } catch (syncError) {
      failures.push({ shipmentId: shipment.id, error: syncError.message });
      await supabase
        .from("shipmozo_shipments")
        .update({ last_error: `Tracking sync failed: ${syncError.message}`, updated_at: new Date().toISOString() })
        .eq("id", shipment.id);
    }
  }

  return NextResponse.json({ processed, failed: failures.length, failures });
}
