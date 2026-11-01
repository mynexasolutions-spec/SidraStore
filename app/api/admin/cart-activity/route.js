import { NextResponse } from "next/server";
import { createAdminCatalogClient, isAuthorizedAdminRequest } from "@/lib/adminCatalog";

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Administrator authentication is required." }, { status: 401 });
}

export async function GET(request) {
  if (!isAuthorizedAdminRequest(request)) return unauthorizedResponse();

  const limitParameter = Number.parseInt(new URL(request.url).searchParams.get("limit") || "30", 10);
  const limit = Number.isFinite(limitParameter) ? Math.min(Math.max(limitParameter, 1), 50) : 30;
  const supabase = createAdminCatalogClient();

  const [notificationsResult, unreadResult] = await Promise.all([
    supabase
      .from("cart_activity_notifications")
      .select("id,auth_user_id,customer_id,customer_name,customer_email,product_id,product_name,product_image_url,variant_size,unit_price,quantity_added,cart_quantity,activity_type,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("cart_activity_notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  if (notificationsResult.error) {
    return NextResponse.json({ error: notificationsResult.error.message }, { status: 500 });
  }
  if (unreadResult.error) {
    return NextResponse.json({ error: unreadResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    notifications: notificationsResult.data || [],
    unreadCount: unreadResult.count || 0,
  });
}

export async function DELETE(request) {
  if (!isAuthorizedAdminRequest(request)) return unauthorizedResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }

  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id) => typeof id === "string" && id.length > 0)
    : [];
  const deleteAll = body?.deleteAll === true;
  if (!deleteAll && ids.length === 0) {
    return NextResponse.json({ error: "Notification ids or deleteAll are required." }, { status: 400 });
  }

  const supabase = createAdminCatalogClient();
  let query = supabase
    .from("cart_activity_notifications")
    .delete();

  if (deleteAll) query = query.not("id", "is", null);
  else query = query.in("id", ids);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
