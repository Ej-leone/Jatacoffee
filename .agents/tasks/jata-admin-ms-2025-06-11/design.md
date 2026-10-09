# Design: Jata Cafe admin dashboard at `/ms`

> Revision 2. Resolves all 15 findings in `design-review.md` (1 HIGH, 7 MEDIUM, 7 NIT). See *Responses to the design review* at the end for the disposition of each.

## Overview

The server-side half of the Jata admin already exists and works: `src/lib/auth.ts` owns sessions and password policy, `src/lib/admin-actions.ts` exposes every mutation as a React 19 server action, and `src/lib/queries.ts` owns all reads. What is missing is the UI — there are no page files under `src/app` for the dashboard, so every admin URL 404s. This design adds that UI as a new `src/app/ms/` subtree and rewrites the hard-coded `/admin` paths in the existing server code to `/ms`. Nothing in `auth.ts`, `queries.ts`, `db.ts`, `pricing.ts` or the storefront changes except (a) the `/admin` → `/ms` string rewrite, (b) the removal of the footer "Staff login" link, and (c) the `robots.ts` disallow rule.

The shape is deliberately boring: Server Components read through `queries.ts` and render HTML; forms post to the existing server actions. Client Components appear only where React needs a hook — `useActionState` for actions that return validation errors, `useFormStatus` for pending buttons, and `usePathname` for nav highlighting. There is no client-side data fetching, no state management library, and no new npm dependency.

## Technology stack (locked)

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.4.0 App Router |
| UI runtime | React 19.3.0 Server Components + Server Actions |
| Language | TypeScript 7.0.2, `strict: true`, `@/*` → `./src/*` |
| Styling | Tailwind CSS v4 via `@import "tailwindcss"` in `src/app/globals.css`, existing `@theme` tokens and `@layer components` classes only |
| Data | `better-sqlite3` through `src/lib/queries.ts` — no raw SQL in pages |
| Auth | Existing `requireAdmin()` / `jata_session` cookie. No middleware, no JWT, no new auth lib |
| Icons | `src/components/icons.tsx` only |
| Charts | None. Bars are CSS width percentages |
| Confirmation dialogs | Native `<details>` disclosure, not `window.confirm` |
| `useActionState` form submission | `onSubmit` + `startTransition` (see *Form submission mechanics*) |
| Tests | No runner available (see *Testability and verification*) |

Versions above are the ones actually installed in `node_modules`, not the `^` ranges in `package.json`. No new dependencies. `sharp` and `better-sqlite3` stay in `serverExternalPackages`.

## Route tree and files to create

Route groups in parentheses do not appear in the URL. All three groups live *inside* `src/app/ms/` so the whole admin surface is one directory and the URL prefix is unambiguous.

```
src/app/ms/
  layout.tsx                        → shell-free wrapper: noindex metadata + force-dynamic
  error.tsx                         → client error boundary for the whole /ms subtree
  (public)/
    login/page.tsx                  → /ms/login            PUBLIC, not gated
  (onboarding)/
    layout.tsx                      → requireAdmin() only (no must-change gate)
    password/page.tsx               → /ms/password          change password
  (dashboard)/
    layout.tsx                      → requireAdmin() + must-change gate + nav + account menu
    page.tsx                        → /ms                   stats + recent orders
    orders/page.tsx                 → /ms/orders
    menu/page.tsx                   → /ms/menu
    categories/page.tsx             → /ms/categories
    banners/page.tsx                → /ms/banners
    promotions/page.tsx             → /ms/promotions
    delivery/page.tsx               → /ms/delivery
    customers/page.tsx              → /ms/customers
    settings/page.tsx               → /ms/settings
```

Resulting URL set — confirmed against every `redirect(...)` and `revalidatePath(...)` literal in `admin-actions.ts`: `/ms`, `/ms/login`, `/ms/orders`, `/ms/menu`, `/ms/categories`, `/ms/banners`, `/ms/promotions`, `/ms/delivery`, `/ms/customers`, `/ms/settings`. `/ms/password` is additional; no server action references it, so its path is ours to choose.

New components:

```
src/lib/admin-format.ts                        pure helpers, no DB/React (the unit-testable seam)
src/components/admin/admin-nav.tsx             "use client" — usePathname for aria-current
src/components/admin/submit-button.tsx         "use client" — pending prop, useFormStatus fallback
src/components/admin/confirm-delete.tsx        server component — <details> + form + SubmitButton
src/components/admin/ui.tsx                    server components — PageHeader, StatCard, SavedNotice, StatusPill, Money
src/components/admin/login-form.tsx            "use client" — useActionState(loginAction)
src/components/admin/password-form.tsx         "use client" — useActionState(changePasswordAction)
src/components/admin/menu-item-form.tsx        "use client" — useActionState(saveMenuItemAction)
src/components/admin/category-form.tsx         "use client" — useActionState(saveCategoryAction)
src/components/admin/banner-form.tsx           "use client" — useActionState(saveBannerAction)
src/components/admin/promotion-form.tsx        "use client" — useActionState(savePromotionAction)
src/components/admin/zone-form.tsx             "use client" — useActionState(saveZoneAction)
src/components/admin/delivery-settings-form.tsx "use client" — useActionState(saveDeliverySettingsAction)
src/components/admin/settings-form.tsx         "use client" — useActionState(saveSettingsAction)
```

Existing files edited: `src/lib/auth.ts` (1 string), `src/lib/admin-actions.ts` (29 strings), `src/app/robots.ts`, `src/components/site-footer.tsx`, `next.config.ts`. Nothing else.

## Gating structure: why three route groups

`requireAdmin()` redirects to `/ms/login`. If the login page sat under a layout that calls `requireAdmin()`, an unauthenticated visitor would loop forever. The forced-password-change gate has the same hazard: a server layout cannot read the current pathname, so a single gated layout that redirects on `must_change_password` would also bounce the change-password page into itself. Three sibling groups under `src/app/ms/` solve both without any pathname sniffing:

