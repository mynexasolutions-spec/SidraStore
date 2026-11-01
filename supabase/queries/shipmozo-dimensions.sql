-- Add admin-managed package dimensions to an existing Shipmozo setup.
-- Run this once in the Supabase SQL Editor if shipmozo-setup.sql was already run.

alter table public.shipmozo_shipments
  add column if not exists package_weight_kg numeric(10,3),
  add column if not exists package_length_cm numeric(10,2),
  add column if not exists package_width_cm numeric(10,2),
  add column if not exists package_height_cm numeric(10,2);
