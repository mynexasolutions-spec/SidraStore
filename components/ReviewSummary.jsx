import { Star, StarHalf } from "lucide-react";

export function ReviewStars({ rating = 0, size = 14 }) {
  return (
    <span className="flex items-center text-gold" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => {
        if (rating >= value) return <Star key={value} size={size} fill="currentColor" />;
        if (rating >= value - 0.5) return <StarHalf key={value} size={size} fill="currentColor" />;
        return <Star key={value} size={size} className="text-stone-300" />;
      })}
    </span>
  );
}

export default function ReviewSummary({ rating = 0, reviews = 0, size = 14, className = "" }) {
  if (!reviews) return <span className={`text-xs text-stone-400 ${className}`}>No reviews yet</span>;

  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <ReviewStars rating={rating} size={size} />
      <span className="font-semibold text-ink">{Number(rating).toFixed(1)}</span>
      <span className="text-stone-400">({reviews})</span>
    </span>
  );
}
