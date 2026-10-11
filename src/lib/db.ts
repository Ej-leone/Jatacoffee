import "server-only";

import postgres from "postgres";

export { hashPassword, slugify, verifyPassword } from "./password";

/* ------------------------------------------------------------------ *
 * Connection (singleton, survives Next.js dev hot-reloads)
 * ------------------------------------------------------------------ *
 *
 * DATABASE_URL must point at Supabase's Supavisor *transaction* pooler
 * (port 6543), not the direct connection on 5432 and not session mode.
 * Every serverless invocation is its own short-lived process, so direct
 * connections exhaust Postgres' connection limit long before the traffic
 * justifies it. Transaction mode hands a server connection back to the
 * pool at the end of each statement, which is what makes that safe.
 *
 * Three settings follow from that choice:
 *
 *   max: 1        One Lambda serves one request at a time, so a larger
 *                 local pool would just park idle sockets on the pooler.
 *   prepare: false Transaction mode has no session to hold a prepared
 *                 statement, so named prepares fail. postgres.js sends
 *                 the query text with bound parameters instead.
 *   idle_timeout  Release the socket after 20s rather than holding a
 *                 pooler slot for the lifetime of a warm-but-idle Lambda.
 *
 * DDL and seeding want the direct or session connection instead - see
 * MIGRATION_DATABASE_URL in the scripts under scripts/.
 */

type JataTypes = { bigint: postgres.PostgresType<number> };

type JataSql = ReturnType<typeof connect>;

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Put the Supabase Supavisor transaction pooler " +
        "connection string (port 6543) in .env.local for local work and in the " +
        "Vercel project environment variables for deploys. See .env.example.",
    );
  }

  return postgres(url, {
    max: 1,
    prepare: false,
    ssl: "require",
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { application_name: "jata-cafe" },

    /**
     * postgres.js returns int8 as a string by default, which would make
     * `promo.target_id === category.id` false and turn every count(*) into
     * text. Ids are `bigint generated always as identity`, so they come back
     * through this parser. 2^53 cents is far beyond cafe scale.
     */
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (value: number) => value.toString(),
        parse: (raw: string) => Number(raw),
      },
    } satisfies JataTypes,
  });
}

type GlobalWithSql = typeof globalThis & { __jataSql?: JataSql };
const g = globalThis as GlobalWithSql;

export const sql: JataSql = (g.__jataSql ??= connect());
