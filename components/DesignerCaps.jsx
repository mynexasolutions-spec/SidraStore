"use client";

import { useState } from "react";
import { Eye, Heart, ShoppingCart, Tag } from "lucide-react";
import SmartImage from "./SmartImage";
import Reveal from "./Reveal";
import Particles from "./Particles";
import { getProductPath } from "@/lib/productCatalog";
import { useWishlist } from "./WishlistProvider";
import { useStorefrontCatalog } from "./useStorefrontData";
import ProductRating from "./ReviewSummary";

export default function DesignerCaps() {
  const { isWishlisted, toggleWishlist } = useWishlist();
  const { products: catalogProducts, error: catalogError, isLoading } = useStorefrontCatalog([]);
  const capProducts = catalogProducts.filter((product) => product.categorySlug === "islamic-caps" || product.category === "Islamic Caps");
  const [added, setAdded] = useState(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const toggle = (setter, name, ms) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else {
        next.add(name);
        if (ms) setTimeout(() => setter((p) => { const n = new Set(p); n.delete(name); return n; }), ms);
      }
      return next;
    });

  const initialCount = 10;
  const displayProducts = showAll ? capProducts : capProducts.slice(0, initialCount);

  if (isLoading) return <section className="bg-cream py-20 text-center text-sm text-stone-500">Loading cap collection...</section>;

  return (
    <section className="relative isolate overflow-hidden bg-cream py-20 lg:py-24">
      <Particles />

      {/* Ambient glows */}
      <div className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] animate-glow rounded-full bg-[radial-gradient(circle,rgba(232,189,109,0.28),transparent_65%)]" />
      <div className="pointer-events-none absolute -right-40 bottom-10 h-[460px] w-[460px] animate-glow rounded-full bg-[radial-gradient(circle,rgba(201,154,75,0.22),transparent_65%)] [animation-delay:2s]" />
      <span className="pointer-events-none absolute -top-6 right-6 hidden select-none font-serif text-[200px] font-bold leading-none text-gold/[0.06] lg:block">
        Caps
      </span>

      {/* Floating ornamental seal */}
      <div className="pointer-events-none absolute right-8 top-1/3 hidden h-[180px] w-[180px] animate-float lg:block">
        <svg viewBox="0 0 200 200" className="absolute inset-0 animate-spin-slow">
          <defs>
            <path id="capsSeal" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
          </defs>
          <text fontSize="14" fontWeight="500" fill="#E8BD6D" opacity="0.6">
            <textPath href="#capsSeal" textLength="486" lengthAdjust="spacing">
              ISLAMIC CAPS • DESIGNER COLLECTION • PREMIUM QUALITY •
            </textPath>
          </text>
        </svg>
      </div>

      <div className="container-site relative">
        <Reveal className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.35em] text-gold-dark">
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold-dark" />
              Islamic Caps
            </p>
            <h2 className="mt-3 font-serif text-4xl font-semibold text-ink lg:text-5xl">
              Designer <span className="text-shimmer-dark">Collection</span>
            </h2>
            <p className="mt-3 hidden max-w-[420px] text-base text-stone-500 sm:block">
              Handcrafted Islamic caps blending tradition with contemporary elegance. {capProducts.length} unique designs available.
            </p>
          </div>
        </Reveal>

        {catalogError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Catalog synchronization failed: {catalogError}</p>}

        {/* Grid: 5 columns on desktop, 2 on tablet, 1 on mobile */}
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {displayProducts.map((p, i) => {
            const liked = isWishlisted(p);
            const isAdded = added.has(p.name);
            return (
              <Reveal key={p.src} delay={i * 60}>
                <article className="group relative h-full select-none overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_-18px_rgba(21,16,12,0.35)] ring-1 ring-stone-200 transition duration-500 hover:-translate-y-3 hover:shadow-[0_34px_60px_-20px_rgba(201,154,75,0.6)] hover:ring-gold/70">
                  <SmartImage
                    src={p.src}
                    alt={p.name}
                    tone={p.tone}
                    className="h-[230px] w-full"
                    imgClassName="pointer-events-none h-full w-full object-cover transition duration-700 group-hover:scale-110"
                  >
                    <a
                      href={getProductPath(p)}
                      aria-label={`View ${p.name} details`}
                      className="absolute inset-0 z-[1]"
                    />
                    {/* Depth gradient */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

                    {/* Category badge */}
                    <span className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-lg bg-white/90 text-stone-700 backdrop-blur-sm border border-gold/30">
                      {p.subCategory || p.category}
                    </span>

                    {/* Rank badge */}
                    <span
                      className={`absolute right-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-lg ${
                        p.badge === "Best Seller"
                          ? "bg-gradient-to-b from-gold-light to-gold text-ink"
                          : p.badge === "New Arrival"
                          ? "bg-gradient-to-b from-emerald-500 to-emerald-700 text-white"
                          : p.badge === "Limited"
                          ? "bg-gradient-to-b from-rose-500 to-rose-700 text-white"
                          : p.badge === "Exclusive"
                          ? "bg-gradient-to-b from-purple-500 to-purple-700 text-white"
                          : p.badge === "Featured"
                          ? "bg-gradient-to-b from-blue-500 to-blue-700 text-white"
                          : "bg-black/55 text-gold-light backdrop-blur-sm"
                      }`}
                    >
                      {p.badge === "Best Seller" && <Tag size={12} />}
                      {p.badge === "New Arrival" && <span className="text-[10px]">NEW</span>}
                      {p.badge === "Limited" && <span className="text-[10px]">LTD</span>}
                      {p.badge === "Exclusive" && <span className="text-[10px]">EXCL</span>}
                      {p.badge === "Featured" && <span className="text-[10px]">★</span>}
                      {!p.badge && `#${i + 1}`}
                    </span>

                    {/* Wishlist */}
                    <button
                      aria-label="Wishlist"
                      aria-pressed={liked}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlist(p); }}
                      className={`absolute right-3 top-36 z-20 flex h-9 w-9 items-center justify-center rounded-full shadow-lg transition duration-300 hover:scale-110 ${
                        liked ? "bg-red-500 text-white" : "bg-white/95 text-stone-600 hover:text-red-500"
                      }`}
                    >
                      <Heart size={16} fill={liked ? "currentColor" : "none"} className={liked ? "animate-bob" : ""} />
                    </button>

                    {/* Quick view slides up on hover */}
                    <a href={getProductPath(p)} className="absolute inset-x-4 bottom-4 z-10 flex translate-y-6 items-center justify-center gap-2 rounded-full bg-white/90 py-2 text-xs font-semibold text-ink opacity-0 shadow-lg backdrop-blur-sm transition duration-500 hover:bg-gold group-hover:translate-y-0 group-hover:opacity-100">
                      <Eye size={14} /> Quick View
                    </a>
                  </SmartImage>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-bold leading-tight text-ink line-clamp-1">
                        <a href={getProductPath(p)} className="transition hover:text-gold-dark">{p.name}</a>
                      </h3>
                      {p.badge && (
                        <span className="shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-r from-gold-dark to-gold">
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[13px] text-stone-500 line-clamp-1">{p.desc}</p>
                    <ProductRating rating={p.rating} reviews={p.reviews} size={13} className="mt-2 text-xs" />
                    <p className="mt-2.5 text-2xl font-bold text-ink">
                      <span className="mr-0.5 text-lg font-semibold text-gold-dark">₹</span>
                      {p.price}
                    </p>
                    <button
                      onClick={() => toggle(setAdded, p.name, 1800)}
                      className={`btn-gold-sm relative mt-3 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3 text-[13px] font-semibold transition duration-300 ${
                        isAdded
                          ? "bg-emerald-600 text-white"
                          : "bg-ink text-white hover:bg-gradient-to-b hover:from-gold-light hover:to-gold hover:text-ink"
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <ShoppingCart size={16} className="rotate-90" /> Added to Cart
                        </>
                      ) : (
                        <>
                          <ShoppingCart size={15} /> Add to Cart
                        </>
                      )}
                    </button>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>

        {/* View more / Show less button */}
        {!showAll && capProducts.length > initialCount && (
          <div className="mt-10 text-center">
            <button
              onClick={() => setShowAll(true)}
              className="btn-gold inline-flex"
            >
              View All {capProducts.length} Caps
            </button>
          </div>
        )}
        {showAll && (
          <div className="mt-10 text-center">
            <button
              onClick={() => setShowAll(false)}
              className="btn-gold inline-flex bg-ink hover:bg-gradient-to-b hover:from-gold-light hover:to-gold hover:text-ink"
            >
              Show Less ({initialCount} Caps)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
