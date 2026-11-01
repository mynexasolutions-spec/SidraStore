"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, CheckCheck, ShoppingCart } from "lucide-react";
import SmartImage from "@/components/SmartImage";

function formatActivityTime(value) {
  if (!value) return "Unknown time";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPrice(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function AdminCartNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestInFlight = useRef(false);
  const mounted = useRef(true);
  const containerRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;

    try {
      const response = await fetch("/api/admin/cart-activity?limit=30", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load cart activity.");
      if (!mounted.current) return;
      setNotifications(Array.isArray(result.notifications) ? result.notifications : []);
      setUnreadCount(Number(result.unreadCount) || 0);
      setError("");
    } catch (loadError) {
      if (mounted.current) setError(loadError.message || "Unable to load cart activity.");
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadNotifications();
    const refreshTimer = window.setInterval(() => void loadNotifications(), 4000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadNotifications();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      mounted.current = false;
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadNotifications]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const deleteNotifications = async ({ ids = [], deleteAll = false } = {}) => {
    const unreadBeingDeleted = deleteAll
      ? unreadCount
      : notifications.filter((item) => ids.includes(item.id) && !item.read_at).length;

    const response = await fetch("/api/admin/cart-activity", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deleteAll ? { deleteAll: true } : { ids }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Unable to update notification status.");

    setNotifications((current) => deleteAll
      ? []
      : current.filter((item) => !ids.includes(item.id)));
    setUnreadCount((current) => Math.max(0, current - unreadBeingDeleted));
  };

  const deleteOneNotification = async (id) => {
    try {
      await deleteNotifications({ ids: [id] });
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete notification.");
    }
  };

  const deleteAllNotifications = async () => {
    if (!notifications.length) return;
    try {
      await deleteNotifications({ deleteAll: true });
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete notifications.");
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={unreadCount ? `${unreadCount} unread cart notifications` : "Cart notifications"}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-stone-500 transition hover:bg-cream hover:text-gold-dark"
      >
        <BellRing size={19} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_20px_60px_-20px_rgba(21,16,12,0.45)]">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <div>
              <p className="font-semibold text-ink">Cart activity</p>
              <p className="text-xs text-stone-400">Registered customer additions</p>
            </div>
            <button
              type="button"
              onClick={deleteAllNotifications}
              disabled={!notifications.length}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gold-dark transition hover:text-ink disabled:cursor-not-allowed disabled:text-stone-300"
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>

          {error && <p className="border-b border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-700">{error}</p>}

          <div className="max-h-[min(70vh,480px)] overflow-y-auto">
            {loading ? (
              <p className="px-4 py-10 text-center text-sm text-stone-500">Loading cart activity...</p>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <ShoppingCart className="mx-auto text-stone-300" size={28} />
                <p className="mt-2 text-sm font-medium text-stone-500">No cart activity yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {notifications.map((notification) => {
                  const unread = !notification.read_at;
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => deleteOneNotification(notification.id)}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-cream/70 ${unread ? "bg-amber-50/60" : "bg-white"}`}
                    >
                      <SmartImage
                        src={notification.product_image_url}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-xl"
                        imgClassName="h-full w-full object-cover"
                        tone="from-stone-100 to-stone-300"
                        fallback={<ShoppingCart className="m-auto text-stone-400" size={18} />}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="line-clamp-2 text-sm font-semibold text-ink">
                            {notification.customer_name} added {notification.product_name}
                            {notification.variant_size ? ` (${notification.variant_size})` : ""}
                          </span>
                          {unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold-dark" aria-label="Unread" />}
                        </span>
                        <span className="mt-1 block text-xs text-stone-500">
                          {formatPrice(notification.unit_price)} · Qty {notification.quantity_added}
                        </span>
                        <span className="mt-1 block text-[11px] text-stone-400">{formatActivityTime(notification.created_at)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
