"use client";

import { X } from "lucide-react";

export default function CatalogDialog({ title, subtitle, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0" />
      <section role="dialog" aria-modal="true" aria-label={title} className={`relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px] ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7">
          <div><h2 className="text-xl font-bold text-ink">{title}</h2>{subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 transition hover:border-gold hover:bg-cream" aria-label="Close"><X size={19} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}
