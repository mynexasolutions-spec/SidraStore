"use client";

import { useState } from "react";
import {
  Check,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Zap,
} from "lucide-react";
import SmartImage from "./SmartImage";
import Reveal from "./Reveal";
import { getProductPath } from "@/lib/productCatalog";
import { useCart } from "./CartProvider";
import { useStorefrontCatalog } from "./useStorefrontData";
import ProductGallery from "./ProductGallery";
import ProductReviews from "./ProductReviews";
import ProductRating from "./ReviewSummary";

function getDescription(product) {
  if (product.description?.trim()) return product.description.trim();

  const categoryDescriptions = {
    "Attar & Fragrances": "A refined, alcohol-free fragrance selected for its expressive character and lasting presence.",
    "Islamic Caps": "A thoughtfully crafted cap that balances traditional character with a comfortable everyday fit.",
    Surma: "An authentic traditional eye kohl chosen for a timeless, meaningful daily ritual.",
    "Prayer Essentials": "A carefully selected prayer essential designed to bring comfort and beauty to moments of worship.",
    "Islamic Wear": "A heritage-inspired piece made to bring elegance and tradition into special and everyday occasions.",
    "Gifts & Combos": "A considered collection of Sidra favourites, presented as a memorable gift for someone special.",
  };

  return `${product.desc}. ${categoryDescriptions[product.category]}`;
}

const serviceItems = [
  { icon: ShieldCheck, title: "Authentic Product", text: "Quality checked by Sidra Store" },
  { icon: Truck, title: "Secure Delivery", text: "Carefully packed for transit" },
  { icon: RotateCcw, title: "Easy Support", text: "Help when you need it" },
  { icon: PackageCheck, title: "Premium Packing", text: "Ready for gifting" },
];

