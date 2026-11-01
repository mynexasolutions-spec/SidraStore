-- Live Shipmozo tracking storage for an existing Shipmozo installation.
-- Run this once in the Supabase SQL Editor after shipmozo-setup.sql.

alter table public.shipmozo_shipments
  add column if not exists expected_delivery_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists tracking_response jsonb;

alter table public.shipmozo_shipments
  drop constraint if exists shipmozo_shipments_status_check;

alter table public.shipmozo_shipments
  add constraint shipmozo_shipments_status_check
  check (status in ('pending', 'pushed', 'assigned', 'pickup_scheduled', 'delivered', 'cancelled'));

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

create index if not exists shipmozo_tracking_events_shipment_idx
  on public.shipmozo_tracking_events(shipment_id, event_at desc, created_at desc);

alter table public.shipmozo_tracking_events enable row level security;
alter table public.shipmozo_shipments replica identity full;
alter table public.shipmozo_tracking_events replica identity full;
revoke all on table public.shipmozo_tracking_events from anon, authenticated;
grant select on table public.shipmozo_tracking_events to authenticated;
revoke select (provider_response, tracking_response) on table public.shipmozo_shipments from authenticated;
revoke select (raw_event) on table public.shipmozo_tracking_events from authenticated;

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
