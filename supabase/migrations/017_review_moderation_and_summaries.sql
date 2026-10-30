-- Database-backed review moderation and approved-review summaries.
-- Existing product rating columns are retained as synchronized cache fields for
-- compatibility, but storefront reads use the approved-review summary view.

alter table public.reviews
  add column if not exists status text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null;

update public.reviews
set status = case when is_approved then 'approved' else 'pending' end
where status is null;

alter table public.reviews
  alter column status set default 'pending',
  alter column status set not null;

alter table public.reviews
  drop constraint if exists reviews_status_check;

alter table public.reviews
  add constraint reviews_status_check check (status in ('pending', 'approved', 'rejected'));

update public.reviews
set approved_at = coalesce(approved_at, updated_at, created_at)
where status = 'approved' and approved_at is null;

create index if not exists reviews_product_status_created_idx
  on public.reviews(product_id, status, created_at desc);

create or replace function public.sync_review_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status
       and new.is_approved is distinct from old.is_approved then
      new.status := case when new.is_approved then 'approved' else 'pending' end;
    end if;
  end if;

  if new.status is null then new.status := 'pending'; end if;
  new.is_approved := new.status = 'approved';

  if new.status = 'approved' then
    if tg_op = 'INSERT' then
      new.approved_at := coalesce(new.approved_at, now());
    elsif old.status is distinct from new.status then
      new.approved_at := coalesce(new.approved_at, now());
    end if;
    new.rejected_at := null;
    new.rejected_by := null;
  elsif new.status = 'rejected' then
    if tg_op = 'INSERT' then
      new.rejected_at := coalesce(new.rejected_at, now());
    elsif old.status is distinct from new.status then
      new.rejected_at := coalesce(new.rejected_at, now());
    end if;
    new.approved_at := null;
    new.approved_by := null;
  else
    new.approved_at := null;
    new.approved_by := null;
    new.rejected_at := null;
    new.rejected_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_sync_moderation_fields on public.reviews;
create trigger reviews_sync_moderation_fields
before insert or update on public.reviews
for each row execute function public.sync_review_moderation_fields();

create or replace function public.refresh_product_review_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_product_id uuid;
begin
  affected_product_id := case when tg_op = 'DELETE' then old.product_id else new.product_id end;

  update public.products
  set
    rating = coalesce((
      select round(avg(reviews.rating)::numeric, 1)
      from public.reviews
      where reviews.product_id = affected_product_id and reviews.status = 'approved'
    ), 0),
    review_count = (
      select count(*)
      from public.reviews
      where reviews.product_id = affected_product_id and reviews.status = 'approved'
    )
  where id = affected_product_id;

  if tg_op = 'UPDATE' then
    if old.product_id is distinct from new.product_id then
      update public.products
      set
        rating = coalesce((
          select round(avg(reviews.rating)::numeric, 1)
          from public.reviews
          where reviews.product_id = old.product_id and reviews.status = 'approved'
        ), 0),
        review_count = (
          select count(*)
          from public.reviews
          where reviews.product_id = old.product_id and reviews.status = 'approved'
        )
      where id = old.product_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists reviews_refresh_product_summary on public.reviews;
create trigger reviews_refresh_product_summary
after insert or update or delete on public.reviews
for each row execute function public.refresh_product_review_summary();

update public.products as product
set
  rating = coalesce((
    select round(avg(reviews.rating)::numeric, 1)
    from public.reviews
    where reviews.product_id = product.id and reviews.status = 'approved'
  ), 0),
  review_count = (
    select count(*)
    from public.reviews
    where reviews.product_id = product.id and reviews.status = 'approved'
  );

create or replace view public.product_review_summaries as
select
  products.id as product_id,
  coalesce(round(avg(reviews.rating)::numeric, 1), 0)::numeric(2, 1) as average_rating,
  count(reviews.id)::integer as approved_review_count
from public.products
left join public.reviews
  on reviews.product_id = products.id
  and reviews.status = 'approved'
group by products.id;

drop policy if exists "Public reads approved reviews" on public.reviews;
create policy "Public reads approved reviews"
on public.reviews for select to anon, authenticated
using (status = 'approved' or public.is_admin());

drop policy if exists "Authenticated users create reviews" on public.reviews;
create policy "Authenticated users create reviews"
on public.reviews for insert to authenticated
with check (auth_user_id = auth.uid() and status = 'pending' and is_approved = false);

drop policy if exists "Customers read own pending reviews" on public.reviews;
drop policy if exists "Customers read own reviews" on public.reviews;
create policy "Customers read own reviews"
on public.reviews for select to authenticated
using (auth_user_id = auth.uid() or status = 'approved' or public.is_admin());

drop policy if exists "Customers update own pending reviews" on public.reviews;
create policy "Customers update own pending reviews"
on public.reviews for update to authenticated
using (auth_user_id = auth.uid() and status = 'pending')
with check (auth_user_id = auth.uid() and status = 'pending' and is_approved = false);

grant select on public.product_review_summaries to anon, authenticated;

comment on column public.reviews.status is
  'Moderation state. Only approved reviews are visible publicly and included in product summaries.';
