import { NextResponse } from "next/server";
import { createAdminCatalogClient, isAuthorizedAdminRequest } from "@/lib/adminCatalog";

const orderStatuses = new Set(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]);

export async function PATCH(request, { params }) {
  if (!isAuthorizedAdminRequest(request)) return NextResponse.json({ error: "Administrator authentication is required." }, { status: 401 });
  const body = await request.json();
  if (!orderStatuses.has(body.status)) return NextResponse.json({ error: "Invalid order status." }, { status: 400 });

  const supabase = createAdminCatalogClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: body.status })
    .eq("id", params.id)
    .select("id,status,payment_status,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ order: data });
}
