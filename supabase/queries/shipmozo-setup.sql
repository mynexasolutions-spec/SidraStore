-- Shipmozo shipment state for the admin fulfilment workflow.
-- Run this once in the Supabase SQL Editor before using Shipmozo actions.

create table if not exists public.shipmozo_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null default 'shipmozo' check (provider = 'shipmozo'),
  provider_order_id text,
  warehouse_id text,
  package_weight_kg numeric(10,3),
  package_length_cm numeric(10,2),
  package_width_cm numeric(10,2),
  package_height_cm numeric(10,2),
  status text not null default 'pending' check (status in ('pending', 'pushed', 'assigned', 'pickup_scheduled', 'delivered', 'cancelled')),
  awb_number text,
  courier_id text,
  courier_name text,
  tracking_status text,
  tracking_url text,
  expected_delivery_at timestamptz,
  delivered_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  provider_response jsonb,
  tracking_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipmozo_tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipmozo_shipments(id) on delete cascade,
  event_key text not null,
  status text not null,
  description text,
  location text,
  event_at timestamptz,
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shipment_id, event_key)
);

create unique index if not exists shipmozo_shipments_provider_order_uidx
  on public.shipmozo_shipments(provider_order_id)
  where provider_order_id is not null;

create unique index if not exists shipmozo_shipments_awb_uidx
  on public.shipmozo_shipments(awb_number)
  where awb_number is not null;

create index if not exists shipmozo_shipments_status_idx
  on public.shipmozo_shipments(status, updated_at desc);
create index if not exists shipmozo_tracking_events_shipment_idx
  on public.shipmozo_tracking_events(shipment_id, event_at desc, created_at desc);

alter table public.shipmozo_shipments enable row level security;
alter table public.shipmozo_tracking_events enable row level security;
alter table public.shipmozo_shipments replica identity full;
alter table public.shipmozo_tracking_events replica identity full;
revoke all on table public.shipmozo_shipments from anon, authenticated;
revoke all on table public.shipmozo_tracking_events from anon, authenticated;

grant select on table public.shipmozo_shipments to authenticated;
grant select on table public.shipmozo_tracking_events to authenticated;
revoke select (provider_response, tracking_response) on table public.shipmozo_shipments from authenticated;
revoke select (raw_event) on table public.shipmozo_tracking_events from authenticated;

drop policy if exists "Customers read own Shipmozo shipments" on public.shipmozo_shipments;
create policy "Customers read own Shipmozo shipments" on public.shipmozo_shipments for select to authenticated
using (
  exists (
    select 1
    from public.orders
    join public.customers on customers.id = orders.customer_id
    where orders.id = shipmozo_shipments.order_id
      and customers.auth_user_id = auth.uid()
  )
);

drop policy if exists "Customers read own Shipmozo tracking events" on public.shipmozo_tracking_events;
create policy "Customers read own Shipmozo tracking events" on public.shipmozo_tracking_events for select to authenticated
using (
  exists (
    select 1
    from public.shipmozo_shipments
    join public.orders on orders.id = shipmozo_shipments.order_id
    join public.customers on customers.id = orders.customer_id
    where shipmozo_shipments.id = shipmozo_tracking_events.shipment_id
      and customers.auth_user_id = auth.uid()
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shipmozo_shipments'
  ) then
    alter publication supabase_realtime add table public.shipmozo_shipments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shipmozo_tracking_events'
  ) then
    alter publication supabase_realtime add table public.shipmozo_tracking_events;
  end if;
end $$;
