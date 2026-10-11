# Implementation Plan — Jata Cafe: SQLite → Supabase Postgres + Supabase Storage (Vercel Hobby)

Worktree: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration` (branch `feat/supabase-migration`, HEAD `7a99422`).
Step agents run with cwd = the main workspace, so **every path below is absolute** and **every git command uses `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration`**. Shell is PowerShell: chain with `;`, never `&&`.

Steps are ordered by dependency and each one ends green (`npm run typecheck` exit 0) and committed. If an agent restarts, re-run `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration log --oneline` and resume at the first unticked step.

## Workflow step → plan step map

| Workflow step | Plan steps |
| --- | --- |
| `impl-db-driver` | 1, 2 |
| `impl-schema-seed` | 3, 4, 5 |
| `impl-queries-async` | 6, 7, 8, 9 |
| `impl-auth-actions-async` | 10 |
| `impl-callers-await` | 11 |
| `impl-uploads-storage` | 13, 14 |
| `impl-remove-sqlite` | 12, 15 |
| `impl-env-example` | 16 |
| `impl-deployment-md` | 17 |
| `verify` | 18 |

---

## Verification contract

There is **no test framework in this repo** (no `test` script, no vitest/jest/playwright config) and adding one is out of scope. The gates are:

- `npm run typecheck` → `tsc --noEmit`, exit 0. Works offline, no database needed. **This is the per-step gate.** Baseline confirmed green at HEAD.
- `npm run db:check` → new in step 5. Connects to Postgres and asserts the seed row counts. Needs a reachable database.
- `npm run build` → `next build`. **Requires a reachable `DATABASE_URL`** (see "Build-time database dependency" below). This machine has no `docker`, no `psql` and no `supabase` CLI, so there is no offline substitute — a build failure whose message is a connection error is an environment gap, not a code defect, and must be reported as such rather than "fixed" by changing page caching.

Run every command from the worktree: `cd c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration; npm run typecheck`.

---

## Decisions

Settled upstream, encoded here, not to be reopened:

1. **Access layer: `postgres` (postgres.js)** against the Supavisor **transaction** pooler on **6543**, `max: 1`, `prepare: false`, `ssl: 'require'`, client cached at module level. Confirmed feasible: `queries.ts`, `auth.ts` and `admin-actions.ts` are all hand-written SQL with no ORM, so the diff is mechanical. Transaction mode has no prepared statements, hence `prepare: false`.
2. **All DB access stays behind `src/lib/db.ts` + `src/lib/queries.ts`.** No `runtime = "edge"` anywhere. There is no `middleware.ts` today — do not add one.
3. **scrypt password hashing preserved byte-for-byte** (`scrypt:salt:hash`, `scryptSync(plain.normalize("NFKC"), salt, 64)`, `timingSafeEqual`). Custom hashed-token sessions preserved (SHA-256 of 32 random bytes in `sessions`, raw token in httpOnly `jata_session`). `must_change_password`, the 8-failures-per-15-minutes `login_attempts` throttle, and "password change deletes all sessions for that user" all survive.
4. **Money stays integer minor units.** All `*_cents` columns are `integer`. Never `numeric`, never `float`. `orders.items_json` stays a denormalised text snapshot.
5. **Uploads → Supabase Storage.** `sharp` resizes to WebP (1600px long edge) before upload, server-side MIME + size checks. `sharp` stays in `serverExternalPackages`; `better-sqlite3` is removed from it.
6. **Schema + seed only. No data migration, no SQLite export.** The handful of orders/customers/events rows are test data and are discarded.
7. **`supabase/migrations/0001_init.sql`** plus an explicitly-run seed, replacing the "CREATE TABLE IF NOT EXISTS + conditional seed on boot" pattern. Seed content preserved exactly: 19 settings, 6 categories, 48 menu items, 3 banners, 8 delivery zones, 3 promotions, 1 admin. (All seven counts verified against `db.ts` during exploration.)

Decided here, with reasons:

8. **Row shapes are normalised in SQL, not in TypeScript.** `types.ts` declares `is_active: number`, `created_at: string` and so on, and ~30 call sites across 12 files compare `=== 1` / `=== 0` (including client components: `menu-item-card.tsx`, `live-offers.tsx`, five admin forms, six admin pages). Columns become correct Postgres types (`boolean`, `timestamptz`, `date`) and **every `SELECT *` is replaced by an explicit column list that casts back to the shape the app already expects**: `is_active::int AS is_active`, `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at`, `to_char(starts_at, 'YYYY-MM-DD') AS starts_at`. Rationale: the database gets the right types, `types.ts` and all comparison sites stay untouched, and there is no way for a missed `=== 1` to silently invert a sold-out badge. Define the column lists once as shared `sql` fragments in `queries.ts`.
9. **`int8` is parsed to a JS number** via a postgres.js custom type. postgres.js returns `bigint` — and therefore every `count(*)` and `sum()` — as a **string** by default ([postgres.js: Numbers, bigint, numeric](https://github.com/porsager/postgres#numbers-bigint-numeric); content rephrased for licensing compliance). Ids are `bigint generated always as identity` per decision 7, so without the override `Category.id` would arrive as `"3"` and `promo.target_id === category.id` would be false. Aggregates are **additionally** cast in SQL (`count(*)::int`, `coalesce(sum(total_cents),0)::int`, `round(coalesce(avg(total_cents),0))::int`) so the `daily` rows, which are used without `Number()`, are numbers. Precision is a non-issue at cafe scale (2^53 cents is ~90 trillion KES).
10. **`LIKE` → `ILIKE`** in `listOrders` and `listCustomers`. SQLite's `LIKE` is case-insensitive for ASCII; Postgres's is not. Without this, admin search silently stops matching "Mary" for "mary" — a behaviour regression.
11. **jsonb vs text, per column:** `orders.items_json` → **text** (`JSON.parse` at `admin-format.ts:safeOrderLines` and `queries.ts:getDashboardStats`); `orders.applied_promos` → **text** (`JSON.parse` at `admin-format.ts:safeAppliedPromos`); `events.meta_json` → **jsonb** (grep confirms it is write-only — `logEvent` is the only call site, nothing ever reads it — so jsonb is a free upgrade that leaves event analytics queryable). `logEvent` must then pass the object itself, not `JSON.stringify(meta)`; postgres.js serialises a JS object to jsonb.
12. **Date-only and time-only schedule fields:** `banners.starts_at/ends_at` and `promotions.starts_at/ends_at` → `date` columns, selected through `to_char(..., 'YYYY-MM-DD')` because `isPromotionLive` does `promo.starts_at.slice(0,10) > clock.date` and `formatDay` slices the string. `promotions.start_time/end_time` stay **text** with a `~ '^\d{2}:\d{2}$'` check, because `toMinutes`/`describeSchedule` parse `"HH:MM"` and a real `time` column would hand back `"14:00:00"`.
13. **UTC day boundaries preserved.** `date(created_at) = date('now')` becomes `(created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date`. Nairobi-local days would arguably serve the owner better; that is a behaviour change, so it is flagged below rather than made.
14. **RLS: enabled on all twelve tables with zero policies.** The app connects as the Postgres role in `DATABASE_URL` (the table owner), which is not subject to RLS, so the app is unaffected. `anon` and `authenticated` reach these tables only through PostgREST, and RLS-on-with-no-policies means they see nothing. `0001_init.sql` also issues `revoke all ... from anon, authenticated` as defence in depth. The service-role key is used **only** by the Storage upload path, server-side, and is **never** `NEXT_PUBLIC_`-prefixed. The only new public var is `NEXT_PUBLIC_SUPABASE_URL` (a hostname, not a credential), needed for `next/image` `remotePatterns`.
15. **Storage access via plain `fetch`, no `@supabase/supabase-js`.** A `POST` to `/storage/v1/object/<bucket>/<path>` with `Authorization: Bearer <service_role>` is about fifteen lines; the SDK would pull in auth/realtime/postgrest for one upload call.
16. **Incremental-but-green conversion strategy.** `queries.ts` and `auth.ts` are fully synchronous today; postgres.js is async, so flipping a function's signature breaks every caller's typecheck in the same instant. To keep every commit green, the async ports are written as **new files first** (`src/lib/pg-client.ts`, `src/lib/password.ts`, `src/lib/queries-pg.ts`, `src/lib/auth-pg.ts`) while the SQLite files still compile and serve. One mechanical step then flips all imports and adds `await`. A final step deletes the old files and renames the new ones onto `db.ts` / `queries.ts` / `auth.ts`, restoring the module layout decision 2 requires. This is the restart-safe ordering: the big risky file is authored in isolation, and losing it costs one file, not a broken tree.
17. **Node pinned to 22** via `.nvmrc`, with `engines.node` relaxed to `>=22.0.0` so the local Node 24.16 still runs. Vercel reads both.
18. **Broken `db:reset` removed**, not repaired — `scripts/reset-db.mjs` never existed and the SQLite-file notion it implied is gone. Replaced by `db:migrate`, `db:seed`, `db:check`.

---

## Steps

- [ ] 1. Add the `postgres` dependency, pin Node, and fix the scripts block.
      `npm install postgres@3.4.7` (exact, pinned). In `package.json`: set `engines.node` to `">=22.0.0"`, delete the broken `"db:reset": "node scripts/reset-db.mjs"` entry. Create `.nvmrc` containing `22`.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\package.json`, `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\package-lock.json`, `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\.nvmrc`
      Verify: `cd c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration; npm run typecheck` exits 0; `node -e "require.resolve('postgres')"` resolves; `npm pkg get scripts.db:reset` returns `{}`.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add package.json package-lock.json .nvmrc` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "build: add postgres.js, pin Node 22, drop broken db:reset script"`

- [ ] 2. Create the postgres.js client module.
      New file `src/lib/pg-client.ts`: `import "server-only"`, read `process.env.DATABASE_URL` (throw a clear, actionable error naming the variable if absent), create the client with `max: 1`, `prepare: false`, `ssl: "require"`, `idle_timeout: 20`, `connect_timeout: 10`, `connection: { application_name: "jata-cafe" }`, and the int8 override from decision 9: `types: { bigint: { to: 20, from: [20], serialize: (x: number) => x.toString(), parse: (x: string) => Number(x) } }`. Cache on `globalThis.__jataSql` so dev hot-reload and warm Lambdas reuse one connection. Export `sql`. Add a header comment explaining 6543/transaction-mode/`prepare: false`/`max: 1`.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\src\lib\pg-client.ts`
      Verify: `npm run typecheck` exits 0 (new module, no importers yet, SQLite path untouched and still serving).
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add src/lib/pg-client.ts` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "feat(db): add postgres.js client for Supabase transaction pooler"`

- [ ] 3. Write the Postgres schema migration.
      New file `supabase/migrations/0001_init.sql`, translating all twelve tables from `src/lib/db.ts` (`settings`, `categories`, `menu_items`, `banners`, `delivery_zones`, `promotions`, `customers`, `orders`, `events`, `admin_users`, `sessions`, `login_attempts`). Idiom translation: `INTEGER PRIMARY KEY AUTOINCREMENT` → `bigint generated always as identity primary key`; `0/1 INTEGER` flags → `boolean` with the same defaults; `TEXT NOT NULL DEFAULT (datetime('now'))` → `timestamptz not null default now()`; schedule date fields → `date`, `start_time`/`end_time` → `text` with the `HH:MM` check (decision 12); all `*_cents` → `integer` with the existing `>= 0` checks; `items_json`/`applied_promos` → `text`, `meta_json` → `jsonb` (decision 11). Keep every index and the partial unique index `on promotions(code) where code is not null`. Keep `sessions.user_id` → `admin_users(id) on delete cascade`, `menu_items.category_id` → `categories(id) on delete cascade`, and the two `on delete set null` zone/customer references. End with `alter table ... enable row level security;` for all twelve tables, no policies, plus `revoke all on all tables in schema public from anon, authenticated;` (decision 14). Use `create table if not exists` so a partial apply can be retried.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\supabase\migrations\0001_init.sql`
      Verify: `npm run typecheck` exits 0 (SQL is not compiled). Reviewer check: every table, column, index, default, check constraint and foreign key in the `migrate()` template string of the pre-change `src/lib/db.ts` has a counterpart, and no column is `numeric`/`real`/`float`.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add supabase/migrations/0001_init.sql` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "feat(db): add 0001_init.sql Postgres schema with RLS enabled"`

- [ ] 4. Write the one-shot seed script.
      New file `scripts/seed.mjs` (plain ESM; `tsconfig.json` excludes `scripts/`, so no typecheck burden). Port `DEFAULT_SETTINGS` (19 keys), `SEED_MENU` (6 categories / 48 items), `SEED_ZONES` (8), the 3 banners, the 3 promotions and `slugify` **verbatim** from the pre-change `src/lib/db.ts` — copy the strings, do not retype them. Wrap in `sql.begin`. Make it re-runnable without duplicating the menu: `insert ... on conflict (key) do update` for settings, `on conflict (slug) do nothing` for categories and menu items, and guard zones/banners/promotions with `select count(*)` short-circuits. Resolve `signature-coffees`' category id by slug for the happy-hour promotion's `target_id`. Create exactly one admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` with `on conflict (email) do nothing`, `must_change_password = true`, hashing with the same scrypt recipe (inline it; `scripts/` must not import from `src/`). Print the credentials block the old `ensureAdmin` printed. Connect through `process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL` so DDL/seed can use the direct or session connection rather than the transaction pooler.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\scripts\seed.mjs`
      Verify: `npm run typecheck` exits 0. `node -c` is not available for ESM, so syntax-check with `node --input-type=module -e "await import('file:///c:/Users/Eliza/Desktop/Jata/.worktrees/supabase-migration/scripts/seed.mjs')"` **only after** `DATABASE_URL` exists; otherwise defer execution to step 18 and confirm the counts (19/6/48/3/8/3/1) by reading the file.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add scripts/seed.mjs` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "feat(db): add re-runnable Supabase seed script"`

- [ ] 5. Add the migrate / seed / check npm scripts.
      New file `scripts/db-apply.mjs`: reads a `.sql` path from `argv[2]`, executes it with `sql.unsafe(contents)` over `MIGRATION_DATABASE_URL ?? DATABASE_URL`. New file `scripts/check-db.mjs`: asserts `settings = 19`, `categories = 6`, `menu_items = 48`, `banners = 3`, `delivery_zones = 8`, `promotions = 3`, `admin_users >= 1`, prints a table, exits 1 on any mismatch. Add to `package.json`: `"db:migrate": "node scripts/db-apply.mjs supabase/migrations/0001_init.sql"`, `"db:seed": "node scripts/seed.mjs"`, `"db:check": "node scripts/check-db.mjs"`.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\scripts\db-apply.mjs`, `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\scripts\check-db.mjs`, `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\package.json`
      Verify: `npm run typecheck` exits 0; `npm run db:check` with no `DATABASE_URL` fails with the explicit "set DATABASE_URL" message from step 2, not a stack trace.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add scripts/db-apply.mjs scripts/check-db.mjs package.json` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "feat(db): add db:migrate, db:seed and db:check scripts"`

- [ ] 6. Extract the password helpers and shared SQL fragments.
      New file `src/lib/password.ts`: `hashPassword`, `verifyPassword` and `slugify` copied **unchanged** from `src/lib/db.ts` (no node:crypto change, no normalisation change). New file `src/lib/queries-pg.ts`: header comment, `import "server-only"`, import `sql` from `./pg-client`, and the shared column-list fragments from decision 8 — one exported-internal `const` per table (`CATEGORY_COLS`, `MENU_ITEM_COLS`, `BANNER_COLS`, `ZONE_COLS`, `PROMO_COLS`, `CUSTOMER_COLS`, `ORDER_COLS`) each a `sql` fragment with the `::int` / `to_char` casts. No query functions yet.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\src\lib\password.ts`, `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\src\lib\queries-pg.ts`
      Verify: `npm run typecheck` exits 0.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add src/lib/password.ts src/lib/queries-pg.ts` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "refactor(db): extract scrypt helpers and shared SQL column fragments"`

- [ ] 7. Port the catalogue queries (settings, categories, menu items).
      In `src/lib/queries-pg.ts` add async ports of `getSettings`, `updateSettings`, `listCategories`, `getCategoryBySlug`, `createCategory`, `updateCategory`, `deleteCategory`, `uniqueSlug`, `listMenu`, `listFeatured`, `getMenuItem`, `getMenuItemsByIds`, `createMenuItem`, `updateMenuItem`, `setMenuItemAvailability`, `deleteMenuItem`, and re-export the `MenuItemInput` type. Same names, same signatures, each returning a `Promise`. Techniques: `insert ... on conflict (key) do update set value = excluded.value` replaces `INSERT OR REPLACE`; `returning id` replaces `lastInsertRowid`; `where i.id in ${sql(ids)}` replaces the `?` placeholder join; optional `WHERE` clauses compose as nested fragments (`${opts.availableOnly ? sql`where c.is_active` : sql``}`); `updateSettings` wraps its loop in `sql.begin`.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\src\lib\queries-pg.ts`
      Verify: `npm run typecheck` exits 0 (still no importers; the SQLite path is still what runs).
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add src/lib/queries-pg.ts` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "feat(db): port settings, category and menu queries to Postgres"`

- [ ] 8. Port banners, zones and promotions.
      In `src/lib/queries-pg.ts` add `listBanners`, `getBanner`, `createBanner`, `updateBanner`, `deleteBanner`, `listZones`, `getZone`, `createZone`, `updateZone`, `deleteZone`, `listPromotions`, `getPromotion`, `toPublicPromotion`, `listPublicPromotions`, `findPromotionByCode`, `createPromotion`, `updatePromotion`, `deletePromotion`, `incrementPromotionUsage`, and the `BannerInput` / `ZoneInput` / `PromotionInput` types. The banner active-window filter becomes `where is_active and (starts_at is null or starts_at <= current_date) and (ends_at is null or ends_at >= current_date)` — the `= ''` empty-string arms disappear because the column is now `date`. `incrementPromotionUsage` becomes one statement: `update promotions set usage_count = usage_count + 1 where id in ${sql(ids)}`.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\src\lib\queries-pg.ts`
      Verify: `npm run typecheck` exits 0.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add src/lib/queries-pg.ts` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "feat(db): port banner, zone and promotion queries to Postgres"`

- [ ] 9. Port orders, customers, events and the dashboard.
      In `src/lib/queries-pg.ts` add `recordOrder`, `listOrders`, `getOrder`, `setOrderStatus`, `listCustomers`, `updateCustomerNotes`, `deleteCustomer`, `logEvent`, `getDashboardStats`, `nextOrderReference`, and the `RecordOrderInput` / `DashboardStats` types. Specifics that must land here:
      `recordOrder` → `sql.begin`, `on conflict (phone) do update set ..., last_order_at = now()`, `returning id` for both the customer upsert and the order insert.
      Search filters use **`ILIKE`** (decision 10).
      `updateCustomerNotes` casts its nullable params — `coalesce(${patch.notes ?? null}::text, notes)`, `coalesce(${...}::boolean, marketing_opt_in)` — or Postgres rejects the untyped `NULL` with "could not determine data type".
      `logEvent` passes the meta object directly for the `jsonb` column (decision 11).
      `getDashboardStats`: `datetime('now','-7 days')` → `now() - interval '7 days'`; `date(created_at) = date('now')` → `(created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date`; `date(created_at) AS day` → `to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS day`; every aggregate cast — `count(*)::int`, `coalesce(sum(total_cents),0)::int`, `round(coalesce(avg(total_cents),0))::int` (decision 9).
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\src\lib\queries-pg.ts`
      Verify: `npm run typecheck` exits 0. Reviewer check: `src/lib/queries-pg.ts` exports every name `src/lib/queries.ts` exports, and contains no `strftime`, `datetime(`, `julianday` or bare `LIKE`.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add src/lib/queries-pg.ts` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "feat(db): port order, customer, event and dashboard queries to Postgres"`

- [ ] 10. Port the auth module.
      New file `src/lib/auth-pg.ts`: async ports of `createSession`, `destroySession`, `getCurrentUser`, `requireAdmin`, `attemptLogin`, `changePassword`, `passwordProblem` (pure, copy as-is), plus the `SessionUser` / `LoginResult` types and the `COOKIE_NAME` / `SESSION_DAYS` / `MAX_ATTEMPTS` / `ATTEMPT_WINDOW_MINUTES` constants at their current values. Import crypto helpers from `./password`, `sql` from `./pg-client`. `expires_at > datetime('now')` → `expires_at > now()`; the attempt window → `created_at > now() - make_interval(mins => ${ATTEMPT_WINDOW_MINUTES})`; the daily cleanup → `created_at < now() - interval '1 day'`; `last_login_at = datetime('now')` → `= now()`. `attemptLogin` and `changePassword` become `async`. Do not touch the scrypt recipe, the SHA-256 token hashing, the cookie flags, the throttle thresholds, or the "delete all sessions for this user on password change" behaviour.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\src\lib\auth-pg.ts`
      Verify: `npm run typecheck` exits 0 (no importers yet). Reviewer check: diff `auth-pg.ts` against `auth.ts` and confirm the only differences are `await`/`async`, the SQL dialect, and the import source.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add src/lib/auth-pg.ts` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "feat(auth): port session, login and password flows to Postgres"`

- [ ] 11. Flip every call site to the async modules.
      One mechanical commit — it has to be atomic, because the moment a function returns a `Promise` its unawaited callers stop typechecking. Repoint imports from `@/lib/queries` → `@/lib/queries-pg` and `@/lib/auth` → `@/lib/auth-pg`, and add `await` to each call. All page components are already `async`, so this is `await` insertion only; no component needs restructuring. `admin-actions.ts` also needs `await` on `attemptLogin`, `changePassword` and the dynamic `getPromotion` import in `togglePromotionAction`.
      Files (24): `src\lib\admin-actions.ts`, `src\app\sitemap.ts`, `src\app\api\checkout\route.ts`, `src\app\api\promo\route.ts`, `src\app\(site)\layout.tsx`, `src\app\(site)\page.tsx`, `src\app\(site)\menu\page.tsx`, `src\app\(site)\offers\page.tsx`, `src\app\(site)\delivery\page.tsx`, `src\app\(site)\visit\page.tsx`, `src\app\(site)\checkout\page.tsx`, `src\app\ms\(dashboard)\layout.tsx`, `src\app\ms\(dashboard)\page.tsx`, `src\app\ms\(dashboard)\banners\page.tsx`, `src\app\ms\(dashboard)\categories\page.tsx`, `src\app\ms\(dashboard)\customers\page.tsx`, `src\app\ms\(dashboard)\delivery\page.tsx`, `src\app\ms\(dashboard)\menu\page.tsx`, `src\app\ms\(dashboard)\orders\page.tsx`, `src\app\ms\(dashboard)\promotions\page.tsx`, `src\app\ms\(dashboard)\settings\page.tsx`, `src\app\ms\(onboarding)\layout.tsx`, `src\app\ms\(onboarding)\password\page.tsx`, `src\app\ms\(public)\login\page.tsx` (all under `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\`)
      Verify: `npm run typecheck` exits 0. A missing `await` surfaces here as `Property 'x' does not exist on type 'Promise<...>'`, so a green typecheck is a real signal. Reviewer check: `git -C ... grep -n "@/lib/queries\"\|@/lib/auth\"" -- src` returns nothing.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add src` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "refactor: await the async Postgres query and auth modules at every call site"`

- [ ] 12. Retire the SQLite modules and restore the canonical file names.
      Delete `src/lib/db.ts`, `src/lib/queries.ts`, `src/lib/auth.ts`. `git mv` `queries-pg.ts` → `queries.ts`, `auth-pg.ts` → `auth.ts`, `pg-client.ts` → `db.ts` (decision 2: DB access lives behind `db.ts` + `queries.ts`). Re-export `hashPassword` / `verifyPassword` / `slugify` from `db.ts` so its public surface matches the old one. Update the imports touched in step 11 back to `@/lib/queries` and `@/lib/auth`, and the intra-lib imports to `./db`.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\src\lib\db.ts`, `...\src\lib\queries.ts`, `...\src\lib\auth.ts`, `...\src\lib\password.ts`, plus the 24 call sites from step 11
      Verify: `npm run typecheck` exits 0; `git -C ... grep -rn "better-sqlite3" -- src` returns nothing.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add -A src` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "refactor(db): remove SQLite modules and restore db.ts/queries.ts/auth.ts names"`

- [ ] 13. Add the Supabase Storage upload helper and route.
      **Gap first:** exploration found **no upload handler anywhere in this repo.** `image_url` is a plain `type="text"` input in `banner-form.tsx` and `menu-item-form.tsx`, nothing writes to `public/uploads/`, and `sharp` is used only by `scripts/generate-placeholders.mjs`. So this is net-new work, not a migration of something that exists. It is sequenced last because the deploy does not depend on it.
      New file `src/lib/storage.ts`: `uploadImage(bytes, contentType, keyPrefix)` → `sharp(bytes).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()`, then `fetch` `POST ${SUPABASE_URL}/storage/v1/object/${bucket}/${key}` with `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, `content-type: image/webp`, `cache-control: public, max-age=31536000, immutable`; key is `${prefix}/${randomUUID()}.webp`; returns the public URL. New file `src/app/api/admin/upload/route.ts`: `POST`, **no `runtime` export** (nodejs default, per decision 2), gated by `await requireAdmin()`, reads `request.formData()`, rejects anything outside `image/jpeg|image/png|image/webp|image/avif` or over 8 MB **before** touching sharp, returns `{ ok: true, url }`. In `next.config.ts`: add `images.remotePatterns` for the `NEXT_PUBLIC_SUPABASE_URL` host — without it `next/image` throws on an uploaded URL at render time.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\src\lib\storage.ts`, `...\src\app\api\admin\upload\route.ts`, `...\next.config.ts`
      Verify: `npm run typecheck` exits 0. Reviewer check: the route has no `export const runtime`, validates MIME and size before decoding, and `SUPABASE_SERVICE_ROLE_KEY` appears only in server modules (`git -C ... grep -n "SERVICE_ROLE" -- src` must not hit any file containing `"use client"`).
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add src/lib/storage.ts src/app/api/admin/upload/route.ts next.config.ts` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "feat(uploads): add Supabase Storage upload route with sharp WebP resize"`

- [ ] 14. Wire the uploader into the two admin forms.
      New client component `src/components/admin/image-upload.tsx`: a file input plus a small `useTransition` handler that posts to `/api/admin/upload` and writes the returned URL into the sibling `image_url` input. **Keep the existing text input** — the owner can still paste `/img/generated/...` — so nothing the customer sees changes and no existing data breaks. Render it next to the `image_url` field in both forms. Accessibility: label the input, announce success/failure in an `aria-live="polite"` region, keep the field keyboard-reachable.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\src\components\admin\image-upload.tsx`, `...\src\components\admin\menu-item-form.tsx`, `...\src\components\admin\banner-form.tsx`
      Verify: `npm run typecheck` exits 0. Manual smoke (step 18, needs a deployed or locally-configured Supabase): upload a JPEG in `/ms/menu`, confirm the field fills with a `.webp` Supabase URL and the item renders on `/menu`.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add src/components/admin` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "feat(uploads): add image upload control to menu item and banner forms"`

- [ ] 15. Drop `better-sqlite3` and its leftovers.
      `npm uninstall better-sqlite3 @types/better-sqlite3`. In `next.config.ts` reduce `serverExternalPackages` to `["sharp"]`. In `.gitignore` remove the `data/` and `public/uploads/*` / `!public/uploads/.gitkeep` entries. In `scripts/generate-placeholders.mjs` remove the `fs.mkdirSync(.../public/uploads)` call (line ~17) — nothing writes there any more. Delete `public/uploads/` if present in the worktree.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\package.json`, `...\package-lock.json`, `...\next.config.ts`, `...\.gitignore`, `...\scripts\generate-placeholders.mjs`
      Verify: `npm run typecheck` exits 0; `npm ls better-sqlite3` reports it absent; `git -C ... grep -rn "better-sqlite3\|DATABASE_PATH\|jata.sqlite" -- src next.config.ts package.json` returns nothing.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add package.json package-lock.json next.config.ts .gitignore scripts/generate-placeholders.mjs` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "chore: remove better-sqlite3 dependency and local-disk leftovers"`

- [ ] 16. Rewrite `.env.example`.
      Remove `DATABASE_PATH`. Add `DATABASE_URL` (Supavisor transaction pooler, port **6543**, with a comment that 5432-direct and session mode are wrong for serverless), `MIGRATION_DATABASE_URL` (optional, direct/session connection for `db:migrate` and `db:seed`), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (with a blunt "server-only, never prefix this `NEXT_PUBLIC_`" warning), `SUPABASE_STORAGE_BUCKET=menu`. Keep `NEXT_PUBLIC_SITE_URL`, `SESSION_SECRET` (still unread by any code — say so), `SEED_ADMIN_*` (now consumed only by `npm run db:seed`, not on boot), `GOOGLE_SITE_VERIFICATION`.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\.env.example`
      Verify: `npm run typecheck` exits 0. Reviewer check: every `process.env.*` read in `src/` and `scripts/` has a line in `.env.example`, and no `NEXT_PUBLIC_` name carries a secret.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add .env.example` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "docs: document Supabase and Storage environment variables"`

- [ ] 17. Rewrite `DEPLOYMENT.md` for Vercel Hobby.
      The current 1102-line document is a VPS/systemd/nginx/Docker guide built on the premise that the app **cannot** run serverless (§1 "Read this before you choose a host"). That premise is now false and the guide is actively misleading. Replace with a Vercel-first document: Supabase project creation; run `npm run db:migrate` then `npm run db:seed` once (CLI with `MIGRATION_DATABASE_URL`, or paste `0001_init.sql` into the SQL editor — note that this machine has no `psql`/`supabase` CLI); create the public `menu` Storage bucket; the Vercel env-var table (which vars are build-time vs runtime, and that `NEXT_PUBLIC_*` is inlined at build); Node 22 via `.nvmrc`; first login at `/ms/login` and the forced password change; the RLS posture from decision 14; backups via Supabase PITR/dashboard instead of the `sqlite3` scripts; free-tier limits (Storage 1 GB — hence the 1600px WebP resize; Supabase pauses idle projects, which will fail a build). Keep the still-true gotchas: HTTPS is mandatory or the `secure` `jata_session` cookie is dropped and login loops silently; `NEXT_PUBLIC_SITE_URL` must be right at build time. Carry over the appendix items that remain open (`robots.ts` missing `/ms`, the stale `/ms` header rule in `next.config.ts`, the staff-login link in `site-footer.tsx`) as explicitly-not-applied suggestions. **Record that a second owner account `tobey@jatacafe.co.ke` existed in the old SQLite database and must be recreated by hand** — either through the Supabase dashboard or a second `npm run db:seed` run with different `SEED_ADMIN_*` values — because no data was migrated. Delete the systemd/nginx/Caddy/pm2/Docker/Fly/Railway sections and the SQLite backup machinery.
      Files: `c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration\DEPLOYMENT.md`
      Verify: `npm run typecheck` exits 0. Reviewer check: no occurrence of `better-sqlite3`, `DATABASE_PATH`, `systemd`, `sqlite3`, or "cannot run on a serverless platform"; the `tobey@jatacafe.co.ke` note is present; every command in the doc exists in `package.json`.
      Commit: `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add DEPLOYMENT.md` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "docs: rewrite DEPLOYMENT.md for Vercel Hobby and Supabase"`

- [ ] 18. Full verification pass.
      `npm run typecheck` (must be 0). Then, **if and only if** a `DATABASE_URL` is available: `npm run db:migrate`; `npm run db:seed`; `npm run db:check` (expect 19/6/48/3/8/3/≥1); `npm run build`. Manual smoke list for the owner, in order: `/` renders banners and featured items; `/menu` lists 48 items in 6 categories; `/offers` shows the happy-hour promotion with its schedule; `/delivery` lists 8 zones; `/checkout` posts to `/api/checkout` and returns a WhatsApp URL with an order reference; `/api/promo` accepts `JATA10`; `/ms/login` signs in and forces the password change; after the change, all sessions are gone and a fresh login is required; a wrong password eight times in fifteen minutes is throttled; `/ms/menu` toggles sold-out and the change appears on `/menu`; an image upload returns a Supabase URL that renders. Record every result in the step output. **If no database is reachable, say so plainly** — `npm run build` will fail at static generation with a connection error, and that is the environment gap described in the verification contract, not a defect to patch by changing page caching.
      Files: none (verification only)
      Verify: typecheck 0; build 0 or a clearly-reported connection failure; `db:check` counts exact.
      Commit: nothing to commit unless a defect is found and fixed, in which case `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration add <files>` then `git -C c:\Users\Eliza\Desktop\Jata\.worktrees\supabase-migration commit -m "fix: <what the verification pass found>"`

---

## Static generation tradeoff (home / menu / offers / delivery / visit)

**No change required, and none should be made.** All five storefront routes plus `(site)/layout.tsx` already carry `export const revalidate = 120`, and `src/app/ms/layout.tsx` already carries `export const dynamic = "force-dynamic"`. That is exactly the right shape for Vercel: ISR for the storefront, always-dynamic for the dashboard, with `revalidateStorefront()` pushing an immediate refresh after every admin mutation.

The time-dependent part is real but pre-existing. `/offers` and the `LiveOffers` component call `nairobiClock()` **server-side** at render, so the "On now" badge and the happy-hour card can lag the true 14:00 and 17:00 boundaries by up to the 120-second revalidation window. That is identical to today's behaviour on a VPS, so migrating to Vercel introduces no regression.

Moving the clock client-side would change what the customer sees, so it is flagged rather than done:

- The badge would flicker between server HTML and hydration, and would differ for anyone with JS blocked.
- `/offers` splits promotions into "Running right now" and "Coming back later" server-side; client-side evaluation would either render both sections empty on first paint or require shipping all promotion rows to the browser.
- Actual discounts are unaffected either way: `computePricing` runs in `src/app/api/checkout/route.ts` on every order and is the authoritative total. Only the *display* badge is cached.

If the owner wants minute-accurate badges, the cheap options are lowering `revalidate` on `/offers` alone (say 30s — still trivially within Hobby limits) or making only the badge a client component fed by the already-public promotion rows. Both are user-visible decisions and need the owner's say-so.

---

## Gaps, assumptions and flags for the user

1. **Build-time database dependency.** `next build` prerenders the five ISR storefront routes, and `(site)/layout.tsx` calls `getSettings()`, so the build opens a database connection. `DATABASE_URL` must be present in Vercel's **Build** environment, not just Runtime, and the Supabase project must be awake. A paused free-tier project fails the build. Documented in step 17.
2. **No upload handler exists today.** Steps 13–14 are net-new, not a migration (see step 13). Assumption: an upload control is wanted, since local-disk uploads were part of the brief's premise. If the owner would rather keep pasting URLs, steps 13–14 can be dropped with no effect on steps 1–12 or the deploy.
3. **No local Postgres.** No `docker`, `psql` or `supabase` CLI on this machine, so steps 3–5 cannot be executed against a real database until Supabase credentials exist. They are still committed as code and verified by review; execution lands in step 18.
4. **Day boundaries stay UTC** in the dashboard (decision 13). "Orders today" therefore rolls over at 03:00 Nairobi time, as it does now. Switching to Nairobi days is a one-line change per query and arguably what the owner wants — flagged, not done, because it changes reported numbers.
5. **`SESSION_SECRET` is still read by nothing.** Kept in `.env.example` with that stated plainly, as it is today.
6. **No tests.** Verification is typecheck + build + `db:check` + the manual smoke list in step 18. Adding a test framework was not requested and is not in this plan.
7. **Discarded test data.** The single orders/customers/events rows are not migrated, per the brief. The second owner account `tobey@jatacafe.co.ke` is recorded in `DEPLOYMENT.md` as recreate-by-hand (step 17).

*Content from external sources was rephrased for compliance with licensing restrictions.*
