import "server-only";

import { db, slugify } from "./db";
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
 * Settings
 * ------------------------------------------------------------------ */

const NUMERIC_SETTINGS = new Set([
  "delivery_flat_fee_cents",
  "free_delivery_threshold_cents",
  "min_order_cents",
]);

export function getSettings(): SiteSettings {
  const rows = db().prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];

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
    instagram_url: read("instagram_url"),
    tiktok_url: read("tiktok_url"),
    facebook_url: read("facebook_url"),
    currency: read("currency", "KES"),
  };
}

export function updateSettings(patch: Record<string, string | number>): void {
  const stmt = db().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const run = db().transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null) continue;
      stmt.run(key, String(NUMERIC_SETTINGS.has(key) ? Math.round(Number(value)) : value));
    }
  });
  run();
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export function listCategories(opts: { includeHidden?: boolean } = {}): Category[] {
  const where = opts.includeHidden ? "" : "WHERE is_active = 1";
  return db()
    .prepare(`SELECT * FROM categories ${where} ORDER BY sort_order, name`)
    .all() as Category[];
}

export function getCategoryBySlug(slug: string): Category | null {
  return (
    (db().prepare("SELECT * FROM categories WHERE slug = ?").get(slug) as
      | Category
      | undefined) ?? null
  );
}

export function createCategory(input: {
  name: string;
  blurb?: string | null;
  sort_order?: number;
  is_active?: boolean;
}): number {
  const info = db()
    .prepare(
      "INSERT INTO categories (name, slug, blurb, sort_order, is_active) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      input.name.trim(),
      uniqueSlug("categories", slugify(input.name)),
      input.blurb?.trim() || null,
      input.sort_order ?? 0,
      input.is_active === false ? 0 : 1,
    );
  return Number(info.lastInsertRowid);
}

export function updateCategory(
  id: number,
  input: { name: string; blurb?: string | null; sort_order?: number; is_active?: boolean },
): void {
  db()
    .prepare(
      "UPDATE categories SET name = ?, blurb = ?, sort_order = ?, is_active = ? WHERE id = ?",
    )
    .run(
      input.name.trim(),
      input.blurb?.trim() || null,
      input.sort_order ?? 0,
      input.is_active === false ? 0 : 1,
      id,
    );
}

export function deleteCategory(id: number): void {
  db().prepare("DELETE FROM categories WHERE id = ?").run(id);
}

/* ------------------------------------------------------------------ *
 * Menu items
 * ------------------------------------------------------------------ */

function uniqueSlug(table: "categories" | "menu_items", base: string): string {
  const seed = base || "item";
  let candidate = seed;
  let n = 2;
  const stmt = db().prepare(`SELECT 1 FROM ${table} WHERE slug = ?`);
  while (stmt.get(candidate)) {
    candidate = `${seed}-${n++}`;
  }
  return candidate;
}

export function listMenu(
  opts: { availableOnly?: boolean; categorySlug?: string } = {},
): MenuItemWithCategory[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts.availableOnly) clauses.push("c.is_active = 1");
  if (opts.categorySlug) {
    clauses.push("c.slug = ?");
    params.push(opts.categorySlug);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return db()
    .prepare(
      `SELECT i.*, c.name AS category_name, c.slug AS category_slug
         FROM menu_items i
         JOIN categories c ON c.id = i.category_id
         ${where}
        ORDER BY c.sort_order, c.name, i.sort_order, i.name`,
    )
    .all(...params) as MenuItemWithCategory[];
}

export function listFeatured(limit = 6): MenuItemWithCategory[] {
  return db()
    .prepare(
      `SELECT i.*, c.name AS category_name, c.slug AS category_slug
         FROM menu_items i
         JOIN categories c ON c.id = i.category_id
        WHERE i.is_featured = 1 AND c.is_active = 1
        ORDER BY i.is_available DESC, i.sort_order
        LIMIT ?`,
    )
    .all(limit) as MenuItemWithCategory[];
}

export function getMenuItem(id: number): MenuItem | null {
  return (
    (db().prepare("SELECT * FROM menu_items WHERE id = ?").get(id) as MenuItem | undefined) ??
    null
  );
}

