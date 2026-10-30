import { NextResponse } from "next/server";
import { createAdminCatalogClient } from "@/lib/adminCatalog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await createAdminCatalogClient()
      .from("reviews")
      .select("id,customer_name,rating,title,body,created_at,products(name,slug)")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) throw new Error(error.message);
    const reviews = (data || []).map((review) => ({
      id: review.id,
      name: review.customer_name,
      place: "Verified customer review",
      rating: Number(review.rating),
      product: review.products?.name || "Sidra Store product",
      img: null,
      text: review.body,
      created_at: review.created_at,
    }));
    return NextResponse.json({ reviews }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