- **`(public)`** — no layout of its own, so `/ms/login` renders directly inside `src/app/ms/layout.tsx`. No auth call on the request path at all.
- **`(onboarding)/layout.tsx`** — `const user = await requireAdmin();` and nothing else. A session is required, but `must_change_password` is *not* checked, which is exactly what the change-password screen needs. It renders minimal chrome (wordmark + the user's email) and shows a "Back to dashboard" link **only when `user.must_change_password` is falsy**, so a user who is mid-forced-change has no escape hatch in the UI.
- **`(dashboard)/layout.tsx`** — `const user = await requireAdmin();` then `if (user.must_change_password) redirect("/ms/password");`. Every dashboard page is gated in this one place.

The three groups define disjoint URLs (`/ms/login`, `/ms/password`, and `/ms` + eight children), so there is no parallel-page conflict. Rejected alternative: a single `src/app/ms/layout.tsx` gate with per-page opt-outs — it needs the pathname, which server layouts do not get, and it scatters the gate. Contingency: if the sibling-group arrangement ever conflicts, collapse `(onboarding)` into `(public)` and have `password/page.tsx` call `requireAdmin()` itself; the `(dashboard)` gate stays untouched either way.

`src/app/ms/layout.tsx` is a pass-through that exists to own two segment-level concerns for the whole subtree:

```tsx
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Jata admin", template: "%s · Jata admin" },
  robots: { index: false, follow: false },
};
export default function MsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

`force-dynamic` guarantees every admin screen re-reads SQLite instead of serving a cached shell, and overriding `title.template` stops admin pages inheriting the root layout's `"%s | Jata Cafe Eastleigh"` suffix. It does **not** call `requireAdmin()`.

### Landmarks and page structure

`src/app/layout.tsx` is `<html><body>{children}</body></html>` only, and the storefront's `<main id="main">` plus skip link live in `src/app/(site)/layout.tsx`, which `/ms` deliberately does not share. So each `/ms` group supplies its own landmarks:

**`(dashboard)/layout.tsx`**, in order:

```tsx
<a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-espresso-900 focus:px-4 focus:py-2 focus:text-cream-50">
  Skip to content
</a>
<header className="...">            {/* wordmark + account <details> + logout form */}
  <nav aria-label="Admin"><AdminNav /></nav>
</header>
<main id="admin-main" className="container-page pb-16">{children}</main>
```

The skip-link class string is copied verbatim from `(site)/layout.tsx` (verified present), so this needs no new CSS.

**`(onboarding)/layout.tsx`** and **`(public)/login/page.tsx`** each wrap their single card in `<main className="container-page flex min-h-dvh items-center justify-center py-12">`. They have no nav, so they need no skip link.

Every page body starts with a `PageHeader` rendering exactly one `<h1>`; section titles inside a page are `<h2>`. No page renders a second `<main>`.

### First-login forced password change

1. Seeded owner (`admin@jatacafe.co.ke` / `ChangeMe@Jata2026`) has `must_change_password = 1`.
2. `loginAction` succeeds → `createSession()` → `redirect("/ms")`.
3. `(dashboard)/layout.tsx` sees `must_change_password` → `redirect("/ms/password")`. Typing `/ms/orders` directly hits the same gate, so the dashboard is unreachable.
4. `changePasswordAction` → `changePassword()` which sets `must_change_password = 0` **and deletes every session row for that user** → `redirect("/ms/login?changed=1")`.
5. `/ms/login` reads `searchParams.changed` and renders a success banner: *"Password updated. Sign in with your new password."*

The browser still holds the now-orphaned `jata_session` cookie at step 5. `getCurrentUser()` returns `null` because the session row is gone, so the login form renders normally and `createSession()` overwrites the cookie on the next successful sign-in. No cleanup code needed.

`/ms/login` additionally calls `getCurrentUser()` and redirects to `/ms` when a live session exists, so a bookmarked login URL does not strand a signed-in manager on a login form. Loop analysis: `/ms/login` → `/ms` → (`must_change` only) → `/ms/password`, which renders. Every hop is one-way; no cycle.

**Accepted gap:** the `must_change_password` gate is UI-level only. Server actions call `requireAdmin()`, which does not check that flag, so a user who has authenticated with the seeded password could in principle post a mutation directly before changing it. Closing this would mean editing the auth design, which the task forbids. The practical exposure is nil — they already hold valid credentials for that same account — so this is documented rather than fixed.

## Form submission mechanics

This section is load-bearing for nine forms; read it before writing any of them.

**The problem.** In React 19, passing a function to `<form action={fn}>` makes React reset every uncontrolled field in that form once the action resolves — regardless of what it returned. On a rejected `ActionState` (`{ ok: false, error }`) the manager would see an error banner above a form that has reverted to its `defaultValue`s, losing everything typed into the 11-field promotion form or the 13-field settings form.

**The decision: submit through `onSubmit`, not the `action` prop, for all nine `useActionState` forms.** React's automatic reset only applies to `action`-prop submissions, so routing the same call through a transition sidesteps it and leaves the form entirely under our control:

```tsx
"use client";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { savePromotionAction } from "@/lib/admin-actions";
import { SubmitButton } from "./submit-button";

export function PromotionForm({ initial /* Promotion | null */, ... }) {
  const [state, formAction, pending] = useActionState(savePromotionAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Create mode only: clear the form after a successful save so a second tap
  // cannot create a near-duplicate row. Edit mode keeps its values.
  useEffect(() => {
    if (state?.ok && !initial) formRef.current?.reset();
  }, [state, initial]);

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {/* fields */}
      <SubmitButton pending={pending}>Save offer</SubmitButton>
    </form>
  );
}
```

`new FormData(event.currentTarget)` must be read synchronously inside the handler, before the transition. Native constraint validation still runs first — `onSubmit` does not fire until `required`/`min`/`maxLength` pass — so the validation table below is unaffected.

**Rejected alternative:** keep `action={formAction}` and tell the user their input was discarded. Cheaper to write, but it makes the long forms hostile, and finding 4's duplicate-row problem would still need a separate answer.

**Accepted tradeoff:** these nine forms stop working without JavaScript. The admin is an authenticated single-user dashboard, not the storefront, and every form here already depends on client hooks for its error display. The forms that stay progressively enhanced are the ones that need no hook: the GET filter forms on `/ms/orders` and `/ms/customers` (plain `method="get"`), and every `void` action form (toggles, deletes, `setOrderStatusAction`, `saveCustomerAction`, `logoutAction`), which keep `action={fn}`.

**Post-submit behaviour, by action kind.** This is the complete rule set; no form is left to the implementer's judgement:

| Action | Redirects? | On `ok: true` | On `ok: false` |
| --- | --- | --- | --- |
| `loginAction`, `changePasswordAction`, `saveMenuItemAction`, `saveBannerAction`, `savePromotionAction` | yes | never returns — navigation happens | keep values, show `state.error` |
| `saveCategoryAction`, `saveZoneAction` — **create mode** (`!initial`) | no | `formRef.current?.reset()`, show `state.message` | keep values, show `state.error` |
| `saveCategoryAction`, `saveZoneAction` — **edit mode** | no | keep values, show `state.message` | keep values, show `state.error` |
| `saveDeliverySettingsAction`, `saveSettingsAction` | no | keep values, show `state.message`. **Never reset** — these are update-only and a reset would show blanks over live data | keep values, show `state.error` |

The create-mode reset matters because nothing stops a duplicate server-side: `createCategory`/`createZone` have no uniqueness constraint on `name`, and `uniqueSlug()` will mint `signature-coffees-2` without complaint.

## `/admin` → `/ms` path migration

Exhaustive list. After the edits, `rg '"/admin' src` must return nothing.

**`src/lib/auth.ts`** — one occurrence, line 79: `redirect("/admin/login")` → `redirect("/ms/login")`.

**`src/lib/admin-actions.ts`** — every literal below (29 in total, counted function by function):

| Function | Literal(s) |
| --- | --- |
| `refreshAdmin` | `revalidatePath("/admin")` → `"/ms"` |
| `loginAction` | `redirect("/admin")` → `"/ms"` |
| `logoutAction` | `redirect("/admin/login")` → `"/ms/login"` |
| `changePasswordAction` | `redirect("/admin/login?changed=1")` → `"/ms/login?changed=1"` |
| `saveBannerAction` | `refreshAdmin("/admin/banners")`, `redirect("/admin/banners?saved=1")` |
| `deleteBannerAction`, `toggleBannerAction` | `refreshAdmin("/admin/banners")` |
| `saveCategoryAction`, `deleteCategoryAction` | `refreshAdmin("/admin/categories", "/admin/menu")` |
| `saveMenuItemAction` | `refreshAdmin("/admin/menu")`, `redirect("/admin/menu?saved=1")` |
| `toggleAvailabilityAction`, `deleteMenuItemAction` | `refreshAdmin("/admin/menu")` |
| `saveZoneAction`, `deleteZoneAction`, `saveDeliverySettingsAction` | `refreshAdmin("/admin/delivery")` |
| `savePromotionAction` | `refreshAdmin("/admin/promotions")`, `redirect("/admin/promotions?saved=1")` |
| `togglePromotionAction`, `deletePromotionAction` | `refreshAdmin("/admin/promotions")` |
| `setOrderStatusAction` | `revalidatePath("/admin/orders")`, `revalidatePath("/admin")` |
| `saveCustomerAction` | `revalidatePath("/admin/customers")` |
| `deleteCustomerAction` | `revalidatePath("/admin/customers")`, `revalidatePath("/admin")` |
| `saveSettingsAction` | `refreshAdmin("/admin/settings")` |

**`src/app/robots.ts`** — `disallow: ["/admin", "/admin/", "/api/", "/checkout"]` → `["/ms", "/ms/", "/api/", "/checkout"]`. Keep the existing two-entry shape (bare + trailing slash) so both the segment and its children are covered.

**`next.config.ts`** — not mentioned in the task brief but it matters: `headers()` has a `{ source: "/admin/:path*" }` block applying `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`. Change `source` to `"/ms/:path*"`. Left as-is, the admin subtree would silently lose both headers. The file already uses `{ source: "/:path*" }` for the site-wide security headers, which confirms `:path*` matches zero segments, so this single entry covers bare `/ms` as well as its children; the verification pass confirms it with `curl -I` against both `/ms` and `/ms/login`, and if bare `/ms` comes back without the headers, add a second `{ source: "/ms" }` entry carrying the same two.

**`src/app/sitemap.ts`** — verified: no admin route is listed and none is added. `listCategories()` only yields storefront `/menu?category=` URLs.

Because `force-dynamic` is set on the `/ms` subtree, the `revalidatePath("/ms...")` calls are largely inert for admin screens — they always re-read SQLite anyway. They are still converted exactly, because leaving `/admin` strings behind would be dead code pointing at a non-existent route, and because `refreshAdmin()` also drives `revalidateStorefront()`, which is what actually makes an edit show on the live site.

## Storefront link removal

`src/components/site-footer.tsx`, the bottom bar — the last `<div>` inside the `container-page` wrapper, currently:

```tsx
<div className="mt-9 flex flex-col gap-2 border-t border-cream-100/10 pt-5 text-[0.75rem] text-cream-200/55 sm:flex-row sm:items-center sm:justify-between">
  <p>
    © {year} {settings.site_name}. All rights reserved.
  </p>
  <Link href="/admin" className="hover:text-caramel-300">
    Staff login
  </Link>
</div>
```

Replace it with exactly this:

```tsx
<div className="mt-9 border-t border-cream-100/10 pt-5 text-[0.75rem] text-cream-200/55">
  <p>
    © {year} {settings.site_name}. All rights reserved.
  </p>
</div>
```

No `/ms` replacement — the admin area has no discoverable entry point. The `Link` import stays; it is still used by the "Order" nav list earlier in the same file. Verify with a grep over `src/components` and `src/app/(site)` for `"/admin"`, `"/ms"` and `Staff login`.

## Page specifications

Legend for the action column:
- **state** = returns `ActionState`; driven by `useActionState` in a Client Component using the `onSubmit` pattern above; renders inline errors.
- **void** = returns `Promise<void>`; used as a plain `<form action={fn}>` from a Server Component; ends in `redirect()` or just revalidates.

### `/ms/login` — `(public)/login/page.tsx`

Reads `searchParams` (`changed?: string`) and `getCurrentUser()` (redirecting to `/ms` if a live session exists). Renders a centred card inside `<main>` with `<LoginForm />`. No `queries.ts` call.

| Action | Kind | FormData fields |
| --- | --- | --- |
| `loginAction` | state | `email` (≤120), `password` (≤200) |

Success redirects to `/ms`; failure renders `state.error` from `attemptLogin` — wrong credentials, blank fields, or the rate-limit message after 8 failures in 15 minutes per email.

### `/ms/password` — `(onboarding)/password/page.tsx`

```tsx
const user = await requireAdmin(); // SessionUser, never null
```

Use `requireAdmin()`, not `getCurrentUser()`: the latter is typed `Promise<SessionUser | null>` and the layout's guarantee is invisible to the type checker, so `user.email` would not compile under `strict` and would invite a `!` assertion. Two cheap indexed reads on a screen visited once per password change is the right price. The same rule applies to any other page that needs the user object.

Renders `<PasswordForm />` plus the policy as help text wired to the new-password input via `aria-describedby`: *"At least 10 characters, with one lowercase letter, one uppercase letter and one number."* — mirroring `passwordProblem()`.

| Action | Kind | FormData fields |
| --- | --- | --- |
| `changePasswordAction` | state | `current_password`, `new_password`, `confirm_password` (each ≤200) |

### `/ms` — `(dashboard)/page.tsx`

Reads `getDashboardStats()`, `listOrders({ limit: 8 })`, `getSettings()` (for `currency`).

Stat cards from `DashboardStats`: orders today / 7d, revenue today / 7d (`formatMoney`), average order (30d), new customers 7d, total customers, sold-out item count (links to `/ms/menu`), active promotions (links to `/ms/promotions`), WhatsApp checkout clicks today / 7d. Then `top_items` as a ranked list and a recent-orders table linking to `/ms/orders`.

The `daily` series renders as CSS bars (`width: ${(revenue_cents / max) * 100}%`) under the heading **"Last 7 days (by day)"**. `getDashboardStats()` builds `daily` from `created_at >= datetime('now', '-6 days')` while `orders_7d`/`revenue_7d_cents` use `-7 days`, so the windows differ by a day and the empty copy must not contradict the cards: when `daily.length === 0` render *"No orders in this period yet."* The query omits zero-revenue days rather than filling them; that is left as-is, and the bar width guards against `max === 0`.

No actions on this page.

### `/ms/orders` — `(dashboard)/orders/page.tsx`

Reads `listOrders({ limit: 100, status, search })` and `getSettings()`. `searchParams`: `status` (validated against `new|confirmed|completed|cancelled|all`, anything else → `all`), `q` (via `clampSearch`). The validated `status` is passed through verbatim including `"all"` — `listOrders` skips the `status = ?` clause for that value, so the page needs no special case.

Filter UI is a GET `<form action="/ms/orders" method="get">` with a status `<select name="status">` and an `<input type="search" name="q">`, so filtering works with no JS and the URL is shareable. `listOrders` matches `q` against `phone`, `customer_name` and `reference`, so the search placeholder reads "Phone, name or reference". Each row shows reference, `created_at`, customer name, phone as `<a href={`tel:+${order.phone}`}>` (the stored value is normalised by `normalizeKenyanPhone()` with no leading `+`, matching the `tel:+${settings.whatsapp_number}` precedent in `site-footer.tsx`), order type, zone, totals, and expands via `<details>` to `safeOrderLines(order.items_json)` and `safeAppliedPromos(order.applied_promos)`.

| Action | Kind | FormData fields |
| --- | --- | --- |
| `setOrderStatusAction` | void | `id`, `status` |

One small form per row: a `<select name="status">` defaulting to the order's current status with options from `ORDER_STATUSES`/`ORDER_STATUS_LABELS`, a hidden `id`, and a submit button. The select gets a real `<label className="sr-only" htmlFor={`status-${order.id}`}>Status for order {order.reference}</label>`. The action silently ignores an unknown status, so the select's four fixed options are the only input path.

### `/ms/menu` — `(dashboard)/menu/page.tsx`

Reads `listMenu({})` (all items, available or not — `listMenu` applies no clauses for an empty argument), `listCategories({ includeHidden: true })` for the category select, `getSettings()`, and `getMenuItem(editId)` when editing. `searchParams`: `edit` (via `positiveInt`), `saved` (presence → success notice).

Single page carrying both the list and the form, because `saveMenuItemAction` redirects to `/ms/menu?saved=1`. `?edit=<id>` loads the item into `<MenuItemForm item={...} categories={...} />`; absent or unresolvable `edit` renders the same component in create mode (with an inline *"That item no longer exists — this will create a new one."* notice if the id was present but not found). Never `notFound()`.

| Action | Kind | FormData fields |
| --- | --- | --- |
| `saveMenuItemAction` | state | `id` (hidden, edit only), `category_id` (required), `name` (≥2, ≤100), `description` (≤400), **`price` (whole shillings, ≥1)**, `image_url` (≤400), `badge` (≤30), `is_available` (checkbox), `is_featured` (checkbox), `sort_order` (int) |
| `toggleAvailabilityAction` | void | `id`, `next_state` (`"1"` to make available, `"0"` to sell out) |
| `deleteMenuItemAction` | void | `id` |

Defaults for a new item: `is_available` checked, `is_featured` unchecked, `sort_order` 0. Editing pre-fills every field, with `defaultValue={centsToShillingInput(item.price_cents)}` for `price`. `image_url` is `type="text"`, **not** `type="url"` — the seeded values are site-relative paths like `/img/generated/signature-coffees.webp`, which fail URL validation.

### `/ms/categories` — `(dashboard)/categories/page.tsx`

Reads `listCategories({ includeHidden: true })` and `listMenu({})` (to show an item count per category). `searchParams`: `edit`.

`saveCategoryAction` returns `{ ok: true, message }` without redirecting, so the page stays put and `<CategoryForm />` renders the message itself; in create mode it also resets (see *Form submission mechanics*). There is no `getCategoryById` in `queries.ts` and we are not adding one; `listCategories({ includeHidden: true })` is unpaginated, so resolving `?edit=<id>` with an in-memory `.find()` is complete and correct.

| Action | Kind | FormData fields |
| --- | --- | --- |
| `saveCategoryAction` | state | `id` (hidden, edit only), `name` (≥2, ≤60), `blurb` (≤200), `sort_order`, `is_active` (checkbox) |
| `deleteCategoryAction` | void | `id` |

**Cascade warning:** `menu_items.category_id` is `REFERENCES categories(id) ON DELETE CASCADE` and `foreign_keys = ON`. Deleting a category deletes every item in it. The confirm disclosure must say so with the live count: *"Deleting 'Signature Coffees' also deletes its 10 menu items. This cannot be undone."*

### `/ms/banners` — `(dashboard)/banners/page.tsx`

Reads `listBanners({})` (all, no date filter) and `getBanner(editId)`. `searchParams`: `edit`, `saved`.

| Action | Kind | FormData fields |
| --- | --- | --- |
| `saveBannerAction` | state | `id`, `title` (≥2, ≤120), `subtitle` (≤300), `image_url` (≤400), `link_url` (≤400), `cta_label` (≤40), `theme`, `is_active`, `sort_order`, `starts_at`, `ends_at` |
| `toggleBannerAction` | void | `id`, `next_state`, **plus** `title`, `subtitle`, `image_url`, `link_url`, `cta_label`, `theme`, `sort_order`, `starts_at`, `ends_at` |
| `deleteBannerAction` | void | `id` |

**Highest-risk form on the dashboard.** `toggleBannerAction` does not re-read the row — it calls `updateBanner()` with values taken straight from the submitted FormData. A toggle form that posts only `id` and `next_state` blanks the banner's title, subtitle, image and dates, and `updateBanner` applies `input.theme || "espresso"`, so a missing `theme` silently resets a caramel banner to espresso. All nine extra fields must be present as hidden inputs mirroring the current row, and nullable columns must serialise as `""` not `"null"`: `value={banner.starts_at ?? ""}`. `is_active` must **not** be among them — it comes from `next_state`. Contrast with `togglePromotionAction`, which calls `getPromotion(id)` itself and therefore needs only `id` + `next_state`.

`theme` is a `<select>` restricted to `espresso | caramel | mint | berry` — the four keys in `THEMES` in `src/components/hero-banners.tsx`. Anything else falls back to `espresso` at render time, so free text would look broken. `starts_at`/`ends_at` are `type="date"` (the `activeOnly` query compares `date(starts_at) <= date('now')`). `link_url` is `type="text"` — seeded values are paths like `/menu?category=signature-coffees`.

### `/ms/promotions` — `(dashboard)/promotions/page.tsx`

Reads `listPromotions({})`, `listCategories({ includeHidden: true })` and `listMenu({})` (for the `target_id` picker), `getSettings()`, `getPromotion(editId)`. `searchParams`: `edit`, `saved`. Each row also shows `describeSchedule()` and `isPromotionLive()` from `pricing.ts` so the owner can see whether an offer is running right now, plus `usage_count` / `max_uses`.

| Action | Kind | FormData fields |
| --- | --- | --- |
| `savePromotionAction` | state | `id`, `name` (≥2, ≤80), `kind`, `code` (≥3, ≤32, uppercased by the action), `discount_type`, **`discount_value` (raw int, ≥1)**, `scope`, `target_id`, **`min_subtotal` (whole shillings)**, `days` (multi-value), `start_time`, `end_time`, `starts_at`, `ends_at`, `max_uses`, `is_active` |
| `togglePromotionAction` | void | `id`, `next_state` |
| `deletePromotionAction` | void | `id` |

`<PromotionForm />` is a Client Component already (for `useActionState`), so it keeps `kind`, `discount_type` and `scope` in `useState` mirrors of the selects and uses them to:
- render the `code` input only when `kind === "code"` (the action nulls `code` for other kinds and demands ≥3 chars for `code`);
- render the `target_id` select only when `scope !== "all"`, sourced from categories when `scope === "category"` and from menu items when `scope === "item"`. When the chosen scope has **no rows**, replace the select with a note and a link to `/ms/categories` or `/ms/menu`, and force `scope` back to `"all"` — same rule as the menu form's empty-category guard, because `savePromotionAction` rejects a non-`all` scope with no `target_id`;
- relabel `discount_value` as **"Percent off"** (`max="100"`) or **"Shillings off"** (no max) following `discount_type`. The label is the main defence against the 100× mistake.

`days` is seven checkboxes all named `days`, values `1`–`7` (Mon–Sun), read by `form.getAll("days")` and pre-filled from `parseDaysOfWeek(promo.days_of_week)`. The action stores a CSV only when 1–6 days are ticked; none or all seven store `null`, which `isPromotionLive()` treats as every day. Help text: *"Leave every day ticked (or none) for an offer that runs daily."* Re-saving the seeded Happy Hour therefore rewrites `days_of_week` from `"1,2,3,4,5,6,7"` to `null` — behaviourally identical, not a bug.

`start_time`/`end_time` are `type="time"` with no `step` (so the browser submits `HH:MM`, matching the action's 5-char cap) and are validated both-or-neither server-side; the help text says so. `max_uses` blank → `null` (unlimited).

### `/ms/delivery` — `(dashboard)/delivery/page.tsx`

Reads `listZones({})`, `getSettings()`, `getZone(editId)`. `searchParams`: `edit`. Two independent sections: delivery settings on top, then the zone list + zone form.

| Action | Kind | FormData fields |
| --- | --- | --- |
| `saveDeliverySettingsAction` | state | `delivery_mode` (`zone`\|`flat`), **`delivery_flat_fee`**, **`free_delivery_threshold`**, **`min_order`** (all whole shillings), `delivery_note` (≤400) |
| `saveZoneAction` | state | `id`, `name` (≥2, ≤80), **`fee` (whole shillings)**, `eta_minutes` (blank → null), `notes` (≤200), `is_active`, `sort_order` |
| `deleteZoneAction` | void | `id` |

Both return a message without redirecting. **Every settings field must be pre-filled** from `getSettings()` — see the pre-fill invariant: `shillingsToCents()` returns `0` for a blank or non-numeric input and `updateSettings()` writes every key in the patch, so an empty box silently zeroes the live free-delivery threshold or minimum order. `delivery_mode` is a `<select>`; the action treats anything other than `"flat"` as `"zone"`. Deleting a zone is safe — `customers.zone_id` and `orders.zone_id` are `ON DELETE SET NULL` — but the confirm text still notes that customers pinned to that area lose it.

### `/ms/customers` — `(dashboard)/customers/page.tsx`

Reads `listCustomers({ limit: 200, search })`. `searchParams`: `q` (via `clampSearch`), matched by the query against phone, name and location.

This is the one screen that uses an **inline `<details>` row form** rather than `?edit=<id>`. There is no `getCustomerById` in `queries.ts`, and `listCustomers` is both limited (200) and search-filtered, so an id from the query string is not reliably resolvable from the rendered list. The two editable fields are small enough to sit in the row, and `saveCustomerAction` does not redirect, so submitting re-renders in place.

| Action | Kind | FormData fields |
| --- | --- | --- |
| `saveCustomerAction` | **void** | `id` (required — the action no-ops without it), `notes` (≤400), `marketing_opt_in` (checkbox) |
| `deleteCustomerAction` | void | `id` |

`saveCustomerAction` returns `Promise<void>`, so despite being a "save" it is a plain form action, **not** `useActionState`. It writes both fields unconditionally, and `updateCustomerNotes`'s `notes = COALESCE(?, notes)` guard does nothing here: `str(form, "notes", 400)` yields `""` for an empty textarea, and SQLite's `COALESCE('', notes)` returns `''`. Likewise `bool()` turns an unchecked box into `false`, never `null`. Both fields must therefore render the stored value:

```tsx
<textarea name="notes" maxLength={400} defaultValue={customer.notes ?? ""} className="field" />
<input type="checkbox" name="marketing_opt_in" defaultChecked={customer.marketing_opt_in === 1} />
```

Omitting either one means opening a row and saving wipes the notes or opts the customer out. Confirm copy for delete: *"Their past orders stay, but lose the link to this profile."* (`orders.customer_id` is `ON DELETE SET NULL`.)

### `/ms/settings` — `(dashboard)/settings/page.tsx`

Reads `getSettings()`. No price fields on this form — delivery money lives on `/ms/delivery`.

| Action | Kind | FormData fields |
| --- | --- | --- |
| `saveSettingsAction` | state | `site_name` (≤60), `tagline` (≤80), `hero_kicker` (≤120), `whatsapp_number` (≥9 digits after stripping non-digits), `phone_display` (≤30), `address_line` (≤160), `area_hint` (≤80), `maps_url` (≤400), `opening_hours` (≤120), `announcement` (≤200), `instagram_url` (≤200), `tiktok_url` (≤200), `facebook_url` (≤200) |

**All thirteen inputs get `defaultValue={settings.<key>}`.** This is not optional polish. `saveSettingsAction` passes all thirteen keys to `updateSettings()`, which upserts every key in the patch, and `str()` returns `""` for a blank input — so a form rendered without pre-fill wipes the address, hours, maps link, announcement, tagline, kicker, phone, area hint and all three social URLs on the first save. `whatsapp_number` is the only key with a server-side floor (`< 9` digits → inline error), which makes the failure mode "fix the WhatsApp number, lose the other twelve". Every field on `SiteSettings` is a non-nullable `string`, so `defaultValue={settings.address_line}` typechecks with no `??` fallback.

`whatsapp_number` is `type="tel" inputMode="numeric"` with help text *"Country code first, no plus sign — e.g. 254712345678."*; the action strips non-digits before validating. `maps_url` and the three social URLs are `type="url"` (their values are absolute). `site_name` blank falls back to `"Jata Cafe"` server-side. Saving triggers `revalidateStorefront()`, so the success message reads *"Saved. The live site is updated."* — the action's own wording.

## Money: shillings ↔ cents, field by field

The DB stores integer cents. `admin-actions.ts#shillingsToCents` strips commas, floors negatives and non-finite values at `0`, and multiplies by 100 on write. Forms therefore post **raw shillings** and must never pre-multiply. For display inside an input, convert with `centsToShillingInput()`.

| Page | Input `name` | Stored column | On write (action) | On render (form) |
| --- | --- | --- | --- | --- |
| `/ms/menu` | `price` | `menu_items.price_cents` | `shillingsToCents` ×100 | `centsToShillingInput(item.price_cents)` |
| `/ms/delivery` | `fee` | `delivery_zones.fee_cents` | ×100 | `centsToShillingInput(zone.fee_cents)` |
| `/ms/delivery` | `delivery_flat_fee` | `settings.delivery_flat_fee_cents` | ×100 | `centsToShillingInput(settings.delivery_flat_fee_cents)` |
| `/ms/delivery` | `free_delivery_threshold` | `settings.free_delivery_threshold_cents` | ×100 | `centsToShillingInput(settings.free_delivery_threshold_cents)` |
| `/ms/delivery` | `min_order` | `settings.min_order_cents` | ×100 | `centsToShillingInput(settings.min_order_cents)` |
| `/ms/promotions` | `min_subtotal` | `promotions.min_subtotal_cents` | ×100 | `centsToShillingInput(promo.min_subtotal_cents)` |
| `/ms/promotions` | **`discount_value`** | `promotions.discount_value` | **`int()` — no conversion** | **`String(promo.discount_value)` as-is** |

**`/100` must not appear in any form component.** `centsToShillingInput()` in `src/lib/admin-format.ts` is the only place the division lives:

```ts
/** Stored cents -> the digits that belong in a whole-shilling number input. */
export function centsToShillingInput(cents: number): string {
  return String(Math.round(cents / 100));
}
```

`discount_value` is the exception and the trap. `savePromotionAction` reads it with `int()`, not `shillingsToCents()`, and for `discount_type === "fixed"` the ×100 happens later at pricing time — `pricing.ts#discountAmount` computes `Math.min(base, promo.discount_value * 100)`. Dividing it by 100 in the form would turn "KES 200 off" into "KES 2 off" on the next save. For `percent` it is simply the percentage. The invariant is owned by `pricing.ts`; the admin form is a passthrough.

Number-input attributes are **not** uniform — each field gets the constraint the action actually enforces, so the browser rejects what the server would reject:

| Input | Attributes | Why |
| --- | --- | --- |
| `price` | `type="number" min="1" step="1" required inputMode="numeric"` | `saveMenuItemAction` rejects `priceCents <= 0`; `min="0"` would let the browser submit a value the server bounces |
| `fee`, `delivery_flat_fee`, `free_delivery_threshold`, `min_order`, `min_subtotal` | `type="number" min="0" step="1" inputMode="numeric"` | `0` is meaningful: a free zone, a disabled threshold, no minimum |
| `discount_value` — **not a money field**; raw integer, never converted | `type="number" min="1" step="1" required inputMode="numeric"`, plus `max="100"` when `discount_type === "percent"` | `savePromotionAction` rejects `<= 0`, and `> 100` for percent |
| `sort_order` | `type="number" step="1"` | blank → `0` via `int()` |
| `eta_minutes`, `max_uses` | `type="number" min="0" step="1"` | blank → `null` |

`defaultValue` must be bare digits. **Do not** use `formatAmount()` / `formatMoney()` for input values: both call `toLocaleString("en-KE")` and emit `"1,250"`, and an `<input type="number">` with a comma in its value renders blank, so the next save posts `0`. Those helpers are for read-only display (tables, stat cards) only.

## Shared components

**`src/lib/admin-format.ts`** — pure, no React, no DB, no `"use server"`, safe to import from both Server and Client Components (only type-only imports from `./types`). Full public surface:

```ts
import type { OrderLine, OrderStatus } from "./types";

export type AppliedPromo = { name: string; amount_cents: number };

/** Stored cents -> digits for a whole-shilling number input. */
export function centsToShillingInput(cents: number): string;
/** "1,2,3" -> [1,2,3]; "" and null -> []; junk entries dropped. */
export function parseDaysOfWeek(csv: string | null): number[];
/** orders.items_json -> lines; malformed or null -> []. */
export function safeOrderLines(json: string | null): OrderLine[];
/** orders.applied_promos -> promos; malformed or null -> []. */
export function safeAppliedPromos(json: string | null): AppliedPromo[];
/** searchParams value -> trimmed, length-capped search string. */
export function clampSearch(q: string | undefined, max?: number): string; // max default 60
/** searchParams value -> positive integer, or null. */
export function positiveInt(v: string | undefined): number | null;
export function isOrderStatus(v: string): v is OrderStatus;

export const ORDER_STATUSES: readonly OrderStatus[]; // ["new","confirmed","completed","cancelled"]
export const ORDER_STATUS_LABELS: Record<OrderStatus, string>;
// { new: "New", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" }
```

`AppliedPromo` matches what `src/app/api/checkout/route.ts` actually writes: `JSON.stringify(pricing.applied.map((p) => ({ name: p.name, amount_cents: p.amount_cents })))`. Both `safe*` parsers take `string | null` because `orders.applied_promos` is nullable and `parseDaysOfWeek` has to handle a null `days_of_week`.

**`SubmitButton`** (`"use client"`) — props `{ children, pending?: boolean, className?, variant? }`:

```tsx
const status = useFormStatus();
const busy = pending ?? status.pending;
```

`useFormStatus` only reports submissions made through the `action` prop, so the nine `onSubmit` forms pass `pending` from `useActionState`'s third tuple element; the `action={fn}` forms (toggles, deletes, logout, order status, customer save) omit the prop and fall back to the hook. Either way the button renders `disabled={busy}`, `aria-busy={busy}`, and swaps its label for a "Saving…" variant. Because `useFormStatus` reads the *nearest ancestor* form, this must stay a separate component rendered **inside** `<form>`; calling the hook in the component that renders the `<form>` always reports `pending: false`.

**`ConfirmDelete`** (Server Component) — props `{ action, id, label, warning? }`. Renders:

```
<details>
  <summary>Delete</summary>            ← styled like a button, natively keyboard-operable
  <p>{warning ?? `Delete “${label}”? This cannot be undone.`}</p>
  <form action={action}>
    <input type="hidden" name="id" value={id} />
    <SubmitButton>Yes, delete “{label}”</SubmitButton>
  </form>
</details>
```

Chosen over `window.confirm` because it needs no client JS, is keyboard-operable and screen-reader-announced as a disclosure, and lets the cascade warning for categories be real prose instead of a one-line dialog string. The real submit button carries the item name, satisfying the discernible-text rule.

**`AdminNav`** (`"use client"`) — `usePathname()` for `aria-current="page"`, exact match for `/ms` and `startsWith` for the rest, mirroring `site-header.tsx`, which does `item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)` (verified). Nav items: Dashboard `/ms` (GridIcon), Orders `/ms/orders` (BagIcon), Menu `/ms/menu` (SparkIcon), Categories `/ms/categories` (GridIcon), Banners `/ms/banners` (ImageIcon), Promotions `/ms/promotions` (TagIcon), Delivery `/ms/delivery` (ScooterIcon), Customers `/ms/customers` (UsersIcon), Settings `/ms/settings` (SettingsIcon) — all already in `icons.tsx`.

Layout decision: one top nav for all breakpoints — a horizontally scrolling rail using the existing `.no-scrollbar` class on small screens, wrapping to an inline list at `sm:` and up. Rejected a `md:` left sidebar: it doubles the layout markup and the dashboard is primarily a phone-in-the-kitchen tool. The account menu is a server-rendered `<details>` in the `<header>` containing the signed-in email, a "Change password" link to `/ms/password`, and `<form action={logoutAction}><SubmitButton>Log out</SubmitButton></form>` with a `LogoutIcon`.

**`ui.tsx`** (Server Components) — `PageHeader` (kicker + the page's single `<h1>` + optional description, matching the storefront's `container-page pt-6` header pattern), `StatCard`, `SavedNotice` (renders the `?saved=1` / `?changed=1` banner with `role="status"`), `StatusPill` (order status → `.chip` with colour), `Money` (wraps `formatMoney`).

Styling reuses the existing `globals.css` component classes throughout: `.container-page`, `.card`, `.btn` + `.btn-primary` / `.btn-outline` / `.btn-ghost`, `.field`, `.field-label`, `.field-error`, `.chip`, `.prose-note`, `.no-scrollbar`, and **`.admin-table`**, which already exists with `th`/`td`/`tbody tr:hover` rules and was clearly written for these screens. No new CSS and no new `@theme` tokens.

## Input validation

Validation of *stored* values is already complete inside `admin-actions.ts` (`str()` strips control characters, trims and caps length; `int()`/`id()` coerce; `shillingsToCents()` floors at 0; each action has its own business rules). The UI layer adds matching native constraints so the browser catches mistakes before a round trip; it never relaxes a server rule.

| Input | Rule | Failure behaviour |
| --- | --- | --- |
| `email` | required, `type="email"`, `maxLength={120}` | Browser blocks; server returns "Enter your email and password." |
| `password`, `current_password`, `new_password`, `confirm_password` | required, `type="password"`, `maxLength={200}`, `minLength={10}` on new/confirm | Server messages from `passwordProblem()` / mismatch, rendered inline |
| `name` / `title` (all entities) | required, `minLength={2}`, `maxLength` matching the action (`name` 100 menu / 60 category / 80 zone / 80 promotion; `title` 120 banner) | Inline `state.error` |
| number inputs | per the money table above — `min` differs by field, never a blanket `min="0"` | Browser blocks; inline error as a backstop, e.g. "Enter a price above zero." |
| `starts_at` / `ends_at` | `type="date"`, optional | n/a |
| `start_time` / `end_time` | `type="time"`, both-or-neither | Inline error from the action |
| `days` | 0–7 checkboxes, values 1–7 | Out-of-range values filtered server-side |
| `code` | shown only when `kind === "code"`, `minLength={3}`, `maxLength={32}`, uppercased by the action | Inline error; UNIQUE clash → "The code "X" is already in use." |
| `target_id` | `<select>`, required when `scope !== "all"`; replaced by a link when the scope has no rows | Inline "Choose a category." / "Choose a menu item." |
| `whatsapp_number` | `type="tel"`, required, ≥9 digits after stripping non-digits | Inline "Enter the WhatsApp number in full…" |
| `image_url`, `link_url` | `type="text"` — site-relative paths are legal values | n/a |
| `maps_url`, `*_url` socials | `type="url"`, optional | Browser blocks malformed absolute URLs |
| text areas (`description` 400, `blurb` 200, `notes` 200 zone / 400 customer, `announcement` 200, `delivery_note` 400) | `maxLength` matching the action's `str()` cap | n/a |
| checkboxes | `is_active` / `is_available` default **checked** for new records; `is_featured` defaults unchecked; `marketing_opt_in` reflects the stored row | n/a |

Search params are external input too and are validated in the page before reaching `queries.ts`:

| Param | Rule | On failure |
| --- | --- | --- |
| `?status=` | `isOrderStatus()` or the literal `all` | fall back to `all` |
| `?q=` | `clampSearch()`: trim, cap 60 chars | over-long input truncated |
| `?edit=` | `positiveInt()`; must resolve to an existing row | ignored → form renders in create mode with a notice; never `notFound()` |
| `?saved=`, `?changed=` | presence only, value unused | notice not shown |

`q` reaches SQL as a bound `LIKE` parameter, so there is no injection surface; `%`/`_` typed by the user act as wildcards, which is acceptable for an internal search box.

## Error handling

| Operation | Failure | Severity | Caller sees | Logged |
| --- | --- | --- | --- | --- |
| Any `queries.ts` read during render | better-sqlite3 throws (locked/corrupt file, busy past the 5 s `busy_timeout`) | Fatal for the request, recoverable by retry | `src/app/ms/error.tsx` boundary: "We could not load this screen." + `reset()` retry button + link to `/ms` | Next logs the stack server-side automatically; the boundary gets only a `digest` in production, so it adds no logging of its own |
| `safeOrderLines` / `safeAppliedPromos` on a malformed row | bad JSON | Recoverable, scoped to one order | That order renders "Items unavailable"; the rest of the table is fine | No — matches `getDashboardStats()`, which already skips malformed `items_json` silently |
| Server action business rule (`ActionState`) | blank name, zero price, bad time window, duplicate code, wrong current password, rate limit | Recoverable | `state.error` rendered above the form in a `role="alert"` region with `aria-live="polite"`. Typed values are preserved — the `onSubmit` pattern in *Form submission mechanics* is what makes that true | No |
| Server action unexpected throw | SQLITE constraint we do not anticipate, FS error | Fatal for that submission | `src/app/ms/error.tsx`; Next returns an opaque digest to the browser | Next logs the real error server-side |
| Server action auth | session expired or deleted mid-edit | Fatal for that submission | `requireAdmin()` → `redirect("/ms/login")`; typed input is lost | No |
| `loginAction` rate limit | 8 failures / 15 min / email | Recoverable after the window | "Too many attempts. Wait 15 minutes and try again." | No |
| Unknown `/ms/*` URL | no matching route | n/a | Existing `src/app/not-found.tsx` — plain card, no storefront chrome, no admin link | n/a |

The realistic constraint violations are all already covered by the existing code or by the schema's own cascade rules: deleting a category cascades to its items, zones and customers null out their references, and orders carry an `items_json` snapshot with no FK to `menu_items`. The only genuine UNIQUE collision reachable from these forms is the promo code (`CREATE UNIQUE INDEX idx_promo_code ON promotions(code) WHERE code IS NOT NULL`), which `savePromotionAction` already catches and rethrows for anything else. So the error boundary is a true last resort, not a routine path.

`src/app/ms/error.tsx` must be a Client Component (`"use client"`, props `{ error, reset }`) — that is a Next.js requirement for error boundaries. It is deliberately placed at the `/ms` segment, not inside a group, so it covers login, onboarding and dashboard alike, including errors thrown by the nested group layouts.

Losing typed input on mid-edit session expiry is accepted rather than engineered around: sessions last 7 days, the alternative is draft persistence in `localStorage`, and that is scope the task does not ask for.

## Invariants and where they are enforced

| Invariant | Owner | Why there |
| --- | --- | --- |
| Money is cents in SQLite, whole shillings in the UI | Write side: `admin-actions.ts#shillingsToCents` (already). Read side: the form components via `centsToShillingInput()` | The action layer is the only write path; converting in the UI on write too would multiply by 100 twice |
| `promotions.discount_value` is **not** cents | `pricing.ts#discountAmount` (×100 at compute time) | Pre-existing contract between storage and the pricing engine; the admin form must stay a passthrough or fixed discounts shift by 100× |
| **Every field an action writes is pre-filled from the stored value** | The form component's `defaultValue` / `defaultChecked` | `str()` returns `""`, `bool()` returns `false` and `shillingsToCents()` returns `0` for a blank or absent input, and every `update*` call writes all the columns in its payload unconditionally. A missing `defaultValue` is silent data loss, not a cosmetic gap. Applies in full to `/ms/settings` (13 fields), `/ms/delivery` (5), `/ms/customers` (`notes` + `marketing_opt_in`) and the hidden mirrors on `/ms/banners` |
| Only an authenticated admin reaches the dashboard | `(dashboard)/layout.tsx` for navigation **and** `requireAdmin()` inside every action (already) | Server actions are independently addressable POST endpoints; a layout gate cannot protect them. Defence in depth is the intended model |
| A user with `must_change_password` cannot use the dashboard | `(dashboard)/layout.tsx` only | Layout is the single choke point for all nine dashboard pages. Action-level enforcement would mean editing `auth.ts`, which is out of bounds (see *Accepted gap*) |
| Toggling a banner preserves its content | The toggle form's nine hidden inputs on `/ms/banners` | `toggleBannerAction` rebuilds the whole row from FormData; only the submitting form can supply the current values |
| A successful create does not become two rows | The create-mode `formRef.current?.reset()` in `category-form` / `zone-form` | `createCategory`/`createZone` have no name uniqueness constraint and `uniqueSlug()` silently mints a `-2` suffix, so the client is the only layer that can prevent the duplicate |
| The storefront exposes no path to `/ms` | `site-footer.tsx` (link removed) + the grep check in verification | Single removal point; a test cannot assert "no link exists anywhere" as cheaply as a grep can |
| `/ms` stays out of search indexes | Three places: `robots.ts` disallow, `metadata.robots` on `src/app/ms/layout.tsx`, `X-Robots-Tag` header in `next.config.ts` | robots.txt is advisory, the meta tag covers rendered pages, the header covers everything under the prefix including non-HTML responses |

## Next.js 16 / React 19 pitfalls

1. **`cookies()` is async.** `auth.ts` already does `const jar = await cookies()`. Pages must never call `cookies()` themselves — they get the user from `await requireAdmin()` (returns `SessionUser`) or `await getCurrentUser()` (returns `SessionUser | null`, so it needs a null branch). Both are async; forgetting the `await` yields a Promise that is truthy, which would make a hand-rolled gate pass for anonymous visitors.
2. **`searchParams` and `params` are Promises.** Type them as `Promise<{ ... }>` and destructure with `await`, exactly as `src/app/(site)/menu/page.tsx` already does. Synchronous access is gone in 16.
3. **`"use server"` files may only export async functions.** `admin-actions.ts` already satisfies this. Do not add shared constants, types or lookup tables to it — that is what `src/lib/admin-format.ts` is for.
4. **Importing actions into Client Components is fine** precisely because `admin-actions.ts` carries the file-level `"use server"`. No need to thread actions through props from a Server Component.
5. **`useActionState` comes from `react`**, not `react-dom`'s legacy `useFormState`. Signature: `const [state, formAction, pending] = useActionState(action, null)`; the initial state is `null`, matching `ActionState = {...} | null`.
6. **React 19 resets uncontrolled fields when an `action`-prop submission completes**, win or lose. That is why all nine `ActionState` forms submit via `onSubmit` + `startTransition(() => formAction(data))` instead — see *Form submission mechanics*. The corollary: nothing resets by itself any more, so a successful **create** must reset explicitly or a second tap duplicates the row.
7. **`redirect()` inside a server action throws `NEXT_REDIRECT`.** Never wrap an action call in a `try/catch` on the client — it would swallow the navigation. Actions that both redirect on success and return an error on failure (`loginAction`, `saveMenuItemAction`, `saveBannerAction`, `savePromotionAction`, `changePasswordAction`) work correctly with `useActionState` because `redirect` returns `never`.
8. **`useFormStatus` reads the nearest ancestor `<form>` and only tracks `action`-prop submissions.** It must be called in a child component, never in the component that renders the form, and it reports `pending: false` forever for an `onSubmit` form — hence `SubmitButton`'s `pending` prop.
9. **`logoutAction()` takes no parameters** but is used as `<form action={logoutAction}>`. React passes a `FormData` argument that the function ignores; TypeScript accepts the narrower signature. Do not add a dummy parameter.
10. **`saveCustomerAction` returns `Promise<void>`, not `ActionState`.** It looks like a save but must be a plain form action. Passing it to `useActionState` would be a type error and would break the no-redirect-just-revalidate behaviour.
11. **`force-dynamic` in `src/app/ms/layout.tsx` applies to the whole subtree**, which is what we want: every dashboard page reads SQLite through `queries.ts` on every request, and route segment config in a layout covers all nested segments, so one declaration is enough.
12. **`revalidatePath` only works inside a server action or route handler.** All existing calls are already in the right place; pages must not call it.
13. **`<input type="number">` rejects a `value` containing a comma** — see the money rules. Same class of bug as `type="url"` rejecting `/img/generated/x.webp`.

## Accessibility and mobile

Every `/ms` screen has exactly one `<main>` landmark and one `<h1>`, and the dashboard group adds a "Skip to content" link targeting `#admin-main` so the nine-item nav rail is skippable — see *Landmarks and page structure* for the markup order. The nav itself is wrapped in `<nav aria-label="Admin">`.

Every control gets a real `<label htmlFor>`; labels that would be visual noise in a dense table row use `className="sr-only"` rather than being dropped for an `aria-label`. Help and error text is tied to its input with `aria-describedby`, and error regions use `role="alert"` with `aria-live="polite"`. Buttons always carry text — icons from `icons.tsx` are already `aria-hidden` via their shared `base()`, so an icon-only button would be unlabelled. Status feedback banners use `role="status"`.

Mobile-first: single-column stacked forms, tables that scroll horizontally inside `overflow-x-auto` wrappers with the most important columns first, and the `min-height: 2.875rem` tap targets inherited from `.btn`. Colour comes from the existing tokens, which are already tuned for contrast on the `cream-50` body; destructive affordances use `berry-500` on white rather than colour alone — the disclosure's text ("Delete", "Yes, delete X") carries the meaning. Keyboard operability comes free from using `<details>`/`<summary>`, native form controls and real links; `globals.css` already defines a high-contrast `:focus-visible` outline and honours `prefers-reduced-motion`.

Full WCAG conformance cannot be asserted from code review alone — it needs manual testing with a screen reader and an expert audit. What is designed here is the structural layer: landmarks, semantics, labelling, focus and contrast tokens.

## Testability and verification

There is no test runner in `package.json` and adding one would mean a new npm dependency, which the task forbids. So automated verification is limited to what the project already provides:

- `npm run typecheck` (`tsc --noEmit`) — catches the action/FormData mismatches that matter most: wrong `useActionState` signature, `saveCustomerAction` misuse, missing `await` on `searchParams`, and the `SessionUser | null` narrowing on `/ms/password`.
- `npm run build` — catches route-group collisions, Client/Server Component boundary violations, and `"use server"` export violations.
- `rg '"/admin' src` — must return zero matches. Plus `rg -n '/admin' next.config.ts` to confirm the header source was converted.

`src/lib/admin-format.ts` is deliberately pure so that it is the seam a future test runner would target, and its signatures are pinned above so the cases are unambiguous: `centsToShillingInput` round-trips (`35000 → "350"`, `0 → "0"`); `parseDaysOfWeek` on `null`, `""`, `"1,2,3,4,5,6,7"` and junk; `safeOrderLines` / `safeAppliedPromos` on `null` and malformed JSON; `clampSearch(undefined)` → `""` and a 200-char input → 60 chars; `positiveInt("0")` / `positiveInt("abc")` → `null`; `isOrderStatus` rejecting arbitrary strings. Everything else is integration-shaped by nature (synchronous SQLite reads inside Server Components), which is why the logic worth testing was pushed into that one module instead of being inlined in pages.

Manual pass, in order, against the seeded database (`admin@jatacafe.co.ke` / `ChangeMe@Jata2026`). Windows PowerShell — chain with `;`:

1. `npm run dev`; load `/ms` while signed out → lands on `/ms/login`, no loop, page renders (this is the check the task calls out explicitly).
2. Wrong password once → inline error. Correct password → bounced to `/ms/password`, not the dashboard. Try `/ms/orders` directly → still bounced.
3. Change the password (fail the 10-char/upper/lower/digit policy first to see the message) → lands on `/ms/login?changed=1` with the confirmation banner. Sign in with the new password → dashboard.
4. **Form-reset check** (confirms *Form submission mechanics* against the installed React 19.3.0): on `/ms/settings`, change the WhatsApp number to `123` and save → inline error **and every other field still holds what it had**. Fix it and save.
5. `/ms/menu`: confirm an existing item's price shows as **350**, not 35000 or 3.5. Save without edits and re-check the storefront `/menu` price is unchanged. Toggle availability, then delete a throwaway item.
6. `/ms/promotions`: confirm the seeded "Big order bonus" shows `discount_value` **200** with a "Shillings off" label, and `min_subtotal` **3000**. Save and confirm the storefront `/offers` still shows KES 200 off.
7. `/ms/banners`: toggle a banner off and on, then confirm its title, subtitle, image, theme and dates survived.
8. `/ms/delivery`: save with no edits, confirm the storefront `/delivery` figures are unchanged. `/ms/settings`: save with no edits, then confirm the storefront footer still shows the address, opening hours and the Instagram link (the blank-field-overwrites-a-setting check).
9. `/ms/customers`: open a row, change nothing, save, confirm **both** the notes text and the opt-in state survived. Then edit the notes and confirm the change sticks.
10. `/ms/categories`: create a category, then click Save a second time without touching anything → the form is empty and only one row was created.
11. `/ms/orders`: change a status, confirm the dashboard counts follow.
12. Keyboard-only pass on one dashboard page: Tab once → "Skip to content" is visible and focusable, activating it jumps past the nav.
13. Log out → `/ms/login`. Load the storefront and confirm no "Staff login" link; check `/robots.txt` contains the `/ms` disallow; run `curl -I http://localhost:3000/ms` ; `curl -I http://localhost:3000/ms/login` and confirm both carry `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`. Also confirm the rendered `<head>` of a dashboard page has `<meta name="robots" content="noindex, nofollow">`.
14. `npm run typecheck`; `npm run build`.

The existing database must not be deleted — `npm run db:reset` points at a `scripts/reset-db.mjs` that does not exist, and `seed()` only runs on an empty `categories` table.

## Edge cases

- **Empty states** on every list: no orders, no customers, no promotions, no banners, no zones. Each renders a short card with the relevant "New …" affordance rather than an empty table.
- **No categories yet** → the menu-item form's `category_id` select has nothing to offer. Render the form disabled with a link to `/ms/categories` instead of a select that cannot satisfy the action's "Choose a category." rule.
- **No rows for the chosen promotion scope** → same treatment: `scope === "category"` with zero categories, or `scope === "item"` with zero menu items, replaces the `target_id` select with a note plus a link to `/ms/categories` / `/ms/menu` and keeps `scope` at `"all"`, because `savePromotionAction` rejects a non-`all` scope with no target.
- **`?edit=<id>` for a deleted row** → create mode plus a notice. Same for a stale bookmark after a cascade delete.
- **Promotion target of a deleted category or item** → `target_id` points at nothing; the row shows "target missing" and the form's select falls back to unselected, forcing a re-pick on the next save.
- **Banner with null `starts_at`/`ends_at`** → hidden toggle inputs must serialise `""`, and date inputs must get `defaultValue={banner.starts_at ?? ""}`.
- **Order with `customer_id` null** (customer deleted) → the row shows the snapshotted `customer_name`/`phone` from the order itself, with no profile link.
- **Zero-revenue day in `daily`** → bar width guards against division by zero when `max` is 0.
- **Very long values** — a 400-char description or a 200-char announcement — are `maxLength`-capped in the UI to match the action's own `str()` cap, and tables truncate with `line-clamp`/`truncate` rather than reflowing.
- **Re-saving the seeded Happy Hour** rewrites `days_of_week` from all-seven to `null`. Equivalent behaviour; documented so it is not mistaken for data loss.
- **Two managers editing at once** — last write wins. There is no optimistic concurrency in the schema and adding one is out of scope.

## Out of scope

Creating or managing additional admin users (no server action exists for it), order creation or editing from the dashboard (orders arrive through `/api/checkout` only), image upload (`image_url` is a text field pointing at an existing asset), CSV export, pagination beyond the limits already baked into `listOrders`/`listCustomers`, no-JS support for the nine `ActionState` forms (see the accepted tradeoff), any change to the auth model, DB schema or seeding, and any storefront visual change beyond removing the footer link.

---

## Responses to the design review

All 15 findings are addressed in this revision; none are backlogged or declined.

| # | Severity | Resolution |
| --- | --- | --- |
| 1 | HIGH | **Addressed — Option A.** New *Form submission mechanics* section: all nine `ActionState` forms submit via `onSubmit` + `preventDefault` + `startTransition(() => formAction(data))`, so React's `action`-prop auto-reset never applies and typed input survives a rejected submit. `SubmitButton` gains a `pending?: boolean` prop fed by `useActionState`'s third element, with `useFormStatus` as the fallback for `action={fn}` forms. The error-handling table row no longer claims the behaviour for free — it points at the mechanism that produces it. Added as pitfall #6, and the no-JS tradeoff is stated and accepted. Manual step 4 verifies it against the installed React 19.3.0. |
| 2 | MEDIUM | **Addressed.** New invariant row "Every field an action writes is pre-filled from the stored value", owned by the form component's `defaultValue`/`defaultChecked`. The `/ms/settings` spec now requires `defaultValue={settings.<key>}` on all thirteen inputs and explains the exact failure mode (`str()` → `""` + unconditional upsert, with `whatsapp_number` the only guarded key). Manual step 8 now checks a text setting: save with no edits, confirm the footer address, hours and Instagram link survive. Confirmed `SiteSettings` fields are non-nullable strings, so no `??` fallback is needed. |
| 3 | MEDIUM | **Addressed.** The `/ms/customers` spec now gives both pre-fills as code, and explains why `COALESCE(?, notes)` does not protect the textarea (`str()` yields `""`, and `COALESCE('', notes)` is `''`). Manual step 9 is "open a row, change nothing, save, confirm both the notes text and the opt-in state survived". |
| 4 | MEDIUM | **Addressed.** The post-submit rule set in *Form submission mechanics* covers all four non-redirecting actions explicitly: create + `ok` → `formRef.current?.reset()`; edit + `ok` → keep values and show `state.message`; `saveDeliverySettingsAction`/`saveSettingsAction` → never reset. Backed by a new invariant row ("A successful create does not become two rows") naming the client as the owner, since `uniqueSlug()` will not object. Manual step 10 is the double-tap test. |
| 5 | MEDIUM | **Addressed.** `/ms/password` uses `const user = await requireAdmin();`, with the reasoning inline (narrows to `SessionUser`, two indexed reads on a once-per-change screen) and the rule generalised to any page needing the user. Pitfall #1 now states the return type of each function so the distinction is unambiguous. |
| 6 | MEDIUM | **Addressed.** `admin-format.ts` now ships a full pinned surface: `AppliedPromo`, `centsToShillingInput(cents: number): string`, `parseDaysOfWeek(csv: string \| null)`, `safeOrderLines(json: string \| null)`, `safeAppliedPromos(json: string \| null)`, `clampSearch(q: string \| undefined, max?: number)`, `positiveInt(v: string \| undefined)`, `isOrderStatus`, `ORDER_STATUSES` and `ORDER_STATUS_LABELS` with its four values. `AppliedPromo` is justified against what the checkout route actually writes. |
| 7 | MEDIUM | **Addressed.** The blanket `min="0"` rule is gone, replaced by a per-field attribute table: `price` `min="1" required`; `fee`/`delivery_flat_fee`/`free_delivery_threshold`/`min_order`/`min_subtotal` `min="0"`; `discount_value` labelled **not a money field**, `min="1" required` plus `max="100"` for percent. The `/ms/promotions` spec and the validation table now both defer to that one table instead of restating numbers. |
| 8 | MEDIUM | **Addressed.** New *Landmarks and page structure* subsection gives the `(dashboard)/layout.tsx` markup order outright — skip link → `<header>` with `<nav aria-label="Admin">` → `<main id="admin-main" className="container-page pb-16">` — reusing the verified `sr-only focus:not-sr-only …` class string from `(site)/layout.tsx`. `(onboarding)` and `(public)/login` wrap their card in `<main>`. The accessibility section leads with landmarks, and manual step 12 is a keyboard check of the skip link. |
| 9 | NIT | **Addressed.** Every "On render (form)" cell is now `centsToShillingInput(...)`, with `discount_value` as `String(promo.discount_value)` to keep it visibly outside the conversion. Added the rule: "`/100` must not appear in any form component." |
| 10 | NIT | **Addressed, both halves.** The chart is headed "Last 7 days (by day)", the empty copy is "No orders in this period yet.", and the `-6 days` vs `-7 days` discrepancy is stated so the copy is not mistaken for a bug. |
| 11 | NIT | **Addressed.** Pitfall #11 (renumbered) now justifies `force-dynamic` from the dashboard pages' SQLite reads and from segment config applying to the whole subtree. The `/ms/login` example is gone; the page spec keeps `getCurrentUser()`. |
| 12 | NIT | **Addressed.** *Storefront link removal* now shows the before and the exact after markup, with no prose about which classes to drop. |
| 13 | NIT | **Addressed.** `/ms/orders` specifies `href={`tel:+${order.phone}`}` and cites both the `normalizeKenyanPhone()` storage format and the `site-footer.tsx` precedent. |
| 14 | NIT | **Addressed.** Banner `title` is `(≥2, ≤120)` in the page table; promo `code` is `(≥3, ≤32, uppercased by the action)`. The validation table also enumerates the per-entity `name` caps (100/60/80/80) and the textarea caps. |
| 15 | NIT | **Addressed.** New edge case: a scope with zero rows replaces the `target_id` select with a note and a link to `/ms/categories` / `/ms/menu` and keeps `scope` at `"all"`. Also stated in the `/ms/promotions` spec. |

Two of the review's open items are now closed by inspection rather than deferred: the installed versions are React 19.3.0 / react-dom 19.3.0 / Next 16.4.0 / TypeScript 7.0.2 (read from `node_modules`, not the `^` ranges), and `site-header.tsx` does use `item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)` with `aria-current={active ? "page" : undefined}`, so `AdminNav` mirrors a real precedent. The remaining open items are inherently runtime checks — `npm run typecheck`, `npm run build`, the `curl -I` header assertions and the rendered `<meta name="robots">` — and are items 4, 13 and 14 of the manual pass.
