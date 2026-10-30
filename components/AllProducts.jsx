"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Heart, ShoppingCart, Tag, Filter, ChevronDown } from "lucide-react";
import SmartImage from "./SmartImage";
import Reveal from "./Reveal";
import Particles from "./Particles";
import { getProductPath } from "@/lib/productCatalog";
import { useCart } from "./CartProvider";
import { useWishlist } from "./WishlistProvider";
import { useStorefrontCatalog } from "./useStorefrontData";
import ProductRating from "./ReviewSummary";

function categorySlug(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getInitialFilterState(initialCategory, queryString = "", catalogCategories = []) {
  const searchParams = new URLSearchParams(queryString);
  const categorySlugs = searchParams.getAll("category");
  const categoryNames = categorySlugs
    .map((slug) => catalogCategories.find((category) => categorySlug(category.slug || category.name) === slug)?.name)
    .filter(Boolean);
  const fallbackCategory = catalogCategories.find((category) => categorySlug(category.slug || category.name) === initialCategory)?.name;
  const maximumPriceValue = searchParams.get("maxPrice");
  const maximumPrice = maximumPriceValue === null ? null : Number(maximumPriceValue);
  const requestedSort = searchParams.get("sort");
  const requestedProductsPerPage = Number(searchParams.get("perPage"));
  const requestedPage = Number(searchParams.get("page"));

  return {
    selectedCategories: new Set(categoryNames.length ? categoryNames : fallbackCategory ? [fallbackCategory] : []),
    maximumPriceOverride: Number.isFinite(maximumPrice) && maximumPrice > 0 ? maximumPrice : null,
    sortBy: ["featured", "price-low", "price-high", "rating", "newest"].includes(requestedSort) ? requestedSort : "featured",
    productsPerPage: [12, 24, 36].includes(requestedProductsPerPage) ? requestedProductsPerPage : 12,
    currentPage: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}

function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-stone-200/80 ${className}`} aria-hidden="true" />;
}

function ShopSkeleton() {
  return (
    <section className="relative isolate overflow-clip bg-cream py-20 lg:py-24" aria-busy="true" aria-label="Loading products">
      <div className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(232,189,109,0.18),transparent_65%)]" />
      <div className="pointer-events-none absolute -right-40 bottom-10 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(201,154,75,0.14),transparent_65%)]" />

      <div className="container-site relative">
        <div>
          <SkeletonBlock className="h-3 w-36" />
          <SkeletonBlock className="mt-4 h-12 w-64 max-w-full" />
          <SkeletonBlock className="mt-4 hidden h-5 w-[420px] max-w-full sm:block" />
        </div>

        <div className="mt-8 flex items-center justify-between gap-4 border-y border-gold/20 py-4">
          <SkeletonBlock className="h-11 w-28 lg:hidden" />
          <SkeletonBlock className="hidden h-4 w-48 lg:block" />
          <div className="ml-auto flex gap-2">
            <SkeletonBlock className="hidden h-11 w-24 sm:block" />
            <SkeletonBlock className="h-11 w-36" />
          </div>
        </div>

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
          <SkeletonBlock className="hidden h-[520px] rounded-3xl lg:block" />
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200">
                <SkeletonBlock className="aspect-square rounded-none" />
                <div className="space-y-3 p-3">
                  <SkeletonBlock className="h-5 w-3/4" />
                  <SkeletonBlock className="h-3 w-full" />
                  <SkeletonBlock className="h-4 w-1/2" />
                  <SkeletonBlock className="h-10 w-full rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterPanel({ products, categories, minimumCatalogPrice, maximumCatalogPrice, selectedCategories, maximumPrice, onCategoryToggle, onClearCategories, onMaximumPriceChange, onReset }) {
  const hasActiveFilters = selectedCategories.size > 0 || maximumPrice < maximumCatalogPrice;

  return (
    <div className="overflow-hidden rounded-3xl border border-gold/25 bg-white/95 shadow-[0_22px_50px_-30px_rgba(21,16,12,0.45)] backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-stone-200 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-gold-dark">
            <Filter size={18} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-dark">Refine</p>
            <h3 className="text-lg font-bold text-ink">Filter Products</h3>
          </div>
        </div>
        {hasActiveFilters && (
          <button type="button" onClick={onReset} className="text-xs font-semibold text-gold-dark transition hover:text-ink">
            Reset
          </button>
        )}
      </div>

      <div className="px-6 py-5">
        <h4 className="font-serif text-xl font-semibold text-ink">Categories</h4>
        <div className="mt-4 space-y-1">
          <label className="group flex cursor-pointer items-center justify-between rounded-xl px-2 py-2.5 transition hover:bg-cream">
            <span className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedCategories.size === 0}
                onChange={onClearCategories}
                className="h-4 w-4 rounded border-stone-300 accent-[#C99A4B]"
              />
              <span className="text-sm font-medium text-stone-700 group-hover:text-ink">All Products</span>
            </span>
            <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold text-stone-500">{products.length}</span>
          </label>

          {categories.map((category) => {
            const count = products.filter((product) => product.category === category).length;
            return (
              <label key={category} className="group flex cursor-pointer items-center justify-between rounded-xl px-2 py-2.5 transition hover:bg-cream">
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(category)}
                    onChange={() => onCategoryToggle(category)}
                    className="h-4 w-4 rounded border-stone-300 accent-[#C99A4B]"
                  />
                  <span className="text-sm font-medium text-stone-700 group-hover:text-ink">{category}</span>
                </span>
                <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold text-stone-500">{count}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="border-t border-stone-200 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <h4 className="font-serif text-xl font-semibold text-ink">Max Price</h4>
          <span className="rounded-full bg-gold/15 px-3 py-1 text-sm font-bold text-gold-dark">₹{maximumPrice}</span>
        </div>
        <input
          type="range"
          min={minimumCatalogPrice}
          max={maximumCatalogPrice}
          step="50"
          value={maximumPrice}
          onChange={(event) => onMaximumPriceChange(Number(event.target.value))}
          aria-label="Maximum product price"
          className="mt-5 h-2 w-full cursor-pointer accent-[#C99A4B]"
        />
        <div className="mt-2 flex justify-between text-xs font-medium text-stone-500">
          <span>₹{minimumCatalogPrice}</span>
          <span>₹{maximumCatalogPrice}</span>
        </div>
      </div>
    </div>
  );
}

function LoadedAllProducts({ initialCategory, products, catalogCategories, catalogError, refreshCatalog }) {
  const { addItem } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
  const categories = useMemo(() => {
    const categoryNames = new Map();
    catalogCategories.forEach((categoryRecord) => {
      const category = String(categoryRecord.name || "").trim();
      if (category) categoryNames.set(category.toLowerCase(), category);
    });
    return [...categoryNames.values()];
  }, [catalogCategories]);
  const { minimumCatalogPrice, maximumCatalogPrice } = useMemo(() => {
    const catalogPrices = products.map((product) => product.price);
    return {
      minimumCatalogPrice: catalogPrices.length ? Math.min(...catalogPrices) : 0,
      maximumCatalogPrice: catalogPrices.length ? Math.max(...catalogPrices) : 0,
    };
  }, [products]);
  const [added, setAdded] = useState(() => new Set());
  const [selectedCategories, setSelectedCategories] = useState(() => new Set());
  const [maximumPriceOverride, setMaximumPriceOverride] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState("featured");
  const [productsPerPage, setProductsPerPage] = useState(12);
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersReady, setFiltersReady] = useState(false);
  const skipPageReset = useRef(true);
  const maximumPrice = Math.min(maximumPriceOverride ?? maximumCatalogPrice, maximumCatalogPrice);

  useEffect(() => {
    const restoredFilterState = getInitialFilterState(initialCategory, window.location.search, catalogCategories);
    setSelectedCategories(new Set(restoredFilterState.selectedCategories));
    setMaximumPriceOverride(restoredFilterState.maximumPriceOverride);
    setSortBy(restoredFilterState.sortBy);
    setProductsPerPage(restoredFilterState.productsPerPage);
    setCurrentPage(restoredFilterState.currentPage);
    skipPageReset.current = true;
    setFiltersReady(true);
  }, [catalogCategories, initialCategory]);

  useEffect(() => {
    if (!filtersReady) return;
    setSelectedCategories((currentCategories) => {
      const validCategories = new Set([...currentCategories].filter((category) => categories.includes(category)));
      return validCategories.size === currentCategories.size ? currentCategories : validCategories;
    });
  }, [categories, filtersReady]);

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

  const toggleCategory = (category) => {
    setSelectedCategories((currentCategories) => {
      const nextCategories = new Set(currentCategories);
      if (nextCategories.has(category)) nextCategories.delete(category);
      else nextCategories.add(category);
      return nextCategories;
    });
  };

  const resetFilters = () => {
    setSelectedCategories(new Set());
    setMaximumPriceOverride(null);
  };

  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(product.category);
    return matchesCategory && product.price <= maximumPrice;
  }), [maximumPrice, products, selectedCategories]);

  const sortedProducts = useMemo(() => [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case "price-low": return a.price - b.price;
      case "price-high": return b.price - a.price;
      case "rating": return b.rating - a.rating;
      case "newest": return b.reviews - a.reviews;
      default: return 0;
    }
  }), [filteredProducts, sortBy]);
  const pageCount = Math.max(1, Math.ceil(sortedProducts.length / productsPerPage));
  const activePage = Math.min(currentPage, pageCount);
  const paginatedProducts = useMemo(
    () => sortedProducts.slice((activePage - 1) * productsPerPage, activePage * productsPerPage),
    [activePage, productsPerPage, sortedProducts],
  );
  const visiblePages = useMemo(() => {
    const start = Math.max(1, Math.min(activePage - 2, pageCount - 4));
    const end = Math.min(pageCount, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [activePage, pageCount]);

  useEffect(() => {
    if (!filtersReady) return;
    if (skipPageReset.current) {
      skipPageReset.current = false;
      return;
    }
    setCurrentPage(1);
  }, [filtersReady, maximumPriceOverride, productsPerPage, selectedCategories, sortBy]);

  useEffect(() => {
    if (typeof window === "undefined" || !filtersReady || !products.length) return;

    const searchParams = new URLSearchParams(window.location.search);
    searchParams.delete("category");
    [...selectedCategories].forEach((category) => searchParams.append("category", categorySlug(category)));

    if (maximumPriceOverride !== null && maximumPrice < maximumCatalogPrice) searchParams.set("maxPrice", String(maximumPriceOverride));
    else searchParams.delete("maxPrice");

    if (sortBy === "featured") searchParams.delete("sort");
    else searchParams.set("sort", sortBy);

    if (productsPerPage === 12) searchParams.delete("perPage");
    else searchParams.set("perPage", String(productsPerPage));

    if (activePage === 1) searchParams.delete("page");
    else searchParams.set("page", String(activePage));

    const query = searchParams.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [activePage, filtersReady, maximumCatalogPrice, maximumPrice, maximumPriceOverride, products.length, productsPerPage, selectedCategories, sortBy]);

  if (!filtersReady) return <ShopSkeleton />;

  return (
    <section className="relative isolate overflow-clip bg-cream py-20 lg:py-24">
      <Particles />

      {/* Ambient glows */}
      <div className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] animate-glow rounded-full bg-[radial-gradient(circle,rgba(232,189,109,0.28),transparent_65%)]" />
      <div className="pointer-events-none absolute -right-40 bottom-10 h-[460px] w-[460px] animate-glow rounded-full bg-[radial-gradient(circle,rgba(201,154,75,0.22),transparent_65%)] [animation-delay:2s]" />
      <span className="pointer-events-none absolute -top-6 right-6 hidden select-none font-serif text-[200px] font-bold leading-none text-gold/[0.06] lg:block">
        Products
      </span>

      {/* Floating ornamental seal */}
      <div className="pointer-events-none absolute right-8 top-1/3 hidden h-[180px] w-[180px] animate-float lg:block">
        <svg viewBox="0 0 200 200" className="absolute inset-0 animate-spin-slow">
          <defs>
            <path id="productsSeal" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
          </defs>
          <text fontSize="14" fontWeight="500" fill="#E8BD6D" opacity="0.6">
            <textPath href="#productsSeal" textLength="486" lengthAdjust="spacing">
              ALL PRODUCTS • PREMIUM QUALITY • AUTHENTIC •
            </textPath>
          </text>
        </svg>
      </div>

      <div className="container-site relative">
        <Reveal className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.35em] text-gold-dark">
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold-dark" />
              Complete Collection
            </p>
            <h2 className="mt-3 font-serif text-4xl font-semibold text-ink lg:text-5xl">
              All <span className="text-shimmer-dark">Products</span>
            </h2>
            <p className="mt-3 hidden max-w-[420px] text-base text-stone-500 sm:block">
              {products.length} premium Islamic lifestyle products — attars, caps, prayer essentials & more.
            </p>
          </div>
        </Reveal>

        {catalogError && (
          <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>Catalog synchronization failed: {catalogError}</span>
            <button type="button" onClick={refreshCatalog} className="rounded-full border border-red-200 px-3 py-1.5 font-semibold transition hover:bg-red-100">
              Retry
            </button>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-4 border-y border-gold/20 py-4">
          <button
            type="button"
            onClick={() => setFiltersOpen((isOpen) => !isOpen)}
            aria-expanded={filtersOpen}
            aria-controls="mobile-shop-filters"
            className="flex items-center gap-2 rounded-full border border-gold/40 bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:border-gold lg:hidden"
          >
            <Filter size={16} className="text-gold-dark" />
            Filters
            {(selectedCategories.size > 0 || maximumPrice < maximumCatalogPrice) && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-ink">
                {selectedCategories.size + (maximumPrice < maximumCatalogPrice ? 1 : 0)}
              </span>
            )}
          </button>
          <p className="hidden text-sm text-stone-500 lg:block">
            Showing <span className="font-semibold text-ink">{filteredProducts.length}</span> of {products.length} products
          </p>
          <div className="ml-auto flex items-center gap-2">
            <label className="hidden items-center gap-2 text-xs font-semibold text-stone-500 sm:flex">
              Per page
              <select value={productsPerPage} onChange={(event) => setProductsPerPage(Number(event.target.value))} className="rounded-full border border-gold/30 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-gold">
                {[12, 24, 36].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort products"
              className="cursor-pointer appearance-none rounded-full border border-gold/30 bg-white py-2.5 pl-5 pr-10 text-sm font-medium text-ink shadow-sm focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Top Rated</option>
              <option value="newest">Most Reviewed</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" size={16} />
            </div>
          </div>
        </div>

        <div className="mt-8 grid items-start gap-7 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside
            id="mobile-shop-filters"
            className={`${filtersOpen ? "block" : "hidden"} max-h-[calc(100vh-7rem)] self-start overflow-y-auto rounded-3xl lg:sticky lg:top-24 lg:block`}
            aria-label="Product filters"
          >
            <FilterPanel
              products={products}
              categories={categories}
              minimumCatalogPrice={minimumCatalogPrice}
              maximumCatalogPrice={maximumCatalogPrice}
              selectedCategories={selectedCategories}
              maximumPrice={maximumPrice}
              onCategoryToggle={toggleCategory}
              onClearCategories={() => setSelectedCategories(new Set())}
              onMaximumPriceChange={setMaximumPriceOverride}
              onReset={resetFilters}
            />
          </aside>

          <div>
            <p className="mb-5 text-sm text-stone-500 lg:hidden">
              Showing <span className="font-semibold text-ink">{paginatedProducts.length}</span> of {filteredProducts.length} matching products
            </p>

        {/* Grid: 3 cols desktop, 2 tablet, 1 mobile */}
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {paginatedProducts.map((p, i) => {
            const isAdded = added.has(p.name);
            const liked = isWishlisted(p);
            return (
              <Reveal key={p.name} delay={i * 40}>
                <article className="group relative h-full select-none overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_-18px_rgba(21,16,12,0.35)] ring-1 ring-stone-200 transition duration-500 hover:-translate-y-3 hover:shadow-[0_34px_60px_-20px_rgba(201,154,75,0.6)] hover:ring-gold/70">
                  <SmartImage
                    src={p.src}
                    alt={p.name}
                    tone={p.tone}
                    className="aspect-square w-full"
                    imgClassName="pointer-events-none h-full w-full object-contain transition duration-700 group-hover:brightness-105"
                  >
                    {/* Depth gradient */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />
                    <a
                      href={getProductPath(p)}
                      aria-label={`View ${p.name} details`}
                      className="absolute inset-0 z-[1]"
                    />

                    {/* Category badge */}
                    <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-[9px] font-bold shadow-lg bg-white/90 text-stone-700 backdrop-blur-sm border border-gold/30">
                      {p.category}
                    </span>

                    {/* Badge */}
                    <span
                      className={`pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold shadow-lg ${
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
                          : p.badge === "Featured"
                          ? "bg-gradient-to-b from-emerald-500 to-emerald-700 text-white"
                          : p.badge === "Seasonal"
                          ? "bg-gradient-to-b from-rose-500 to-rose-700 text-white"
                          : "bg-black/55 text-gold-light backdrop-blur-sm"
                      }`}
                    >
                      {p.badge === "Best Seller" && <Tag size={10} />}
                      {p.badge && !["Best Seller"].includes(p.badge) && <span className="text-[8px]">{p.badge === "New" ? "NEW" : p.badge === "Limited" ? "LTD" : p.badge === "Premium" ? "PREM" : p.badge === "Popular" ? "POP" : p.badge === "Exclusive" ? "EXCL" : p.badge === "New Arrival" ? "NEW" : p.badge === "Featured" ? "★" : p.badge === "Seasonal" ? "SEAS" : p.badge}</span>}
                    </span>

                    <button
                      type="button"
                      aria-label={liked ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}
                      aria-pressed={liked}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleWishlist(p);
                      }}
                      className={`absolute right-2 top-10 z-20 flex h-9 w-9 items-center justify-center rounded-full shadow-lg transition duration-300 hover:scale-110 ${liked ? "bg-red-500 text-white" : "bg-white/95 text-stone-600 hover:text-red-500"}`}
                    >
                      <Heart size={16} fill={liked ? "currentColor" : "none"} className={liked ? "animate-bob" : ""} />
                    </button>

                    {/* Quick view */}
                    <a href={getProductPath(p)} className="absolute inset-x-3 bottom-3 z-10 flex translate-y-6 items-center justify-center gap-1.5 rounded-full bg-white/90 py-1.5 text-[10px] font-semibold text-ink opacity-0 shadow-lg backdrop-blur-sm transition duration-500 hover:bg-gold group-hover:translate-y-0 group-hover:opacity-100">
                      <Eye size={12} /> Quick View
                    </a>
                  </SmartImage>

                  <div className="p-3">
                    <div>
                      <h3 className="break-words text-base font-bold leading-snug text-ink">
                        <a href={getProductPath(p)} className="transition hover:text-gold-dark">
                          {p.name}
                        </a>
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

        {filteredProducts.length > 0 && (
          <nav aria-label="Product pagination" className="mt-9 flex flex-wrap items-center justify-center gap-2">
            <button type="button" disabled={activePage === 1} onClick={() => { setCurrentPage((page) => Math.max(1, page - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex h-10 items-center gap-1 rounded-full border border-gold/30 bg-white px-4 text-sm font-semibold transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
            {visiblePages.map((page) => <button key={page} type="button" aria-current={page === activePage ? "page" : undefined} onClick={() => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`h-10 min-w-10 rounded-full border px-3 text-sm font-bold transition ${page === activePage ? "border-gold bg-gold text-ink" : "border-stone-200 bg-white hover:border-gold"}`}>{page}</button>)}
            <button type="button" disabled={activePage === pageCount} onClick={() => { setCurrentPage((page) => Math.min(pageCount, page + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex h-10 items-center gap-1 rounded-full border border-gold/30 bg-white px-4 text-sm font-semibold transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={16} /></button>
          </nav>
        )}

        {filteredProducts.length === 0 && (
          <div className="rounded-3xl border border-gold/20 bg-white py-16 text-center shadow-sm">
            <p className="font-serif text-2xl font-semibold text-ink">No products match these filters</p>
            <p className="mt-2 text-sm text-stone-500">Try another category or increase the maximum price.</p>
            <button type="button" onClick={resetFilters} className="mt-5 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gold-dark">
              Clear Filters
            </button>
          </div>
        )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AllProducts({ initialCategory }) {
  const { products, categories: catalogCategories, error: catalogError, refresh, isLoading } = useStorefrontCatalog([]);

  if (isLoading) return <ShopSkeleton />;

  return (
    <LoadedAllProducts
      initialCategory={initialCategory}
      products={products}
      catalogCategories={catalogCategories}
      catalogError={catalogError}
      refreshCatalog={refresh}
    />
  );
}
