/**
 * Applies a .sql file to the Supabase Postgres database.
 *
 *   node --env-file-if-exists=.env scripts/db-apply.mjs supabase/migrations/0001_init.sql
 *
 * Uses MIGRATION_DATABASE_URL when set, falling back to DATABASE_URL. DDL and
 * multi-statement scripts want a direct or session-mode connection; the
 * transaction pooler on :6543 is for the running app, not for schema changes.
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/db-apply.mjs <path-to.sql>");
  process.exit(2);
}

const resolved = path.resolve(process.cwd(), file);
if (!fs.existsSync(resolved)) {
  console.error(`No such file: ${resolved}`);
  process.exit(2);
}

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(
    "No database connection string.\n" +
      "Set MIGRATION_DATABASE_URL (preferred - the direct connection on :5432)\n" +
      "or DATABASE_URL in .env, then try again.\n" +
      "Both are in the Supabase dashboard behind the Connect button.",
  );
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false, ssl: "require", onnotice: () => {} });

try {
  const contents = fs.readFileSync(resolved, "utf8");
  await sql.unsafe(contents);
  console.log(`applied ${path.relative(process.cwd(), resolved)}`);
} catch (err) {
  console.error(`failed applying ${file}:`);
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
