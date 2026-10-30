import { NextResponse } from "next/server";
import { createAdminCatalogClient } from "@/lib/adminCatalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminCatalogClient();
  const [
    { data: categories, error: categoryError },
    { data: products, error: productError },
    { data: reviewSummaries, error: reviewSummaryError },
  ] = await Promise.all([
    supabase.from("categories").select("id,name,slug,description,image_url,sort_order,subcategories(id,name,slug,sort_order,is_active)").eq("is_active", true).order("sort_order"),
    supabase.from("products").select("id,name,slug,short_description,description,price,stock_quantity,image_url,gallery_urls,variants,badge,is_featured,category_id,subcategory_id,categories(name,slug),subcategories(name,slug)").eq("is_active", true).order("created_at"),
    supabase.from("product_review_summaries").select("product_id,average_rating,approved_review_count"),
  ]);
  const error = categoryError || productError || reviewSummaryError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const uniqueCategories = [...new Map(
    categories.map((category) => [category.name.trim().toLowerCase(), category]),
  ).values()];
  const summariesByProductId = new Map((reviewSummaries || []).map((summary) => [summary.product_id, summary]));
  const productsWithReviewSummaries = (products || []).map((product) => {
    const summary = summariesByProductId.get(product.id);
    return {
      ...product,
      average_rating: Number(summary?.average_rating || 0),
      approved_review_count: Number(summary?.approved_review_count || 0),
    };
  });
  return NextResponse.json({ categories: uniqueCategories, products: productsWithReviewSummaries }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
