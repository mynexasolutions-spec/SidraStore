import { notFound } from "next/navigation";
import { cache } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductDetails from "@/components/ProductDetails";
import {
  allProducts,
  applyProductCatalogDetails,
  findProductBySlug,
  getSimilarProducts,
} from "@/lib/productCatalog";
import { createAdminCatalogClient } from "@/lib/adminCatalog";

export const dynamic = "force-dynamic";

const loadProduct = cache(async (slug) => {
  const fallbackProduct = findProductBySlug(slug);
  const safeFallbackProduct = fallbackProduct ? { ...fallbackProduct, rating: 0, reviews: 0 } : null;
  try {
    const supabase = createAdminCatalogClient();
    const { data, error } = await supabase
      .from("products")
      .select("id,name,slug,short_description,description,price,stock_quantity,image_url,gallery_urls,variants,badge,categories(name,slug),subcategories(name,slug)")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return safeFallbackProduct ? { ...safeFallbackProduct, slug } : null;
    const { data: reviewSummary, error: reviewSummaryError } = await supabase
      .from("product_review_summaries")
      .select("average_rating,approved_review_count")
      .eq("product_id", data.id)
      .maybeSingle();
    if (reviewSummaryError) throw new Error(reviewSummaryError.message);
    return applyProductCatalogDetails({
      id: data.id,
      slug: data.slug,
      src: data.image_url,
      galleryUrls: data.gallery_urls || [],
      name: data.name,
      desc: data.short_description,
      description: data.description,
      price: Number(data.price),
      stockQuantity: Number(data.stock_quantity),
      rating: Number(reviewSummary?.average_rating || 0),
      reviews: Number(reviewSummary?.approved_review_count || 0),
      category: data.categories?.name || "Uncategorized",
      categorySlug: data.categories?.slug,
      subCategory: data.subcategories?.name || "General",
      badge: data.badge,
      variants: data.variants || [],
      tone: fallbackProduct?.tone || "from-stone-200 to-cream",
    }, safeFallbackProduct);
  } catch (error) {
    if (!safeFallbackProduct) throw error;
    console.warn("Product database lookup failed; using the bundled catalog entry.", { slug, error: error.message });
    return { ...safeFallbackProduct, slug };
  }
});

export async function generateMetadata({ params }) {
  const product = await loadProduct(params.slug);

  if (!product) {
    return { title: "Product Not Found | Sidra Store" };
  }

  return {
    title: `${product.name} | Sidra Store`,
    description: `${product.desc}. Shop authentic ${product.category.toLowerCase()} from Sidra Store.`,
  };
}

export default async function ProductPage({ params }) {
  const product = await loadProduct(params.slug);

  if (!product) notFound();

  const similarProducts = product.id
    ? allProducts.filter((candidate) => candidate.category === product.category && candidate.name !== product.name).slice(0, 4)
    : getSimilarProducts(product, 4);

  return (
    <>
      <Header />
      <ProductDetails product={product} similarProducts={similarProducts} />
      <Footer />
    </>
  );
}
