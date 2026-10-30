import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateFullName(value) {
  const fullName = String(value || "").trim().replace(/\s+/g, " ");
  if (fullName.length < 2 || fullName.length > 80) return "Full name must be between 2 and 80 characters.";
  return fullName;
}

export function isValidOtp(code) {
  return /^\d{6}$/.test(code);
}

export function createOtp() {
  const code = String(randomInt(100000, 1000000));
  return { code, codeHash: hashOtp(code) };
}

export function hashOtp(code) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("OTP hashing is not configured.");

  return createHmac("sha256", serviceRoleKey)
    .update(createHash("sha256").update(code).digest("hex"))
    .digest("hex");
}

export function matchesOtp(code, storedHash) {
  const expectedHash = Buffer.from(hashOtp(code), "hex");
  const actualHash = Buffer.from(storedHash || "", "hex");
  return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
}

export function getOtpExpiry() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
}

export function getSafeNextPath(value) {
  const nextPath = String(value || "");
  return nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/checkout";
}
