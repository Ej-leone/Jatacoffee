/**
 * Seeds a fresh Supabase database: menu content, then the first owner account.
 *
 *   npm run db:seed
 *
 * Run this ONCE, after `npm run db:migrate`. It is safe to re-run - every
 * insert is ON CONFLICT DO NOTHING - but it will not overwrite anything you
 * have since edited through the /ms dashboard.
 *
 * The menu content lives in supabase/seed.sql (generated from the cafe's
 * original database, so prices and copy are exact). This script applies that
 * file and then creates the admin user from SEED_ADMIN_* , which cannot live
 * in plain SQL because the password must be scrypt-hashed.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(
    "No database connection string.\n" +
      "Set MIGRATION_DATABASE_URL (the direct connection on :5432) or\n" +
      "DATABASE_URL in .env. Both are behind the Connect button in Supabase.",
  );
  process.exit(2);
}

/**
 * scrypt, matching src/lib/password.ts exactly. Format: scrypt:<salt>:<hash>.
 * Changing any parameter here invalidates every existing password, so don't.
 */
function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain.normalize("NFKC"), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

const email = (process.env.SEED_ADMIN_EMAIL || "admin@jatacafe.co.ke").toLowerCase().trim();
const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe@Jata2026";
const name = process.env.SEED_ADMIN_NAME || "Jata Cafe Manager";

const usingDefaultPassword = !process.env.SEED_ADMIN_PASSWORD;

const sql = postgres(url, { max: 1, prepare: false, ssl: "require", onnotice: () => {} });

try {
  // ---- menu content -----------------------------------------------------
  const seedFile = path.resolve(process.cwd(), "supabase/seed.sql");
  if (!fs.existsSync(seedFile)) {
    console.error(`Missing ${seedFile}`);
    process.exit(2);
  }
  await sql.unsafe(fs.readFileSync(seedFile, "utf8"));
  console.log("applied supabase/seed.sql");

  // ---- first owner account ----------------------------------------------
  const existing = await sql`select id from admin_users where email = ${email}`;
  if (existing.length > 0) {
    console.log(`admin_users already has ${email} - left untouched`);
  } else {
    await sql`
      insert into admin_users (email, name, password_hash, role, must_change_password)
      values (${email}, ${name}, ${hashPassword(password)}, 'owner', true)
      on conflict (email) do nothing
    `;
    console.log("");
    console.log("  ┌──────────────────────────────────────────────────────┐");
    console.log("  │  Owner account created. Sign in at /ms/login         │");
    console.log("  └──────────────────────────────────────────────────────┘");
    console.log(`     email:    ${email}`);
    console.log(`     password: ${password}`);
    console.log("");
    console.log("  You will be forced to change this password on first login.");
    if (usingDefaultPassword) {
      console.log("");
      console.log("  WARNING: SEED_ADMIN_PASSWORD was not set, so the built-in");
      console.log("  default was used. That value is public knowledge - it is in");
      console.log("  the repository. Log in and change it before going live.");
    }
    console.log("");
  }

  // ---- summary ----------------------------------------------------------
  const [counts] = await sql`
    select (select count(*)::int from settings)       as settings,
           (select count(*)::int from categories)     as categories,
           (select count(*)::int from menu_items)     as menu_items,
           (select count(*)::int from banners)        as banners,
           (select count(*)::int from delivery_zones) as delivery_zones,
           (select count(*)::int from promotions)     as promotions,
           (select count(*)::int from admin_users)    as admin_users
  `;
  console.log("seeded:", Object.entries(counts).map(([k, v]) => `${k}=${v}`).join("  "));
} catch (err) {
  console.error("seed failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
