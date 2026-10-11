import "server-only";

import type { JSONValue } from "postgres";
import { sql } from "./db";
import { slugify } from "./password";
import type { PublicPromotion } from "./pricing";
import type {
  Banner,
  Category,
  Customer,
  DeliveryZone,
  MenuItem,
  MenuItemWithCategory,
  Order,
  OrderLine,
  Promotion,
  SiteSettings,
} from "./types";

/* ------------------------------------------------------------------ *
 * Column lists
 *
 * Postgres stores flags as boolean and timestamps as timestamptz. The
 * rest of the app still expects the SQLite shapes (0/1 and
 * "YYYY-MM-DD HH:MM:SS"), including `is_available === 0` in the menu
 * cards. Every SELECT goes through one of these fragments so a boolean
 * never leaks out as `true` and silently fails that check.
 *
 * Day boundaries stay UTC, matching date('now') on the old SQLite file.
 * ------------------------------------------------------------------ */

function categoryCols() {
  return sql`
    id,
    name,
    slug,
    blurb,
    sort_order,
    is_active::int as is_active
  `;
}

function menuItemCols() {
  return sql`
    i.id,
    i.category_id,
    i.name,
    i.slug,
    i.description,
    i.price_cents,
    i.image_url,
    i.badge,
    i.is_available::int as is_available,
    i.is_featured::int as is_featured,
    i.sort_order,
    to_char(i.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as created_at
  `;
}

function menuItemWithCategoryCols() {
  return sql`
    ${menuItemCols()},
    c.name as category_name,
    c.slug as category_slug
  `;
}

function bannerCols() {
  return sql`
    id,
    title,
    subtitle,
    image_url,
    link_url,
    cta_label,
    theme,
    is_active::int as is_active,
    sort_order,
    to_char(starts_at, 'YYYY-MM-DD') as starts_at,
    to_char(ends_at, 'YYYY-MM-DD') as ends_at
  `;
}

function zoneCols() {
  return sql`
    id,
    name,
    fee_cents,
    eta_minutes,
    notes,
    is_active::int as is_active,
    sort_order
  `;
}

function promotionCols() {
  return sql`
    id,
    name,
    kind,
    code,
    discount_type,
    discount_value,
    scope,
    target_id,
    min_subtotal_cents,
    days_of_week,
    start_time,
    end_time,
    to_char(starts_at, 'YYYY-MM-DD') as starts_at,
    to_char(ends_at, 'YYYY-MM-DD') as ends_at,
    max_uses,
    usage_count,
    is_active::int as is_active,
    to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as created_at
  `;
}

function orderCols() {
  return sql`
    id,
    reference,
    customer_id,
    customer_name,
    phone,
    order_type,
    location,
    zone_id,
    zone_name,
    items_json,
    subtotal_cents,
    discount_cents,
    delivery_fee_cents,
    total_cents,
    applied_promos,
    promo_code,
    notes,
    status,
    to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as created_at
  `;
}

function customerCols() {
  return sql`
    c.id,
    c.phone,
    c.name,
    c.location,
    c.zone_id,
    c.orders_count,
    c.total_spend_cents,
    c.marketing_opt_in::int as marketing_opt_in,
    c.notes,
    to_char(c.first_order_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as first_order_at,
    to_char(c.last_order_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as last_order_at
  `;
}

function utcToday() {
  return sql`(created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date`;
}

