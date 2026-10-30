"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, Mail, RefreshCw, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AuthFrame from "./AuthFrame";

async function getErrorMessage(response, fallback) {
  try {
    const body = await response.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

function validatePassword(password) {
  if (password.length < 8) return "Password must contain at least 8 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include an uppercase letter, a lowercase letter, and a number.";
  }
  return "";
}

export default function CustomerAuth({ nextPath, initialError }) {
  const [mode, setMode] = useState("login");
  const [authMethod, setAuthMethod] = useState("password");
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState({ type: initialError ? "error" : "", message: initialError || "" });
  const [submitting, setSubmitting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [suggestRegister, setSuggestRegister] = useState(false);

  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const isRegistering = mode === "register";

  function changeMode(nextMode) {
    setMode(nextMode);
    setStep("email");
    setStatus({ type: "", message: "" });
    setCooldown(0);
    setSuggestRegister(false);
  }

  function changeAuthMethod(nextMethod) {
    setAuthMethod(nextMethod);
    setStep("email");
    setStatus({ type: "", message: "" });
    setCooldown(0);
    setSuggestRegister(false);
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ type: "", message: "" });

    const form = new FormData(event.currentTarget);
    const nextEmail = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const nextFullName = String(form.get("fullName") || "").trim();
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (isRegistering) {
      if (nextFullName.length < 2 || nextFullName.length > 80) {
        setStatus({ type: "error", message: "Full name must be between 2 and 80 characters." });
        setSubmitting(false);
        return;
      }

      const passwordError = validatePassword(password);
      if (passwordError) {
        setStatus({ type: "error", message: passwordError });
        setSubmitting(false);
        return;
      }
      if (password !== confirmPassword) {
        setStatus({ type: "error", message: "Passwords do not match." });
        setSubmitting(false);
        return;
      }
    }

    const supabase = createClient();
    const result = isRegistering
      ? await supabase.auth.signUp({
        email: nextEmail,
        password,
        options: {
          data: { full_name: nextFullName },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
        },
      })
      : await supabase.auth.signInWithPassword({ email: nextEmail, password });

    setSubmitting(false);
    if (result.error) {
      const errorCode = String(result.error.code || "").toLowerCase();
      const errorMessage = String(result.error.message || "").toLowerCase();
      const shouldSuggestRegister = !isRegistering && (errorCode === "invalid_credentials" || errorMessage.includes("invalid login credentials"));
      setSuggestRegister(shouldSuggestRegister);
      setStatus({
        type: "error",
        message: shouldSuggestRegister
          ? "Account not found or the password is incorrect. If you are new to Sidra Store, create an account first."
          : result.error.message,
      });
      return;
    }

    setSuggestRegister(false);
    setEmail(nextEmail);
    setFullName(nextFullName);

    if (isRegistering && !result.data.session) {
      setStatus({ type: "success", message: "Account created. Check your email to confirm your account, then log in." });
      return;
    }

    window.location.assign(nextPath);
  }

  async function requestPasswordReset() {
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail) {
      setStatus({ type: "error", message: "Enter your email address first so we can send the reset link." });
      return;
    }

    setResettingPassword(true);
    setStatus({ type: "", message: "" });
    const { error } = await createClient().auth.resetPasswordForEmail(nextEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResettingPassword(false);

    if (error) {
      setStatus({ type: "error", message: error.message });
      return;
    }

    setStatus({ type: "success", message: "If an account exists for this email, a password reset link has been sent." });
  }

  async function requestOtp(event) {
    event.preventDefault();
    if (cooldown) return;
    setSubmitting(true);
    setSuggestRegister(false);
    setStatus({ type: "", message: "" });
    const form = new FormData(event.currentTarget);
    const nextEmail = String(form.get("email") || "").trim().toLowerCase();
    const nextFullName = String(form.get("fullName") || "").trim();

    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: nextEmail, fullName: nextFullName, intent: mode }),
      });
      if (!response.ok) {
        setStatus({ type: "error", message: await getErrorMessage(response, "We could not send the verification code.") });
        return;
      }

      setEmail(nextEmail);
      setFullName(nextFullName);
      setStep("code");
      setCooldown(60);
      setStatus({ type: "success", message: "We sent a 6-digit verification code to your email." });
    } catch {
      setStatus({ type: "error", message: "We could not send the verification code. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ type: "", message: "" });
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") || "").trim();

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, email, intent: mode, nextPath }),
      });
      if (!response.ok) {
        setSuggestRegister(response.status === 404 && mode === "login");
        setStatus({ type: "error", message: await getErrorMessage(response, "That code is invalid or expired.") });
        return;
      }

      setSuggestRegister(false);
      setStatus({ type: "success", message: "Verified. Signing you in..." });
      const result = await response.json();
      window.location.assign(result.nextPath || nextPath);
    } catch {
      setStatus({ type: "error", message: "We could not complete sign-in. Please request a new code and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  function resendOtp() {
    if (cooldown || submitting) return;
    setSubmitting(true);
    fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, fullName, intent: mode }),
    })
      .then(async (response) => {
        if (!response.ok) {
          setStatus({ type: "error", message: await getErrorMessage(response, "We could not resend the verification code.") });
          return;
        }
        setCooldown(60);
        setStatus({ type: "success", message: "A new verification code has been sent." });
      })
      .catch(() => setStatus({ type: "error", message: "We could not resend the verification code. Please try again." }))
      .finally(() => setSubmitting(false));
  }

  const title = step === "code"
    ? "Check your email"
    : isRegistering
      ? "Create your account"
      : "Log in to Sidra";
  const description = step === "code"
    ? `Enter the verification code sent to ${email}.`
    : authMethod === "password"
      ? isRegistering
        ? "Create an account with your email and a secure password."
        : "Sign in with your email and password."
      : isRegistering
        ? "Create an account with a one-time email verification code."
        : "Sign in securely with a one-time code sent to your email.";

  return (
    <AuthFrame
      eyebrow={isRegistering ? "Join Sidra Store" : "Welcome Back"}
      title={title}
      description={description}
      footer={step === "code" ? (
        <button type="button" onClick={() => { setStep("email"); setSuggestRegister(false); setStatus({ type: "", message: "" }); }} className="inline-flex items-center gap-2 font-bold text-gold-dark transition hover:text-ink">
          <ArrowLeft size={16} /> Use a different email
        </button>
      ) : (
        <>
          {isRegistering ? "Already have an account? " : "New to Sidra? "}
          <button type="button" onClick={() => changeMode(isRegistering ? "login" : "register")} className="font-bold text-gold-dark transition hover:text-ink">
            {isRegistering ? "Sign in" : "Create an account"}
          </button>
        </>
      )}
    >
      {step === "email" && (
        <div className="mb-5 grid grid-cols-2 rounded-2xl bg-stone-100 p-1" role="tablist" aria-label="Authentication method">
          <button type="button" role="tab" aria-selected={authMethod === "password"} onClick={() => changeAuthMethod("password")} className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${authMethod === "password" ? "bg-white text-ink shadow-sm" : "text-stone-500 hover:text-ink"}`}>
            <span className="inline-flex items-center gap-2"><KeyRound size={15} /> Password</span>
          </button>
          <button type="button" role="tab" aria-selected={authMethod === "otp"} onClick={() => changeAuthMethod("otp")} className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${authMethod === "otp" ? "bg-white text-ink shadow-sm" : "text-stone-500 hover:text-ink"}`}>
            <span className="inline-flex items-center gap-2"><Mail size={15} /> Email OTP</span>
          </button>
        </div>
      )}

      {step === "email" && authMethod === "password" && (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          {isRegistering && (
            <label className="block">
              <span className="sr-only">Full name</span>
              <span className="flex h-14 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 shadow-sm transition focus-within:border-gold focus-within:ring-4 focus-within:ring-gold/10">
                <UserRound size={18} className="text-gold-dark" />
                <input name="fullName" required minLength={2} maxLength={80} autoComplete="name" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-stone-400" placeholder="Full name" />
              </span>
            </label>
          )}
          <label className="block">
            <span className="sr-only">Email address</span>
            <span className="flex h-14 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 shadow-sm transition focus-within:border-gold focus-within:ring-4 focus-within:ring-gold/10">
              <Mail size={18} className="text-gold-dark" />
              <input name="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-full w-full bg-transparent text-sm outline-none placeholder:text-stone-400" placeholder="Email address" />
            </span>
          </label>
          <label className="block">
            <span className="sr-only">Password</span>
            <span className="flex h-14 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 shadow-sm transition focus-within:border-gold focus-within:ring-4 focus-within:ring-gold/10">
              <KeyRound size={18} className="text-gold-dark" />
              <input name="password" type={showPassword ? "text" : "password"} required minLength={8} autoComplete={isRegistering ? "new-password" : "current-password"} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400" placeholder="Password" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="text-stone-400 transition hover:text-gold-dark">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {isRegistering && (
            <label className="block">
              <span className="sr-only">Confirm password</span>
              <span className="flex h-14 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 shadow-sm transition focus-within:border-gold focus-within:ring-4 focus-within:ring-gold/10">
                <KeyRound size={18} className="text-gold-dark" />
                <input name="confirmPassword" type={showPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-stone-400" placeholder="Confirm password" />
              </span>
            </label>
          )}
          {status.message && <p role={status.type === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${status.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{status.message}</p>}
          {suggestRegister && <button type="button" onClick={() => changeMode("register")} className="mx-auto block text-sm font-bold text-gold-dark transition hover:text-ink">Create an account</button>}
          <button disabled={submitting} className="group flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-gold-dark via-gold to-gold-dark px-6 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_14px_32px_-16px_rgba(168,122,50,0.9)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-14px_rgba(168,122,50,0.8)] disabled:cursor-not-allowed disabled:opacity-60">
            {!submitting && <LogIn size={18} />}
            {submitting ? (isRegistering ? "Creating account..." : "Signing in...") : (isRegistering ? "Create account" : "Sign in")}
          </button>
          {!isRegistering && (
            <button type="button" disabled={resettingPassword || submitting} onClick={requestPasswordReset} className="mx-auto block text-sm font-semibold text-gold-dark transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50">
              {resettingPassword ? "Sending reset link..." : "Forgot password?"}
            </button>
          )}
        </form>
      )}

      {step === "email" && authMethod === "otp" && (
        <form onSubmit={requestOtp} className="space-y-4">
          {isRegistering && (
            <label className="block">
              <span className="sr-only">Full name</span>
              <span className="flex h-14 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 shadow-sm transition focus-within:border-gold focus-within:ring-4 focus-within:ring-gold/10">
                <UserRound size={18} className="text-gold-dark" />
                <input name="fullName" required minLength={2} maxLength={80} autoComplete="name" className="h-full w-full bg-transparent text-sm outline-none placeholder:text-stone-400" placeholder="Full name" />
              </span>
            </label>
          )}
          <label className="block">
            <span className="sr-only">Email address</span>
            <span className="flex h-14 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 shadow-sm transition focus-within:border-gold focus-within:ring-4 focus-within:ring-gold/10">
              <Mail size={18} className="text-gold-dark" />
              <input name="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-full w-full bg-transparent text-sm outline-none placeholder:text-stone-400" placeholder="Email address" />
            </span>
          </label>
          {status.message && <p role={status.type === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${status.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{status.message}</p>}
          {suggestRegister && <button type="button" onClick={() => changeMode("register")} className="mx-auto block text-sm font-bold text-gold-dark transition hover:text-ink">Create an account</button>}
          <button disabled={submitting || Boolean(cooldown)} className="group flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-gold-dark via-gold to-gold-dark px-6 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_14px_32px_-16px_rgba(168,122,50,0.9)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-14px_rgba(168,122,50,0.8)] disabled:cursor-not-allowed disabled:opacity-60">
            {!submitting && <Mail size={18} />}
            {submitting ? "Sending code..." : cooldown ? `Resend in ${cooldown}s` : "Send verification code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <label className="block">
            <span className="sr-only">Verification code</span>
            <input name="code" required autoFocus inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className="h-16 w-full rounded-2xl border border-stone-200 bg-white px-4 text-center text-2xl font-bold tracking-[0.5em] text-ink outline-none shadow-sm transition focus:border-gold focus:ring-4 focus:ring-gold/10" placeholder="000000" />
          </label>
          {status.message && <p role={status.type === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${status.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{status.message}</p>}
          <button disabled={submitting} className="group flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-gold-dark via-gold to-gold-dark px-6 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_14px_32px_-16px_rgba(168,122,50,0.9)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-14px_rgba(168,122,50,0.8)] disabled:cursor-not-allowed disabled:opacity-60">
            {!submitting && <LogIn size={18} />}
            {submitting ? "Verifying..." : "Verify and continue"}
          </button>
          <button type="button" disabled={Boolean(cooldown) || submitting} onClick={resendOtp} className="mx-auto flex items-center gap-2 text-sm font-semibold text-gold-dark transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw size={15} /> {cooldown ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
