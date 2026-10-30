"use client";

import { useState } from "react";
import { Eye, Heart, ShoppingCart, Tag, ChevronDown } from "lucide-react";
import SmartImage from "./SmartImage";
import Reveal from "./Reveal";
import Particles from "./Particles";
import { getProductPath } from "@/lib/productCatalog";
import { useCart } from "./CartProvider";
import { useWishlist } from "./WishlistProvider";
import { useStorefrontCatalog } from "./useStorefrontData";
import ProductRating from "./ReviewSummary";

const categoryData = {
  "attar-fragrances": {
    title: "Attar & Fragrances",
    subtitle: "Premium Attar Collection",
    description: "Discover our exquisite range of premium attars crafted from the finest ingredients.",
    products: [
      { src: "/products/Attar & Fragrances/sidra-oudh.jpg", name: "Sidra Oudh", desc: "Premium Attar", price: 499, tone: "from-emerald-900 to-stone-900", badge: "Best Seller", subCategory: "Oudh" },
      { src: "/products/Attar & Fragrances/aseel.jpg", name: "Aseel", desc: "Premium Attar", price: 499, tone: "from-amber-700 to-amber-950", badge: "Popular", subCategory: "Oudh" },
      { src: "/products/Attar & Fragrances/white-oudh.jpg", name: "White Oudh", desc: "Premium Attar", price: 699, tone: "from-stone-100 to-stone-300", subCategory: "Oudh" },
      { src: "/products/Attar & Fragrances/cr7.jpg", name: "CR 7", desc: "Premium Attar", price: 499, tone: "from-stone-700 to-stone-950", subCategory: "Oudh" },
      { src: "/products/Attar & Fragrances/jannatul-ferdous.jpg", name: "Jannatul Ferdous", desc: "Premium Attar", price: 899, tone: "from-teal-800 to-emerald-950", badge: "Premium", subCategory: "Floral" },
      { src: "/products/Attar & Fragrances/rose-bulgari.jpg", name: "Rose Bulgari", desc: "Premium Attar", price: 499, tone: "from-rose-600 to-red-900", subCategory: "Floral" },
      { src: "/products/Attar & Fragrances/fasli-gulab.jpg", name: "Fasli Gulab", desc: "Premium Attar", price: 499, tone: "from-orange-300 to-amber-700", subCategory: "Floral" },
    ]
  },
  "islamic-caps": {
    title: "Islamic Caps",
    subtitle: "Designer Collection",
    description: "Handcrafted Islamic caps blending tradition with contemporary elegance.",
    products: [
      { src: "/products/Ismalic Caps/IMG-20230108-WA0009.jpg.jpeg", name: "Classic White Kufi", desc: "Traditional cotton kufi cap", price: 299, tone: "from-stone-100 to-stone-300", badge: "Best Seller", subCategory: "Classic" },
      { src: "/products/Ismalic Caps/IMG-20230108-WA0010.jpg.jpeg", name: "Embroidered Taqiyah", desc: "Gold thread embroidery detail", price: 349, tone: "from-amber-100 to-amber-300", subCategory: "Embroidered" },
      { src: "/products/Ismalic Caps/IMG-20230108-WA0016.jpg.jpeg", name: "Premium Barkati Cap", desc: "Handcrafted premium fabric", price: 399, tone: "from-slate-200 to-slate-400", subCategory: "Barkati" },
      { src: "/products/Ismalic Caps/IMG-20230108-WA0020.jpg.jpeg", name: "Designer Owaisi Cap", desc: "Modern fit with classic style", price: 449, tone: "from-sky-100 to-sky-300", badge: "New Arrival", subCategory: "Owaisi" },
      { src: "/products/Ismalic Caps/IMG-20230108-WA0022.jpg.jpeg", name: "Omani Style Cap", desc: "Traditional Omani design", price: 499, tone: "from-stone-700 to-stone-900", subCategory: "Omani" },
      { src: "/products/Ismalic Caps/IMG-20230108-WA0026.jpg.jpeg", name: "Jarkali Premium Cap", desc: "Distinctive peaked design", price: 399, tone: "from-stone-200 to-stone-400", subCategory: "Jarkali" },
      { src: "/products/Ismalic Caps/IMG-20230108-WA0029.jpg.jpeg", name: "Imama Shareef Style", desc: "Elegant turban-style cap", price: 449, tone: "from-stone-100 to-stone-300", subCategory: "Imama" },
      { src: "/products/Ismalic Caps/IMG-20230108-WA0031.jpg.jpeg", name: "Designer Collection 1", desc: "Exclusive designer pattern", price: 549, tone: "from-stone-700 to-stone-900", badge: "Limited", subCategory: "Designer" },
      { src: "/products/Ismalic Caps/IMG-20230108-WA0035.jpg.jpeg", name: "Designer Collection 2", desc: "Premium embroidered finish", price: 599, tone: "from-amber-700 to-amber-950", badge: "Limited", subCategory: "Designer" },
      { src: "/products/Ismalic Caps/IMG_20230331_213440.jpg.jpeg", name: "Designer Collection 3", desc: "Luxury fabric blend", price: 499, tone: "from-stone-800 to-stone-950", subCategory: "Designer" },
      { src: "/products/Ismalic Caps/IMG_20230331_214004.jpg.jpeg", name: "Designer Collection 4", desc: "Artisanal craftsmanship", price: 549, tone: "from-slate-700 to-slate-900", subCategory: "Designer" },
      { src: "/products/Ismalic Caps/IMG_20230331_214015.jpg.jpeg", name: "Designer Collection 5", desc: "Limited edition design", price: 599, tone: "from-amber-800 to-stone-900", subCategory: "Designer" },
    ]
  },
  "surma": {
    title: "Surma",
    subtitle: "Traditional Kohl Collection",
    description: "Authentic surma and kohl for beautiful, healthy eyes.",
    products: [
      { src: "/products/surma/surma.jpg", name: "Pure Surma Kohl", desc: "Traditional eye kohl", price: 199, tone: "from-stone-800 to-stone-950", badge: "Best Seller", subCategory: "Traditional" },
    ]
  },
  "prayer-essentials": {
    title: "Prayer Essentials",
    subtitle: "Sacred Prayer Collection",
    description: "Premium prayer mats and essentials for your spiritual journey.",
    products: [
      { src: "/products/Prayer Essentials/ja-namaz.jpg", name: "Premium Ja Namaz", desc: "Soft prayer mat", price: 599, tone: "from-blue-700 to-blue-950", badge: "Premium", subCategory: "Prayer Mat" },
      { src: "/products/Prayer Essentials/ja-namaz.jpg", name: "Velvet Ja Namaz", desc: "Luxury velvet prayer mat", price: 899, tone: "from-purple-700 to-purple-950", subCategory: "Prayer Mat" },
    ]
  },
  "islamic-wear": {
    title: "Islamic Wear",
    subtitle: "Traditional Wear Collection",
    description: "Elegant Islamic wear crafted with premium fabrics.",
    products: [
      { src: "/products/Ismalic wear/ajrak-chadar.jpg", name: "Ajrak Chadar", desc: "Traditional block print", price: 1299, tone: "from-red-800 to-red-950", badge: "Popular", subCategory: "Chadar" },
    ]
  },
  "gifts-combos": {
    title: "Gifts & Combos",
    subtitle: "Curated Gift Sets",
    description: "Thoughtfully curated gift combinations for your loved ones.",
    products: [
      { src: "/products/attar-fragrances/attar.jpg", name: "Attar Gift Set (3pc)", desc: "Sidra Oudh, Aseel, White Oudh", price: 1499, tone: "from-amber-700 to-amber-950", badge: "Best Seller", subCategory: "Attar Set" },
      { src: "/products/gifts-combos/attar.jpg", name: "Premium Gift Box", desc: "Attar + Cap + Surma combo", price: 1999, tone: "from-stone-700 to-stone-900", badge: "New", subCategory: "Combo" },
    ]
  },
};