function flag(value: boolean | undefined, fallback = true): boolean {
  if (value === undefined) return fallback;
  return value;
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

const NUMERIC_SETTINGS = new Set([
  "delivery_flat_fee_cents",
  "free_delivery_threshold_cents",
  "min_order_cents",
]);

/** Profiles the cafe actually uses. Replaces the old seed handle until settings are saved. */
const CAFE_INSTAGRAM = "https://www.instagram.com/jata.cafe";
const CAFE_TIKTOK = "https://www.tiktok.com/@jata.cafe";
const STALE_INSTAGRAM = [
  "https://instagram.com/jatacafe",
  "http://instagram.com/jatacafe",
  "https://www.instagram.com/jatacafe",
  "http://www.instagram.com/jatacafe",
];
const STALE_TIKTOK = ["https://tiktok.com/@jatacafe", "https://www.tiktok.com/@jatacafe"];

function socialLink(stored: string, fallback: string, stale: readonly string[]): string {
  const value = stored.trim().replace(/\/$/, "");
  if (!value || stale.includes(value)) return fallback;
  return stored.trim();
}

export async function getSettings(): Promise<SiteSettings> {
  const rows = await sql<{ key: string; value: string }[]>`
    select key, value from settings
  `;

  const raw: Record<string, string> = {};
  for (const row of rows) raw[row.key] = row.value;

  const read = (key: string, fallback = "") => raw[key] ?? fallback;
  const readNumber = (key: string, fallback = 0) => {
    const n = Number(raw[key]);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    site_name: read("site_name", "Jata Cafe"),
    tagline: read("tagline", "Fancy but affordable"),
    hero_kicker: read("hero_kicker"),
    whatsapp_number: read("whatsapp_number", "254180740540"),
    phone_display: read("phone_display"),
    address_line: read("address_line"),
    area_hint: read("area_hint"),
    maps_url: read("maps_url"),
    opening_hours: read("opening_hours"),
    announcement: read("announcement"),
    delivery_mode: read("delivery_mode", "zone") === "flat" ? "flat" : "zone",
    delivery_flat_fee_cents: readNumber("delivery_flat_fee_cents", 10000),
    free_delivery_threshold_cents: readNumber("free_delivery_threshold_cents", 0),
    delivery_note: read("delivery_note"),
    min_order_cents: readNumber("min_order_cents", 0),
    instagram_url: socialLink(read("instagram_url"), CAFE_INSTAGRAM, STALE_INSTAGRAM),
    tiktok_url: socialLink(read("tiktok_url"), CAFE_TIKTOK, STALE_TIKTOK),
    facebook_url: read("facebook_url"),
    currency: read("currency", "KES"),
  };
}

export async function updateSettings(patch: Record<string, string | number>): Promise<void> {
  const entries = Object.entries(patch).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== null,
  );
  if (entries.length === 0) return;

  await sql.begin(async (tx) => {
    for (const [key, value] of entries) {
      const stored = String(NUMERIC_SETTINGS.has(key) ? Math.round(Number(value)) : value);
      await tx`
        insert into settings (key, value)
        values (${key}, ${stored})
        on conflict (key) do update set value = excluded.value
      `;
    }
  });
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export async function listCategories(
  opts: { includeHidden?: boolean } = {},
): Promise<Category[]> {
  const rows = await sql<Category[]>`
    select ${categoryCols()}
      from categories
     ${opts.includeHidden ? sql`` : sql`where is_active`}
     order by sort_order, name
  `;
  return rows;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const rows = await sql<Category[]>`
    select ${categoryCols()} from categories where slug = ${slug}
  `;
  return rows[0] ?? null;
}

async function slugTaken(table: "categories" | "menu_items", candidate: string): Promise<boolean> {
  const rows =
    table === "categories"
      ? await sql`select 1 from categories where slug = ${candidate}`
      : await sql`select 1 from menu_items where slug = ${candidate}`;
  return rows.length > 0;
}

async function uniqueSlug(table: "categories" | "menu_items", base: string): Promise<string> {
  const seed = base || "item";
  let candidate = seed;
  let n = 2;
  while (await slugTaken(table, candidate)) {
    candidate = `${seed}-${n++}`;
  }
  return candidate;
}

export async function createCategory(input: {
  name: string;
  blurb?: string | null;
  sort_order?: number;
  is_active?: boolean;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    insert into categories (name, slug, blurb, sort_order, is_active)
    values (
      ${input.name.trim()},
      ${await uniqueSlug("categories", slugify(input.name))},
      ${input.blurb?.trim() || null},
      ${input.sort_order ?? 0},
      ${flag(input.is_active)}
    )
    returning id
  `;
  return rows[0].id;
}

export async function updateCategory(
  id: number,
  input: { name: string; blurb?: string | null; sort_order?: number; is_active?: boolean },
): Promise<void> {
  await sql`
    update categories
       set name = ${input.name.trim()},
           blurb = ${input.blurb?.trim() || null},
           sort_order = ${input.sort_order ?? 0},
           is_active = ${flag(input.is_active)}
     where id = ${id}
  `;
}

export async function deleteCategory(id: number): Promise<void> {
  await sql`delete from categories where id = ${id}`;
}

/* ------------------------------------------------------------------ *
 * Menu items
 * ------------------------------------------------------------------ */

export async function listMenu(
  opts: { availableOnly?: boolean; categorySlug?: string } = {},
): Promise<MenuItemWithCategory[]> {
  const hideInactiveCategories = Boolean(opts.availableOnly);
  const categorySlug = opts.categorySlug ?? null;
  return await sql<MenuItemWithCategory[]>`
    select ${menuItemWithCategoryCols()}
      from menu_items i
      join categories c on c.id = i.category_id
     where (${hideInactiveCategories} = false or c.is_active)
       and (${categorySlug}::text is null or c.slug = ${categorySlug})
     order by c.sort_order, c.name, i.sort_order, i.name
  `;
}

export async function listFeatured(limit = 6): Promise<MenuItemWithCategory[]> {
  return await sql<MenuItemWithCategory[]>`
    select ${menuItemWithCategoryCols()}
      from menu_items i
      join categories c on c.id = i.category_id
     where i.is_featured and c.is_active
     order by i.is_available desc, i.sort_order
     limit ${limit}
  `;
}

export async function getMenuItem(id: number): Promise<MenuItem | null> {
  const rows = await sql<MenuItem[]>`
    select
      id,
      category_id,
      name,
      slug,
      description,
      price_cents,
      image_url,
      badge,
      is_available::int as is_available,
      is_featured::int as is_featured,
      sort_order,
      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as created_at
    from menu_items
    where id = ${id}
  `;
  return rows[0] ?? null;
}

/** Fetch the authoritative price/availability for a set of ids. */
export async function getMenuItemsByIds(ids: number[]): Promise<MenuItemWithCategory[]> {
  if (ids.length === 0) return [];
  return await sql<MenuItemWithCategory[]>`
    select ${menuItemWithCategoryCols()}
      from menu_items i
      join categories c on c.id = i.category_id
     where i.id in ${sql(ids)}
  `;
}

export type MenuItemInput = {
  category_id: number;
  name: string;
  description?: string | null;
  price_cents: number;
  image_url?: string | null;
  badge?: string | null;
  is_available?: boolean;
  is_featured?: boolean;
  sort_order?: number;
};

export async function createMenuItem(input: MenuItemInput): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    insert into menu_items
      (category_id, name, slug, description, price_cents, image_url, badge,
       is_available, is_featured, sort_order)
    values (
      ${input.category_id},
      ${input.name.trim()},
      ${await uniqueSlug("menu_items", slugify(input.name))},
      ${input.description?.trim() || null},
      ${Math.max(0, Math.round(input.price_cents))},
      ${input.image_url?.trim() || null},
      ${input.badge?.trim() || null},
      ${flag(input.is_available)},
      ${Boolean(input.is_featured)},
      ${input.sort_order ?? 0}
    )
    returning id
  `;
  return rows[0].id;
}

export async function updateMenuItem(id: number, input: MenuItemInput): Promise<void> {
  await sql`
    update menu_items
       set category_id = ${input.category_id},
           name = ${input.name.trim()},
           description = ${input.description?.trim() || null},
           price_cents = ${Math.max(0, Math.round(input.price_cents))},
           image_url = ${input.image_url?.trim() || null},
           badge = ${input.badge?.trim() || null},
           is_available = ${flag(input.is_available)},
           is_featured = ${Boolean(input.is_featured)},
           sort_order = ${input.sort_order ?? 0}
     where id = ${id}
  `;
}

export async function setMenuItemAvailability(id: number, available: boolean): Promise<void> {
  await sql`update menu_items set is_available = ${available} where id = ${id}`;
}

export async function deleteMenuItem(id: number): Promise<void> {
  await sql`delete from menu_items where id = ${id}`;
}

/* ------------------------------------------------------------------ *
 * Banners
 * ------------------------------------------------------------------ */

export async function listBanners(opts: { activeOnly?: boolean } = {}): Promise<Banner[]> {
  if (!opts.activeOnly) {
    return await sql<Banner[]>`
      select ${bannerCols()} from banners order by sort_order, id
    `;
  }
  return await sql<Banner[]>`
    select ${bannerCols()}
      from banners
     where is_active
       and (starts_at is null or starts_at <= (now() at time zone 'UTC')::date)
       and (ends_at is null or ends_at >= (now() at time zone 'UTC')::date)
     order by sort_order, id
  `;
}

export async function getBanner(id: number): Promise<Banner | null> {
  const rows = await sql<Banner[]>`
    select ${bannerCols()} from banners where id = ${id}
  `;
  return rows[0] ?? null;
}

export type BannerInput = {
  title: string;
  subtitle?: string | null;
  image_url?: string | null;
  link_url?: string | null;
  cta_label?: string | null;
  theme?: string;
  is_active?: boolean;
  sort_order?: number;
  starts_at?: string | null;
  ends_at?: string | null;
};

export async function createBanner(input: BannerInput): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    insert into banners
      (title, subtitle, image_url, link_url, cta_label, theme, is_active, sort_order, starts_at, ends_at)
    values (
      ${input.title.trim()},
      ${input.subtitle?.trim() || null},
      ${input.image_url?.trim() || null},
      ${input.link_url?.trim() || null},
      ${input.cta_label?.trim() || null},
      ${input.theme || "espresso"},
      ${flag(input.is_active)},
      ${input.sort_order ?? 0},
      ${input.starts_at || null},
      ${input.ends_at || null}
    )
    returning id
  `;
  return rows[0].id;
}

export async function updateBanner(id: number, input: BannerInput): Promise<void> {
  await sql`
    update banners
       set title = ${input.title.trim()},
           subtitle = ${input.subtitle?.trim() || null},
           image_url = ${input.image_url?.trim() || null},
           link_url = ${input.link_url?.trim() || null},
           cta_label = ${input.cta_label?.trim() || null},
           theme = ${input.theme || "espresso"},
           is_active = ${flag(input.is_active)},
           sort_order = ${input.sort_order ?? 0},
           starts_at = ${input.starts_at || null},
           ends_at = ${input.ends_at || null}
     where id = ${id}
  `;
}

export async function deleteBanner(id: number): Promise<void> {
  await sql`delete from banners where id = ${id}`;
}

/* ------------------------------------------------------------------ *
 * Delivery zones
 * ------------------------------------------------------------------ */

export async function listZones(
  opts: { activeOnly?: boolean } = {},
): Promise<DeliveryZone[]> {
  return await sql<DeliveryZone[]>`
    select ${zoneCols()}
      from delivery_zones
     ${opts.activeOnly ? sql`where is_active` : sql``}
     order by sort_order, fee_cents
  `;
}

export async function getZone(id: number): Promise<DeliveryZone | null> {
  const rows = await sql<DeliveryZone[]>`
    select ${zoneCols()} from delivery_zones where id = ${id}
  `;
  return rows[0] ?? null;
}

export type ZoneInput = {
  name: string;
  fee_cents: number;
  eta_minutes?: number | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

export async function createZone(input: ZoneInput): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    insert into delivery_zones
      (name, fee_cents, eta_minutes, notes, is_active, sort_order)
    values (
      ${input.name.trim()},
      ${Math.max(0, Math.round(input.fee_cents))},
      ${input.eta_minutes ?? null},
      ${input.notes?.trim() || null},
      ${flag(input.is_active)},
      ${input.sort_order ?? 0}
    )
    returning id
  `;
  return rows[0].id;
}

export async function updateZone(id: number, input: ZoneInput): Promise<void> {
  await sql`
    update delivery_zones
       set name = ${input.name.trim()},
           fee_cents = ${Math.max(0, Math.round(input.fee_cents))},
           eta_minutes = ${input.eta_minutes ?? null},
           notes = ${input.notes?.trim() || null},
           is_active = ${flag(input.is_active)},
           sort_order = ${input.sort_order ?? 0}
     where id = ${id}
  `;
}

export async function deleteZone(id: number): Promise<void> {
  await sql`delete from delivery_zones where id = ${id}`;
}

/* ------------------------------------------------------------------ *
 * Promotions
 * ------------------------------------------------------------------ */

export async function listPromotions(
  opts: { activeOnly?: boolean } = {},
): Promise<Promotion[]> {
  return await sql<Promotion[]>`
    select ${promotionCols()}
      from promotions
     ${opts.activeOnly ? sql`where is_active` : sql``}
     order by kind, id desc
  `;
}

export async function getPromotion(id: number): Promise<Promotion | null> {
  const rows = await sql<Promotion[]>`
    select ${promotionCols()} from promotions where id = ${id}
  `;
  return rows[0] ?? null;
}

function toPublicPromotion(p: Promotion): PublicPromotion {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    requires_code: Boolean(p.code && p.code.trim() !== ""),
    discount_type: p.discount_type,
    discount_value: p.discount_value,
    scope: p.scope,
    target_id: p.target_id,
    min_subtotal_cents: p.min_subtotal_cents,
    days_of_week: p.days_of_week,
    start_time: p.start_time,
    end_time: p.end_time,
    starts_at: p.starts_at,
    ends_at: p.ends_at,
  };
}

