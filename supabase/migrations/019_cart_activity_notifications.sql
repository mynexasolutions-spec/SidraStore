-- Registered-customer cart activity for protected Admin Panel notifications.
-- Each add action supplies an idempotency key so retries cannot create duplicates.

create table if not exists public.cart_activity_notifications (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  cart_id uuid references public.carts(id) on delete set null,
  cart_item_id uuid references public.cart_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  event_id uuid not null,
  activity_type text not null default 'added' check (activity_type = 'added'),
  customer_name text not null,
  customer_email text not null,
  product_name text not null,
  product_image_url text,
  variant_size text,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity_added integer not null check (quantity_added between 1 and 25),
  cart_quantity integer not null check (cart_quantity between 1 and 25),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (auth_user_id, event_id)
);

create index if not exists cart_activity_notifications_created_idx
  on public.cart_activity_notifications(created_at desc);
create index if not exists cart_activity_notifications_unread_idx
  on public.cart_activity_notifications(read_at, created_at desc);
create index if not exists cart_activity_notifications_customer_idx
  on public.cart_activity_notifications(auth_user_id, created_at desc);

alter table public.cart_activity_notifications enable row level security;
alter table public.cart_activity_notifications replica identity full;
revoke all on table public.cart_activity_notifications from anon, authenticated;

create or replace function public.record_customer_cart_activity(
  p_product_slug text,
  p_quantity integer,
  p_variant_size text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_customer public.customers%rowtype;
  selected_product public.products%rowtype;
  active_cart_id uuid;
  selected_cart_item public.cart_items%rowtype;
  created_notification_id uuid;
  normalized_slug text := trim(coalesce(p_product_slug, ''));
  normalized_variant_size text := nullif(trim(coalesce(p_variant_size, '')), '');
  calculated_unit_price numeric(12, 2);
  next_cart_quantity integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if normalized_slug = '' then
    raise exception 'A product is required.';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 25 then
    raise exception 'Cart quantity must be between 1 and 25.';
  end if;
  if p_event_id is null then
    raise exception 'A cart activity event id is required.';
  end if;

  select * into current_customer
  from public.customers
  where auth_user_id = current_user_id;
  if not found then
    raise exception 'Customer profile was not found.';
  end if;

  -- Serialize cart activity for one customer. This keeps the cart quantity and
  -- the notification snapshot consistent when two browser tabs add together.
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select id into created_notification_id
  from public.cart_activity_notifications
  where auth_user_id = current_user_id and event_id = p_event_id;
  if found then
    return jsonb_build_object(
      'duplicate', true,
      'notification_id', created_notification_id
    );
  end if;

  select * into selected_product
  from public.products
  where slug = normalized_slug and is_active
  for update;
  if not found then
    raise exception 'The selected product is unavailable.';
  end if;

  if normalized_variant_size is null then
    calculated_unit_price := selected_product.price;
  else
    select (variant.value ->> 'price')::numeric
    into calculated_unit_price
    from jsonb_array_elements(coalesce(selected_product.variants, '[]'::jsonb)) as variant(value)
    where variant.value ->> 'size' = normalized_variant_size
    limit 1;
    if calculated_unit_price is null then
      raise exception 'The selected product variant is unavailable.';
    end if;
  end if;

  select id into active_cart_id
  from public.carts
  where auth_user_id = current_user_id and status = 'active'
  for update;

  if active_cart_id is null then
    insert into public.carts (auth_user_id)
    values (current_user_id)
    returning id into active_cart_id;
  end if;

  select * into selected_cart_item
  from public.cart_items
  where cart_id = active_cart_id
    and product_id = selected_product.id
    and variant_size is not distinct from normalized_variant_size
  for update;

  if found then
    next_cart_quantity := least(25, selected_cart_item.quantity + p_quantity);
    update public.cart_items
    set quantity = next_cart_quantity,
        unit_price = calculated_unit_price,
        updated_at = now()
    where id = selected_cart_item.id;
  else
    next_cart_quantity := least(25, p_quantity);
    insert into public.cart_items (cart_id, product_id, quantity, variant_size, unit_price)
    values (active_cart_id, selected_product.id, next_cart_quantity, normalized_variant_size, calculated_unit_price)
    returning * into selected_cart_item;
  end if;

  insert into public.cart_activity_notifications (
    auth_user_id,
    customer_id,
    cart_id,
    cart_item_id,
    product_id,
    event_id,
    customer_name,
    customer_email,
    product_name,
    product_image_url,
    variant_size,
    unit_price,
    quantity_added,
    cart_quantity
  ) values (
    current_user_id,
    current_customer.id,
    active_cart_id,
    selected_cart_item.id,
    selected_product.id,
    p_event_id,
    current_customer.full_name,
    current_customer.email,
    selected_product.name,
    selected_product.image_url,
    normalized_variant_size,
    calculated_unit_price,
    p_quantity,
    next_cart_quantity
  ) returning id into created_notification_id;

  return jsonb_build_object(
    'duplicate', false,
    'notification_id', created_notification_id,
    'cart_id', active_cart_id,
    'cart_item_id', selected_cart_item.id,
    'cart_quantity', next_cart_quantity
  );
end;
$$;

revoke all on function public.record_customer_cart_activity(text, integer, text, uuid) from public;
grant execute on function public.record_customer_cart_activity(text, integer, text, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cart_activity_notifications'
  ) then
    alter publication supabase_realtime add table public.cart_activity_notifications;
  end if;
end $$;
