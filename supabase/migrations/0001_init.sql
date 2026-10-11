-- ===========================================================================
-- Jata Cafe - initial Postgres schema
--
-- Translated from the SQLite schema that lived in src/lib/db.ts migrate().
-- Apply ONCE against a fresh Supabase project, either with
--     npm run db:migrate
-- or by pasting this file into the Supabase SQL editor.
--
-- Safe to re-run: every statement is IF NOT EXISTS / idempotent, so a partial
-- apply can be retried.
--
-- Translation notes (differences from the SQLite original are deliberate):
--   * INTEGER PRIMARY KEY AUTOINCREMENT -> bigint generated always as identity
--   * 0/1 integer flags                 -> boolean
--   * TEXT DEFAULT (datetime('now'))    -> timestamptz DEFAULT now()
--   * schedule date fields              -> date
--   * promotions.start_time/end_time    -> text, kept as "HH:MM" (the app
--     parses the string; a real `time` column would return "14:00:00")
--   * *_cents columns stay integer minor units (KES cents). Never numeric,
--     never float - money must not acquire a floating point representation.
--   * orders.items_json / applied_promos stay text (the app JSON.parses them)
--   * events.meta_json becomes jsonb (write-only in the app, so this is a
--     free upgrade that leaves event analytics queryable)
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- settings: key/value store for site configuration
-- ---------------------------------------------------------------------------
create table if not exists settings (
  key   text primary key,
  value text not null
);


-- ---------------------------------------------------------------------------
-- categories: menu sections
-- ---------------------------------------------------------------------------
create table if not exists categories (
  id         bigint generated always as identity primary key,
  name       text    not null,
  slug       text    not null unique,
  blurb      text,
  sort_order integer not null default 0,
  is_active  boolean not null default true
);


