create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  desktop_image_url text not null,
  mobile_image_url text,
  cta_label text,
  cta_href text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_settings (
  id uuid primary key default gen_random_uuid(),
  free_shipping_threshold numeric(12, 2) not null default 999,
  standard_shipping_amount numeric(12, 2) not null default 0,
  prepaid_enabled boolean not null default true,
  prepaid_shipping_amount numeric(12, 2) not null default 0,
  prepaid_free_shipping_threshold numeric(12, 2) not null default 999,
  cod_enabled boolean not null default true,
  cod_shipping_amount numeric(12, 2) not null default 100,
  cod_free_shipping_threshold numeric(12, 2) not null default 999,
  currency_code text not null default 'INR',
  delivery_message text not null default 'Fast & Secure Delivery',
  updated_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists hero_slides_set_updated_at on public.hero_slides;
create trigger hero_slides_set_updated_at before update on public.hero_slides for each row execute function public.set_updated_at();
drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at before update on public.announcements for each row execute function public.set_updated_at();
drop trigger if exists delivery_settings_set_updated_at on public.delivery_settings;
create trigger delivery_settings_set_updated_at before update on public.delivery_settings for each row execute function public.set_updated_at();
drop trigger if exists faqs_set_updated_at on public.faqs;
create trigger faqs_set_updated_at before update on public.faqs for each row execute function public.set_updated_at();

alter table public.hero_slides enable row level security;
alter table public.announcements enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.faqs enable row level security;

drop policy if exists "Public reads active hero slides" on public.hero_slides;
create policy "Public reads active hero slides" on public.hero_slides for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "Admins manage hero slides" on public.hero_slides;
create policy "Admins manage hero slides" on public.hero_slides for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public reads active announcements" on public.announcements;
create policy "Public reads active announcements" on public.announcements for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "Admins manage announcements" on public.announcements;
create policy "Admins manage announcements" on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public reads delivery settings" on public.delivery_settings;
create policy "Public reads delivery settings" on public.delivery_settings for select to anon, authenticated using (true);
drop policy if exists "Admins manage delivery settings" on public.delivery_settings;
create policy "Admins manage delivery settings" on public.delivery_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public reads active FAQs" on public.faqs;
create policy "Public reads active FAQs" on public.faqs for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists "Admins manage FAQs" on public.faqs;
create policy "Admins manage FAQs" on public.faqs for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.hero_slides, public.announcements, public.delivery_settings, public.faqs to anon, authenticated;
grant insert, update, delete on public.hero_slides, public.announcements, public.delivery_settings, public.faqs to authenticated;

