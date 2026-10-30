"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeToStorefrontUpdates } from "@/lib/storefrontSync";
import { applyProductCatalogDetails } from "@/lib/productCatalog";

const emptyStorefrontContent = { hero_slides: [], announcements: [], delivery_settings: null, faqs: [] };

function getProductKey(product) {
  return String(product.slug || product.name || "").trim().toLowerCase();
}

function withoutReviewSummary(product) {
  return { ...product, rating: 0, reviews: 0 };
}

export function mapStorefrontProduct(product, fallbackProduct) {
  return applyProductCatalogDetails({
    id: product.id,
    slug: product.slug,
    src: product.image_url,
    galleryUrls: Array.isArray(product.gallery_urls) ? product.gallery_urls : [],
    name: product.name,
    desc: product.short_description,
    description: product.description,
    price: Number(product.price),
    stockQuantity: Number(product.stock_quantity),
    rating: Number(product.average_rating || 0),
    reviews: Number(product.approved_review_count || 0),
    isFeatured: Boolean(product.is_featured),
    category: product.categories?.name || "Uncategorized",
    categorySlug: product.categories?.slug,
    subCategory: product.subcategories?.name || "General",
    badge: product.badge,
    variants: Array.isArray(product.variants) ? product.variants : (fallbackProduct?.variants || []),
    tone: fallbackProduct?.tone || "from-stone-200 to-cream",
  }, fallbackProduct);
}

function useLiveEndpoint(url, initialValue) {
  const [data, setData] = useState(initialValue);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const dataSignatureRef = useRef(JSON.stringify(initialValue));
  const requestSequenceRef = useRef(0);
  const refresh = useCallback(async () => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    try {
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Unable to load ${url}.`);
      if (requestSequence !== requestSequenceRef.current) return false;
      const nextSignature = JSON.stringify(result);
      if (nextSignature !== dataSignatureRef.current) {
        dataSignatureRef.current = nextSignature;
        setData(result);
      }
      setError("");
      return true;
    } catch (requestError) {
      if (requestSequence !== requestSequenceRef.current) return false;
      throw requestError;
    }
  }, [url]);

  useEffect(() => {
    let mounted = true;
    const update = async () => {
      try {
        const isCurrentRequest = await refresh();
        if (mounted && isCurrentRequest) setIsLoading(false);
      } catch (requestError) {
        if (mounted) {
          setError(requestError.message);
          setIsLoading(false);
        }
      }
    };
    update();
    const unsubscribe = subscribeToStorefrontUpdates(update);
    const interval = window.setInterval(update, 10000);
    return () => { mounted = false; unsubscribe(); window.clearInterval(interval); };
  }, [refresh]);
  return { data, error, refresh, isLoading };
}

export function useStorefrontCatalog(initialProducts) {
  const initialProductsRef = useRef(initialProducts);
  const { data, error, refresh, isLoading } = useLiveEndpoint("/api/storefront/catalog", { products: [], categories: [] });
  const products = useMemo(
    () => {
      const fallbackProducts = initialProductsRef.current;
      if (!data.products.length) return fallbackProducts.map(withoutReviewSummary);

      const fallbackByKey = new Map(fallbackProducts.map((product) => [getProductKey(product), product]));
      const fallbackOrder = new Map(fallbackProducts.map((product, index) => [getProductKey(product), index]));
      const seenProducts = new Set();

      return data.products
        .map((product) => mapStorefrontProduct(product, fallbackByKey.get(getProductKey(product))))
        .filter((product) => {
          const key = getProductKey(product);
          if (!key || seenProducts.has(key)) return false;
          seenProducts.add(key);
          return true;
        })
        .sort((first, second) => {
          const firstIndex = fallbackOrder.get(getProductKey(first)) ?? Number.MAX_SAFE_INTEGER;
          const secondIndex = fallbackOrder.get(getProductKey(second)) ?? Number.MAX_SAFE_INTEGER;
          return firstIndex - secondIndex;
        });
    },
    [data.products],
  );
  return { products, categories: data.categories, error, refresh, isLoading };
}

export function useStorefrontCategories(initialCategories = []) {
  const { data, error, refresh, isLoading } = useLiveEndpoint("/api/storefront/catalog", { products: [], categories: initialCategories });
  return { categories: data.categories, error, refresh, isLoading };
}

export function useStorefrontContent(initialValue) {
  return useLiveEndpoint("/api/storefront/content", initialValue || emptyStorefrontContent);
}