/** Fetch the authoritative price/availability for a set of ids. */
export function getMenuItemsByIds(ids: number[]): MenuItemWithCategory[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db()
    .prepare(
      `SELECT i.*, c.name AS category_name, c.slug AS category_slug
         FROM menu_items i
         JOIN categories c ON c.id = i.category_id
        WHERE i.id IN (${placeholders})`,
    )
    .all(...ids) as MenuItemWithCategory[];
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

export function createMenuItem(input: MenuItemInput): number {
  const info = db()
    .prepare(
      `INSERT INTO menu_items
         (category_id, name, slug, description, price_cents, image_url, badge,
          is_available, is_featured, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.category_id,
      input.name.trim(),
      uniqueSlug("menu_items", slugify(input.name)),
      input.description?.trim() || null,
      Math.max(0, Math.round(input.price_cents)),
      input.image_url?.trim() || null,
      input.badge?.trim() || null,
      input.is_available === false ? 0 : 1,
      input.is_featured ? 1 : 0,
      input.sort_order ?? 0,
    );
  return Number(info.lastInsertRowid);
}

export function updateMenuItem(id: number, input: MenuItemInput): void {
  db()
    .prepare(
      `UPDATE menu_items SET
         category_id = ?, name = ?, description = ?, price_cents = ?, image_url = ?,
         badge = ?, is_available = ?, is_featured = ?, sort_order = ?
       WHERE id = ?`,
    )
    .run(
      input.category_id,
      input.name.trim(),
      input.description?.trim() || null,
      Math.max(0, Math.round(input.price_cents)),
      input.image_url?.trim() || null,
      input.badge?.trim() || null,
      input.is_available === false ? 0 : 1,
      input.is_featured ? 1 : 0,
      input.sort_order ?? 0,
      id,
    );
}

export function setMenuItemAvailability(id: number, available: boolean): void {
  db()
    .prepare("UPDATE menu_items SET is_available = ? WHERE id = ?")
    .run(available ? 1 : 0, id);
}

export function deleteMenuItem(id: number): void {
  db().prepare("DELETE FROM menu_items WHERE id = ?").run(id);
}

/* ------------------------------------------------------------------ *
 * Banners
 * ------------------------------------------------------------------ */

export function listBanners(opts: { activeOnly?: boolean } = {}): Banner[] {
  if (!opts.activeOnly) {
    return db().prepare("SELECT * FROM banners ORDER BY sort_order, id").all() as Banner[];
  }
  return db()
    .prepare(
      `SELECT * FROM banners
        WHERE is_active = 1
          AND (starts_at IS NULL OR starts_at = '' OR date(starts_at) <= date('now'))
          AND (ends_at   IS NULL OR ends_at   = '' OR date(ends_at)   >= date('now'))
        ORDER BY sort_order, id`,
    )
    .all() as Banner[];
}

export function getBanner(id: number): Banner | null {
  return (
    (db().prepare("SELECT * FROM banners WHERE id = ?").get(id) as Banner | undefined) ?? null
  );
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

export function createBanner(input: BannerInput): number {
  const info = db()
    .prepare(
      `INSERT INTO banners
         (title, subtitle, image_url, link_url, cta_label, theme, is_active, sort_order, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.title.trim(),
      input.subtitle?.trim() || null,
      input.image_url?.trim() || null,
      input.link_url?.trim() || null,
      input.cta_label?.trim() || null,
      input.theme || "espresso",
      input.is_active === false ? 0 : 1,
      input.sort_order ?? 0,
      input.starts_at || null,
      input.ends_at || null,
    );
  return Number(info.lastInsertRowid);
}

export function updateBanner(id: number, input: BannerInput): void {
  db()
    .prepare(
      `UPDATE banners SET
         title = ?, subtitle = ?, image_url = ?, link_url = ?, cta_label = ?,
         theme = ?, is_active = ?, sort_order = ?, starts_at = ?, ends_at = ?
       WHERE id = ?`,
    )
    .run(
      input.title.trim(),
      input.subtitle?.trim() || null,
      input.image_url?.trim() || null,
      input.link_url?.trim() || null,
      input.cta_label?.trim() || null,
      input.theme || "espresso",
      input.is_active === false ? 0 : 1,
      input.sort_order ?? 0,
      input.starts_at || null,
      input.ends_at || null,
      id,
    );
}

export function deleteBanner(id: number): void {
  db().prepare("DELETE FROM banners WHERE id = ?").run(id);
}

/* ------------------------------------------------------------------ *
 * Delivery zones
 * ------------------------------------------------------------------ */

export function listZones(opts: { activeOnly?: boolean } = {}): DeliveryZone[] {
  const where = opts.activeOnly ? "WHERE is_active = 1" : "";
  return db()
    .prepare(`SELECT * FROM delivery_zones ${where} ORDER BY sort_order, fee_cents`)
    .all() as DeliveryZone[];
}

export function getZone(id: number): DeliveryZone | null {
  return (
    (db().prepare("SELECT * FROM delivery_zones WHERE id = ?").get(id) as
      | DeliveryZone
      | undefined) ?? null
  );
}

export type ZoneInput = {
  name: string;
  fee_cents: number;
  eta_minutes?: number | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

export function createZone(input: ZoneInput): number {
  const info = db()
    .prepare(
      "INSERT INTO delivery_zones (name, fee_cents, eta_minutes, notes, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.name.trim(),
      Math.max(0, Math.round(input.fee_cents)),
      input.eta_minutes ?? null,
      input.notes?.trim() || null,
      input.is_active === false ? 0 : 1,
      input.sort_order ?? 0,
    );
  return Number(info.lastInsertRowid);
}

export function updateZone(id: number, input: ZoneInput): void {
  db()
    .prepare(
      `UPDATE delivery_zones SET name = ?, fee_cents = ?, eta_minutes = ?, notes = ?,
         is_active = ?, sort_order = ? WHERE id = ?`,
    )
    .run(
      input.name.trim(),
      Math.max(0, Math.round(input.fee_cents)),
      input.eta_minutes ?? null,
      input.notes?.trim() || null,
      input.is_active === false ? 0 : 1,
      input.sort_order ?? 0,
      id,
    );
}

export function deleteZone(id: number): void {
  db().prepare("DELETE FROM delivery_zones WHERE id = ?").run(id);
}

/* ------------------------------------------------------------------ *
 * Promotions
 * ------------------------------------------------------------------ */

export function listPromotions(opts: { activeOnly?: boolean } = {}): Promotion[] {
  const where = opts.activeOnly ? "WHERE is_active = 1" : "";
  return db()
    .prepare(`SELECT * FROM promotions ${where} ORDER BY kind, id DESC`)
    .all() as Promotion[];
}

export function getPromotion(id: number): Promotion | null {
  return (
    (db().prepare("SELECT * FROM promotions WHERE id = ?").get(id) as
      | Promotion
      | undefined) ?? null
  );
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
export function listPublicPromotions(): PublicPromotion[] {
  return listPromotions({ activeOnly: true })
    .filter((p) => p.max_uses === null || p.usage_count < p.max_uses)
    .map(toPublicPromotion);
}

/** Look up a discount code. Returns null if unknown, inactive or used up. */
export function findPromotionByCode(code: string): PublicPromotion | null {
  const trimmed = (code || "").trim().toUpperCase();
  if (!trimmed) return null;

  const row = db()
    .prepare(
      `SELECT * FROM promotions
        WHERE is_active = 1 AND code IS NOT NULL AND UPPER(code) = ?
          AND (max_uses IS NULL OR usage_count < max_uses)`,
    )
    .get(trimmed) as Promotion | undefined;

  return row ? toPublicPromotion(row) : null;
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
    code: input.kind === "code" ? (input.code?.trim().toUpperCase() || null) : null,
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
    is_active: input.is_active === false ? 0 : 1,
  };
}

export function createPromotion(input: PromotionInput): number {
  const info = db()
    .prepare(
      `INSERT INTO promotions
         (name, kind, code, discount_type, discount_value, scope, target_id,
          min_subtotal_cents, days_of_week, start_time, end_time, starts_at, ends_at,
          max_uses, is_active)
       VALUES (@name, @kind, @code, @discount_type, @discount_value, @scope, @target_id,
               @min_subtotal_cents, @days_of_week, @start_time, @end_time, @starts_at,
               @ends_at, @max_uses, @is_active)`,
    )
    .run(promoParams(input));
  return Number(info.lastInsertRowid);
}

export function updatePromotion(id: number, input: PromotionInput): void {
  db()
    .prepare(
      `UPDATE promotions SET
         name = @name, kind = @kind, code = @code, discount_type = @discount_type,
         discount_value = @discount_value, scope = @scope, target_id = @target_id,
         min_subtotal_cents = @min_subtotal_cents, days_of_week = @days_of_week,
         start_time = @start_time, end_time = @end_time, starts_at = @starts_at,
         ends_at = @ends_at, max_uses = @max_uses, is_active = @is_active
       WHERE id = @id`,
    )
    .run({ ...promoParams(input), id });
}

export function deletePromotion(id: number): void {
  db().prepare("DELETE FROM promotions WHERE id = ?").run(id);
}

export function incrementPromotionUsage(ids: number[]): void {
  if (ids.length === 0) return;
  const stmt = db().prepare(
    "UPDATE promotions SET usage_count = usage_count + 1 WHERE id = ?",
  );
  const run = db().transaction(() => ids.forEach((id) => stmt.run(id)));
  run();
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

export function recordOrder(input: RecordOrderInput): { orderId: number; customerId: number } {
  const run = db().transaction(() => {
    db()
      .prepare(
        `INSERT INTO customers (phone, name, location, zone_id, marketing_opt_in)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(phone) DO UPDATE SET
           name          = COALESCE(excluded.name, customers.name),
           location      = COALESCE(excluded.location, customers.location),
           zone_id       = COALESCE(excluded.zone_id, customers.zone_id),
           last_order_at = datetime('now')`,
      )
      .run(
        input.phone,
        input.customer_name,
        input.location,
        input.zone_id,
        input.marketing_opt_in ? 1 : 0,
      );

    const customer = db()
      .prepare("SELECT id FROM customers WHERE phone = ?")
      .get(input.phone) as { id: number };

    db()
      .prepare(
        `UPDATE customers
            SET orders_count = orders_count + 1,
                total_spend_cents = total_spend_cents + ?,
                last_order_at = datetime('now')
          WHERE id = ?`,
      )
      .run(input.total_cents, customer.id);

    const info = db()
      .prepare(
        `INSERT INTO orders
           (reference, customer_id, customer_name, phone, order_type, location, zone_id,
            zone_name, items_json, subtotal_cents, discount_cents, delivery_fee_cents,
            total_cents, applied_promos, promo_code, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.reference,
        customer.id,
        input.customer_name,
        input.phone,
        input.order_type,
        input.location,
        input.zone_id,
        input.zone_name,
        JSON.stringify(input.lines),
        input.subtotal_cents,
        input.discount_cents,
        input.delivery_fee_cents,
        input.total_cents,
        input.applied_promos,
        input.promo_code,
        input.notes,
      );

    return { orderId: Number(info.lastInsertRowid), customerId: customer.id };
  });

  return run();
}

export function listOrders(
  opts: { limit?: number; status?: string; search?: string } = {},
): Order[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts.status && opts.status !== "all") {
    clauses.push("status = ?");
    params.push(opts.status);
  }
  if (opts.search) {
    clauses.push("(phone LIKE ? OR customer_name LIKE ? OR reference LIKE ?)");
    const like = `%${opts.search}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(opts.limit ?? 100);

  return db()
    .prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(...params) as Order[];
}

export function getOrder(id: number): Order | null {
  return (
    (db().prepare("SELECT * FROM orders WHERE id = ?").get(id) as Order | undefined) ?? null
  );
}

export function setOrderStatus(id: number, status: Order["status"]): void {
  db().prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
}

export function listCustomers(
  opts: { limit?: number; search?: string } = {},
): (Customer & { zone_name: string | null })[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (opts.search) {
    clauses.push("(c.phone LIKE ? OR c.name LIKE ? OR c.location LIKE ?)");
    const like = `%${opts.search}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(opts.limit ?? 200);

  return db()
    .prepare(
      `SELECT c.*, z.name AS zone_name
         FROM customers c
         LEFT JOIN delivery_zones z ON z.id = c.zone_id
         ${where}
        ORDER BY c.last_order_at DESC
        LIMIT ?`,
    )
    .all(...params) as (Customer & { zone_name: string | null })[];
}

export function updateCustomerNotes(
  id: number,
  patch: { notes?: string | null; marketing_opt_in?: boolean },
): void {
  db()
    .prepare(
      `UPDATE customers SET
         notes = COALESCE(?, notes),
         marketing_opt_in = COALESCE(?, marketing_opt_in)
       WHERE id = ?`,
    )
    .run(
      patch.notes ?? null,
      patch.marketing_opt_in === undefined ? null : patch.marketing_opt_in ? 1 : 0,
      id,
    );
}

export function deleteCustomer(id: number): void {
  db().prepare("DELETE FROM customers WHERE id = ?").run(id);
}

/* ------------------------------------------------------------------ *
 * Events + dashboard stats
 * ------------------------------------------------------------------ */

export function logEvent(type: string, meta?: unknown): void {
  db()
    .prepare("INSERT INTO events (type, meta_json) VALUES (?, ?)")
    .run(type, meta === undefined ? null : JSON.stringify(meta));
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

export function getDashboardStats(): DashboardStats {
  const scalar = (sql: string, ...params: unknown[]): number => {
    const row = db().prepare(sql).get(...params) as { v: number | null } | undefined;
    return Number(row?.v ?? 0);
  };

  const daily = db()
    .prepare(
      `SELECT date(created_at) AS day,
              COUNT(*)         AS orders,
              SUM(total_cents) AS revenue_cents
         FROM orders
        WHERE created_at >= datetime('now', '-6 days')
        GROUP BY date(created_at)
        ORDER BY day`,
    )
    .all() as { day: string; orders: number; revenue_cents: number }[];

  const recent = db()
    .prepare(
      `SELECT items_json FROM orders WHERE created_at >= datetime('now', '-30 days')`,
    )
    .all() as { items_json: string }[];

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
    whatsapp_clicks_today: scalar(
      "SELECT COUNT(*) AS v FROM events WHERE type = 'whatsapp_checkout' AND date(created_at) = date('now')",
    ),
    whatsapp_clicks_7d: scalar(
      "SELECT COUNT(*) AS v FROM events WHERE type = 'whatsapp_checkout' AND created_at >= datetime('now', '-7 days')",
    ),
    orders_today: scalar(
      "SELECT COUNT(*) AS v FROM orders WHERE date(created_at) = date('now')",
    ),
    orders_7d: scalar(
      "SELECT COUNT(*) AS v FROM orders WHERE created_at >= datetime('now', '-7 days')",
    ),
    revenue_today_cents: scalar(
      "SELECT COALESCE(SUM(total_cents), 0) AS v FROM orders WHERE date(created_at) = date('now') AND status != 'cancelled'",
    ),
    revenue_7d_cents: scalar(
      "SELECT COALESCE(SUM(total_cents), 0) AS v FROM orders WHERE created_at >= datetime('now', '-7 days') AND status != 'cancelled'",
    ),
    avg_order_cents: scalar(
      "SELECT COALESCE(AVG(total_cents), 0) AS v FROM orders WHERE created_at >= datetime('now', '-30 days') AND status != 'cancelled'",
    ),
    new_customers_7d: scalar(
      "SELECT COUNT(*) AS v FROM customers WHERE first_order_at >= datetime('now', '-7 days')",
    ),
    total_customers: scalar("SELECT COUNT(*) AS v FROM customers"),
    sold_out_count: scalar("SELECT COUNT(*) AS v FROM menu_items WHERE is_available = 0"),
    active_promos: scalar("SELECT COUNT(*) AS v FROM promotions WHERE is_active = 1"),
    top_items,
    daily,
  };
}

/** Short, human-friendly order reference, e.g. "JC-4F7Q2". */
export function nextOrderReference(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = "";
    for (let i = 0; i < 5; i++) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const reference = `JC-${suffix}`;
    const exists = db()
      .prepare("SELECT 1 FROM orders WHERE reference = ?")
      .get(reference);
    if (!exists) return reference;
  }
  return `JC-${Date.now().toString(36).toUpperCase()}`;
}
