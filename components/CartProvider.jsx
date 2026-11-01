"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { allProducts, createProductSlug } from "@/lib/productCatalog";
import { createClient } from "@/lib/supabase/client";
import { useStorefrontCatalog } from "./useStorefrontData";

const STORAGE_KEY = "sidra_store_cart";
const CartContext = createContext(null);

function normalizeCartItem(product, quantity) {
  const variant = product.variant;
  const productSlug = product.slug || createProductSlug(product.name);
  const variantKey = variant ? `-${variant.size}` : "";
  return {
    slug: productSlug + variantKey,
    productSlug,
    name: product.name + (variant ? ` (${variant.size})` : ""),
    price: Number(variant?.price ?? product.price),
    src: product.src,
    quantity: Math.max(1, Number(quantity) || 1),
    variant: variant ? { size: variant.size, price: variant.price } : null,
  };
}

function persistCart(items) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

async function recordAuthenticatedCartActivity(item, quantity) {
  const supabase = createClient();
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error("Unable to verify the customer before recording cart activity.", userError);
    return;
  }
  if (!data.user) return;

  const { error } = await supabase.rpc("record_customer_cart_activity", {
    p_product_slug: item.productSlug,
    p_quantity: Math.min(25, Math.max(1, Math.floor(Number(quantity) || 1))),
    p_variant_size: item.variant?.size || null,
    p_event_id: window.crypto.randomUUID(),
  });
  if (error) {
    console.error("Unable to record authenticated cart activity.", error);
  }
}

export function CartProvider({ children }) {
  const { products: catalogProducts, error: catalogError } = useStorefrontCatalog(allProducts);
  const [items, setItems] = useState([]);
  const itemsRef = useRef([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const storedItems = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(storedItems)) {
        itemsRef.current = storedItems;
        setItems(storedItems);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded || !catalogProducts.length) return;
    const currentItems = itemsRef.current;
    const nextItems = currentItems.map((item) => {
        const itemProductSlug = item.productSlug || item.slug.replace(/-(6ml|12ml)$/, "");
        const product = catalogProducts.find(
          (candidate) => (candidate.slug || createProductSlug(candidate.name)) === itemProductSlug,
        );

        // A temporary catalog/API mismatch must never erase a customer's cart.
        if (!product) return item;

        const variant = item.variant
          ? product.variants?.find((candidate) => candidate.size === item.variant.size)
          : null;
        const availableStock = variant?.stock ?? product.stockQuantity;
        const quantity = Number.isFinite(availableStock) && availableStock > 0
          ? Math.min(item.quantity, availableStock)
          : item.quantity;

        return {
          ...item,
          productSlug: itemProductSlug,
          name: product.name + (variant ? ` (${variant.size})` : ""),
          price: Number(variant?.price ?? product.price),
          src: product.src,
          quantity,
        };
    });

    if (JSON.stringify(nextItems) !== JSON.stringify(currentItems)) {
      itemsRef.current = nextItems;
      persistCart(nextItems);
      setItems(nextItems);
    }
  }, [catalogProducts, loaded]);

  const addItem = useCallback((product, quantity = 1) => {
    const nextItem = normalizeCartItem(product, quantity);
    const currentItems = itemsRef.current;
    const existing = currentItems.find((item) => item.slug === nextItem.slug);
    const nextItems = !existing ? [...currentItems, nextItem] : currentItems.map((item) =>
      item.slug === nextItem.slug
        ? { ...item, quantity: item.quantity + nextItem.quantity }
        : item,
    );
    itemsRef.current = nextItems;
    persistCart(nextItems);
    setItems(nextItems);

    void recordAuthenticatedCartActivity(nextItem, nextItem.quantity).catch((error) => {
      console.error("Unable to record authenticated cart activity.", error);
    });
  }, []);

  const updateQuantity = useCallback((slug, quantity) => {
    const nextItems = itemsRef.current
      .map((item) => item.slug === slug ? { ...item, quantity: Math.max(0, quantity) } : item)
      .filter((item) => item.quantity > 0);
    itemsRef.current = nextItems;
    persistCart(nextItems);
    setItems(nextItems);
  }, []);

  const removeItem = useCallback((slug) => {
    const nextItems = itemsRef.current.filter((item) => item.slug !== slug);
    itemsRef.current = nextItems;
    persistCart(nextItems);
    setItems(nextItems);
  }, []);

  const clearCart = useCallback(() => {
    itemsRef.current = [];
    persistCart([]);
    setItems([]);
  }, []);
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const value = useMemo(
    () => ({ items, itemCount, subtotal, catalogProducts, catalogError, addItem, updateQuantity, removeItem, clearCart }),
    [items, itemCount, subtotal, catalogProducts, catalogError, addItem, updateQuantity, removeItem, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider.");
  return context;
}
