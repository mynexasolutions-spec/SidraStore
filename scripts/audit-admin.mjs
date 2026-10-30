import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const separator = line.indexOf("=");
  if (separator > 0 && !line.startsWith("#")) process.env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
}

const baseUrl = process.env.AUDIT_BASE_URL || "http://localhost:3000";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const suffix = Date.now();
const created = { categoryId: null, productId: null, reviewId: null, inquiryId: null, content: [] };
const results = [];
let cookie = "";

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function cleanup() {
  for (const [table, id] of [...created.content].reverse()) await supabase.from(table).delete().eq("id", id);
  if (created.reviewId) await supabase.from("reviews").delete().eq("id", created.reviewId);
  if (created.inquiryId) await supabase.from("inquiries").delete().eq("id", created.inquiryId);
  if (created.productId) await supabase.from("products").delete().eq("id", created.productId);
  if (created.categoryId) await supabase.from("categories").delete().eq("id", created.categoryId);
}

try {
  let result = await request("/api/admin/catalog/categories");
  record("Authentication rejects anonymous admin API", result.response.status === 401, `status ${result.response.status}`);

  result = await request("/api/admin/login", { method: "POST", body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: `${process.env.ADMIN_PASSWORD}-invalid` }) });
  record("Authentication rejects invalid password", result.response.status === 401, `status ${result.response.status}`);

  result = await request("/api/admin/login", { method: "POST", body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  cookie = result.response.headers.get("set-cookie")?.split(";")[0] || "";
  record("Authentication accepts configured admin", result.response.ok && cookie.includes("sidra_admin_session="), `status ${result.response.status}`);

  result = await request("/api/admin/catalog/categories", { method: "POST", body: JSON.stringify({ name: `Audit Category ${suffix}`, description: "Temporary audit record", image_url: "/images/hero1.png", is_active: true }) });
  created.categoryId = result.body.category?.id;
  record("Category create", result.response.status === 201 && created.categoryId, `status ${result.response.status}`);
  result = await request(`/api/admin/catalog/categories/${created.categoryId}`, { method: "PATCH", body: JSON.stringify({ name: `Audit Category Updated ${suffix}`, description: "Updated", image_url: "/images/heromobile.png", is_active: true }) });
  record("Category update", result.response.ok && result.body.category?.description === "Updated", `status ${result.response.status}`);

  result = await request("/api/admin/catalog/subcategories", { method: "POST", body: JSON.stringify({ category_id: created.categoryId, name: `Audit Subcategory ${suffix}` }) });
  const subcategoryId = result.body.subcategory?.id;
  record("Subcategory create", result.response.status === 201 && subcategoryId, `status ${result.response.status}`);
  result = await request(`/api/admin/catalog/subcategories/${subcategoryId}`, { method: "PATCH", body: JSON.stringify({ name: `Audit Subcategory Updated ${suffix}` }) });
  record("Subcategory update", result.response.ok, `status ${result.response.status}`);
  result = await request(`/api/admin/catalog/subcategories/${subcategoryId}`, { method: "DELETE" });
  record("Subcategory delete", result.response.ok, `status ${result.response.status}`);

  result = await request("/api/admin/catalog/products", { method: "POST", body: JSON.stringify({ name: `Audit Product ${suffix}`, category_id: created.categoryId, short_description: "Temporary audit product", description: "Safe test data", price: 321, stock_quantity: 7, image_url: "/images/hero1.png", badge: "Audit", is_active: true }) });
  created.productId = result.body.product?.id;
  record("Product create", result.response.status === 201 && created.productId, `status ${result.response.status}`);
  result = await request(`/api/admin/catalog/products/${created.productId}`, { method: "PATCH", body: JSON.stringify({ name: `Audit Product ${suffix}`, category_id: created.categoryId, short_description: "Updated audit product", description: "Safe test data", price: 432, stock_quantity: 9, image_url: "/images/heromobile.png", badge: "Audit", is_active: true }) });
  record("Product price and inventory update", result.response.ok && Number(result.body.product?.price) === 432 && result.body.product?.stock_quantity === 9, `status ${result.response.status}`);
  result = await request("/api/storefront/catalog");
  const publicProduct = result.body.products?.find((product) => product.id === created.productId);
  record("Storefront catalog synchronization", result.response.ok && Number(publicProduct?.price) === 432 && publicProduct?.stock_quantity === 9, `public product ${publicProduct ? "found" : "missing"}`);

  for (const [resource, table, body, updatedField] of [
    ["hero-slides", "hero_slides", { title: `Audit Hero ${suffix}`, subtitle: "Audit", desktop_image_url: "/images/hero1.png", mobile_image_url: "/images/heromobile.png", cta_label: "Shop", cta_href: "/shop", sort_order: 99, is_active: true }, "title"],
    ["announcements", "announcements", { message: `Audit announcement ${suffix}`, sort_order: 99, is_active: true }, "message"],
    ["faqs", "faqs", { question: `Audit question ${suffix}?`, answer: "Temporary audit answer.", sort_order: 99, is_active: true }, "question"],
  ]) {
    result = await request(`/api/admin/content/${resource}`, { method: "POST", body: JSON.stringify(body) });
    const id = result.body.item?.id;
    if (id) created.content.push([table, id]);
    record(`${resource} create`, result.response.status === 201 && id, `status ${result.response.status}`);
    const update = { ...body, id, [updatedField]: `${body[updatedField]} updated` };
    result = await request(`/api/admin/content/${resource}`, { method: "PATCH", body: JSON.stringify(update) });
    record(`${resource} update`, result.response.ok && result.body.item?.[updatedField].endsWith("updated"), `status ${result.response.status}`);
    result = await request("/api/storefront/content");
    const publicKey = resource.replace("-", "_");
    record(`${resource} storefront synchronization`, result.response.ok && result.body[publicKey]?.some((item) => item.id === id), `public record ${result.body[publicKey]?.some((item) => item.id === id) ? "found" : "missing"}`);
    result = await request(`/api/admin/content/${resource}?id=${id}`, { method: "DELETE" });
    record(`${resource} delete`, result.response.ok, `status ${result.response.status}`);
    created.content = created.content.filter((entry) => entry[1] !== id);
  }

  result = await request("/api/admin/delivery-settings");
  const originalSettings = result.body.settings;
  result = await request("/api/admin/delivery-settings", { method: "PUT", body: JSON.stringify({ free_shipping_threshold: 1100, standard_shipping_amount: 75, currency_code: "INR", delivery_message: "Audit delivery" }) });
  record("Delivery settings update", result.response.ok && Number(result.body.settings?.standard_shipping_amount) === 75, `status ${result.response.status}`);
  result = await request("/api/storefront/content");
  record("Delivery settings storefront synchronization", Number(result.body.delivery_settings?.free_shipping_threshold) === 1100, `threshold ${result.body.delivery_settings?.free_shipping_threshold}`);
  await request("/api/admin/delivery-settings", { method: "PUT", body: JSON.stringify(originalSettings) });

  const { data: existingProduct } = await supabase.from("products").select("id").neq("id", created.productId).limit(1).single();
  const { data: review, error: reviewError } = await supabase.from("reviews").insert({ product_id: existingProduct.id, customer_name: "Audit Customer", rating: 5, title: "Audit review", body: "Temporary safe audit review.", status: "pending", is_approved: false }).select("id").single();
  if (reviewError) throw reviewError;
  created.reviewId = review.id;
  result = await request(`/api/admin/reviews/${review.id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
  record("Review moderation update", result.response.ok && result.body.review?.status === "approved", `status ${result.response.status}`);
  result = await request(`/api/admin/reviews/${review.id}`, { method: "DELETE" });
  record("Review delete", result.response.ok, `status ${result.response.status}`);
  created.reviewId = null;

  result = await request("/api/contact", { method: "POST", body: JSON.stringify({ name: "Audit Customer", email: "audit.customer@example.com", phone: "+91 90000 00000", subject: `Audit inquiry ${suffix}`, message: "Temporary safe audit inquiry." }) });
  record("Public inquiry create", result.response.status === 201, `status ${result.response.status}`);
  result = await request("/api/admin/inquiries");
  const inquiry = result.body.inquiries?.find((item) => item.subject === `Audit inquiry ${suffix}`);
  created.inquiryId = inquiry?.id;
  record("Admin inquiry read", result.response.ok && created.inquiryId, `record ${created.inquiryId ? "found" : "missing"}`);
  result = await request(`/api/admin/inquiries/${created.inquiryId}`, { method: "PATCH", body: JSON.stringify({ status: "resolved" }) });
  record("Inquiry status update", result.response.ok && result.body.inquiry?.status === "resolved", `status ${result.response.status}`);
  result = await request(`/api/admin/inquiries/${created.inquiryId}`, { method: "DELETE" });
  record("Inquiry delete", result.response.ok, `status ${result.response.status}`);
  created.inquiryId = null;

  result = await request("/api/admin/orders");
  const order = result.body.orders?.[0];
  const originalOrder = order ? { status: order.status, payment_status: order.payment_status } : null;
  record("Order read with customer and items", result.response.ok && order && Array.isArray(order.order_items), `orders ${result.body.orders?.length || 0}`);
  if (order) {
    result = await request(`/api/admin/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ status: "processing", payment_status: "paid" }) });
    record("Order and payment status update", result.response.ok && result.body.order?.status === "processing" && result.body.order?.payment_status === "paid", `status ${result.response.status}`);
    await request(`/api/admin/orders/${order.id}`, { method: "PATCH", body: JSON.stringify(originalOrder) });
  }

  result = await request("/api/admin/customers");
  const customer = result.body.customers?.find((item) => item.email.endsWith("@example.com")) || result.body.customers?.[0];
  record("Customer read with order history", result.response.ok && customer && Array.isArray(customer.orders), `customers ${result.body.customers?.length || 0}`);
  if (customer) {
    const originalCustomer = { full_name: customer.full_name, email: customer.email, phone: customer.phone || "" };
    result = await request(`/api/admin/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify({ ...originalCustomer, phone: "+91 90000 00999" }) });
    record("Customer update", result.response.ok && result.body.customer?.phone === "+91 90000 00999", `status ${result.response.status}`);
    await request(`/api/admin/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify(originalCustomer) });
  }

  result = await request(`/api/admin/catalog/products/${created.productId}`, { method: "DELETE" });
  record("Product delete", result.response.ok, `status ${result.response.status}`);
  created.productId = null;
  result = await request(`/api/admin/catalog/categories/${created.categoryId}`, { method: "DELETE" });
  record("Category delete", result.response.ok, `status ${result.response.status}`);
  created.categoryId = null;

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.filter((item) => item.passed).length, failedAt: error.message, results }, null, 2));
  process.exitCode = 1;
} finally {
  await cleanup();
}
