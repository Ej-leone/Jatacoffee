import Link from "next/link";
import { ClockIcon, TagIcon } from "./icons";
import {
  describeSchedule,
  formatMoney,
  isPromotionLive,
  nairobiClock,
} from "@/lib/pricing";
import type { Category, Promotion } from "@/lib/types";

function scopeLabel(promo: Promotion, categories: Category[], itemNames: Map<number, string>) {
  if (promo.scope === "all") return "your whole order";
  if (promo.scope === "category") {
    return categories.find((c) => c.id === promo.target_id)?.name.toLowerCase() ?? "selected items";
  }
  return itemNames.get(promo.target_id ?? -1) ?? "selected items";
}

function valueLabel(promo: Promotion, currency: string) {
  return promo.discount_type === "percent"
    ? `${promo.discount_value}% off`
    : `${formatMoney(promo.discount_value * 100, currency)} off`;
}

/**
 * Shows what is on offer right now, plus anything scheduled for later today.
 * Everything here comes straight from the promotions engine in the admin panel.
 */
export function LiveOffers({
  promotions,
  categories,
  itemNames,
  currency,
  compact = false,
}: {
  promotions: Promotion[];
  categories: Category[];
  itemNames: Map<number, string>;
  currency: string;
  compact?: boolean;
}) {
  const clock = nairobiClock();
  const live = promotions.filter((p) => p.is_active === 1 && isPromotionLive(p, clock));

  if (live.length === 0) return null;

  if (compact) {
    const first = live[0];
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-leaf-500/25 bg-leaf-500/8 px-3.5 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf-600 text-white">
          <TagIcon size={14} />
        </span>
        <p className="text-[0.8125rem] font-medium text-leaf-600">
          <strong className="font-bold">{valueLabel(first, currency)}</strong> on{" "}
          {scopeLabel(first, categories, itemNames)} right now
          {first.code ? (
            <>
              {" "}
              with code <strong className="font-bold">{first.code}</strong>
            </>
          ) : null}
          .
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="live-offers" className="container-page mt-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
            On now
          </p>
          <h2 id="live-offers" className="font-display text-2xl font-bold text-espresso-900">
            Live offers
          </h2>
        </div>
        <Link
          href="/offers"
          className="shrink-0 text-sm font-semibold text-caramel-600 underline underline-offset-4"
        >
          All offers
        </Link>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {live.map((promo) => (
          <li key={promo.id} className="card flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="chip bg-leaf-500/12 text-leaf-600">
                <TagIcon size={13} />
                {valueLabel(promo, currency)}
              </span>
              {promo.code && (
                <span className="rounded-md border border-dashed border-caramel-400 bg-caramel-300/20 px-2 py-1 font-mono text-xs font-bold tracking-wider text-caramel-600">
                  {promo.code}
                </span>
              )}
            </div>

            <h3 className="font-display text-lg font-bold leading-snug text-espresso-900">
              {promo.name}
            </h3>

            <p className="prose-note">
              Applies to {scopeLabel(promo, categories, itemNames)}
              {promo.min_subtotal_cents > 0 && (
                <> on orders from {formatMoney(promo.min_subtotal_cents, currency)}</>
              )}
              .
            </p>

            {(promo.start_time || promo.days_of_week) && (
              <p className="mt-auto flex items-center gap-1.5 pt-1 text-xs font-semibold text-espresso-500">
                <ClockIcon size={13} />
                {describeSchedule(promo)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