/**
 * Promotions safe to hand to the browser. Codes themselves are stripped, so a
 * shopper cannot read unredeemed codes out of the page source.
 */
export async function listPublicPromotions(): Promise<PublicPromotion[]> {
  const rows = await listPromotions({ activeOnly: true });
  return rows
    .filter((p) => p.max_uses === null || p.usage_count < p.max_uses)
    .map(toPublicPromotion);
}

/** Look up a discount code. Returns null if unknown, inactive or used up. */
export async function findPromotionByCode(code: string): Promise<PublicPromotion | null> {
  const trimmed = (code || "").trim().toUpperCase();
  if (!trimmed) return null;

  const rows = await sql<Promotion[]>`
    select ${promotionCols()}
      from promotions
     where is_active
       and code is not null
       and upper(code) = ${trimmed}
       and (max_uses is null or usage_count < max_uses)
  `;
  return rows[0] ? toPublicPromotion(rows[0]) : null;
}

export type PromotionInput = {
  name: string;
  kind: Promotion["kind"];
  code?: string | null;
  discount_type: Promotion["discount_type"];
  discount_value: number;
  scope: Promotion["scope"];
  target_id?: number | null;
  min_subtotal_cents?: number;
  days_of_week?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  max_uses?: number | null;
  is_active?: boolean;
};

