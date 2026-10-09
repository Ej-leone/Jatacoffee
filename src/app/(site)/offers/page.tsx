import Link from "next/link";
import type { Metadata } from "next";
import { ClockIcon, TagIcon } from "@/components/icons";
import {
  describeSchedule,
  formatMoney,
  isPromotionLive,
  nairobiClock,
} from "@/lib/pricing";
import { getSettings, listCategories, listMenu, listPromotions } from "@/lib/queries";
import type { Category, Promotion } from "@/lib/types";

export const metadata: Metadata = {
  title: "Offers & Happy Hour",
  description:
    "Current Jata Cafe offers: happy hour discounts on signature coffees, discount codes and automatic cart savings. Eastleigh, Nairobi.",
  alternates: { canonical: "/offers" },
};

function scopeText(promo: Promotion, categories: Category[], itemNames: Map<number, string>) {
  if (promo.scope === "all") return "your whole order";
  if (promo.scope === "category") {
    return categories.find((c) => c.id === promo.target_id)?.name ?? "selected items";
  }
  return itemNames.get(promo.target_id ?? -1) ?? "a selected item";
}

export default async function OffersPage() {
  const settings = getSettings();
  const categories = listCategories({ includeHidden: true });
  const promotions = listPromotions({ activeOnly: true });
  const itemNames = new Map(listMenu().map((item) => [item.id, item.name]));
  const clock = nairobiClock();

  const live = promotions.filter((p) => isPromotionLive(p, clock));
  const scheduled = promotions.filter((p) => !isPromotionLive(p, clock));

  const renderCard = (promo: Promotion, isLive: boolean) => (
    <li key={promo.id} className="card flex flex-col gap-2.5 p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`chip ${
            isLive ? "bg-leaf-500/12 text-leaf-600" : "bg-cream-200 text-espresso-600"
          }`}
        >
          <TagIcon size={13} />
          {isLive ? "On now" : "Scheduled"}
        </span>
        {promo.code && (
          <span className="rounded-md border border-dashed border-caramel-400 bg-caramel-300/20 px-2.5 py-1 font-mono text-sm font-bold tracking-wider text-caramel-600">
            {promo.code}
          </span>
        )}
      </div>

      <h3 className="font-display text-xl font-bold leading-snug text-espresso-900">
        {promo.name}
      </h3>

      <p className="font-display text-2xl font-bold text-caramel-600">
        {promo.discount_type === "percent"
          ? `${promo.discount_value}% off`
          : `${formatMoney(promo.discount_value * 100, settings.currency)} off`}
      </p>

      <p className="prose-note">
        Applies to <strong className="font-semibold">{scopeText(promo, categories, itemNames)}</strong>
        {promo.min_subtotal_cents > 0 && (
          <> on orders from {formatMoney(promo.min_subtotal_cents, settings.currency)}</>
        )}
        {promo.code
          ? ". Enter the code at checkout."
          : ". Applied automatically in your cart."}
      </p>

      {(promo.start_time || promo.days_of_week) && (
        <p className="mt-auto flex items-center gap-1.5 pt-1 text-xs font-semibold text-espresso-500">
          <ClockIcon size={13} />
          {describeSchedule(promo)} · Nairobi time
        </p>
      )}
    </li>
  );

  return (
    <>
      <header className="container-page pt-6">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
          Save a little
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-espresso-900">
          Offers & happy hour
        </h1>
        <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-espresso-600">
          Fancy but affordable, and cheaper still at the right time of day. Discounts apply
          themselves in your cart, so what you see is what you pay.
        </p>
      </header>

      {live.length > 0 && (
        <section aria-labelledby="live" className="container-page mt-7">
          <h2 id="live" className="font-display text-2xl font-bold text-espresso-900">
            Running right now
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((promo) => renderCard(promo, true))}
          </ul>
        </section>
      )}

      {scheduled.length > 0 && (
        <section aria-labelledby="scheduled" className="container-page mt-9">
          <h2 id="scheduled" className="font-display text-2xl font-bold text-espresso-900">
            Coming back later
          </h2>
          <p className="prose-note mt-1">
            These switch on automatically when their window opens.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scheduled.map((promo) => renderCard(promo, false))}
          </ul>
        </section>
      )}

      {promotions.length === 0 && (
        <section className="container-page mt-7">
          <div className="card p-8 text-center">
            <p className="font-display text-lg font-bold text-espresso-900">
              No offers running today
            </p>
            <p className="prose-note mx-auto mt-1 max-w-sm">
              Our everyday prices are already friendly. Check the menu and see.
            </p>
            <Link href="/menu" className="btn btn-primary mt-4">
              Browse the menu
            </Link>
          </div>
        </section>
      )}

      <section className="container-page mt-10">
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <h2 className="font-display text-xl font-bold text-espresso-900">
            Put an offer to work
          </h2>
          <p className="prose-note max-w-md">
            Add items to your cart and the savings show up before you send the order.
          </p>
          <Link href="/menu" className="btn btn-accent">
            Go to the menu
          </Link>
        </div>
      </section>
    </>
  );
}

// Cached HTML for fast first paint on mobile data. Admin edits push an immediate
// refresh via revalidateStorefront(); this is the self-healing fallback.
export const revalidate = 120;
