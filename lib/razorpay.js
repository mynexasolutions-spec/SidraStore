import { createHmac, timingSafeEqual } from "node:crypto";

const RAZORPAY_API_URL = "https://api.razorpay.com/v1";

function getConfiguration() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!keyId || !keySecret) throw new Error("Razorpay API configuration is incomplete.");
  return { keyId, keySecret, webhookSecret };
}

async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = getConfiguration();
  const authorization = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`${RAZORPAY_API_URL}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      authorization: `Basic ${authorization}`,
      "content-type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });
  const responseBody = await response.text();
  let data;
  try {
    data = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const description = data?.error?.description || responseBody.slice(0, 500);
    throw new Error(`Razorpay API request failed with status ${response.status}: ${description}`);
  }

  return data;
}

export function getRazorpayKeyId() {
  return getConfiguration().keyId;
}

export function rupeesToPaise(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error("The payment amount is invalid.");
  const amountInPaise = Math.round(numericAmount * 100);
  if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) throw new Error("The payment amount is invalid.");
  return amountInPaise;
}

export async function createRazorpayOrder({ amountInPaise, receipt, notes }) {
  return razorpayRequest("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes,
    }),
  });
}

export async function fetchRazorpayPayment(paymentId) {
  return razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
}

function compareSignature(payload, suppliedSignature, secret) {
  if (!secret || typeof suppliedSignature !== "string" || !/^[a-f0-9]{64}$/i.test(suppliedSignature)) return false;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest();
  const actualSignature = Buffer.from(suppliedSignature, "hex");
  return actualSignature.length === expectedSignature.length && timingSafeEqual(actualSignature, expectedSignature);
}

export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const { keySecret } = getConfiguration();
  return compareSignature(`${orderId}|${paymentId}`, signature, keySecret);
}

export function verifyWebhookSignature(rawBody, signature) {
  const { webhookSecret } = getConfiguration();
  return compareSignature(rawBody, signature, webhookSecret);
}
