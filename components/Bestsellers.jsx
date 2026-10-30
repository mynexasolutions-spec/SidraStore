"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Flame,
  Heart,
  ShoppingCart,
} from "lucide-react";
import SmartImage from "./SmartImage";
import Reveal from "./Reveal";
import { allProducts, getProductPath } from "@/lib/productCatalog";
import { useCart } from "./CartProvider";
import { useWishlist } from "./WishlistProvider";
import { useStorefrontCatalog } from "./useStorefrontData";
import ProductRating from "./ReviewSummary";

export default function Bestsellers() {
  const { addItem } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const { products } = useStorefrontCatalog(allProducts);
  const featuredProducts = products.filter((product) => product.isFeatured);
  const ref = useRef(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });
  const [progress, setProgress] = useState(0); // 0..1 scroll position
  const [thumb, setThumb] = useState(0.4); // visible share of the track
  const [added, setAdded] = useState(() => new Set());

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress(max > 0 ? el.scrollLeft / max : 0);
    setThumb(el.scrollWidth > 0 ? Math.min(el.clientWidth / el.scrollWidth, 1) : 1);
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  // move by one card (+ gap) per click
  const scroll = (dir) => {
    const el = ref.current;
    if (!el) return;
    const card = el.firstElementChild;
    const step = card ? card.getBoundingClientRect().width + 16 : 300;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  // mouse drag-to-scroll (touch already scrolls natively)
  const onDown = (e) => {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
    el.style.scrollSnapType = "none";
    el.style.scrollBehavior = "auto";
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    ref.current.scrollLeft = d.startLeft - dx;
  };
  const onUp = () => {
    const el = ref.current;
    if (!drag.current.active) return;
    drag.current.active = false;
    el.style.scrollSnapType = "";
    el.style.scrollBehavior = "";
  };

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

  const atStart = progress <= 0.01;
  const atEnd = progress >= 0.99;

  if (!featuredProducts.length) return null;

  return (
    <section className="relative overflow-hidden bg-cream py-20 lg:py-24">
      {/* ambience */}
      <div className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] animate-glow rounded-full bg-[radial-gradient(circle,rgba(232,189,109,0.28),transparent_65%)]" />
      <div className="pointer-events-none absolute -right-40 bottom-10 h-[460px] w-[460px] animate-glow rounded-full bg-[radial-gradient(circle,rgba(201,154,75,0.22),transparent_65%)] [animation-delay:2s]" />
      <span className="pointer-events-none absolute -top-6 right-6 hidden select-none font-serif text-[200px] font-bold leading-none text-gold/[0.06] lg:block">
        Attar
      </span>

      <div className="container-site relative">
        <Reveal className="flex items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.35em] text-gold-dark">
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold-dark" />
              Featured
            </p>
            <h2 className="mt-3 font-serif text-4xl font-semibold text-ink lg:text-5xl">
              Featured <span className="text-shimmer-dark">Products</span>
            </h2>
            <p className="mt-3 hidden max-w-[420px] text-base text-stone-500 sm:block">
              Hand-picked products selected for the Sidra Store homepage.
            </p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <a href="/shop" className="link-underline hidden items-center text-sm font-semibold text-ink sm:flex">
              View All
            </a>
            <button
              onClick={() => scroll(-1)}
              disabled={atStart}
              aria-label="Previous"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 bg-white transition hover:border-gold hover:bg-gold disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => scroll(1)}
              disabled={atEnd}
              aria-label="Next"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 bg-white transition hover:border-gold hover:bg-gold disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </Reveal>

        <div
          ref={ref}
          onScroll={update}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onDragStart={(e) => e.preventDefault()}
          className="no-scrollbar -mx-4 mt-10 flex cursor-grab snap-x snap-mandatory scroll-pl-4 gap-4 overflow-x-auto scroll-smooth px-4 pb-8 pt-3 active:cursor-grabbing sm:-mx-8 sm:scroll-pl-8 sm:px-8 lg:mx-0 lg:scroll-pl-0 lg:px-0"
        >
          {featuredProducts.map((p, i) => {
            const liked = isWishlisted(p);
            const isAdded = added.has(p.name);
            return (
              <Reveal
                key={p.id || p.slug || p.name}
                delay={i * 90}
                className="w-[220px] shrink-0 snap-start sm:w-[240px] lg:w-[calc((100%-4rem)/5)]"
              >
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
                    {/* depth gradient */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

                    {/* rank badge */}
                    <span
                      className={`absolute left-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-lg ${
                        i === 0
                          ? "bg-gradient-to-b from-gold-light to-gold text-ink"
                          : "bg-black/55 text-gold-light backdrop-blur-sm"
                      }`}
                    >
                      {i === 0 && <Flame size={12} />}
                      {i === 0 ? "Featured" : `#${i + 1}`}
                    </span>

                    {/* wishlist */}
                    <button
                      aria-label="Wishlist"
                      aria-pressed={liked}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleWishlist(p);
                      }}
                      className={`absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full shadow-lg transition duration-300 hover:scale-110 ${
                        liked ? "bg-red-500 text-white" : "bg-white/95 text-stone-600 hover:text-red-500"
                      }`}
                    >
                      <Heart size={16} fill={liked ? "currentColor" : "none"} className={liked ? "animate-bob" : ""} />
                    </button>

                    {/* quick view slides up on hover */}
                    <a href={getProductPath(p)} className="absolute inset-x-4 bottom-4 z-10 flex translate-y-6 items-center justify-center gap-2 rounded-full bg-white/90 py-2 text-xs font-semibold text-ink opacity-0 shadow-lg backdrop-blur-sm transition duration-500 hover:bg-gold group-hover:translate-y-0 group-hover:opacity-100">
                      <Eye size={14} /> Quick View
                    </a>
                  </SmartImage>

                  <div className="p-4">
                    <h3 className="text-base font-bold leading-tight text-ink">
                      <a href={getProductPath(p)} className="transition hover:text-gold-dark">{p.name}</a>
                    </h3>
                    <p className="mt-0.5 text-[13px] text-stone-500">{p.subCategory || p.desc}</p>
                    <ProductRating rating={p.rating} reviews={p.reviews} size={13} className="mt-2 text-xs" />
                    <p className="mt-2.5 text-2xl font-bold text-ink">
                      <span className="mr-0.5 text-lg font-semibold text-gold-dark">₹</span>
                      {p.price}
                    </p>
                    <button
                      onClick={() => { addItem(p, 1); toggle(setAdded, p.name, 1800); }}
                      className={`btn-gold-sm relative mt-3 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3 text-[13px] font-semibold transition duration-300 ${
                        isAdded
                          ? "bg-emerald-600 text-white"
                          : "bg-ink text-white hover:bg-gradient-to-b hover:from-gold-light hover:to-gold hover:text-ink"
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <Check size={16} /> Added to Cart
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

        {/* scroll progress track */}
        <div className="mx-auto mt-2 h-1 w-40 overflow-hidden rounded-full bg-stone-300/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-dark via-gold-light to-gold transition-[margin] duration-150"
            style={{ width: `${thumb * 100}%`, marginLeft: `${progress * (1 - thumb) * 100}%` }}
          />
        </div>
      </div>
    </section>
  );
}
