-- Razorpay payment attempts, trusted checkout totals, and server-only payment finalization.
-- Run this once in the Supabase SQL Editor after the existing migrations.

alter table public.orders
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text;

create unique index if not exists orders_razorpay_order_id_uidx
on public.orders (razorpay_order_id)
where razorpay_order_id is not null;

create unique index if not exists orders_razorpay_payment_id_uidx
on public.orders (razorpay_payment_id)
where razorpay_payment_id is not null;

create table if not exists public.payment_attempts (
  id uuid primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  address_id uuid not null references public.delivery_addresses(id),
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created' check (status in ('created', 'verified', 'consumed')),
  order_number text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  consumed_at timestamptz
);

create index if not exists payment_attempts_user_created_idx
on public.payment_attempts (auth_user_id, created_at desc);

alter table public.payment_attempts enable row level security;
revoke all on table public.payment_attempts from anon, authenticated;

create or replace function public.get_customer_checkout_quote_for_user(p_auth_user_id uuid, p_address_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := p_auth_user_id;
  selected_address public.delivery_addresses%rowtype;
  active_cart_id uuid;
  calculated_subtotal numeric(12, 2);
  calculated_shipping numeric(12, 2);
  free_shipping_threshold numeric(12, 2) := 999;
  standard_shipping_amount numeric(12, 2) := 90;
begin
  if current_user_id is null then raise exception 'Authentication is required.'; end if;

  select * into selected_address
  from public.delivery_addresses
  where id = p_address_id and auth_user_id = current_user_id;
  if not found then raise exception 'Delivery address was not found.'; end if;

  if selected_address.recipient_name !~ '.{2,}'
    or selected_address.phone !~ '^[0-9+() -]{7,20}$'
    or selected_address.postal_code !~ '^[0-9]{6}$'
    or length(trim(selected_address.address_line_1)) < 5
    or length(trim(selected_address.city)) < 2
    or length(trim(selected_address.state)) < 2 then
    raise exception 'The delivery address is incomplete or invalid.';
  end if;

  select carts.id into active_cart_id
  from public.carts
  where carts.auth_user_id = current_user_id and carts.status = 'active'
  for update;
  if active_cart_id is null then raise exception 'Your cart is empty.'; end if;

  perform products.id
  from public.products
  join public.cart_items on cart_items.product_id = products.id
  where cart_items.cart_id = active_cart_id
  order by products.id for update;

  if exists (
    select 1
    from public.cart_items
    join public.products on products.id = cart_items.product_id
    where cart_items.cart_id = active_cart_id
      and (
        not products.is_active
        or (
          cart_items.variant_size is null
          and products.stock_quantity < cart_items.quantity
        )
        or (
          cart_items.variant_size is not null
          and coalesce((
            select (variant.value ->> 'stock')::integer
            from jsonb_array_elements(products.variants) as variant(value)
            where variant.value ->> 'size' = cart_items.variant_size
            limit 1
          ), -1) < cart_items.quantity
        )
      )
  ) then
    raise exception 'One or more products are unavailable in the requested quantity.';
  end if;

  select sum(
    (
      case
        when cart_items.variant_size is null then products.price
        else coalesce((
          select (variant.value ->> 'price')::numeric
          from jsonb_array_elements(products.variants) as variant(value)
          where variant.value ->> 'size' = cart_items.variant_size
          limit 1
        ), products.price)
      end
    ) * cart_items.quantity
  )
  into calculated_subtotal
  from public.cart_items
  join public.products on products.id = cart_items.product_id
  where cart_items.cart_id = active_cart_id;
  if calculated_subtotal is null then raise exception 'Your cart is empty.'; end if;

  select settings.free_shipping_threshold, settings.standard_shipping_amount
  into free_shipping_threshold, standard_shipping_amount
  from public.delivery_settings as settings
  order by settings.updated_at desc
  limit 1;

  calculated_shipping := case when calculated_subtotal >= free_shipping_threshold then 0 else standard_shipping_amount end;
  return jsonb_build_object(
    'address_id', p_address_id,
    'cart_id', active_cart_id,
    'subtotal', calculated_subtotal,
    'shipping', calculated_shipping,
    'amount', calculated_subtotal + calculated_shipping,
    'currency', 'INR'
  );
end;
$$;

create or replace function public.get_customer_checkout_quote(p_address_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.get_customer_checkout_quote_for_user(auth.uid(), p_address_id);
$$;

create or replace function public.create_customer_order_for_user(
  p_auth_user_id uuid,
  p_address_id uuid,
  p_payment_method text,
  p_payment_status text,
  p_razorpay_order_id text default null,
  p_razorpay_payment_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_customer public.customers%rowtype;
  selected_address public.delivery_addresses%rowtype;
  active_cart_id uuid;
  created_order_id uuid;
  created_order_number text;
  calculated_subtotal numeric(12, 2);
  calculated_shipping numeric(12, 2);
  free_shipping_threshold numeric(12, 2) := 999;
  standard_shipping_amount numeric(12, 2) := 90;
begin
  if p_auth_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_payment_method not in ('cod', 'razorpay') then raise exception 'Invalid payment method.'; end if;
  if p_payment_status not in ('pending', 'paid') then raise exception 'Invalid payment status.'; end if;
  if p_payment_method = 'cod' and p_payment_status <> 'pending' then raise exception 'Invalid cash-on-delivery payment state.'; end if;
  if p_payment_method = 'razorpay' and (p_payment_status <> 'paid' or p_razorpay_order_id is null or p_razorpay_payment_id is null) then raise exception 'Invalid Razorpay payment state.'; end if;

  select * into current_customer
  from public.customers
  where auth_user_id = p_auth_user_id;
  if not found then raise exception 'Customer profile was not found.'; end if;

  select * into selected_address
  from public.delivery_addresses
  where id = p_address_id and auth_user_id = p_auth_user_id;
  if not found then raise exception 'Delivery address was not found.'; end if;

  if selected_address.recipient_name !~ '.{2,}'
    or selected_address.phone !~ '^[0-9+() -]{7,20}$'
    or selected_address.postal_code !~ '^[0-9]{6}$'
    or length(trim(selected_address.address_line_1)) < 5
    or length(trim(selected_address.city)) < 2
    or length(trim(selected_address.state)) < 2 then
    raise exception 'The delivery address is incomplete or invalid.';
  end if;

  select carts.id into active_cart_id
  from public.carts
  where carts.auth_user_id = p_auth_user_id and carts.status = 'active'
  for update;
  if active_cart_id is null then raise exception 'Your cart is empty.'; end if;

  perform products.id
  from public.products
  join public.cart_items on cart_items.product_id = products.id
  where cart_items.cart_id = active_cart_id
  order by products.id for update;

  if exists (
    select 1
    from public.cart_items
    join public.products on products.id = cart_items.product_id
    where cart_items.cart_id = active_cart_id
      and (
        not products.is_active
        or (
          cart_items.variant_size is null
          and products.stock_quantity < cart_items.quantity
        )
        or (
          cart_items.variant_size is not null
          and coalesce((
            select (variant.value ->> 'stock')::integer
            from jsonb_array_elements(products.variants) as variant(value)
            where variant.value ->> 'size' = cart_items.variant_size
            limit 1
          ), -1) < cart_items.quantity
        )
      )
  ) then
    raise exception 'One or more products are unavailable in the requested quantity.';
  end if;

  select sum(
    (
      case
        when cart_items.variant_size is null then products.price
        else coalesce((
          select (variant.value ->> 'price')::numeric
          from jsonb_array_elements(products.variants) as variant(value)
          where variant.value ->> 'size' = cart_items.variant_size
          limit 1
        ), products.price)
      end
    ) * cart_items.quantity
  )
  into calculated_subtotal
  from public.cart_items
  join public.products on products.id = cart_items.product_id
  where cart_items.cart_id = active_cart_id;
  if calculated_subtotal is null then raise exception 'Your cart is empty.'; end if;

  select settings.free_shipping_threshold, settings.standard_shipping_amount
  into free_shipping_threshold, standard_shipping_amount
  from public.delivery_settings as settings
  order by settings.updated_at desc
  limit 1;

  calculated_shipping := case when calculated_subtotal >= free_shipping_threshold then 0 else standard_shipping_amount end;
  created_order_number := 'SIDRA-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  insert into public.orders (
    order_number, customer_id, customer_email, shipping_address, status,
    payment_status, payment_method, subtotal, shipping_amount, total,
    razorpay_order_id, razorpay_payment_id
  ) values (
    created_order_number,
    current_customer.id,
    current_customer.email,
    jsonb_build_object(
      'recipient_name', selected_address.recipient_name,
      'phone', selected_address.phone,
      'address_line_1', selected_address.address_line_1,
      'address_line_2', selected_address.address_line_2,
      'city', selected_address.city,
      'state', selected_address.state,
      'postal_code', selected_address.postal_code,
      'country', selected_address.country
    ),
    'pending',
    p_payment_status,
    p_payment_method,
    calculated_subtotal,
    calculated_shipping,
    calculated_subtotal + calculated_shipping,
    p_razorpay_order_id,
    p_razorpay_payment_id
  ) returning id into created_order_id;

  insert into public.order_items (order_id, product_id, product_name, variant_label, unit_price, quantity, line_total)
  select
    created_order_id,
    products.id,
    products.name,
    cart_items.variant_size,
    case
      when cart_items.variant_size is null then products.price
      else coalesce((
        select (variant.value ->> 'price')::numeric
        from jsonb_array_elements(products.variants) as variant(value)
        where variant.value ->> 'size' = cart_items.variant_size
        limit 1
      ), products.price)
    end,
    cart_items.quantity,
    (
      case
        when cart_items.variant_size is null then products.price
        else coalesce((
          select (variant.value ->> 'price')::numeric
          from jsonb_array_elements(products.variants) as variant(value)
          where variant.value ->> 'size' = cart_items.variant_size
          limit 1
        ), products.price)
      end
    ) * cart_items.quantity
  from public.cart_items
  join public.products on products.id = cart_items.product_id
  where cart_items.cart_id = active_cart_id;

  update public.products
  set stock_quantity = products.stock_quantity - quantities.quantity
  from (
    select product_id, sum(quantity)::integer as quantity
    from public.cart_items
    where cart_id = active_cart_id and variant_size is null
    group by product_id
  ) as quantities
  where products.id = quantities.product_id;

  update public.products as product
  set variants = (
    select jsonb_agg(
      case
        when coalesce((
          select sum(cart_items.quantity)::integer
          from public.cart_items
          where cart_items.cart_id = active_cart_id
            and cart_items.product_id = product.id
            and cart_items.variant_size = variant.value ->> 'size'
        ), 0) > 0
        then jsonb_set(
          variant.value,
          '{stock}',
          to_jsonb(greatest(
            0,
            coalesce((variant.value ->> 'stock')::integer, 0) - coalesce((
              select sum(cart_items.quantity)::integer
              from public.cart_items
              where cart_items.cart_id = active_cart_id
                and cart_items.product_id = product.id
                and cart_items.variant_size = variant.value ->> 'size'
            ), 0)
          ))
        )
        else variant.value
      end
    )
    from jsonb_array_elements(product.variants) as variant(value)
  )
  where exists (
    select 1 from public.cart_items
    where cart_items.cart_id = active_cart_id
      and cart_items.product_id = product.id
      and cart_items.variant_size is not null
  );

  update public.products as product
  set stock_quantity = coalesce((
    select sum((variant.value ->> 'stock')::integer)::integer
    from jsonb_array_elements(product.variants) as variant(value)
  ), 0)
  where exists (
    select 1 from public.cart_items
    where cart_items.cart_id = active_cart_id
      and cart_items.product_id = product.id
      and cart_items.variant_size is not null
  );

  update public.carts set status = 'converted', updated_at = now() where id = active_cart_id;
  return created_order_number;
end;
$$;

create or replace function public.place_customer_order(p_address_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select public.create_customer_order_for_user(auth.uid(), p_address_id, 'cod', 'pending', null, null);
$$;

create or replace function public.finalize_razorpay_payment(p_payment_attempt_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attempt public.payment_attempts%rowtype;
  created_order_number text;
  current_quote jsonb;
begin
  select * into current_attempt
  from public.payment_attempts
  where id = p_payment_attempt_id
  for update;
  if not found then raise exception 'Payment attempt was not found.'; end if;
  if current_attempt.status = 'consumed' then return current_attempt.order_number; end if;
  if current_attempt.status <> 'verified' then raise exception 'Payment has not been verified.'; end if;

  current_quote := public.get_customer_checkout_quote_for_user(current_attempt.auth_user_id, current_attempt.address_id);
  if (current_quote ->> 'amount')::numeric <> current_attempt.amount then
    raise exception 'The cart total changed before payment was finalized.';
  end if;

  created_order_number := public.create_customer_order_for_user(
    current_attempt.auth_user_id,
    current_attempt.address_id,
    'razorpay',
    'paid',
    current_attempt.razorpay_order_id,
    current_attempt.razorpay_payment_id
  );

  update public.payment_attempts
  set status = 'consumed', order_number = created_order_number, consumed_at = now()
  where id = current_attempt.id;
  return created_order_number;
end;
$$;

revoke all on function public.create_customer_order_for_user(uuid, uuid, text, text, text, text) from public;
revoke all on function public.get_customer_checkout_quote_for_user(uuid, uuid) from public;
revoke all on function public.get_customer_checkout_quote(uuid) from public;
revoke all on function public.place_customer_order(uuid) from public;
revoke all on function public.finalize_razorpay_payment(uuid) from public;
grant execute on function public.get_customer_checkout_quote(uuid) to authenticated;
grant execute on function public.place_customer_order(uuid) to authenticated;
grant execute on function public.finalize_razorpay_payment(uuid) to service_role;
