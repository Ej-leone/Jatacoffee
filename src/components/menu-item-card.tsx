import Image from "next/image";
import { AddToCart } from "./add-to-cart";
import { StarIcon } from "./icons";
import { formatMoney } from "@/lib/pricing";
import type { MenuItemWithCategory } from "@/lib/types";

const FALLBACK_IMAGE = "/img/generated/placeholder.webp";

/**
 * Menu card. A compact row on phones (fast to scan, cheap to download) and a
 * photo-led card from the `sm` breakpoint up.
 */
export function MenuItemCard({
  item,
  currency,
  priority = false,
}: {
  item: MenuItemWithCategory;
  currency: string;
  priority?: boolean;
}) {
  const soldOut = item.is_available === 0;
  const image = item.image_url?.trim() || FALLBACK_IMAGE;

  return (
    <article
      className={`card flex gap-3 overflow-hidden p-3 sm:flex-col sm:p-0 ${
        soldOut ? "opacity-70" : ""
      }`}
    >
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-cream-100 sm:h-auto sm:w-full sm:rounded-none sm:aspect-[4/3]">
        <Image
          src={image}
          alt={item.name}
          fill
          sizes="(max-width: 640px) 96px, (max-width: 1024px) 45vw, 300px"
          className="object-cover"
          priority={priority}
          quality={70}
        />
        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-espresso-900/55">
            <span className="rounded-full bg-cream-50 px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-espresso-900">
              Sold out
            </span>
          </div>
        )}
        {!soldOut && item.badge && (
          <span className="absolute left-2 top-2 hidden items-center gap-1 rounded-full bg-caramel-500 px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-white sm:inline-flex">
            <StarIcon size={10} />
            {item.badge}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-bold leading-snug text-espresso-900">
            {item.name}
          </h3>
          <p className="shrink-0 font-display text-base font-bold tabular-nums text-caramel-600">
            {formatMoney(item.price_cents, currency)}
          </p>
        </div>

        {item.badge && !soldOut && (
          <span className="mt-1 w-fit rounded-full bg-caramel-300/40 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-caramel-600 sm:hidden">
            {item.badge}
          </span>
        )}

        {item.description && (
          <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-espresso-600 sm:line-clamp-3">
            {item.description}
          </p>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-2 sm:mt-4">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-espresso-500">
            {item.category_name}
          </span>
          <AddToCart
            compact
            soldOut={soldOut}
            line={{
              id: item.id,
              name: item.name,
              price_cents: item.price_cents,
              image_url: item.image_url,
              category_id: item.category_id,
              category_name: item.category_name,
            }}
          />
        </div>
      </div>
    </article>
  );
}