function promoParams(input: PromotionInput) {
  return {
    name: input.name.trim(),
    kind: input.kind,
    code: input.kind === "code" ? input.code?.trim().toUpperCase() || null : null,
    discount_type: input.discount_type,
    discount_value: Math.max(0, Math.round(input.discount_value)),
    scope: input.scope,
    target_id: input.scope === "all" ? null : (input.target_id ?? null),
    min_subtotal_cents: Math.max(0, Math.round(input.min_subtotal_cents ?? 0)),
    days_of_week: input.days_of_week?.trim() || null,
    start_time: input.start_time?.trim() || null,
    end_time: input.end_time?.trim() || null,
    starts_at: input.starts_at?.trim() || null,
    ends_at: input.ends_at?.trim() || null,
    max_uses: input.max_uses ?? null,
    is_active: flag(input.is_active),
  };
}

export async function createPromotion(input: PromotionInput): Promise<number> {
  const p = promoParams(input);
  const rows = await sql<{ id: number }[]>`
    insert into promotions
      (name, kind, code, discount_type, discount_value, scope, target_id,
       min_subtotal_cents, days_of_week, start_time, end_time, starts_at, ends_at,
       max_uses, is_active)
    values (
      ${p.name}, ${p.kind}, ${p.code}, ${p.discount_type}, ${p.discount_value},
      ${p.scope}, ${p.target_id}, ${p.min_subtotal_cents}, ${p.days_of_week},
      ${p.start_time}, ${p.end_time}, ${p.starts_at}, ${p.ends_at},
      ${p.max_uses}, ${p.is_active}
    )
    returning id
  `;
  return rows[0].id;
}

