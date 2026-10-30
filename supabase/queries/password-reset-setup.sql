-- Password reset is handled by Supabase Auth, which owns password hashes and recovery tokens.
-- No public-table schema, trigger, or RLS policy should be added for this flow.
--
-- In Supabase Dashboard > Authentication > URL Configuration, add the deployed URL:
-- https://<your-domain>/reset-password
-- https://<your-domain>/auth/confirm
--
-- Local development URL:
-- http://localhost:3000/reset-password
-- http://localhost:3000/auth/confirm
--
-- This verification query is safe to run after the application flow is deployed.
select count(*) as confirmed_customer_accounts
from auth.users
where email_confirmed_at is not null;
