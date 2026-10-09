import Link from "next/link";
import type { Metadata } from "next";
import { MenuItemCard } from "@/components/menu-item-card";
import { LiveOffers } from "@/components/live-offers";
import { SearchIcon } from "@/components/icons";
import {
  getSettings,
  listCategories,
  listMenu,
  listPromotions,
} from "@/lib/queries";
import type { MenuItemWithCategory } from "@/lib/types";

export const metadata: Metadata = {
  title: "Menu & Prices",
  description:
    "The full Jata Cafe menu: signature coffees, fast food, main meals, desserts, cold drinks and breakfast, with live prices in KES. Add to cart and order on WhatsApp.",
  alternates: { canonical: "/menu" },
};

type SearchParams = Promise<{ category?: string; q?: string }>;

export default async function MenuPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { category: activeSlug = "", q = "" } = await searchParams;
  const query = q.trim();

  const settings = getSettings();
  const categories = listCategories();
  const promotions = listPromotions({ activeOnly: true });

  const all = listMenu({ availableOnly: true });
  const itemNames = new Map(all.map((item) => [item.id, item.name]));

  const selected = categories.find((c) => c.slug === activeSlug) ?? null;

  const filtered = all.filter((item) => {
    if (selected && item.category_id !== selected.id) return false;
    if (!query) return true;
    const haystack = `${item.name} ${item.description ?? ""} ${item.category_name}`;
    return haystack.toLowerCase().includes(query.toLowerCase());
  });

  // Group into the categorised layout the brief asks for.
  const groups: { id: number; name: string; slug: string; blurb: string | null; items: MenuItemWithCategory[] }[] = [];
  for (const item of filtered) {
    let group = groups.find((g) => g.id === item.category_id);
    if (!group) {
      const meta = categories.find((c) => c.id === item.category_id);
      group = {
        id: item.category_id,
        name: item.category_name,
        slug: item.category_slug,
        blurb: meta?.blurb ?? null,
        items: [],
      };
      groups.push(group);
    }
    group.items.push(item);
  }

  const chipBase =
    "block whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition-colors";

  return (
    <>
      <header className="container-page pt-6">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
          {settings.tagline}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-espresso-900">
          {selected ? selected.name : "Our menu"}
        </h1>
        <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-espresso-600">
          {selected?.blurb ||
            "Every price below is what you pay in the cafe. Add what you want, then send the order straight to our WhatsApp."}
        </p>

        {/* GET form: search works with JavaScript switched off. */}
        <form
          action="/menu"
          method="get"
          role="search"
          className="mt-4 flex max-w-md items-center gap-2"
        >
          {selected && <input type="hidden" name="category" value={selected.slug} />}
          <div className="relative flex-1">
            <SearchIcon
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-espresso-500"
            />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search the menu"
              aria-label="Search the menu"
              className="field !pl-10"
            />
          </div>
          <button type="submit" className="btn btn-primary !px-4">
            Search
          </button>
        </form>
      </header>

      {/* Category filter rail */}
      <nav aria-label="Menu categories" className="container-page mt-5">
        <ul className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <li>
            <Link
              href={query ? `/menu?q=${encodeURIComponent(query)}` : "/menu"}
              aria-current={!selected ? "page" : undefined}
              className={`${chipBase} ${
                !selected
                  ? "bg-espresso-800 text-cream-50"
                  : "bg-white text-espresso-700 ring-1 ring-cream-200"
              }`}
            >
              Everything
            </Link>
          </li>
          {categories.map((category) => {
            const href = query
              ? `/menu?category=${category.slug}&q=${encodeURIComponent(query)}`
              : `/menu?category=${category.slug}`;
            const active = selected?.id === category.id;
            return (
              <li key={category.id}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`${chipBase} ${
                    active
                      ? "bg-espresso-800 text-cream-50"
                      : "bg-white text-espresso-700 ring-1 ring-cream-200"
                  }`}
                >
                  {category.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="container-page mt-5">
        <LiveOffers
          compact
          promotions={promotions}
          categories={categories}
          itemNames={itemNames}
          currency={settings.currency}
        />
      </div>

      {groups.length === 0 ? (
        <div className="container-page mt-8">
          <div className="card p-8 text-center">
            <p className="font-display text-lg font-bold text-espresso-900">
              Nothing matched that
            </p>
            <p className="prose-note mx-auto mt-1 max-w-sm">
              Try a shorter word, or browse everything we have.
            </p>
            <Link href="/menu" className="btn btn-primary mt-4">
              Show the full menu
            </Link>
          </div>
        </div>
      ) : (
        groups.map((group, groupIndex) => (
          <section
            key={group.id}
            id={group.slug}
            aria-labelledby={`heading-${group.slug}`}
            className="container-page mt-8 scroll-mt-28"
          >
            <div className="flex items-end justify-between gap-3 border-b border-cream-200 pb-2.5">
              <div>
                <h2
                  id={`heading-${group.slug}`}
                  className="font-display text-xl font-bold text-espresso-900"
                >
                  {group.name}
                </h2>
                {group.blurb && !selected && (
                  <p className="mt-0.5 text-[0.8125rem] text-espresso-500">{group.blurb}</p>
                )}
              </div>
              <span className="shrink-0 text-[0.6875rem] font-bold uppercase tracking-wider text-espresso-500">
                {group.items.length} items
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item, index) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  currency={settings.currency}
                  priority={groupIndex === 0 && index < 2}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <div className="container-page mt-10">
        <div className="card p-5 text-center sm:p-6">
          <h2 className="font-display text-xl font-bold text-espresso-900">
            Can't find something?
          </h2>
          <p className="prose-note mx-auto mt-1 max-w-md">
            We cook plenty that never makes the printed list. Message us and ask.
          </p>
          <Link href="/delivery" className="btn btn-outline mt-4">
            See delivery zones & rates
          </Link>
        </div>
      </div>
    </>
  );
}

// Cached HTML for fast first paint on mobile data. Admin edits push an immediate
// refresh via revalidateStorefront(); this is the self-healing fallback.
export const revalidate = 120;
