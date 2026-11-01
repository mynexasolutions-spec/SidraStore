import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CustomerAccount from "@/components/CustomerAccount";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Account & Orders | Sidra Store" };

export default async function AccountPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const [{ data: customer }, { data: addresses }, { data: orders, error: orderError }] = await Promise.all([
    supabase.from("customers").select("id,full_name,email,phone").eq("auth_user_id", user.id).maybeSingle(),
    supabase.from("delivery_addresses").select("id,address_line_1,address_line_2,city,state,postal_code,country").eq("auth_user_id", user.id).eq("is_default", true).limit(1),
    supabase.from("orders").select("id,order_number,status,payment_status,payment_method,total,shipping_amount,created_at,shipping_address,order_items(id,product_id,product_name,variant_label,unit_price,quantity,line_total,products(image_url)),shipmozo_shipments(id,status,provider_order_id,awb_number,courier_id,courier_name,tracking_status,tracking_url,expected_delivery_at,delivered_at,last_synced_at,shipmozo_tracking_events(id,event_key,status,description,location,event_at,created_at))").order("created_at", { ascending: false }),
  ]);
  if (orderError) throw new Error(`Unable to load order history: ${orderError.message}`);

  return <><Header /><CustomerAccount user={{ id: user.id, email: user.email }} customer={customer} address={addresses?.[0] || null} orders={orders || []} /><Footer /></>;
}
