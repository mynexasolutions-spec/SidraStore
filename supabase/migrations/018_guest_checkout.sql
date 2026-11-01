-- Guest checkout with verified account linking and server-side order validation.
-- Run after the existing migrations. The payment_attempts additions also make
-- guest Razorpay checkout work with the existing razorpay-setup.sql objects.

alter table public.delivery_settings
  add column if not exists prepaid_enabled boolean,
  add column if not exists prepaid_shipping_amount numeric(12, 2),
  add column if not exists prepaid_free_shipping_threshold numeric(12, 2),
  add column if not exists cod_enabled boolean,
  add column if not exists cod_shipping_amount numeric(12, 2),
  add column if not exists cod_free_shipping_threshold numeric(12, 2);

update public.delivery_settings
set
  prepaid_enabled = coalesce(prepaid_enabled, true),
  prepaid_shipping_amount = coalesce(prepaid_shipping_amount, standard_shipping_amount),
  prepaid_free_shipping_threshold = coalesce(prepaid_free_shipping_threshold, free_shipping_threshold),
  cod_enabled = coalesce(cod_enabled, true),
  cod_shipping_amount = coalesce(cod_shipping_amount, standard_shipping_amount),
  cod_free_shipping_threshold = coalesce(cod_free_shipping_threshold, free_shipping_threshold);

alter table public.delivery_settings
  alter column prepaid_enabled set default true,
  alter column prepaid_enabled set not null,
  alter column prepaid_shipping_amount set default 0,
  alter column prepaid_shipping_amount set not null,
  alter column prepaid_free_shipping_threshold set default 999,
  alter column prepaid_free_shipping_threshold set not null,
  alter column cod_enabled set default true,
  alter column cod_enabled set not null,
  alter column cod_shipping_amount set default 100,
  alter column cod_shipping_amount set not null,
  alter column cod_free_shipping_threshold set default 999,
  alter column cod_free_shipping_threshold set not null;

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
  auth_user_id uuid references auth.users(id) on delete cascade,
  address_id uuid references public.delivery_addresses(id),
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created' check (status in ('created', 'verified', 'consumed')),
  order_number text,
  guest_checkout jsonb,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  consumed_at timestamptz
);

alter table public.payment_attempts
  add column if not exists guest_checkout jsonb;

alter table public.payment_attempts
  alter column auth_user_id drop not null,
  alter column address_id drop not null;

create index if not exists payment_attempts_user_created_idx
on public.payment_attempts (auth_user_id, created_at desc);

alter table public.payment_attempts enable row level security;
revoke all on table public.payment_attempts from anon, authenticated;

