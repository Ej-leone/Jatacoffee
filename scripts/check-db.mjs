/**
 * Asserts that the Supabase database holds the expected seed state.
 *
 *   npm run db:check
 *
 * Exits 1 on any mismatch, so it doubles as a post-deploy smoke test.
 */
import postgres from "postgres";

const EXPECTED = {
  settings: 19,
  categories: 6,
  menu_items: 48,
  banners: 3,
  delivery_zones: 8,
  promotions: 3,
};
const AT_LEAST = { admin_users: 1 };

const url = process.env.DATABASE_URL || process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL. Set it in .env (Supabase dashboard -> Connect).");
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false, ssl: "require", onnotice: () => {} });

let failed = false;
try {
  const rows = [];

  for (const [table, want] of Object.entries(EXPECTED)) {
    const [{ count }] = await sql`select count(*)::int as count from ${sql(table)}`;
    const ok = count === want;
    if (!ok) failed = true;
    rows.push({ table, want: String(want), got: String(count), ok: ok ? "ok" : "MISMATCH" });
  }

  for (const [table, min] of Object.entries(AT_LEAST)) {
    const [{ count }] = await sql`select count(*)::int as count from ${sql(table)}`;
    const ok = count >= min;
    if (!ok) failed = true;
    rows.push({ table, want: `>=${min}`, got: String(count), ok: ok ? "ok" : "MISMATCH" });
  }

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad("table", 16)}${pad("expected", 10)}${pad("actual", 8)}status`);
  for (const r of rows) {
    console.log(`${pad(r.table, 16)}${pad(r.want, 10)}${pad(r.got, 8)}${r.ok}`);
  }

  if (failed) {
    console.error("\nSeed state does not match. Run `npm run db:seed`, or investigate.");
    process.exitCode = 1;
  } else {
    console.log("\nAll counts match.");
  }
} catch (err) {
  console.error("db:check failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
