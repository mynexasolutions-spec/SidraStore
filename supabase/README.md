# Sidra Store Supabase SQL

This directory keeps database and authorization SQL separate from application code. Run migrations in filename order through the Supabase SQL editor or CLI.

1. `migrations/001_admin_authorization.sql`
2. `migrations/002_catalog.sql`
3. `migrations/003_commerce.sql`
4. `migrations/004_storefront_content.sql`
5. `migrations/005_seed_navigation_categories.sql`
6. `migrations/006_customer_checkout.sql`
7. `migrations/007_seed_product_catalog.sql` (generated after ImageKit upload)
8. `migrations/008_seed_category_images.sql`
9. `migrations/009_normalize_category_slugs_and_images.sql`
10. `migrations/010_seed_demo_orders_and_customers.sql`
11. `migrations/011_storefront_sync_and_checkout_integrity.sql`
12. `migrations/012_add_product_variants.sql`
13. `migrations/013_product_media_reviews_and_cod.sql`
14. `migrations/014_limit_featured_products.sql`
15. `migrations/015_update_premium_attar_catalog.sql`
16. `migrations/016_remove_legacy_attar_products.sql`
17. `migrations/017_review_moderation_and_summaries.sql`
18. `migrations/018_guest_checkout.sql`
19. `migrations/019_cart_activity_notifications.sql`

Run `npm run upload:products` once to upload the product images in `public/products` to ImageKit. The script reads credentials from `.env`, writes the returned public URLs to `data/imagekit-product-urls.json`, and generates `migrations/007_seed_product_catalog.sql`. Then run migration 007 in the Supabase SQL editor.

For customer OTP authentication, run `queries/email-otp-setup.sql` once in the Supabase SQL Editor. Configure Supabase Auth URL settings with your production site URL and add `http://localhost:3000/**` while developing. The app uses Brevo to send OTP emails, while Supabase Auth stores users and sessions; the service-role key is used only on the server and is never sent to the browser.

For Razorpay online payments, run `queries/razorpay-setup.sql` once in the Supabase SQL Editor. Keep `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` server-only. Configure Razorpay Webhooks to send `payment.captured` and `order.paid` events to `/api/payments/razorpay/webhook`.

Migration 018 enables guest COD and Razorpay checkout. Guest orders reuse an existing Supabase Auth customer only when the matching email is confirmed; otherwise they reuse or create an unlinked guest customer record.

Migration 019 records idempotent cart-add activity for authenticated customers. The Admin Panel reads these records through its protected admin API; the Supabase Realtime publication is enabled for the notification table so server-side subscribers can receive inserts without exposing customer details to anonymous storefront clients.

For Vercel deployments, configure `SHIPMOZO_API_BASE_URL`, `SHIPMOZO_PUBLIC_KEY`, `SHIPMOZO_PRIVATE_KEY`, and `SHIPMOZO_PICKUP_ADDRESS_ID` as Production server-side environment variables before using the Admin Panel's AWB actions. Redeploy after changing environment variables. `CRON_SECRET` protects the scheduled tracking sync endpoint.

After creating an administrator in Supabase Auth, edit and run `queries/bootstrap_admin.sql` once with that account's email. The query deliberately fails while the placeholder remains unchanged.

The current `/admin` login continues to use server-only `ADMIN_EMAIL` and `ADMIN_PASSWORD` values from `.env`. The Supabase authorization tables and policies are ready for a later migration to Supabase Auth without exposing the service-role key to the browser.

Never place Supabase service-role credentials, admin passwords, or real user identifiers in these SQL files.

