"use client";

import { useState } from "react";
import { useEffect } from "react";
import { Eye, EyeOff, LockKeyhole, Save } from "lucide-react";
import AuthFrame from "./AuthFrame";
import { createClient } from "@/lib/supabase/client";

function validatePassword(password) {
  if (password.length < 8) return "Password must contain at least 8 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include an uppercase letter, a lowercase letter, and a number.";
  }
  return "";
}

export default function ResetPassword() {
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setRecoveryReady(true);
        setCheckingRecovery(false);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setStatus({ type: "error", message: "We could not verify this reset link. Please request a new one." });
        setCheckingRecovery(false);
        return;
      }
      if (data.session) {
        setRecoveryReady(true);
      } else {
        setStatus({ type: "error", message: "This reset link is invalid or expired. Please request a new password reset link." });
      }
      setCheckingRecovery(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!recoveryReady) {
      setStatus({ type: "error", message: "This reset link is invalid or expired. Please request a new one." });
      return;
    }
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    const passwordError = validatePassword(password);
    if (passwordError) return setStatus({ type: "error", message: passwordError });
    if (password !== confirmPassword) return setStatus({ type: "error", message: "Passwords do not match." });

    setSubmitting(true);
    setStatus({ type: "", message: "" });
    const { error } = await createClient().auth.updateUser({ password });
    setSubmitting(false);
    if (error) return setStatus({ type: "error", message: error.message });
    setStatus({ type: "success", message: "Your password has been updated. You can now continue to your account." });
  }

  return (
    <AuthFrame eyebrow="Password Recovery" title="Choose a new password" description="Use a strong password with at least eight characters, including uppercase, lowercase, and a number." footer={<a href="/login" className="font-bold text-gold-dark transition hover:text-ink">Return to sign in</a>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {[["password", "New password"], ["confirmPassword", "Confirm new password"]].map(([name, label]) => <label key={name} className="block"><span className="sr-only">{label}</span><span className="flex h-14 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 shadow-sm transition focus-within:border-gold focus-within:ring-4 focus-within:ring-gold/10"><LockKeyhole size={18} className="text-gold-dark" /><input name={name} type={showPassword ? "text" : "password"} minLength={8} required autoComplete="new-password" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400" placeholder={label} />{name === "password" && <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="text-stone-400 transition hover:text-gold-dark">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>}</span></label>)}
        {status.message && <p role={status.type === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${status.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{status.message}</p>}
        <button disabled={submitting || checkingRecovery || !recoveryReady} className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-gold-dark via-gold to-gold-dark px-6 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_14px_32px_-16px_rgba(168,122,50,0.9)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-14px_rgba(168,122,50,0.8)] disabled:cursor-not-allowed disabled:opacity-60"><Save size={18} />{checkingRecovery ? "Verifying reset link..." : submitting ? "Saving..." : "Update Password"}</button>
        {status.type === "success" && <a href="/account" className="flex justify-center text-sm font-bold text-gold-dark transition hover:text-ink">Continue to my account</a>}
      </form>
    </AuthFrame>
  );
}