create or replace function public.get_guest_checkout_quote(
  p_items jsonb,
  p_payment_method text,
  p_require_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_count integer;
  calculated_subtotal numeric(12, 2);
  calculated_shipping numeric(12, 2);
  option_enabled boolean;
  shipping_amount numeric(12, 2);
  free_shipping_threshold numeric(12, 2);
  currency_code text := 'INR';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;
  if p_payment_method not in ('cod', 'razorpay') then
    raise exception 'Invalid payment method.';
  end if;

  with requested as (
    select
      trim(item.slug) as slug,
      item.quantity,
      nullif(trim(item.variant_size), '') as variant_size
    from jsonb_to_recordset(p_items) as item(slug text, quantity integer, variant_size text)
  ), matched as (
    select requested.slug, requested.quantity, requested.variant_size, products.id
    from requested
    join public.products on products.slug = requested.slug
    where products.is_active
      and requested.quantity between 1 and 25
      and (
        requested.variant_size is null
        or exists (
          select 1
          from jsonb_array_elements(products.variants) as variant(value)
          where variant.value ->> 'size' = requested.variant_size
        )
      )
  )
  select count(*) into matched_count from matched;

  if matched_count <> jsonb_array_length(p_items) then
    raise exception 'One or more products or variants are unavailable. Refresh the catalog and try again.';
  end if;

  if exists (
    with requested as (
      select
        trim(item.slug) as slug,
        item.quantity,
        nullif(trim(item.variant_size), '') as variant_size
      from jsonb_to_recordset(p_items) as item(slug text, quantity integer, variant_size text)
    ), grouped as (
      select products.id, requested.variant_size, sum(requested.quantity)::integer as quantity
      from requested
      join public.products on products.slug = requested.slug
      group by products.id, requested.variant_size
    )
    select 1
    from grouped
    join public.products on products.id = grouped.id
    where (
      grouped.variant_size is null
      and products.stock_quantity < grouped.quantity
    ) or (
      grouped.variant_size is not null
      and coalesce((
        select (variant.value ->> 'stock')::integer
        from jsonb_array_elements(products.variants) as variant(value)
        where variant.value ->> 'size' = grouped.variant_size
        limit 1
      ), -1) < grouped.quantity
    )
  ) then
    raise exception 'One or more products are unavailable in the requested quantity.';
  end if;

  select sum(
    case
      when requested.variant_size is null then products.price
      else coalesce((
        select (variant.value ->> 'price')::numeric
        from jsonb_array_elements(products.variants) as variant(value)
        where variant.value ->> 'size' = requested.variant_size
        limit 1
      ), products.price)
    end * requested.quantity
  )
  into calculated_subtotal
  from jsonb_to_recordset(p_items) as requested(slug text, quantity integer, variant_size text)
  join public.products on products.slug = trim(requested.slug);

  select
    case when p_payment_method = 'cod' then settings.cod_enabled else settings.prepaid_enabled end,
    case when p_payment_method = 'cod' then settings.cod_shipping_amount else settings.prepaid_shipping_amount end,
    case when p_payment_method = 'cod' then settings.cod_free_shipping_threshold else settings.prepaid_free_shipping_threshold end,
    settings.currency_code
  into option_enabled, shipping_amount, free_shipping_threshold, currency_code
  from public.delivery_settings as settings
  order by settings.updated_at desc
  limit 1;

  if not found then raise exception 'Delivery settings are not configured.'; end if;
  if p_require_enabled and not option_enabled then
    if p_payment_method = 'cod' then
      raise exception 'Cash on Delivery is currently unavailable.';
    end if;
    raise exception 'Prepaid delivery is currently unavailable.';
  end if;

  calculated_shipping := case
    when calculated_subtotal = 0 then 0
    when free_shipping_threshold > 0 and calculated_subtotal >= free_shipping_threshold then 0
    else shipping_amount
  end;

  return jsonb_build_object(
    'subtotal', calculated_subtotal,
    'shipping', calculated_shipping,
    'amount', calculated_subtotal + calculated_shipping,
    'currency', currency_code,
    'payment_method', p_payment_method
  );
end;
$$;

create or replace function public.place_guest_order(
  p_full_name text,
  p_email text,
  p_phone text,
  p_address jsonb,
  p_items jsonb,
  p_payment_method text default 'cod',
  p_payment_status text default 'pending',
  p_razorpay_order_id text default null,
  p_razorpay_payment_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  checkout_quote jsonb;
  matching_customer public.customers%rowtype;
  selected_customer_id uuid;
  created_order_id uuid;
  created_order_number text;
  normalized_email text := lower(trim(p_email));
  recipient_name text := trim(coalesce(nullif(p_address ->> 'recipient_name', ''), p_full_name, ''));
  normalized_phone text := trim(coalesce(p_phone, ''));
  address_line_1 text := trim(coalesce(p_address ->> 'address_line_1', ''));
  address_line_2 text := nullif(trim(p_address ->> 'address_line_2'), '');
  city text := trim(coalesce(p_address ->> 'city', ''));
  state text := trim(coalesce(p_address ->> 'state', ''));
  postal_code text := trim(coalesce(p_address ->> 'postal_code', ''));
  country text := coalesce(nullif(trim(p_address ->> 'country'), ''), 'India');
begin
  if coalesce(length(trim(p_full_name)), 0) < 2 then raise exception 'Customer name is required.'; end if;
  if normalized_email is null or normalized_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'A valid email address is required.'; end if;
  if normalized_phone !~ '^[0-9+() -]{7,20}$' then raise exception 'A valid phone number is required.'; end if;
  if recipient_name !~ '.{2,}'
    or length(address_line_1) < 5
    or length(city) < 2
    or length(state) < 2
    or postal_code !~ '^[0-9]{6}$' then
    raise exception 'The delivery address is incomplete or invalid.';
  end if;
  if p_payment_method not in ('cod', 'razorpay') then raise exception 'Invalid payment method.'; end if;
  if p_payment_status not in ('pending', 'paid') then raise exception 'Invalid payment status.'; end if;
  if p_payment_method = 'cod' and p_payment_status <> 'pending' then raise exception 'Invalid cash-on-delivery payment state.'; end if;
  if p_payment_method = 'razorpay' and (p_payment_status <> 'paid' or p_razorpay_order_id is null or p_razorpay_payment_id is null) then
    raise exception 'Invalid Razorpay payment state.';
  end if;

  checkout_quote := public.get_guest_checkout_quote(p_items, p_payment_method, case when p_payment_method = 'razorpay' then false else true end);

  -- Serialize guest checkouts for the same email so two simultaneous orders
  -- cannot create two unlinked guest customer rows.
  perform pg_advisory_xact_lock(hashtextextended(normalized_email, 0));

  -- An order is linked to an account only when its Supabase email is verified.
  -- Existing unlinked guest records are reused by email to avoid duplicates.
  select customers.* into matching_customer
  from public.customers
  left join auth.users on users.id = customers.auth_user_id
  where lower(trim(customers.email)) = normalized_email
    and (
      customers.auth_user_id is null
      or (users.email_confirmed_at is not null and lower(users.email) = normalized_email)
    )
  order by (customers.auth_user_id is not null) desc, customers.created_at asc
  limit 1
  for update of customers;

  if found then
    selected_customer_id := matching_customer.id;
    if matching_customer.auth_user_id is null then
      update public.customers
      set full_name = trim(p_full_name), phone = normalized_phone, updated_at = now()
      where id = selected_customer_id;
    end if;
  else
    insert into public.customers (full_name, email, phone)
    values (trim(p_full_name), normalized_email, normalized_phone)
    returning id into selected_customer_id;
  end if;

  perform products.id
  from jsonb_to_recordset(p_items) as requested(slug text, quantity integer, variant_size text)
  join public.products on products.slug = trim(requested.slug)
  order by products.id
  for update;

  if exists (
    with requested as (
      select
        trim(item.slug) as slug,
        item.quantity,
        nullif(trim(item.variant_size), '') as variant_size
      from jsonb_to_recordset(p_items) as item(slug text, quantity integer, variant_size text)
    ), grouped as (
      select products.id, requested.variant_size, sum(requested.quantity)::integer as quantity
      from requested
      join public.products on products.slug = requested.slug
      group by products.id, requested.variant_size
    )
    select 1
    from grouped
    join public.products on products.id = grouped.id
    where not products.is_active
      or (
        grouped.variant_size is null
        and products.stock_quantity < grouped.quantity
      ) or (
        grouped.variant_size is not null
        and coalesce((
          select (variant.value ->> 'stock')::integer
          from jsonb_array_elements(products.variants) as variant(value)
          where variant.value ->> 'size' = grouped.variant_size
          limit 1
        ), -1) < grouped.quantity
      )
  ) then
    raise exception 'One or more products are unavailable in the requested quantity.';
  end if;

  created_order_number := 'SIDRA-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  insert into public.orders (
    order_number, customer_id, customer_email, shipping_address, status,
    payment_status, payment_method, subtotal, shipping_amount, total,
    razorpay_order_id, razorpay_payment_id
  ) values (
    created_order_number,
    selected_customer_id,
    normalized_email,
    jsonb_build_object(
      'recipient_name', recipient_name,
      'phone', normalized_phone,
      'address_line_1', address_line_1,
      'address_line_2', address_line_2,
      'city', city,
      'state', state,
      'postal_code', postal_code,
      'country', country
    ),
    'pending',
    p_payment_status,
    p_payment_method,
    (checkout_quote ->> 'subtotal')::numeric,
    (checkout_quote ->> 'shipping')::numeric,
    (checkout_quote ->> 'amount')::numeric,
    p_razorpay_order_id,
    p_razorpay_payment_id
  ) returning id into created_order_id;

  insert into public.order_items (
    order_id, product_id, product_name, variant_label, unit_price, quantity, line_total
  )
  select
    created_order_id,
    products.id,
    products.name,
    nullif(trim(requested.variant_size), ''),
    case
      when nullif(trim(requested.variant_size), '') is null then products.price
      else coalesce((
        select (variant.value ->> 'price')::numeric
        from jsonb_array_elements(products.variants) as variant(value)
        where variant.value ->> 'size' = trim(requested.variant_size)
        limit 1
      ), products.price)
    end,
    requested.quantity,
    (
      case
        when nullif(trim(requested.variant_size), '') is null then products.price
        else coalesce((
          select (variant.value ->> 'price')::numeric
          from jsonb_array_elements(products.variants) as variant(value)
          where variant.value ->> 'size' = trim(requested.variant_size)
          limit 1
        ), products.price)
      end
    ) * requested.quantity
  from jsonb_to_recordset(p_items) as requested(slug text, quantity integer, variant_size text)
  join public.products on products.slug = trim(requested.slug);

  update public.products
  set stock_quantity = products.stock_quantity - quantities.quantity
  from (
    select products.id, sum(requested.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as requested(slug text, quantity integer, variant_size text)
    join public.products on products.slug = trim(requested.slug)
    where nullif(trim(requested.variant_size), '') is null
    group by products.id
  ) as quantities
  where products.id = quantities.id;

  update public.products as product
  set variants = (
    select jsonb_agg(
      case
        when variant_request.quantity > 0 then jsonb_set(
          variant_request.value,
          '{stock}',
          to_jsonb(greatest(0, coalesce((variant_request.value ->> 'stock')::integer, 0) - variant_request.quantity))
        )
        else variant_request.value
      end
    )
    from (
      select
        variant.value,
        coalesce((
          select sum(requested.quantity)::integer
          from jsonb_to_recordset(p_items) as requested(slug text, quantity integer, variant_size text)
          where trim(requested.slug) = product.slug
            and nullif(trim(requested.variant_size), '') = variant.value ->> 'size'
        ), 0) as quantity
      from jsonb_array_elements(product.variants) as variant(value)
    ) as variant_request
  )
  where exists (
    select 1
    from jsonb_to_recordset(p_items) as requested(slug text, quantity integer, variant_size text)
    where trim(requested.slug) = product.slug
      and nullif(trim(requested.variant_size), '') is not null
  );

  update public.products as product
  set stock_quantity = coalesce((
    select sum((variant.value ->> 'stock')::integer)::integer
    from jsonb_array_elements(product.variants) as variant(value)
  ), 0)
  where exists (
    select 1
    from jsonb_to_recordset(p_items) as requested(slug text, quantity integer, variant_size text)
    where trim(requested.slug) = product.slug
      and nullif(trim(requested.variant_size), '') is not null
  );

  return created_order_number;
end;
$$;

create or replace function public.finalize_guest_razorpay_payment(p_payment_attempt_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attempt public.payment_attempts%rowtype;
  created_order_number text;
  checkout_payload jsonb;
begin
  select * into current_attempt
  from public.payment_attempts
  where id = p_payment_attempt_id
  for update;

  if not found then raise exception 'Payment attempt was not found.'; end if;
  if current_attempt.auth_user_id is not null or current_attempt.guest_checkout is null then
    raise exception 'This payment attempt is not a guest checkout.';
  end if;
  if current_attempt.status = 'consumed' then return current_attempt.order_number; end if;
  if current_attempt.status <> 'verified' then raise exception 'Payment has not been verified.'; end if;

  checkout_payload := current_attempt.guest_checkout;
  if (public.get_guest_checkout_quote(checkout_payload -> 'items', 'razorpay', false) ->> 'amount')::numeric <> current_attempt.amount then
    raise exception 'The cart total changed before payment was finalized.';
  end if;

  created_order_number := public.place_guest_order(
    checkout_payload ->> 'full_name',
    checkout_payload ->> 'email',
    checkout_payload ->> 'phone',
    checkout_payload -> 'address',
    checkout_payload -> 'items',
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

revoke all on function public.get_guest_checkout_quote(jsonb, text, boolean) from public;
revoke all on function public.place_guest_order(text, text, text, jsonb, jsonb, text, text, text, text) from public;
revoke all on function public.finalize_guest_razorpay_payment(uuid) from public;
grant execute on function public.get_guest_checkout_quote(jsonb, text, boolean) to service_role;
grant execute on function public.place_guest_order(text, text, text, jsonb, jsonb, text, text, text, text) to service_role;
grant execute on function public.finalize_guest_razorpay_payment(uuid) to service_role;