export async function updatePromotion(id: number, input: PromotionInput): Promise<void> {
  const p = promoParams(input);
  await sql`
    update promotions
       set name = ${p.name},
           kind = ${p.kind},
           code = ${p.code},
           discount_type = ${p.discount_type},
           discount_value = ${p.discount_value},
           scope = ${p.scope},
           target_id = ${p.target_id},
           min_subtotal_cents = ${p.min_subtotal_cents},
           days_of_week = ${p.days_of_week},
           start_time = ${p.start_time},
           end_time = ${p.end_time},
           starts_at = ${p.starts_at},
           ends_at = ${p.ends_at},
           max_uses = ${p.max_uses},
           is_active = ${p.is_active}
     where id = ${id}
  `;
}

export async function deletePromotion(id: number): Promise<void> {
  await sql`delete from promotions where id = ${id}`;
}

export async function incrementPromotionUsage(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`
    update promotions
       set usage_count = usage_count + 1
     where id in ${sql(ids)}
  `;
}

/* ------------------------------------------------------------------ *
 * Orders + customers (basic CRM)
 * ------------------------------------------------------------------ */

export type RecordOrderInput = {
  reference: string;
  phone: string;
  customer_name: string | null;
  order_type: "delivery" | "pickup";
  location: string | null;
  zone_id: number | null;
  zone_name: string | null;
  lines: OrderLine[];
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  applied_promos: string | null;
  promo_code: string | null;
  notes: string | null;
  marketing_opt_in: boolean;
};

