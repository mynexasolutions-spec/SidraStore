import { NextResponse } from "next/server";
import { createAdminCatalogClient, isAuthorizedAdminRequest } from "@/lib/adminCatalog";

export async function GET(request) {
  if (!isAuthorizedAdminRequest(request)) return NextResponse.json({ error: "Administrator authentication is required." }, { status: 401 });
  const supabase = createAdminCatalogClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,customer_id,customer_email,shipping_address,status,payment_status,payment_method,subtotal,shipping_amount,total,created_at,customers(id,full_name,email,phone),order_items(id,product_id,product_name,variant_label,unit_price,quantity,line_total,products(image_url))")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data });
}
