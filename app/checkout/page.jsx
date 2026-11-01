import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CustomerCheckout from "@/components/CustomerCheckout";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout | Sidra Store" };

export default async function CheckoutPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: customer }, { data: addresses }] = user
    ? await Promise.all([
      supabase.from("customers").select("full_name, phone").eq("auth_user_id", user.id).maybeSingle(),
      supabase.from("delivery_addresses").select("id, recipient_name, phone, address_line_1, address_line_2, city, state, postal_code, country").eq("auth_user_id", user.id).eq("is_default", true).limit(1),
    ])
    : [{ data: null }, { data: [] }];

  return (
    <>
      <Header />
      <CustomerCheckout user={user ? { id: user.id, email: user.email } : null} customer={customer} address={addresses?.[0] || null} />
      <Footer />
    </>
  );
}
