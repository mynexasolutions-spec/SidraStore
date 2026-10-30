"use client";

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToStorefrontUpdates } from "@/lib/storefrontSync";
import ProductRating, { ReviewStars } from "./ReviewSummary";

const emptySummary = { rating: 0, reviewCount: 0 };

export default function ProductReviews({ productSlug }) {
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [user, setUser] = useState(null);
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const loadReviews = useCallback(async () => {
    const response = await fetch(`/api/products/${encodeURIComponent(productSlug)}/reviews`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load reviews.");
    setReviews(result.reviews || []);
    setSummary(result.summary || emptySummary);
  }, [productSlug]);

  useEffect(() => {
    let mounted = true;
    const refresh = () => loadReviews().catch((error) => {
      if (mounted) setStatus({ type: "error", message: error.message });
    });

    Promise.all([loadReviews(), createClient().auth.getUser()])
      .then(([, authResult]) => { if (mounted) setUser(authResult.data.user || null); })
      .catch((error) => { if (mounted) setStatus({ type: "error", message: error.message }); })
      .finally(() => { if (mounted) setLoading(false); });

    const unsubscribe = subscribeToStorefrontUpdates(refresh);
    const interval = window.setInterval(refresh, 10000);
    return () => {
      mounted = false;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [loadReviews]);

  async function submitReview(event) {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ type: "", message: "" });
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get("title") || "").trim();
    const body = String(form.get("body") || "").trim();

    try {
      if (!title || title.length > 100 || body.length < 10 || body.length > 1500) {
        throw new Error("Enter a title and a review between 10 and 1500 characters.");
      }
      const response = await fetch(`/api/products/${encodeURIComponent(productSlug)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, title, body }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          window.location.assign(`/login?next=${encodeURIComponent(`/products/${productSlug}#reviews`)}`);
          return;
        }
        throw new Error(result.error || "Unable to submit your review.");
      }
      formElement.reset();
      setRating(5);
      setStatus({ type: "success", message: "Thank you. Your review was submitted for approval." });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Unable to submit your review." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="reviews" className="border-t border-gold/15 bg-cream py-16 lg:py-20">
      <div className="container-site grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-dark">Customer feedback</p>
          <h2 className="mt-3 font-serif text-4xl font-semibold">Ratings & Reviews</h2>
          <div className="mt-4">
            <ProductRating rating={summary.rating} reviews={summary.reviewCount} size={18} className="text-sm" />
          </div>
          <p className="mt-3 text-stone-500">Share your experience after signing in. Reviews appear publicly after admin approval.</p>
          {status.message && <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${status.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{status.message}</p>}

          {user ? (
            <form onSubmit={submitReview} className="mt-7 rounded-3xl border border-gold/20 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-sm font-semibold">Your rating</p>
              <div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`}><Star size={25} fill={value <= rating ? "currentColor" : "none"} className={value <= rating ? "text-gold" : "text-stone-300"} /></button>)}</div>
              <input name="title" maxLength={100} required placeholder="Review title" className="mt-4 h-12 w-full rounded-xl border px-4 outline-none focus:border-gold" />
              <textarea name="body" minLength={10} maxLength={1500} required rows={5} placeholder="Tell other customers about this product" className="mt-3 w-full rounded-xl border p-4 outline-none focus:border-gold" />
              <button disabled={submitting} className="btn-gold mt-4 w-full disabled:opacity-60">{submitting ? "Submitting..." : "Submit Review"}</button>
            </form>
          ) : (
            <a href={`/login?next=${encodeURIComponent(`/products/${productSlug}#reviews`)}`} className="btn-gold mt-7 inline-flex">Sign in to write a review</a>
          )}
        </div>

        <div className="space-y-4">
          {loading && <p className="rounded-2xl bg-white p-6 text-sm text-stone-500">Loading reviews...</p>}
          {!loading && reviews.length === 0 && <p className="rounded-2xl border border-dashed border-gold/30 bg-white p-8 text-center text-stone-500">No approved reviews yet. Be the first to share your experience.</p>}
          {reviews.map((review) => <article key={review.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-ink">{review.customer_name}</p><p className="mt-1 text-xs text-stone-400">{new Date(review.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p></div><ReviewStars rating={review.rating} /></div>{review.title && <h3 className="mt-4 font-semibold">{review.title}</h3>}<p className="mt-2 text-sm leading-7 text-stone-600">{review.body}</p></article>)}
        </div>
      </div>
    </section>
  );
}
