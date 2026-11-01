-- Separate prepaid and COD delivery settings.
-- Run this in the Supabase SQL Editor after the existing migrations and razorpay-setup.sql.

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

alter table public.delivery_settings
  drop constraint if exists delivery_settings_at_least_one_method;

alter table public.delivery_settings
  add constraint delivery_settings_at_least_one_method
  check (prepaid_enabled or cod_enabled);

alter table public.delivery_settings
  drop constraint if exists delivery_settings_prepaid_amounts_check,
  drop constraint if exists delivery_settings_cod_amounts_check;

alter table public.delivery_settings
  add constraint delivery_settings_prepaid_amounts_check
  check (prepaid_shipping_amount >= 0 and prepaid_free_shipping_threshold >= 0),
  add constraint delivery_settings_cod_amounts_check
  check (cod_shipping_amount >= 0 and cod_free_shipping_threshold >= 0);

create or replace function public.get_customer_checkout_quote_for_payment(
  p_auth_user_id uuid,
  p_address_id uuid,
  p_payment_method text,
  p_require_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_quote jsonb;
  calculated_subtotal numeric(12, 2);
  calculated_shipping numeric(12, 2);
  option_enabled boolean;
  shipping_amount numeric(12, 2);
  free_shipping_threshold numeric(12, 2);
  currency_code text := 'INR';
begin
  if auth.uid() is not null and auth.uid() <> p_auth_user_id then
    raise exception 'Authentication does not match the requested customer.';
  end if;
  if p_payment_method not in ('cod', 'razorpay') then
    raise exception 'Invalid payment method.';
  end if;

  select
    case when p_payment_method = 'cod' then settings.cod_enabled else settings.prepaid_enabled end,
    case when p_payment_method = 'cod' then settings.cod_shipping_amount else settings.prepaid_shipping_amount end,
    case when p_payment_method = 'cod' then settings.cod_free_shipping_threshold else settings.prepaid_free_shipping_threshold end,
    settings.currency_code
  into option_enabled, shipping_amount, free_shipping_threshold, currency_code
  from public.delivery_settings as settings
  order by settings.updated_at desc
  limit 1;

  if not found then
    raise exception 'Delivery settings are not configured.';
  end if;
  if p_require_enabled and not option_enabled then
    if p_payment_method = 'cod' then
      raise exception 'Cash on Delivery is currently unavailable.';
    end if;
    raise exception 'Prepaid delivery is currently unavailable.';
  end if;

  base_quote := public.get_customer_checkout_quote_for_user(p_auth_user_id, p_address_id);
  calculated_subtotal := (base_quote ->> 'subtotal')::numeric;
  calculated_shipping := case
    when calculated_subtotal = 0 then 0
    when free_shipping_threshold > 0 and calculated_subtotal >= free_shipping_threshold then 0
    else shipping_amount
  end;

  return base_quote || jsonb_build_object(
    'shipping', calculated_shipping,
    'amount', calculated_subtotal + calculated_shipping,
    'currency', currency_code,
    'payment_method', p_payment_method
  );
end;
$$;

create or replace function public.get_customer_checkout_quote(p_address_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.get_customer_checkout_quote_for_payment(auth.uid(), p_address_id, 'razorpay', true);
$$;

create or replace function public.apply_delivery_settings_to_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  option_enabled boolean;
  shipping_amount numeric(12, 2);
  free_shipping_threshold numeric(12, 2);
begin
  if new.payment_method not in ('cod', 'razorpay') then
    raise exception 'Invalid payment method.';
  end if;

  select
    case when new.payment_method = 'cod' then settings.cod_enabled else settings.prepaid_enabled end,
    case when new.payment_method = 'cod' then settings.cod_shipping_amount else settings.prepaid_shipping_amount end,
    case when new.payment_method = 'cod' then settings.cod_free_shipping_threshold else settings.prepaid_free_shipping_threshold end
  into option_enabled, shipping_amount, free_shipping_threshold
  from public.delivery_settings as settings
  order by settings.updated_at desc
  limit 1;

  if not found then
    raise exception 'Delivery settings are not configured.';
  end if;
  if not option_enabled and not (new.payment_method = 'razorpay' and new.payment_status = 'paid') then
    if new.payment_method = 'cod' then
      raise exception 'Cash on Delivery is currently unavailable.';
    end if;
    raise exception 'Prepaid delivery is currently unavailable.';
  end if;

  new.shipping_amount := case
    when new.subtotal = 0 then 0
    when free_shipping_threshold > 0 and new.subtotal >= free_shipping_threshold then 0
    else shipping_amount
  end;
  new.total := new.subtotal + new.shipping_amount;
  return new;
end;
$$;

drop trigger if exists orders_apply_delivery_settings on public.orders;
create trigger orders_apply_delivery_settings
before insert on public.orders
for each row execute function public.apply_delivery_settings_to_order();

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

  current_quote := public.get_customer_checkout_quote_for_payment(
    current_attempt.auth_user_id,
    current_attempt.address_id,
    'razorpay',
    false
  );
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

revoke all on function public.get_customer_checkout_quote_for_payment(uuid, uuid, text, boolean) from public;
grant execute on function public.get_customer_checkout_quote_for_payment(uuid, uuid, text, boolean) to authenticated;
revoke all on function public.get_customer_checkout_quote(uuid) from public;
grant execute on function public.get_customer_checkout_quote(uuid) to authenticated;
