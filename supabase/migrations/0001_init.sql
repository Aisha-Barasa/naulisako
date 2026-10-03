-- Nauli Sacco initial schema. Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table saccos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table vehicle_owners (
  id uuid primary key default gen_random_uuid(),
  sacco_id uuid not null references saccos(id),
  owner_name text not null,
  phone_masked text,
  created_at timestamptz default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  sacco_id uuid not null references saccos(id),
  owner_id uuid references vehicle_owners(id),
  vehicle_code text unique not null,          -- e.g. KAB123B
  route_name text,
  conductor_name text,
  preset_fare_kes integer,
  lightning_address text,                     -- optional, needs LNURLp
  created_at timestamptz default now()
);

-- Secrets split out so no browser-facing policy can ever touch them
create table vehicle_wallets (
  vehicle_id uuid primary key references vehicles(id) on delete cascade,
  lnbits_wallet_id text not null,
  lnbits_invoice_key text not null,
  lnbits_admin_key text not null              -- needed for off-ramp payouts
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  amount_kes integer not null check (amount_kes > 0),
  payer_phone_masked text not null,           -- e.g. 2547****678
  phone_last3 text not null,
  daraja_checkout_id text unique,
  daraja_merchant_request_id text,
  mpesa_receipt text,
  receipt_last3 text generated always as (right(coalesce(mpesa_receipt, ''), 3)) stored,
  status text not null default 'processing'
    check (status in ('processing','fulfilled','settled','failed')),
  failure_reason text,
  amount_sats integer,
  btc_kes_rate numeric,
  ln_payment_hash text,
  verified_by_conductor boolean default false,
  verified_at timestamptz,
  source text not null default 'pwa' check (source in ('pwa','ussd','seed')),
  created_at timestamptz default now(),
  completed_at timestamptz,
  settled_at timestamptz
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  destination text not null,                  -- bolt11 or lightning address
  provider text,                              -- 'tando' | 'bitcoin.co.ke' | 'other'
  amount_sats integer not null,
  ln_payment_hash text,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  error text,
  created_at timestamptz default now()
);

create table nostr_reports (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  report_date date not null,
  event_id text not null,
  content_hash text not null,
  created_at timestamptz default now(),
  unique (vehicle_id, report_date)
);

create index idx_tx_vehicle_created on transactions(vehicle_id, created_at desc);

alter table saccos enable row level security;
alter table vehicle_owners enable row level security;
alter table vehicles enable row level security;
alter table vehicle_wallets enable row level security;
alter table transactions enable row level security;
alter table payouts enable row level security;
alter table nostr_reports enable row level security;

-- Browser (anon) may read only non-secret, PII-masked data
create policy anon_read_vehicles on vehicles for select to anon using (true);
create policy anon_read_tx on transactions for select to anon using (true);
-- No anon policies on vehicle_wallets, payouts, owners: server only.

alter publication supabase_realtime add table transactions;