export async function recordOrder(
  input: RecordOrderInput,
): Promise<{ orderId: number; customerId: number }> {
  return sql.begin(async (tx) => {
    const customers = await tx<{ id: number }[]>`
      insert into customers (phone, name, location, zone_id, marketing_opt_in)
      values (
        ${input.phone},
        ${input.customer_name},
        ${input.location},
        ${input.zone_id},
        ${input.marketing_opt_in}
      )
      on conflict (phone) do update set
        name = coalesce(excluded.name, customers.name),
        location = coalesce(excluded.location, customers.location),
        zone_id = coalesce(excluded.zone_id, customers.zone_id),
        last_order_at = now()
      returning id
    `;
    const customerId = customers[0].id;

    await tx`
      update customers
         set orders_count = orders_count + 1,
             total_spend_cents = total_spend_cents + ${input.total_cents},
             last_order_at = now()
       where id = ${customerId}
    `;

    const orders = await tx<{ id: number }[]>`
      insert into orders
        (reference, customer_id, customer_name, phone, order_type, location, zone_id,
         zone_name, items_json, subtotal_cents, discount_cents, delivery_fee_cents,
         total_cents, applied_promos, promo_code, notes)
      values (
        ${input.reference},
        ${customerId},
        ${input.customer_name},
        ${input.phone},
        ${input.order_type},
        ${input.location},
        ${input.zone_id},
        ${input.zone_name},
        ${JSON.stringify(input.lines)},
        ${input.subtotal_cents},
        ${input.discount_cents},
        ${input.delivery_fee_cents},
        ${input.total_cents},
        ${input.applied_promos},
        ${input.promo_code},
        ${input.notes}
      )
      returning id
    `;

    return { orderId: orders[0].id, customerId };
  });
}

export async function listOrders(
  opts: { limit?: number; status?: string; search?: string } = {},
): Promise<Order[]> {
  const status = opts.status && opts.status !== "all" ? opts.status : null;
  const like = opts.search ? `%${opts.search}%` : null;
  const limit = opts.limit ?? 100;

  return await sql<Order[]>`
    select ${orderCols()}
      from orders
     where (${status}::text is null or status = ${status})
       and (
         ${like}::text is null
         or phone ilike ${like}
         or customer_name ilike ${like}
         or reference ilike ${like}
       )
     order by created_at desc, id desc
     limit ${limit}
  `;
}

export async function getOrder(id: number): Promise<Order | null> {
  const rows = await sql<Order[]>`
    select ${orderCols()} from orders where id = ${id}
  `;
  return rows[0] ?? null;
}

export async function setOrderStatus(id: number, status: Order["status"]): Promise<void> {
  await sql`update orders set status = ${status} where id = ${id}`;
}

export async function listCustomers(
  opts: { limit?: number; search?: string } = {},
): Promise<(Customer & { zone_name: string | null })[]> {
  const like = opts.search ? `%${opts.search}%` : null;
  const limit = opts.limit ?? 200;

  return await sql<(Customer & { zone_name: string | null })[]>`
    select ${customerCols()}, z.name as zone_name
      from customers c
      left join delivery_zones z on z.id = c.zone_id
     where (
       ${like}::text is null
       or c.phone ilike ${like}
       or c.name ilike ${like}
       or c.location ilike ${like}
     )
     order by c.last_order_at desc
     limit ${limit}
  `;
}

export async function updateCustomerNotes(
  id: number,
  patch: { notes?: string | null; marketing_opt_in?: boolean },
): Promise<void> {
  const notes = patch.notes ?? null;
  const marketing = patch.marketing_opt_in === undefined ? null : patch.marketing_opt_in;
  await sql`
    update customers
       set notes = coalesce(${notes}::text, notes),
           marketing_opt_in = coalesce(${marketing}::boolean, marketing_opt_in)
     where id = ${id}
  `;
}

