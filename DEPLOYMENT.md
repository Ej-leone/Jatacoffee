# Jata Cafe — deployment plan

Deploy the Next.js app on Vercel, with Supabase Postgres as the only database. This plan covers the database cutover. It does not add image uploads; menu and banner photos stay as the WebP files generated at build time, and `image_url` remains a path string.

The app no longer opens a SQLite file. A Vercel deploy without the steps below will fail at build, because the storefront is prerendered and every page reads `settings`.

## What you are deploying

- **App:** Next.js on Vercel. Storefront pages revalidate every 120 seconds. `/ms` is always dynamic. Admin saves call `revalidateStorefront()`, so a menu edit shows up without waiting for that window.
- **Database:** Supabase Postgres. The running app uses the transaction pooler (port **6543**) through `DATABASE_URL`. Schema and seed are applied once, from your machine, through the direct connection.
- **Not included:** Supabase Storage, an upload button, or a copy of an existing `data/jata.sqlite`. Orders, customers, sessions and events in that file are not imported. The menu, zones, banners, promotions and settings come from `supabase/seed.sql`.

## Before you start

- A Supabase project (free tier is enough to start).
- A Vercel account, with this git repository connected.
- Node.js 22 or newer locally (`package.json` requires `>=22`).
- `npm ci` already run in this checkout.

Pick the Supabase region closest to where the Vercel functions will run. A paused free-tier project refuses connections, and the production build opens the database, so a paused project fails the deploy.

## 1. Create the database

In the Supabase dashboard, open **Connect** and copy two strings. Do not invent the host; it differs per project.

| Variable | Which string | Where it is used |
| --- | --- | --- |
| `MIGRATION_DATABASE_URL` | **Direct connection**, port **5432** | Only on your machine, for `db:migrate` and `db:seed`. Not set on Vercel. |
| `DATABASE_URL` | **Transaction pooler**, port **6543** | The app, locally and on Vercel. |

If the direct connection fails because your network has no IPv6, use the **session pooler** (still port 5432, on the pooler host) as `MIGRATION_DATABASE_URL`. Do not point migrate or seed at port 6543. Transaction mode rejects the multi-statement schema script.

Put both in `.env.local` (gitignored). Also set:

```
SEED_ADMIN_EMAIL=owner@jatacafe.co.ke
SEED_ADMIN_PASSWORD=<a password you have not committed>
SEED_ADMIN_NAME=Jata Cafe Manager
NEXT_PUBLIC_SITE_URL=https://<your-production-domain>
```

`SEED_ADMIN_PASSWORD` has no safe default. If you leave it empty, `npm run db:seed` hashes the password that used to live in the repository. Set your own before seeding.

## 2. Apply the schema and seed, once

From this directory:

```
npm run db:migrate
npm run db:seed
npm run db:check
```

`db:migrate` runs `supabase/migrations/0001_init.sql`. It is safe to re-run: every statement is `IF NOT EXISTS`.

`db:seed` applies `supabase/seed.sql`, then creates one owner row from `SEED_ADMIN_*`. Re-running it does not duplicate the menu (`ON CONFLICT DO NOTHING`) and does not reset a password that already exists.

`db:check` must print:

| table | expected |
| --- | --- |
| settings | 19 |
| categories | 6 |
| menu_items | 48 |
| banners | 3 |
| delivery_zones | 8 |
| promotions | 3 |
| admin_users | at least 1 |

The schema turns on row-level security for every table and grants nothing to the `anon` and `authenticated` roles. The app connects as the database owner in `DATABASE_URL`, so those policies do not apply to it. They do close the public REST API. Do not add a policy, and do not put the service-role or secret key in any `NEXT_PUBLIC_` variable. This deploy does not read `SUPABASE_SERVICE_ROLE_KEY`.

Identity sequences are advanced at the end of the seed. The next item you create in `/ms` will not collide with the seeded ids. That matters because the happy-hour promotion points at category id 1.

## 3. Configure Vercel

Create the project from this repository. Framework preset: Next.js. Build command: `npm run build` (the `prebuild` script generates the placeholder WebPs). Install command: `npm ci`. Node.js version: **22.x**.

Set these for **Production**, and include them in the **Build** environment, not only Runtime. `next build` prerenders `/`, `/menu`, `/offers`, `/delivery` and `/visit`, and each of those calls `getSettings()`.