function CategoryPage({ categoryKey, initialCount = 8 }) {
  const { addItem } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const category = categoryData[categoryKey];
  const initialProducts = (category?.products || []).map((product) => ({ ...product, category: category?.title, categorySlug: categoryKey }));
  const { products: catalogProducts, error: catalogError } = useStorefrontCatalog(initialProducts);
  if (!category) return null;

  const { title, subtitle, description } = category;
  const products = catalogProducts.filter((product) => product.categorySlug === categoryKey || product.category === title);
  const [added, setAdded] = useState(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState("featured");

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

  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case "price-low": return a.price - b.price;
      case "price-high": return b.price - a.price;
      case "rating": return b.rating - a.rating;
      case "newest": return b.reviews - a.reviews;
      default: return 0;
    }
  });

  const displayProducts = showAll ? sortedProducts : sortedProducts.slice(0, initialCount);

  return (
    <section className="relative isolate overflow-hidden bg-cream py-20 lg:py-24">
      <Particles />

      {/* Ambient glows */}
      <div className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] animate-glow rounded-full bg-[radial-gradient(circle,rgba(232,189,109,0.28),transparent_65%)]" />
      <div className="pointer-events-none absolute -right-40 bottom-10 h-[460px] w-[460px] animate-glow rounded-full bg-[radial-gradient(circle,rgba(201,154,75,0.22),transparent_65%)] [animation-delay:2s]" />
      <span className="pointer-events-none absolute -top-6 right-6 hidden select-none font-serif text-[200px] font-bold leading-none text-gold/[0.06] lg:block">
        {title.split(' ')[0]}
      </span>

      {/* Floating ornamental seal */}
      <div className="pointer-events-none absolute right-8 top-1/3 hidden h-[180px] w-[180px] animate-float lg:block">
        <svg viewBox="0 0 200 200" className="absolute inset-0 animate-spin-slow">
          <defs>
            <path id="catSeal" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
          </defs>
          <text fontSize="14" fontWeight="500" fill="#E8BD6D" opacity="0.6">
            <textPath href="#catSeal" textLength="486" lengthAdjust="spacing">
              {title.toUpperCase()} • PREMIUM QUALITY • AUTHENTIC •
            </textPath>
          </text>
        </svg>
      </div>

      <div className="container-site relative">
        <Reveal className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.35em] text-gold-dark">
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold-dark" />
              {title}
            </p>
            <h2 className="mt-3 font-serif text-4xl font-semibold text-ink lg:text-5xl">
              {subtitle}
            </h2>
            <p className="mt-3 hidden max-w-[420px] text-base text-stone-500 sm:block">
              {description} {products.length} product{products.length !== 1 ? 's' : ''} available.
            </p>
          </div>
          {products.length > 1 && (
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none bg-white border border-stone-200 rounded-full px-5 py-2 pr-10 text-sm font-medium text-ink focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 cursor-pointer"
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="rating">Top Rated</option>
                <option value="newest">Most Reviewed</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" size={16} />
            </div>
          )}
        </Reveal>

        {catalogError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Catalog synchronization failed: {catalogError}</p>}

        {products.length > 1 && (
          <p className="mt-6 text-sm text-stone-500">
            Showing <span className="font-semibold text-ink">{displayProducts.length}</span> of {products.length} products
          </p>
        )}

        {/* Grid: 4 cols desktop, 2 tablet, 1 mobile */}
        <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
          {displayProducts.map((p, i) => {
            const liked = isWishlisted(p);
            const isAdded = added.has(p.name);
            return (
              <Reveal key={p.src} delay={i * 40}>
                <article className="group relative h-full select-none overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_-18px_rgba(21,16,12,0.35)] ring-1 ring-stone-200 transition duration-500 hover:-translate-y-3 hover:shadow-[0_34px_60px_-20px_rgba(201,154,75,0.6)] hover:ring-gold/70">
                  <SmartImage
                    src={p.src}
                    alt={p.name}
                    tone={p.tone}
                    className="h-[200px] w-full"
                    imgClassName="pointer-events-none h-full w-full object-cover transition duration-700 group-hover:scale-110"
                  >
                    <a
                      href={getProductPath(p)}
                      aria-label={`View ${p.name} details`}
                      className="absolute inset-0 z-[1]"
                    />
                    {/* Depth gradient */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

                    {/* Sub-category badge */}
                    <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold shadow-lg bg-white/90 text-stone-700 backdrop-blur-sm border border-gold/30">
                      {p.subCategory}
                    </span>

                    {/* Badge */}
                    <span
                      className={`absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold shadow-lg ${
                        p.badge === "Best Seller"
                          ? "bg-gradient-to-b from-gold-light to-gold text-ink"
                          : p.badge === "New Arrival" || p.badge === "New"
                          ? "bg-gradient-to-b from-emerald-500 to-emerald-700 text-white"
                          : p.badge === "Limited"
                          ? "bg-gradient-to-b from-rose-500 to-rose-700 text-white"
                          : p.badge === "Premium"
                          ? "bg-gradient-to-b from-purple-500 to-purple-700 text-white"
                          : p.badge === "Popular"
                          ? "bg-gradient-to-b from-blue-500 to-blue-700 text-white"
                          : p.badge === "Exclusive"
                          ? "bg-gradient-to-b from-purple-500 to-purple-700 text-white"
                          : "bg-black/55 text-gold-light backdrop-blur-sm"
                      }`}
                    >
                      {p.badge === "Best Seller" && <Tag size={10} />}
                      {p.badge && !["Best Seller"].includes(p.badge) && <span className="text-[8px]">{p.badge === "New" ? "NEW" : p.badge === "Limited" ? "LTD" : p.badge === "Premium" ? "PREM" : p.badge === "Popular" ? "POP" : p.badge === "Exclusive" ? "EXCL" : p.badge === "New Arrival" ? "NEW" : p.badge}</span>}
                    </span>

                    {/* Wishlist */}
                    <button
                      aria-label="Wishlist"
                      aria-pressed={liked}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWishlist(p); }}
                      className={`absolute right-2 top-30 z-20 flex h-8 w-8 items-center justify-center rounded-full shadow-lg transition duration-300 hover:scale-110 ${
                        liked ? "bg-red-500 text-white" : "bg-white/95 text-stone-600 hover:text-red-500"
                      }`}
                    >
                      <Heart size={14} fill={liked ? "currentColor" : "none"} className={liked ? "animate-bob" : ""} />
                    </button>

                    {/* Quick view */}
                    <a href={getProductPath(p)} className="absolute inset-x-3 bottom-3 z-10 flex translate-y-6 items-center justify-center gap-1.5 rounded-full bg-white/90 py-1.5 text-[10px] font-semibold text-ink opacity-0 shadow-lg backdrop-blur-sm transition duration-500 hover:bg-gold group-hover:translate-y-0 group-hover:opacity-100">
                      <Eye size={12} /> Quick View
                    </a>
                  </SmartImage>

                  <div className="p-3">
                    <div>
                      <h3 className="break-words text-base font-bold leading-snug text-ink">
                        <a href={getProductPath(p)} className="transition hover:text-gold-dark">{p.name}</a>
                      </h3>
                    </div>
                    <p className="mt-0.5 text-[11px] text-stone-500 line-clamp-1">{p.desc}</p>
                    <ProductRating rating={p.rating} reviews={p.reviews} size={13} className="mt-1.5 text-[11px]" />
                    <p className="mt-2 text-xl font-bold text-ink">
                      <span className="mr-0.5 text-base font-semibold text-gold-dark">₹</span>
                      {p.price}
                    </p>
                    <button
                      onClick={() => { addItem(p, 1); toggle(setAdded, p.name, 1800); }}
                      className={`btn-gold-sm relative mt-2.5 flex w-full items-center justify-center gap-1.5 overflow-hidden rounded-xl py-2.5 text-[12px] font-semibold transition duration-300 ${
                        isAdded
                          ? "bg-emerald-600 text-white"
                          : "bg-ink text-white hover:bg-gradient-to-b hover:from-gold-light hover:to-gold hover:text-ink"
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <ShoppingCart size={14} className="rotate-90" /> Added to Cart
                        </>
                      ) : (
                        <>
                          <ShoppingCart size={13} /> Add to Cart
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
        {!showAll && products.length > initialCount && (
          <div className="mt-10 text-center">
            <button
              onClick={() => setShowAll(true)}
              className="btn-gold inline-flex"
            >
              View All {products.length} Products
            </button>
          </div>
        )}
        {showAll && products.length > initialCount && (
          <div className="mt-10 text-center">
            <button
              onClick={() => setShowAll(false)}
              className="btn-gold inline-flex bg-ink hover:bg-gradient-to-b hover:from-gold-light hover:to-gold hover:text-ink"
            >
              Show Less ({initialCount} Products)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default CategoryPage;