-- ---------------------------------------------------------------------------
-- menu_items: individual products
-- ---------------------------------------------------------------------------
create table if not exists menu_items (
  id           bigint generated always as identity primary key,
  category_id  bigint  not null references categories (id) on delete cascade,
  name         text    not null,
  slug         text    not null unique,
  description  text,
  price_cents  integer not null check (price_cents >= 0),
  image_url    text,
  badge        text,
  is_available boolean not null default true,
  is_featured  boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- banners: rotating hero artwork, optionally date-windowed
-- ---------------------------------------------------------------------------
create table if not exists banners (
  id         bigint generated always as identity primary key,
  title      text    not null,
  subtitle   text,
  image_url  text,
  link_url   text,
  cta_label  text,
  theme      text    not null default 'espresso',
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  starts_at  date,
  ends_at    date
);


-- ---------------------------------------------------------------------------
-- delivery_zones: Eastleigh delivery areas and their fees
-- ---------------------------------------------------------------------------
create table if not exists delivery_zones (
  id          bigint generated always as identity primary key,
  name        text    not null,
  fee_cents   integer not null check (fee_cents >= 0),
  eta_minutes integer,
  notes       text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0
);


-- ---------------------------------------------------------------------------
-- customers: derived from orders, keyed by phone number
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id                bigint generated always as identity primary key,
  phone             text    not null unique,
  name              text,
  location          text,
  zone_id           bigint  references delivery_zones (id) on delete set null,
  orders_count      integer not null default 0,
  total_spend_cents integer not null default 0,
  marketing_opt_in  boolean not null default true,
  notes             text,
  first_order_at    timestamptz not null default now(),
  last_order_at     timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- orders: one row per WhatsApp checkout handoff
--
-- items_json is a deliberate denormalised snapshot of the basket at order
-- time, so historical totals do not move when the menu is edited.
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id                 bigint generated always as identity primary key,
  reference          text    not null unique,
  customer_id        bigint  references customers (id) on delete set null,
  customer_name      text,
  phone              text    not null,
  order_type         text    not null default 'delivery',
  location           text,
  zone_id            bigint  references delivery_zones (id) on delete set null,
  zone_name          text,
  items_json         text    not null,
  subtotal_cents     integer not null default 0,
  discount_cents     integer not null default 0,
  delivery_fee_cents integer not null default 0,
  total_cents        integer not null default 0,
  applied_promos     text,
  promo_code         text,
  notes              text,
  status             text    not null default 'new',
  created_at         timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- promotions: automatic (happy hour) and code-based discounts
--
-- target_id is polymorphic - it points at a category or a menu item
-- depending on `scope` - so it deliberately carries no foreign key.
-- start_time/end_time are "HH:MM" strings, parsed by src/lib/pricing.ts.
-- ---------------------------------------------------------------------------
create table if not exists promotions (
  id                 bigint generated always as identity primary key,
  name               text    not null,
  kind               text    not null default 'auto',
  code               text,
  discount_type      text    not null default 'percent',
  discount_value     integer not null default 0,
  scope              text    not null default 'all',
  target_id          bigint,
  min_subtotal_cents integer not null default 0,
  days_of_week       text,
  start_time         text    check (start_time is null or start_time ~ '^[0-9]{2}:[0-9]{2}$'),
  end_time           text    check (end_time   is null or end_time   ~ '^[0-9]{2}:[0-9]{2}$'),
  starts_at          date,
  ends_at            date,
  max_uses           integer,
  usage_count        integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- events: lightweight analytics (currently whatsapp_checkout only)
-- ---------------------------------------------------------------------------
create table if not exists events (
  id         bigint generated always as identity primary key,
  type       text  not null,
  meta_json  jsonb,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- admin_users: dashboard accounts. password_hash is scrypt, format
-- "scrypt:<salt>:<hash>" - see src/lib/password.ts. Do not change the
-- hashing scheme without invalidating every existing password.
-- ---------------------------------------------------------------------------
create table if not exists admin_users (
  id                   bigint generated always as identity primary key,
  email                text    not null unique,
  name                 text    not null default 'Manager',
  password_hash        text    not null,
  role                 text    not null default 'owner',
  must_change_password boolean not null default true,
  created_at           timestamptz not null default now(),
  last_login_at        timestamptz
);


-- ---------------------------------------------------------------------------
-- sessions: only the SHA-256 hash of the session token is stored, so a
-- leaked database yields hashes rather than usable tokens.
-- ---------------------------------------------------------------------------
create table if not exists sessions (
  token_hash text primary key,
  user_id    bigint not null references admin_users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- login_attempts: throttling ledger (8 failures per 15 minutes)
-- ---------------------------------------------------------------------------
create table if not exists login_attempts (
  id         bigint generated always as identity primary key,
  identifier text not null,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index        if not exists idx_items_category     on menu_items (category_id);
create index        if not exists idx_items_featured     on menu_items (is_featured, is_available);
create index        if not exists idx_orders_created     on orders (created_at desc);
create index        if not exists idx_orders_status      on orders (status);
create index        if not exists idx_events_type_created on events (type, created_at desc);
create index        if not exists idx_sessions_user      on sessions (user_id);
create index        if not exists idx_login_attempts     on login_attempts (identifier, created_at desc);
create unique index if not exists idx_promo_code         on promotions (code) where code is not null;


-- ===========================================================================
-- Row Level Security
--
-- The app connects as the role in DATABASE_URL (the table owner), which is
-- not subject to RLS, so enabling it here does not affect the application.
--
-- What it does do is close the PostgREST door: Supabase exposes every table
-- in `public` over its REST API to the `anon` and `authenticated` roles.
-- RLS enabled with zero policies means those roles can see nothing. The
-- explicit REVOKE is defence in depth in case a policy is added later by
-- mistake.
--
-- This app does not use PostgREST at all - Storage uploads go through the
-- Storage API, and all data access is direct SQL.
-- ===========================================================================
alter table settings       enable row level security;
alter table categories     enable row level security;
alter table menu_items     enable row level security;
alter table banners        enable row level security;
alter table delivery_zones enable row level security;
alter table customers      enable row level security;
alter table orders         enable row level security;
alter table promotions     enable row level security;
alter table events         enable row level security;
alter table admin_users    enable row level security;
alter table sessions       enable row level security;
alter table login_attempts enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