| Variable | Required for this deploy | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Transaction pooler, port 6543. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical URL. Inlined at build time. Changing it later does nothing until the next build. |
| `MIGRATION_DATABASE_URL` | No | Leave unset on Vercel. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | No | Consumed only by `npm run db:seed` on your machine. |
| `GOOGLE_SITE_VERIFICATION` | No | Omit to skip the meta tag. Also inlined at build time. |
| `SESSION_SECRET` | No | No code reads it. Sessions are a random token; only the SHA-256 hash is stored. |

`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are documented in `.env.example` for a later upload feature. Nothing in this deploy reads them.

Do not set `DATABASE_PATH`. Nothing reads it.

## 4. Deploy

Push the branch Vercel is tracking, or trigger a deploy from the dashboard. The build has to reach Supabase. If it fails with a connection error, the project is paused, `DATABASE_URL` is missing from the build environment, or the string is the direct port instead of 6543.

After the deploy is green:

1. Open `/`. Banners, categories and featured items render from Postgres.
2. Open `/menu`. Six categories, 48 items.
3. Open `/ms/login`. Sign in with `SEED_ADMIN_EMAIL` and the password you set. The first login forces a password change. That change deletes every session for the account.
4. Change one price in `/ms/menu`, save, and reload `/menu`. The new price should already be there.
5. Place a test order through checkout. It should return a WhatsApp link and insert a row in `orders`. Confirm in the Supabase table editor, then mark it cancelled in `/ms/orders` so it does not sit in the kitchen list.

A wrong password eight times in fifteen minutes is throttled. That counter lives in `login_attempts`.

## 5. How the app uses the database

All SQL goes through `src/lib/queries.ts` and `src/lib/auth.ts`, on the client in `src/lib/db.ts`.

- One connection per warm function (`max: 1`), prepared statements off, SSL required. That is what the transaction pooler allows.
- Money stays integer cents. Fixed discounts stay whole shillings inside `discount_value`; `pricing.ts` multiplies those by 100.
- Booleans and timestamps are real Postgres types. Selects cast flags back to `0`/`1` and timestamps back to `YYYY-MM-DD HH24:MI:SS` so the existing pages keep working.
- Checkout re-reads prices from `menu_items` and stores the basket as `items_json`.
- Dashboard "today" is still a UTC day, same as the old SQLite `date('now')`. It rolls at 03:00 in Nairobi. Promotions themselves use Africa/Nairobi.

There is no migrate-on-boot. A new environment is empty until you run step 2 against it.

## 6. Second environment (preview)

Give the preview environment its own Supabase project, or accept that preview writes land in production. Do not share one database between a preview URL and the live site if anyone will click through checkout. Repeat step 2 for that project, and set that project's `DATABASE_URL` on the Vercel Preview environment.

## 7. When something fails

| Symptom | Cause |
| --- | --- |
| Build error: `DATABASE_URL is not set` | The variable is missing from Vercel's build environment. |
| Build error: timeout or `ENOTFOUND` | Supabase is paused, or the pooler host is wrong. Wake the project and redeploy. |
| Build succeeds, then every page 500s | `DATABASE_URL` was available at build but not at runtime, or it points at a database that was never seeded. |
| `/ms/login` says the email or password is wrong | Seed did not run, or it ran before `SEED_ADMIN_PASSWORD` was set. `db:seed` will not overwrite an existing owner. Create the user again only if `admin_users` is empty. |
| Saving a promotion code returns a 500 | The code is already used. The form should report that; if it does not, the unique index `idx_promo_code` rejected the row. |
| Orders from the old SQLite file are missing | Expected. This cutover does not read `data/jata.sqlite`. |

## 8. Rollback

Vercel: promote the previous deployment. That deployment still expects SQLite, so it will not run on Vercel either. Rollback only works after this Postgres build is the one that has been live. Until the first good deploy, there is no Vercel rollback target.

Supabase: the seed is idempotent and the migration is idempotent. They do not drop tables. Restoring a bad data edit is a Supabase backup restore (point-in-time recovery on a paid plan, or a manual fix on the free plan). Take a backup from the Supabase dashboard once the menu has been edited for real.
