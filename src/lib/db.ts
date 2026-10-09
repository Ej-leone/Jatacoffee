import Database from "better-sqlite3";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ *
 * Connection (singleton, survives Next.js dev hot-reloads)
 * ------------------------------------------------------------------ */

/**
 * Resolved at runtime from DATABASE_PATH so the database file can live on a
 * mounted volume in production. The turbopackIgnore hint stops the bundler from
 * treating this as a static asset lookup and tracing the whole project into the
 * server output.
 */
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data", "jata.sqlite");

type GlobalWithDb = typeof globalThis & { __jataDb?: Database.Database };
const g = globalThis as GlobalWithDb;

function connect(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const database = new Database(DB_PATH);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  migrate(database);
  seed(database);
  return database;
}

export function db(): Database.Database {
  if (!g.__jataDb) g.__jataDb = connect();
  return g.__jataDb;
}

/* ------------------------------------------------------------------ *
 * Password hashing (scrypt, from Node's stdlib - no extra deps)
 * ------------------------------------------------------------------ */

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain.normalize("NFKC"), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const candidate = scryptSync(plain.normalize("NFKC"), salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/* ------------------------------------------------------------------ *
 * Schema
 * ------------------------------------------------------------------ */

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      slug       TEXT NOT NULL UNIQUE,
      blurb      TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active  INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      description TEXT,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      image_url   TEXT,
      badge       TEXT,
      is_available INTEGER NOT NULL DEFAULT 1,
      is_featured  INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_items_category ON menu_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_items_featured ON menu_items(is_featured, is_available);

    CREATE TABLE IF NOT EXISTS banners (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      subtitle   TEXT,
      image_url  TEXT,
      link_url   TEXT,
      cta_label  TEXT,
      theme      TEXT NOT NULL DEFAULT 'espresso',
      is_active  INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      starts_at  TEXT,
      ends_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS delivery_zones (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      fee_cents   INTEGER NOT NULL CHECK (fee_cents >= 0),
      eta_minutes INTEGER,
      notes       TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS promotions (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      name               TEXT NOT NULL,
      kind               TEXT NOT NULL DEFAULT 'auto',
      code               TEXT,
      discount_type      TEXT NOT NULL DEFAULT 'percent',
      discount_value     INTEGER NOT NULL DEFAULT 0,
      scope              TEXT NOT NULL DEFAULT 'all',
      target_id          INTEGER,
      min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
      days_of_week       TEXT,
      start_time         TEXT,
      end_time           TEXT,
      starts_at          TEXT,
      ends_at            TEXT,
      max_uses           INTEGER,
      usage_count        INTEGER NOT NULL DEFAULT 0,
      is_active          INTEGER NOT NULL DEFAULT 1,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_code
      ON promotions(code) WHERE code IS NOT NULL;

    CREATE TABLE IF NOT EXISTS customers (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      phone             TEXT NOT NULL UNIQUE,
      name              TEXT,
      location          TEXT,
      zone_id           INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
      orders_count      INTEGER NOT NULL DEFAULT 0,
      total_spend_cents INTEGER NOT NULL DEFAULT 0,
      marketing_opt_in  INTEGER NOT NULL DEFAULT 1,
      notes             TEXT,
      first_order_at    TEXT NOT NULL DEFAULT (datetime('now')),
      last_order_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      reference          TEXT NOT NULL UNIQUE,
      customer_id        INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name      TEXT,
      phone              TEXT NOT NULL,
      order_type         TEXT NOT NULL DEFAULT 'delivery',
      location           TEXT,
      zone_id            INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
      zone_name          TEXT,
      items_json         TEXT NOT NULL,
      subtotal_cents     INTEGER NOT NULL DEFAULT 0,
      discount_cents     INTEGER NOT NULL DEFAULT 0,
      delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
      total_cents        INTEGER NOT NULL DEFAULT 0,
      applied_promos     TEXT,
      promo_code         TEXT,
      notes              TEXT,
      status             TEXT NOT NULL DEFAULT 'new',
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);

    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,
      meta_json  TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(type, created_at DESC);

    CREATE TABLE IF NOT EXISTS admin_users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT 'Manager',
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'owner',
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS login_attempts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(identifier, created_at DESC);
  `);
}

/* ------------------------------------------------------------------ *
 * Seed - only runs on a brand new database
 * ------------------------------------------------------------------ */

const KES = (shillings: number) => shillings * 100;

const DEFAULT_SETTINGS: Record<string, string> = {
  site_name: "Jata Cafe",
  tagline: "Fancy but affordable",
  hero_kicker: "Eastleigh's favourite coffee & kitchen",
  whatsapp_number: "254180740540",
  phone_display: "+254 180 740 540",
  address_line: "18th Street, Section 3, Eastleigh, Nairobi",
  area_hint: "Opposite Save Mart",
  maps_url: "https://maps.google.com/?q=Jata+Cafe+18th+Street+Section+3+Eastleigh+Nairobi",
  opening_hours: "Mon - Sun · 7:00 AM - 10:00 PM",
  announcement: "Happy Hour: 15% off all signature coffees, 2 PM - 5 PM daily.",
  delivery_mode: "zone",
  delivery_flat_fee_cents: String(KES(100)),
  free_delivery_threshold_cents: String(KES(2500)),
  delivery_note:
    "Rider leaves the cafe within 10 minutes of confirmation. Pay cash or M-Pesa on delivery.",
  min_order_cents: String(KES(200)),
  instagram_url: "https://instagram.com/jatacafe",
  tiktok_url: "",
  facebook_url: "",
  currency: "KES",
};

type SeedItem = {
  name: string;
  price: number;
  description: string;
  featured?: boolean;
  badge?: string;
  soldOut?: boolean;
};

const SEED_MENU: { category: string; blurb: string; items: SeedItem[] }[] = [
  {
    category: "Signature Coffees",
    blurb: "Pulled fresh, every single cup. Our pride and joy.",
    items: [
      {
        name: "Spanish Latte",
        price: 350,
        description:
          "Our bestseller. Double espresso, steamed milk and sweet condensed milk, finished with a dusting of cinnamon.",
        featured: true,
        badge: "Bestseller",
      },
      {
        name: "Iced Spanish Latte",
        price: 400,
        description:
          "The same silky Spanish Latte poured over ice. Made for a hot Eastleigh afternoon.",
        featured: true,
      },
      {
        name: "Caramel Macchiato",
        price: 400,
        description: "Vanilla, steamed milk, espresso and a thick caramel drizzle.",
      },
      {
        name: "Cafe Mocha",
        price: 380,
        description: "Espresso with rich dark chocolate, steamed milk and whipped cream.",
      },
      {
        name: "Flat White",
        price: 320,
        description: "Strong, smooth and velvety. Two shots under a thin layer of microfoam.",
      },
      {
        name: "Cappuccino",
        price: 300,
        description: "Classic third-shot-third-milk-third-foam, dusted with cocoa.",
      },
      {
        name: "Cafe Latte",
        price: 300,
        description: "Mellow espresso with plenty of steamed milk. Easy to love.",
      },
      {
        name: "Americano",
        price: 250,
        description: "Double shot topped with hot water. Black, bold, no fuss.",
      },
      {
        name: "Double Espresso",
        price: 220,
        description: "Two straight shots for when you need to move fast.",
      },
      {
        name: "Kenyan Masala Chai",
        price: 150,
        description: "Milk tea simmered with ginger, cardamom and cloves. Proper chai.",
      },
    ],
  },
  {
    category: "Fast Food",
    blurb: "Hot, fast and generous. Grab and go.",
    items: [
      {
        name: "Jata Chicken Burger",
        price: 550,
        description:
          "Crispy buttermilk chicken fillet, lettuce, tomato and house garlic mayo, with a side of fries.",
        featured: true,
        badge: "Fan favourite",
      },
      {
        name: "Beef Burger",
        price: 500,
        description: "Flame-grilled beef patty, cheddar, caramelised onion and fries.",
      },
      {
        name: "Chicken Shawarma",
        price: 450,
        description: "Marinated chicken, pickles, garlic sauce and fries rolled in warm pita.",
        featured: true,
      },
      {
        name: "Buffalo Chicken Wings (6 pc)",
        price: 600,
        description: "Six wings tossed in sticky buffalo sauce, served with a cooling dip.",
      },
      {
        name: "Loaded Fries",
        price: 450,
        description: "Fries buried under shredded chicken, cheese sauce and spring onion.",
      },
      {
        name: "Masala Fries",
        price: 350,
        description: "Eastleigh classic. Fries simmered in spiced tomato masala.",
      },
      {
        name: "Chicken Wrap",
        price: 480,
        description: "Grilled chicken strips, crunchy slaw and chilli mayo in a soft tortilla.",
      },
      {
        name: "Beef Samosa (2 pc)",
        price: 120,
        description: "Hand-folded, deep golden, spiced minced beef. Best with chai.",
      },
      {
        name: "Chicken Pizza Slice",
        price: 300,
        description: "Thin-crust slice with chicken, peppers and plenty of mozzarella.",
      },
    ],
  },
  {
    category: "Main Meals",
    blurb: "Proper plates for a proper appetite.",
    items: [
      {
        name: "Chicken Biryani",
        price: 700,
        description:
          "Fragrant basmati layered with slow-cooked chicken, served with kachumbari and raita.",
        featured: true,
        badge: "Chef's pick",
      },
      {
        name: "Mutton Biryani",
        price: 850,
        description: "Tender mutton on the bone, saffron rice and fried onion.",
      },
      {
        name: "Beef Pilau",
        price: 600,
        description: "Spiced pilau rice with soft beef chunks, kachumbari on the side.",
      },
      {
        name: "Grilled Chicken & Chips",
        price: 850,
        description: "Half chicken marinated overnight, grilled over coals with chips and salad.",
        featured: true,
      },
      {
        name: "Nyama Choma (1/4 kg)",
        price: 800,
        description: "Charcoal-grilled goat with ugali, kachumbari and chilli.",
      },
      {
        name: "Chicken Tikka Platter",
        price: 800,
        description: "Yoghurt-and-spice marinated chicken from the grill, with naan and mint dip.",
      },
      {
        name: "Fish Fillet & Ugali",
        price: 750,
        description: "Pan-fried tilapia fillet, ugali and sukuma wiki.",
      },
      {
        name: "Chapati & Beef Stew",
        price: 450,
        description: "Two soft chapatis with slow-simmered beef stew.",
      },
    ],
  },
  {
    category: "Desserts",
    blurb: "The reason people stay for one more cup.",
    items: [
      {
        name: "New York Cheesecake",
        price: 400,
        description:
          "Dense, creamy baked cheesecake on a buttery biscuit base with berry compote.",
        featured: true,
        badge: "Must try",
      },
      {
        name: "Tiramisu",
        price: 450,
        description: "Coffee-soaked sponge, mascarpone cream and cocoa. Made in house.",
      },
      {
        name: "Chocolate Fudge Cake",
        price: 350,
        description: "Three layers of dark chocolate sponge with thick fudge icing.",
      },
      {
        name: "Red Velvet Slice",
        price: 380,
        description: "Soft red velvet with tangy cream cheese frosting.",
      },
      {
        name: "Brownie & Ice Cream",
        price: 420,
        description: "Warm fudge brownie with a scoop of vanilla and chocolate sauce.",
      },
      {
        name: "Butter Croissant",
        price: 200,
        description: "Flaky, buttery, baked fresh each morning.",
      },
      {
        name: "Glazed Doughnut",
        price: 150,
        description: "Soft ring doughnut under a sweet vanilla glaze.",
      },
    ],
  },
  {
    category: "Cold Drinks & Smoothies",
    blurb: "Cold, fresh and blended to order.",
    items: [
      {
        name: "Mango Smoothie",
        price: 350,
        description: "Ripe mango blended with yoghurt and a touch of honey.",
        featured: true,
      },
      {
        name: "Avocado Shake",
        price: 400,
        description: "Thick, creamy avocado blended with milk and vanilla.",
      },
      {
        name: "Vanilla Milkshake",
        price: 380,
        description: "Hand-spun ice cream shake topped with cream.",
      },
      {
        name: "Passion Mojito",
        price: 300,
        description: "Fresh passion, lime, mint and soda. Zero alcohol, full flavour.",
      },
      {
        name: "Fresh Juice of the Day",
        price: 250,
        description: "Ask the counter. Usually mango, passion or watermelon.",
      },
      {
        name: "Iced Lemon Tea",
        price: 250,
        description: "Chilled black tea, lemon and a hint of mint.",
      },
      { name: "Soda (300 ml)", price: 100, description: "Ice cold. All the usual suspects." },
      { name: "Bottled Water (500 ml)", price: 80, description: "Chilled or room temperature." },
    ],
  },
  {
    category: "Breakfast",
    blurb: "Served from 7:00 AM. Come hungry.",
    items: [
      {
        name: "Jata Breakfast Platter",
        price: 850,
        description:
          "Eggs your way, beef sausage, grilled tomato, baked beans, toast and a coffee of choice.",
        featured: true,
        badge: "Best value",
      },
      {
        name: "Full English",
        price: 750,
        description: "Two eggs, sausage, bacon, beans, sauteed mushrooms and toast.",
      },
      {
        name: "Spanish Omelette & Toast",
        price: 450,
        description: "Three-egg omelette with peppers, onion and cheese.",
      },
      {
        name: "Pancake Stack",
        price: 400,
        description: "Three fluffy pancakes with honey or chocolate sauce.",
      },
      {
        name: "French Toast",
        price: 420,
        description: "Thick-cut brioche, cinnamon sugar and seasonal fruit.",
      },
      {
        name: "Mandazi & Chai (3 pc)",
        price: 200,
        description: "Warm coconut mandazi with a mug of masala chai.",
      },
    ],
  },
];

const SEED_ZONES: {
  name: string;
  fee: number;
  eta: number;
  notes?: string;
}[] = [
  { name: "Eastleigh Section 1 - 3", fee: 50, eta: 15, notes: "Walking distance. Fastest drop." },
  { name: "Eastleigh Section 4 - 8", fee: 100, eta: 25 },
  { name: "Pumwani / Kariokor", fee: 120, eta: 30 },
  { name: "Pangani / Muthaiga North", fee: 180, eta: 35 },
  { name: "Umoja / Kariobangi", fee: 150, eta: 40 },
  { name: "Buruburu / Donholm", fee: 180, eta: 45 },
  { name: "Nairobi CBD", fee: 200, eta: 40 },
  { name: "South B / South C", fee: 250, eta: 50, notes: "Orders above KES 1,500 only." },
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function seed(database: Database.Database): void {
  const already = database
    .prepare("SELECT COUNT(*) AS n FROM categories")
    .get() as { n: number };
  if (already.n > 0) {
    ensureAdmin(database);
    return;
  }

  const run = database.transaction(() => {
    const setSetting = database.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    );
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) setSetting.run(key, value);

    const insertCategory = database.prepare(
      "INSERT INTO categories (name, slug, blurb, sort_order) VALUES (?, ?, ?, ?)",
    );
    const insertItem = database.prepare(`
      INSERT INTO menu_items
        (category_id, name, slug, description, price_cents, image_url, badge,
         is_available, is_featured, sort_order)
      VALUES (@category_id, @name, @slug, @description, @price_cents, @image_url, @badge,
              @is_available, @is_featured, @sort_order)
    `);

    const categoryIds: Record<string, number> = {};

    SEED_MENU.forEach((group, groupIndex) => {
      const slug = slugify(group.category);
      const info = insertCategory.run(group.category, slug, group.blurb, groupIndex * 10);
      const categoryId = Number(info.lastInsertRowid);
      categoryIds[slug] = categoryId;

      group.items.forEach((item, itemIndex) => {
        insertItem.run({
          category_id: categoryId,
          name: item.name,
          slug: slugify(item.name),
          description: item.description,
          price_cents: KES(item.price),
          image_url: `/img/generated/${slug}.webp`,
          badge: item.badge ?? null,
          is_available: item.soldOut ? 0 : 1,
          is_featured: item.featured ? 1 : 0,
          sort_order: itemIndex * 10,
        });
      });
    });

    const insertZone = database.prepare(
      "INSERT INTO delivery_zones (name, fee_cents, eta_minutes, notes, sort_order) VALUES (?, ?, ?, ?, ?)",
    );
    SEED_ZONES.forEach((zone, index) => {
      insertZone.run(zone.name, KES(zone.fee), zone.eta, zone.notes ?? null, index * 10);
    });

    const insertBanner = database.prepare(`
      INSERT INTO banners (title, subtitle, image_url, link_url, cta_label, theme, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertBanner.run(
      "Fancy but affordable",
      "Signature coffees, hot kitchen and desserts worth the trip. Come hungry, leave happy.",
      "/img/generated/hero-main.webp",
      "/menu",
      "See the menu",
      "espresso",
      0,
    );
    insertBanner.run(
      "Happy Hour: 15% off coffees",
      "Every day between 2 PM and 5 PM. Spanish Latte included, no code needed.",
      "/img/generated/hero-happy-hour.webp",
      "/menu?category=signature-coffees",
      "Order a coffee",
      "caramel",
      10,
    );
    insertBanner.run(
      "Free delivery over KES 2,500",
      "We deliver across Eastleigh and the wider Nairobi east side. Order on WhatsApp in under a minute.",
      "/img/generated/hero-delivery.webp",
      "/delivery",
      "Check your zone",
      "mint",
      20,
    );

    const insertPromo = database.prepare(`
      INSERT INTO promotions
        (name, kind, code, discount_type, discount_value, scope, target_id,
         min_subtotal_cents, days_of_week, start_time, end_time, is_active)
      VALUES (@name, @kind, @code, @discount_type, @discount_value, @scope, @target_id,
              @min_subtotal_cents, @days_of_week, @start_time, @end_time, 1)
    `);

    insertPromo.run({
      name: "Coffee Happy Hour",
      kind: "happy_hour",
      code: null,
      discount_type: "percent",
      discount_value: 15,
      scope: "category",
      target_id: categoryIds["signature-coffees"],
      min_subtotal_cents: 0,
      days_of_week: "1,2,3,4,5,6,7",
      start_time: "14:00",
      end_time: "17:00",
    });

    insertPromo.run({
      name: "Welcome offer",
      kind: "code",
      code: "JATA10",
      discount_type: "percent",
      discount_value: 10,
      scope: "all",
      target_id: null,
      min_subtotal_cents: KES(1000),
      days_of_week: null,
      start_time: null,
      end_time: null,
    });

    insertPromo.run({
      name: "Big order bonus",
      kind: "auto",
      code: null,
      discount_type: "fixed",
      discount_value: 200,
      scope: "all",
      target_id: null,
      min_subtotal_cents: KES(3000),
      days_of_week: null,
      start_time: null,
      end_time: null,
    });
  });

  run();
  ensureAdmin(database);
}

function ensureAdmin(database: Database.Database): void {
  const count = database.prepare("SELECT COUNT(*) AS n FROM admin_users").get() as {
    n: number;
  };
  if (count.n > 0) return;

  const email = (process.env.SEED_ADMIN_EMAIL || "admin@jatacafe.co.ke").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe@Jata2026";
  const name = process.env.SEED_ADMIN_NAME || "Jata Cafe Manager";

  database
    .prepare(
      `INSERT INTO admin_users (email, name, password_hash, role, must_change_password)
       VALUES (?, ?, ?, 'owner', 1)`,
    )
    .run(email, name, hashPassword(password));

  console.log(
    `\n[jata] Admin account created.\n       Email:    ${email}\n       Password: ${password}\n       You will be asked to change this on first login.\n`,
  );
}

export { slugify };
