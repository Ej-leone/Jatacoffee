# Design review (round 2): Jata admin dashboard at `/ms`

Reviewed: `.agents/tasks/jata-admin-ms-2025-06-11/design.md` (Revision 2)
Reviewed against: the source tree as it stands, read fresh. No builds or test suites were run.

Verdict: **CHANGES_REQUESTED** — 0 HIGH, 3 MEDIUM, 9 NIT.

Revision 2 is substantially stronger than a design of this size usually is. The four areas the task
singled out — route-group gating, action→page mapping, the shillings/cents contract, and the
`/admin`→`/ms` migration — are all **correct as written** and are itemised under *Verified
Assumptions* below. The three MEDIUM findings are the behavioural edge the design asserts but does
not own (post-redirect form state), one unpinned contract (form component props), and one pinned
signature that is wrong against the framework (`searchParams` values).

---

## Findings

### 1. MEDIUM — The three redirecting save forms do not actually clear on `?saved=1`, so a second Save duplicates a row (and a post-edit Save inserts instead of updating)

**Where:** *Form submission mechanics* → "Post-submit behaviour, by action kind", row 1
(`loginAction`, `changePasswordAction`, `saveMenuItemAction`, `saveBannerAction`,
`savePromotionAction` → "never returns — navigation happens"); and the invariant row "A successful
create does not become two rows", which names only `category-form` / `zone-form` as owners.

**The problem.** The design closes the duplicate-create hole for the two non-redirecting actions and
assumes navigation closes it for the three redirecting ones. It does not. `saveMenuItemAction`
redirects to `/ms/menu?saved=1` — the *same route*, only `searchParams` differ. A server-action
redirect is a soft navigation: React reconciles `<MenuItemForm>` at the same position with the same
component type, so it **updates rather than remounts**. Uncontrolled inputs keep their DOM values
(React writes `defaultValue` on mount only; changing it later does not overwrite a live `value`).
Two concrete consequences:

- **Create → Save → Save.** The form still holds everything typed. The second submit calls
  `createMenuItem` again. `uniqueSlug()` mints `spanish-latte-2` without complaint — exactly the
  failure the design documents for `createCategory`/`createZone`.
- **Edit `?edit=5` → Save.** The redirect drops `edit=5`, so the page re-renders in create mode and
  the conditional hidden `id` input is removed from the DOM — while every visible field still shows
  item 5's data. The next Save **inserts a copy of item 5** instead of updating it. Worst case on
  `/ms/banners` and `/ms/promotions` too (and a duplicate promo `code` there at least surfaces as the
  UNIQUE error; a duplicate menu item is silent).

This also reads badly: the `?saved=1` success banner appears above a form that looks unsaved.

**Fix.** Force a remount by keying the form on the page state that changed. In
`(dashboard)/menu/page.tsx` (same shape for `banners` and `promotions`):

```tsx
const editId = positiveInt(sp.edit);          // null in create mode
const saved = sp.saved !== undefined;
const item = editId ? getMenuItem(editId) : null;

<MenuItemForm
  key={editId ? `edit-${editId}` : saved ? "new-saved" : "new"}
  item={item}
  categories={categories}
/>
```

