-- OTP challenges are accessed only by the server with SUPABASE_SERVICE_ROLE_KEY.
-- Run this once in the Supabase SQL Editor before using customer OTP auth.

create table if not exists public.email_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('register', 'login')),
  full_name text,
  code_hash text not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_otp_challenges_lookup_idx
on public.email_otp_challenges (lower(email), purpose, created_at desc);

create unique index if not exists email_otp_challenges_one_active_idx
on public.email_otp_challenges (lower(email), purpose)
where consumed_at is null;

alter table public.email_otp_challenges enable row level security;

revoke all on table public.email_otp_challenges from anon, authenticated;