export default function ProductDetails({ product: initialProduct, similarProducts: initialSimilarProducts }) {
  const { addItem } = useCart();
  const { products: liveProducts, error: catalogError } = useStorefrontCatalog([initialProduct, ...initialSimilarProducts]);
  const product = liveProducts.find((item) => item.slug === initialProduct.slug || item.name === initialProduct.name) || initialProduct;
  const similarProducts = liveProducts.filter((item) => item.name !== product.name).sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category)).slice(0, 4);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);

  const variants = product.variants || [];
  const hasVariants = variants.length > 0;
  const displayPrice = selectedVariant ? selectedVariant.price : product.price;

  const addToCart = () => {
    const item = hasVariants && selectedVariant ? { ...product, price: selectedVariant.price, variant: selectedVariant } : product;
    addItem(item, quantity);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  };

  const buyNow = () => {
    const item = hasVariants && selectedVariant ? { ...product, price: selectedVariant.price, variant: selectedVariant } : product;
    addItem(item, quantity);
    window.setTimeout(() => window.location.assign("/checkout"), 100);
  };

  return (
    <main className="overflow-x-clip bg-cream text-ink">
      {catalogError && <p role="alert" className="mx-auto mt-5 max-w-7xl rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Catalog synchronization failed: {catalogError}</p>}
      <section className="relative overflow-hidden py-10 sm:py-14 lg:py-20">
        <div className="pointer-events-none absolute -left-52 top-0 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(232,189,109,0.24),transparent_65%)]" />
        <div className="pointer-events-none absolute -right-52 bottom-0 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(201,154,75,0.18),transparent_65%)]" />

        <div className="container-site relative">
          <nav aria-label="Breadcrumb" className="mb-7 flex flex-wrap items-center gap-2 text-sm text-stone-500">
            <a href="/" className="transition hover:text-gold-dark">Home</a>
            <span aria-hidden="true">/</span>
            <a href="/all-products" className="transition hover:text-gold-dark">All Products</a>
            <span aria-hidden="true">/</span>
            <span className="text-ink">{product.name}</span>
          </nav>

          <div className="grid min-w-0 items-start gap-9 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <Reveal from="left">
              <div className="relative overflow-visible">
                <ProductGallery product={product} />
                <span className="absolute left-7 top-7 rounded-full border border-gold/30 bg-white/90 px-3 py-1.5 text-xs font-bold text-stone-700 shadow-sm backdrop-blur-sm sm:left-[150px]">
                  {product.subCategory}
                </span>
                {product.badge && (
                  <span className="absolute right-7 top-7 rounded-full bg-gradient-to-b from-gold-light to-gold px-3 py-1.5 text-xs font-bold uppercase text-ink shadow-lg">
                    {product.badge}
                  </span>
                )}
              </div>
            </Reveal>

            <Reveal from="right" className="lg:pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-dark">{product.category}</p>
              <h1 className="mt-3 break-words font-serif text-4xl font-semibold leading-tight sm:text-5xl lg:text-[58px]">
                {product.name}
              </h1>
              <p className="mt-3 text-lg text-stone-500">{product.desc}</p>

              <ProductRating rating={product.rating} reviews={product.reviews} size={18} className="mt-5 text-sm" />

              <p className="mt-7 max-w-[620px] whitespace-pre-line text-base leading-8 text-stone-600">
                {getDescription(product)}
              </p>

              {hasVariants && (
                <div className="mt-6">
                  <p className="text-sm font-semibold text-ink">Select Size</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {variants.map((variant) => (
                      <button
                        key={variant.size}
                        type="button"
                        onClick={() => setSelectedVariant(variant)}
                        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                          selectedVariant?.size === variant.size
                            ? "border-gold bg-gradient-to-b from-gold-light to-gold text-ink shadow-[0_4px_14px_-6px_rgba(201,154,75,0.5)]"
                            : "border-stone-300 bg-white text-stone-700 hover:border-gold hover:bg-cream"
                        }`}
                        aria-pressed={selectedVariant?.size === variant.size}
                      >
                        {variant.size}
                        <span className="text-gold-dark">₹{variant.price}</span>
                        {variant.stock !== undefined && (
                          <span className="text-xs text-stone-500">({variant.stock} in stock)</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {selectedVariant && (
                    <p className="mt-2 text-sm text-gold-dark">Selected: {selectedVariant.size} — ₹{selectedVariant.price}</p>
                  )}
                </div>
              )}

              <p className="mt-7 text-4xl font-bold">
                <span className="mr-1 text-2xl font-semibold text-gold-dark">₹</span>
                {displayPrice}
              </p>
              <p className="mt-1 text-sm text-stone-500">Inclusive of all taxes</p>

              <div className="mt-7 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
                <p className="text-sm font-semibold uppercase tracking-wide text-stone-600 sm:hidden">Quantity</p>
                <div className="flex h-[52px] min-h-[52px] w-[164px] shrink-0 justify-self-start items-center justify-between rounded-full border border-stone-300 bg-white px-2 sm:w-full">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    aria-label="Decrease quantity"
                    className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-cream"
                  >
                    <Minus size={17} />
                  </button>
                  <span className="font-semibold tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => value + 1)}
                    aria-label="Increase quantity"
                    className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-cream"
                  >
                    <Plus size={17} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={addToCart}
                  className={`col-span-2 flex h-[52px] min-h-[52px] w-full shrink-0 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold transition duration-300 sm:col-span-1 ${
                    added
                      ? "bg-emerald-600 text-white"
                      : "bg-ink text-white hover:bg-gradient-to-b hover:from-gold-light hover:to-gold hover:text-ink"
                  }`}
                >
                  {added ? <Check size={18} /> : <ShoppingBag size={18} />}
                  {added ? `Added ${quantity} to Cart` : "Add to Cart"}
                </button>

                <button
                  type="button"
                  onClick={buyNow}
                  className="col-span-2 flex h-[52px] min-h-[52px] w-full shrink-0 items-center justify-center gap-2 rounded-full border border-gold-dark bg-gradient-to-b from-gold-light to-gold px-7 text-sm font-semibold text-ink shadow-[0_10px_28px_-14px_rgba(201,154,75,0.8)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-14px_rgba(201,154,75,0.9)] sm:col-span-1"
                >
                  <Zap size={18} /> Buy Now
                </button>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3">
                {serviceItems.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex gap-3 rounded-2xl border border-gold/15 bg-white/75 p-3.5">
                    <Icon size={21} strokeWidth={1.5} className="mt-0.5 shrink-0 text-gold-dark" />
                    <div>
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-stone-500">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <ProductReviews productSlug={product.slug || initialProduct.slug} />

      <section className="border-t border-gold/15 bg-white py-16 lg:py-20">
        <div className="container-site">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-dark">You May Also Like</p>
              <h2 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">Similar Products</h2>
              <p className="mt-3 text-stone-500">More favourites from {product.category}.</p>
            </div>
            <a href="/all-products" className="rounded-full border border-gold/50 px-5 py-2.5 text-sm font-semibold transition hover:bg-gold">
              View All Products
            </a>
          </Reveal>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {similarProducts.map((similarProduct, index) => (
              <Reveal key={similarProduct.name} delay={index * 80} from="zoom">
                <article className="group h-full overflow-hidden rounded-3xl border border-stone-200 bg-cream shadow-[0_14px_35px_-24px_rgba(21,16,12,0.55)] transition duration-500 hover:-translate-y-2 hover:border-gold/60 hover:shadow-[0_28px_55px_-28px_rgba(201,154,75,0.75)]">
                  <a href={getProductPath(similarProduct)} className="block">
                    <SmartImage
                      src={similarProduct.src}
                      alt={similarProduct.name}
                      tone={similarProduct.tone}
                      className="aspect-square w-full"
                      imgClassName="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    />
                  </a>
                  <div className="p-3 sm:p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-dark">
                      {similarProduct.subCategory}
                    </p>
                    <h3 className="mt-2 text-base font-bold sm:text-lg">
                      <a href={getProductPath(similarProduct)} className="transition hover:text-gold-dark">
                        {similarProduct.name}
                      </a>
                    </h3>
                    <ProductRating rating={similarProduct.rating} reviews={similarProduct.reviews} size={13} className="mt-2 text-xs" />
                    <p className="mt-3 text-xl font-bold sm:text-2xl">
                      <span className="mr-0.5 text-lg text-gold-dark">₹</span>
                      {similarProduct.price}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