`edit-5` → `new-saved` changes the key, React unmounts and remounts, and the fields come back empty
in create mode. Add this rule to the post-submit table as a fourth row ("redirecting actions: the
page must remount the form via `key`; the redirect alone does not clear it") and extend the
"A successful create does not become two rows" invariant to name the page's `key` as the owner for
these three forms. Add a manual-pass step: edit an item, Save, then Save again without touching
anything, and confirm no second row was created.

---

### 2. MEDIUM — The nine form components have no pinned props, and the create/edit discriminator is named two different things in two sections

**Where:** *Form submission mechanics* defines `export function PromotionForm({ initial /* Promotion | null */, ... })` and the post-submit table keys create mode off `!initial`. The `/ms/menu` spec instead writes `<MenuItemForm item={...} categories={...} />`. The remaining seven components are only listed as filenames in *Route tree and files to create*. The `...` in the snippet is literal — the collection props are never enumerated.

**The problem.** The discriminator is not cosmetic: it drives whether a successful save resets the
form (`state?.ok && !initial`), whether the hidden `id` is rendered, and — per finding 1 — the page's
`key`. With `initial` in one section and `item` in another, the implementer has to guess which is
authoritative, and the two readings produce different component APIs. `admin-format.ts` got a fully
pinned surface in this revision; the nine components that consume it did not.

**Fix.** Pin one convention and apply it everywhere. Suggested, using `initial` since the
behavioural rules already reference it:

```ts
// src/components/admin/*.tsx — one shape for all nine
type FormProps<T> = { initial: T | null };

LoginForm            : { changed?: boolean }
PasswordForm         : {}                                        // user comes from the layout
MenuItemForm         : FormProps<MenuItem>        & { categories: Category[] }
CategoryForm         : FormProps<Category>
BannerForm           : FormProps<Banner>
PromotionForm        : FormProps<Promotion>       & { categories: Category[]; items: MenuItemWithCategory[] }
ZoneForm             : FormProps<DeliveryZone>
DeliverySettingsForm : { settings: SiteSettings }                // update-only, never null
SettingsForm         : { settings: SiteSettings }                // update-only, never null
```

Then change the `/ms/menu` line to `<MenuItemForm initial={item} categories={categories} />` so the
page specs and the mechanics section agree. Note in the table that the two update-only forms take
`settings` rather than `initial` precisely because they have no create mode — which is also why they
never reset.

---

### 3. MEDIUM — `clampSearch` / `positiveInt` signatures are wrong against what Next.js actually puts in `searchParams`

**Where:** *Shared components* → `admin-format.ts` public surface:
`clampSearch(q: string | undefined, max?: number)` and `positiveInt(v: string | undefined)`; plus the
search-param validation table, which claims search params are validated before reaching
`queries.ts`.

**The problem.** A Next.js `searchParams` value is `string | string[] | undefined` — a repeated query
key yields an array. The design types the page props as `Promise<{ q?: string }>`, so TypeScript will
not catch the mismatch, and `npm run typecheck` (the design's primary automated gate) passes. At
runtime `/ms/orders?q=a&q=b` hands `["a","b"]` to `clampSearch`, whose pinned signature invites
`(q ?? "").trim()` — `Array.prototype.trim` does not exist, so the page throws and the user lands on
`/ms/error.tsx`. `positiveInt` survives by luck (`Number(["1","2"])` → `NaN` → `null`), which makes
the inconsistency easy to miss.

**Fix.** Widen both signatures to the real contract and normalise to the first value:

```ts
type Param = string | string[] | undefined;

/** searchParams value -> trimmed, length-capped search string. */
export function clampSearch(q: Param, max = 60): string {
  const raw = Array.isArray(q) ? (q[0] ?? "") : (q ?? "");
  return raw.trim().slice(0, max);
}

/** searchParams value -> positive integer, or null. */
export function positiveInt(v: Param): number | null {
  const raw = Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
```

Type the page props to match (`searchParams: Promise<{ q?: string | string[] }>`, same for `status`,
`edit`, `saved`), and add a row to the search-param table: "a repeated key arrives as an array; take
the first value".

---

### 4. NIT — `role="alert"` with `aria-live="polite"` is self-cancelling

**Where:** *Error handling* table ("a `role="alert"` region with `aria-live="polite"`") and
*Accessibility and mobile* ("error regions use `role="alert"` with `aria-live="polite"`").

`role="alert"` carries an implicit `aria-live="assertive"`; an explicit `aria-live="polite"`
overrides it, so the markup asks for an alert and then downgrades it. Pick one: `role="alert"` alone
for validation errors (they are the result of a user action and should interrupt), and the already
specified `role="status"` for the saved/changed banners. Drop `aria-live` from the error region.

---

### 5. NIT — The `title.template` on `src/app/ms/layout.tsx` is dead code as specified

**Where:** *Gating structure* → the `src/app/ms/layout.tsx` snippet, justified as "overriding
`title.template` stops admin pages inheriting the root layout's `"%s | Jata Cafe Eastleigh"` suffix".

`template` only applies to children that export a `title`. No `/ms` page spec exports `metadata`, so
every screen renders `title.default` = "Jata admin" and the template never fires. Either drop the
template, or add the missing per-page metadata and keep it:

```tsx
// (dashboard)/orders/page.tsx -> "Orders · Jata admin"
export const metadata = { title: "Orders" };
```

Pick one and say which. If pages do get titles, list the nine strings so they are not invented twice.

---

### 6. NIT — `max_uses` with `min="0"` lets a manager silently kill a promotion

**Where:** *Money* → number-input attributes table, row `eta_minutes`, `max_uses`:
`type="number" min="0" step="1"`.

The design's stated principle is that the browser should reject what the server rejects — but here the
server accepts `0` and `0` is semantically fatal: `listPublicPromotions()` filters on
`max_uses === null || usage_count < max_uses`, so `max_uses = 0` means the offer can never apply, with
no error anywhere and a row reading "0 / 0". `eta_minutes = 0` is harmless by contrast.

**Fix.** Split the row: `eta_minutes` keeps `min="0"`; `max_uses` gets `min="1"` with help text
"Leave blank for unlimited."

---

### 7. NIT — List rows carry two or three sibling `<form>`s and the design never forbids nesting them

**Where:** `/ms/menu` (toggle form + `ConfirmDelete`), `/ms/banners` (toggle + delete),
`/ms/promotions` (toggle + delete), `/ms/customers` (inline save form + delete), `/ms/orders`
(status form). `ConfirmDelete` contains its own `<form>`; no row markup is given.

Nested `<form>` elements are invalid HTML — the parser drops the inner one, so a "Yes, delete X"
button placed inside the inline save form would submit the **save** action instead of the delete.
Silent and nasty, and nothing in the design rules it out.

**Fix.** Add one line to the `ConfirmDelete` spec: "`ConfirmDelete` renders a `<form>`, so it must
always be a *sibling* of any other form in the row, never a descendant. Rows with an inline edit form
place the save form and the delete disclosure in the same flex container, not one inside the other."

---

### 8. NIT — The orders phone link's visible text is unspecified, and an existing formatter is overlooked

**Where:** `/ms/orders` → "phone as `<a href={`tel:+${order.phone}`}>`".

The `href` is right (`normalizeKenyanPhone()` stores `254XXXXXXXXX`, digits only — verified), but the
link text is never stated, so rows will show the raw `254712345678`. `src/lib/whatsapp.ts` already
exports `formatKenyanPhone("254712345678")` → `"+254 712 345 678"`, which is the project-consistent
display form.

**Fix.** Specify `<a href={`tel:+${order.phone}`}>{formatKenyanPhone(order.phone)}</a>` and add
`formatKenyanPhone` to the list of existing helpers the admin reuses (it is a pure function in a
module with no `server-only`, so it is safe in either component kind).

---

### 9. NIT — `centsToShillingInput` is lossy for sub-shilling values and the design does not say so

**Where:** *Money* → the `centsToShillingInput` snippet (`String(Math.round(cents / 100))`).

Every seeded price is `KES(n) = n * 100` and `step="1"` keeps UI writes whole, so the round-trip is
clean today. But `shillingsToCents()` is a server function: a crafted POST of `350.49` stores `35049`,
and the next save through the form silently rewrites it to `35000`. The design asserts the round-trip
("`35000 → "350"`") without stating the rounding direction or that it is one-way.

**Fix.** Add a sentence under the money table: "Stored cents are assumed to be whole shillings;
`centsToShillingInput` rounds to the nearest shilling, so a value that is not a multiple of 100 is
normalised on the next save. This is accepted — no UI path can create one." Keep `Math.round`.

---

### 10. NIT — Truncated lists give no sign that they are truncated

**Where:** `/ms/orders` (`listOrders({ limit: 100, ... })`), `/ms/customers`
(`listCustomers({ limit: 200, ... })`). *Out of scope* acknowledges there is no pagination.

On a busy week the owner sees 100 orders and no indication that older ones exist, which reads as data
loss rather than a limit.

**Fix.** Specify the disclosure: when `orders.length === 100`, render under the table *"Showing the
100 most recent orders. Use the search box to find older ones."* Same for customers at 200.

---

### 11. NIT — The design never states what happens to the old `/admin` URL

**Where:** *`/admin` → `/ms` path migration*.

After the rewrite, `/admin` matches no route and falls through to `src/app/not-found.tsx` (verified:
plain card, no storefront chrome, no admin link). That is the right outcome given the brief, but it
is left implicit — and a helpful implementer may well add a `/admin` → `/ms` redirect to
`next.config.ts`, which would re-expose the path the user asked to retire.

**Fix.** One line in the migration section: "`/admin` is deliberately left to 404 via the existing
root `not-found.tsx`. Do **not** add a redirect, rewrite or alias from `/admin` — that would defeat
the point of moving the URL."

---

### 12. NIT — `ui.tsx`, `SubmitButton` and `ConfirmDelete` prop surfaces are unpinned; `variant?` has no enumerated values

**Where:** *Shared components*. `SubmitButton` props are `{ children, pending?: boolean, className?, variant? }` with no values for `variant`; `ConfirmDelete` is `{ action, id, label, warning? }` with no type for `action`; `PageHeader`, `StatCard`, `SavedNotice`, `StatusPill` and `Money` have no props listed at all.

Lower stakes than finding 2 because these are presentational, but `variant?` with no enumeration is a
straight ambiguity, and `action` has to accept two different shapes.

**Fix.** Pin them:

```ts
type Variant = "primary" | "outline" | "ghost";   // -> .btn-primary / .btn-outline / .btn-ghost

SubmitButton : { children: React.ReactNode; pending?: boolean; className?: string; variant?: Variant }
ConfirmDelete: { action: (form: FormData) => Promise<void>; id: number; label: string; warning?: string }
PageHeader   : { kicker?: string; title: string; description?: string }
StatCard     : { label: string; value: string; hint?: string; href?: string }
SavedNotice  : { show: boolean; children: React.ReactNode }
StatusPill   : { status: OrderStatus }            // new -> caramel, confirmed -> espresso,
                                                  // completed -> leaf, cancelled -> berry
Money        : { cents: number; currency: string }
```

`logoutAction`'s `() => Promise<void>` is assignable to `ConfirmDelete`'s `action` type if it is ever
used there (fewer parameters is fine), so one type covers both shapes.

---

## Verified Assumptions

Each of these is a claim the design makes that I checked against the source and found accurate.

**Route-group gating (the redirect-loop question).** The structure is correct. `requireAdmin()` is the
only redirect source (`src/lib/auth.ts:79`) and it targets `/ms/login`, which sits in `(public)` with
no layout of its own and therefore renders directly inside the pass-through
`src/app/ms/layout.tsx` — no auth call on that request path. `(onboarding)/layout.tsx` requires a
session but not `must_change_password`, so `/ms/password` renders for the forced-change user.
`(dashboard)/layout.tsx` owns the `must_change_password` → `/ms/password` redirect. The three groups
define disjoint URLs (`/ms/login`, `/ms/password`, `/ms` + eight children), so there is no
parallel-page conflict. Every hop is one-way: `/ms/login` → `/ms` → (`must_change` only) →
`/ms/password`, which renders. No cycle exists in the specified arrangement.

**Post-password-change session handling.** `changePassword()` runs
`DELETE FROM sessions WHERE user_id = ?` (`auth.ts`), so after `redirect("/ms/login?changed=1")` the
orphaned cookie resolves to `getCurrentUser() === null` and the login form renders instead of
bouncing to `/ms`. The design's "no cleanup code needed" is right.

**Every server action is mapped to a page, with the right driving mechanism.** All 21 exports of
`src/lib/admin-actions.ts` appear in a page spec. The nine with an `(_prev: ActionState, form: FormData)`
signature — `loginAction`, `changePasswordAction`, `saveBannerAction`, `saveCategoryAction`,
`saveMenuItemAction`, `saveZoneAction`, `saveDeliverySettingsAction`, `savePromotionAction`,
`saveSettingsAction` — are exactly the nine the design drives with `useActionState`. The twelve
`Promise<void>` actions are exactly the ones it drives with a plain `action={fn}` form, including the
two that look like saves: `saveCustomerAction` (correctly flagged as **not** `useActionState`) and
`setOrderStatusAction`. `logoutAction()` taking no parameters while being used as `<form action={...}>`
is fine, as the design says.

**FormData field names.** I checked every name in every page table against the `str`/`int`/`id`/`bool`/
`shillingsToCents`/`getAll` reads in the action bodies. All match, including the two easy-to-miss ones:
the nine content fields `toggleBannerAction` rebuilds from FormData (`title`, `subtitle`, `image_url`,
`link_url`, `cta_label`, `theme`, `sort_order`, `starts_at`, `ends_at` — and correctly *not*
`is_active`, which comes from `next_state`), and `days` as a repeated key read with
`form.getAll("days")`. The contrast the design draws with `togglePromotionAction` is real: that one
calls `getPromotion(id)` itself, so `id` + `next_state` genuinely suffice.

**Money contract, both forms.** Storage is cents, UI is whole shillings, and the split is specified
correctly. `shillingsToCents()` multiplies on write for `price`, `fee`, `delivery_flat_fee`,
`free_delivery_threshold`, `min_order` and `min_subtotal`; display goes through
`centsToShillingInput()` for all six. `discount_value` is correctly carved out: `savePromotionAction`
reads it with `int()`, and `pricing.ts#discountAmount` does
`Math.min(base, promo.discount_value * 100)` for `fixed`, so the admin form must stay a passthrough —
exactly as the design states. The seeded "Big order bonus" is `discount_value: 200` /
`min_subtotal_cents: KES(3000)`, matching manual step 6's expectations (200 and 3000). The warning
against `formatAmount`/`formatMoney` in input values is sound: both call `toLocaleString("en-KE")`.

**`/admin` → `/ms` migration is exhaustive.** `src/lib/auth.ts` has exactly one occurrence (line 79).
`src/lib/admin-actions.ts` has exactly **29**, and the design's function-by-function table sums to 29
and covers every one. A repo-wide search (excluding `node_modules`, `.next`, `.git`) finds `/admin`
only in those two files plus `src/app/robots.ts`, `next.config.ts` and `src/components/site-footer.tsx`
— precisely the five files the design lists. `src/app/sitemap.ts` has no admin route. The
`next.config.ts` catch is real and important: `{ source: "/admin/:path*" }` carries
`X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`, and `{ source: "/:path*" }` is indeed
already used for the security headers. Every action-referenced path has a page: `/ms`, `/ms/login`,
`/ms/orders`, `/ms/menu`, `/ms/categories`, `/ms/banners`, `/ms/promotions`, `/ms/delivery`,
`/ms/customers`, `/ms/settings`.

**Storefront link removal.** The "before" snippet in the design matches `site-footer.tsx` lines
118-127 verbatim, the `Link` import is still needed by the "Order" nav list in the same file, and
there is no other `/admin` or "Staff login" reference anywhere in `src/components` or `src/app/(site)`.

**Data-loss invariants.** All three are real. `saveSettingsAction` passes all 13 keys to
`updateSettings()`, which upserts every key in the patch, and `str()` returns `""` — so a form without
pre-fill does wipe twelve settings while only `whatsapp_number` is guarded. `updateCustomerNotes`'s
`notes = COALESCE(?, notes)` genuinely does not protect the textarea: `saveCustomerAction` passes
`str(form, "notes", 400)`, and `patch.notes ?? null` keeps `""`, so SQLite evaluates `COALESCE('', notes)`
→ `''`. `toggleBannerAction` does rebuild the whole row from FormData, and `updateBanner` applies
`input.theme || "espresso"`. Every `SiteSettings` field the settings form writes is a non-nullable
`string` in `types.ts`, so `defaultValue={settings.address_line}` needs no `??`. `Customer.notes` is
`string | null` and `marketing_opt_in` is `number`, matching the design's
`defaultValue={customer.notes ?? ""}` / `defaultChecked={customer.marketing_opt_in === 1}`.

**Schema claims.** `menu_items.category_id REFERENCES categories(id) ON DELETE CASCADE` with
`foreign_keys = ON`; `customers.zone_id`, `orders.zone_id` and `orders.customer_id` all
`ON DELETE SET NULL`; `CREATE UNIQUE INDEX idx_promo_code ON promotions(code) WHERE code IS NOT NULL`;
`busy_timeout = 5000`; seeded owner `admin@jatacafe.co.ke` / `ChangeMe@Jata2026` with
`must_change_password = 1`; `seed()` returns early when `categories` is non-empty; `promotions.target_id`
has no FK, which is why the "target missing" edge case is needed. `categories` and `delivery_zones`
have no uniqueness on `name`, and `uniqueSlug()` does mint a `-2` suffix silently.

**Query layer.** `listMenu({})` applies no clauses; `listCategories({ includeHidden: true })` is
unpaginated (so the in-memory `.find()` for `?edit=` is sound); `listOrders` skips the `status = ?`
clause for `"all"` and matches `search` against `phone`, `customer_name`, `reference`; `listCustomers`
matches phone, name, location and is limited; there is no `getCategoryById` and no `getCustomerById`,
but `getMenuItem`, `getBanner`, `getZone` and `getPromotion` all exist. `getDashboardStats()` does
build `daily` from `'-6 days'` while `orders_7d`/`revenue_7d_cents` use `'-7 days'`, and it silently
skips malformed `items_json`. `DashboardStats` has every field the dashboard spec reads.

**Helpers and precedents.** `AppliedPromo = { name, amount_cents }` matches what
`src/app/api/checkout/route.ts:205-208` writes. `normalizeKenyanPhone()` returns `254XXXXXXXXX` with
no `+`, so `tel:+${order.phone}` is correct, and `site-footer.tsx` sets the same precedent.
`site-header.tsx` really does use
`item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)` with
`aria-current={active ? "page" : undefined}`. `(site)/menu/page.tsx` already types
`SearchParams = Promise<{...}>` and awaits it. `icons.tsx` exports all nine icons the nav needs
(`GridIcon`, `BagIcon`, `SparkIcon`, `ImageIcon`, `TagIcon`, `ScooterIcon`, `UsersIcon`,
`SettingsIcon`, `LogoutIcon`) plus `AlertIcon`, and its shared `base(size)` helper does set
`"aria-hidden": true`. `hero-banners.tsx` `THEMES` has exactly `espresso | caramel | mint | berry`
with `?? THEMES.espresso` as the fallback. `describeSchedule` and `isPromotionLive` exist in
`pricing.ts` and a `Promotion` row structurally satisfies both parameter types.

**Styling and landmarks.** Every class the design reuses exists in `globals.css`: `.container-page`,
`.card`, `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.field`, `.field-label`,
`.field-error`, `.chip`, `.prose-note`, `.no-scrollbar`, and `.admin-table` with its `th`/`td`/
`tbody tr:hover` rules. `.btn` carries `min-height: 2.875rem`, and the file has both a
`:focus-visible` rule and a `prefers-reduced-motion` block. The skip-link class string is copied
verbatim from `(site)/layout.tsx`. The root layout is `<html lang="en-KE"><body>{children}</body></html>`
with the `"%s | Jata Cafe Eastleigh"` template, and `<main id="main">` plus the skip link live in
`(site)/layout.tsx`, which `/ms` does not share — so the design is right that each `/ms` group must
supply its own landmarks. Tailwind v4 is wired through `@import "tailwindcss"` with no `@source`
override, so new files under `src/app/ms/` and `src/components/admin/` are picked up automatically.

**Toolchain.** Installed versions are react 19.3.0, react-dom 19.3.0, next 16.4.0, typescript 7.0.2 —
matching the design's "locked" table rather than the `^` ranges. `tsconfig.json` has `strict: true`
and `@/*` → `./src/*`. `package.json` has `typecheck` and `build` and no test runner.
`scripts/` contains only `generate-placeholders.mjs`, so the design is right that `npm run db:reset`
points at a missing `scripts/reset-db.mjs` and the existing database must not be deleted. `predev`
and `prebuild` both run a script that does exist, so the manual pass can start.

**Accepted gaps I agree with.** The `must_change_password` gate being UI-only is correctly reasoned —
`requireAdmin()` does not check the flag and closing it means editing `auth.ts`, and the holder
already has valid credentials for that account, so exposure really is nil. Importing a
`"use server"` module into Client Components is fine, and `admin-actions.ts`'s `export type ActionState`
does not violate the async-only export rule because types are erased before the bundler sees them.
Last-write-wins concurrency and the no-JS tradeoff for the nine hook-driven forms are both stated and
reasonable for a single-operator dashboard.

---

## Unverified / Wrong Assumptions

1. **Wrong (finding 1):** "`loginAction`, `changePasswordAction`, `saveMenuItemAction`,
   `saveBannerAction`, `savePromotionAction` … never returns — navigation happens" is used to conclude
   that the redirecting forms need no reset. A server-action redirect to the same route is a soft
   navigation, so the client form component is reconciled rather than remounted and uncontrolled
   fields keep their values. The two login/password cases are unaffected (they navigate to a
   different route), but the three save forms are.
2. **Wrong (finding 3):** `clampSearch(q: string | undefined)` and
   `positiveInt(v: string | undefined)` assume a `searchParams` value is always a string. Next.js
   hands over `string | string[] | undefined`.
3. **Unverified, plausible, and the design says so:** that React 19.3.0's automatic form reset applies
   only to `action`-prop submissions, so `onSubmit` + `startTransition(() => formAction(data))`
   preserves typed input. This matches React's documented `requestFormReset` behaviour and is the
   standard way to dispatch a `useActionState` action programmatically, and manual step 4 is written
   to confirm it against the installed version. I could not confirm it without running the app, and
   the design does not pretend otherwise. If step 4 fails, the fallback is a controlled-state form,
   not the rejected "tell the user their input was discarded" option.
4. **Unverified but low risk, with a stated contingency:** that `{ source: "/ms/:path*" }` in
   `next.config.ts` matches bare `/ms` as well as its children. This is true of path-to-regexp's
   optional-modifier handling, but the design's stated reasoning ("`/:path*` matches zero segments,
   which confirms it") does not actually establish it. The design already carries the right
   contingency — add a second `{ source: "/ms" }` entry if `curl -I http://localhost:3000/ms` comes
   back without the two headers — so no change is required beyond keeping manual step 13.
5. **Unverified, runtime-only:** `npm run typecheck`, `npm run build`, the two `curl -I` header
   assertions and the rendered `<meta name="robots">` check. Per the task instructions I did not run
   builds or test suites. These stay as manual-pass items 13 and 14.