export async function deleteCustomer(id: number): Promise<void> {
  await sql`delete from customers where id = ${id}`;
}

/* ------------------------------------------------------------------ *
 * Events + dashboard stats
 * ------------------------------------------------------------------ */

export async function logEvent(type: string, meta?: unknown): Promise<void> {
  const payload = meta === undefined ? null : sql.json(meta as JSONValue);
  await sql`insert into events (type, meta_json) values (${type}, ${payload})`;
}

export type DashboardStats = {
  whatsapp_clicks_today: number;
  whatsapp_clicks_7d: number;
  orders_today: number;
  orders_7d: number;
  revenue_today_cents: number;
  revenue_7d_cents: number;
  avg_order_cents: number;
  new_customers_7d: number;
  total_customers: number;
  sold_out_count: number;
  active_promos: number;
  top_items: { name: string; quantity: number }[];
  daily: { day: string; orders: number; revenue_cents: number }[];
};

async function scalar(query: Promise<{ v: number | null }[]>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.v ?? 0);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    whatsapp_clicks_today,
    whatsapp_clicks_7d,
    orders_today,
    orders_7d,
    revenue_today_cents,
    revenue_7d_cents,
    avg_order_cents,
    new_customers_7d,
    total_customers,
    sold_out_count,
    active_promos,
    daily,
    recent,
  ] = await Promise.all([
    scalar(sql`
      select count(*)::int as v
        from events
       where type = 'whatsapp_checkout' and ${utcToday()}
    `),
    scalar(sql`
      select count(*)::int as v
        from events
       where type = 'whatsapp_checkout'
         and created_at >= now() - interval '7 days'
    `),
    scalar(sql`
      select count(*)::int as v from orders where ${utcToday()}
    `),
    scalar(sql`
      select count(*)::int as v
        from orders
       where created_at >= now() - interval '7 days'
    `),
    scalar(sql`
      select coalesce(sum(total_cents), 0)::int as v
        from orders
       where ${utcToday()} and status <> 'cancelled'
    `),
    scalar(sql`
      select coalesce(sum(total_cents), 0)::int as v
        from orders
       where created_at >= now() - interval '7 days'
         and status <> 'cancelled'
    `),
    scalar(sql`
      select round(coalesce(avg(total_cents), 0))::int as v
        from orders
       where created_at >= now() - interval '30 days'
         and status <> 'cancelled'
    `),
    scalar(sql`
      select count(*)::int as v
        from customers
       where first_order_at >= now() - interval '7 days'
    `),
    scalar(sql`select count(*)::int as v from customers`),
    scalar(sql`select count(*)::int as v from menu_items where not is_available`),
    scalar(sql`select count(*)::int as v from promotions where is_active`),
    sql<{ day: string; orders: number; revenue_cents: number }[]>`
      select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day,
             count(*)::int as orders,
             coalesce(sum(total_cents), 0)::int as revenue_cents
        from orders
       where created_at >= now() - interval '6 days'
       group by to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')
       order by day
    `,
    sql<{ items_json: string }[]>`
      select items_json
        from orders
       where created_at >= now() - interval '30 days'
    `,
  ]);

  const tally = new Map<string, number>();
  for (const row of recent) {
    try {
      const lines = JSON.parse(row.items_json) as OrderLine[];
      for (const line of lines) {
        tally.set(line.name, (tally.get(line.name) ?? 0) + line.quantity);
      }
    } catch {
      // Ignore malformed rows rather than breaking the dashboard.
    }
  }

  const top_items = [...tally.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  return {
    whatsapp_clicks_today,
    whatsapp_clicks_7d,
    orders_today,
    orders_7d,
    revenue_today_cents,
    revenue_7d_cents,
    avg_order_cents,
    new_customers_7d,
    total_customers,
    sold_out_count,
    active_promos,
    top_items,
    daily,
  };
}

/** Short, human-friendly order reference, e.g. "JC-4F7Q2". */
export async function nextOrderReference(): Promise<string> {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = "";
    for (let i = 0; i < 5; i++) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const reference = `JC-${suffix}`;
    const existing = await sql`select 1 from orders where reference = ${reference}`;
    if (existing.length === 0) return reference;
  }
  return `JC-${Date.now().toString(36).toUpperCase()}`;
}
