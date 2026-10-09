import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { HeroBanners } from "@/components/hero-banners";
import { LiveOffers } from "@/components/live-offers";
import { MenuItemCard } from "@/components/menu-item-card";
import { OrderTypeCta } from "@/components/order-type-cta";
import {
  ChevronRightIcon,
  ClockIcon,
  PinIcon,
  ScooterIcon,
  SparkIcon,
  WhatsAppIcon,
} from "@/components/icons";
import { formatMoney } from "@/lib/pricing";
import {
  getSettings,
  listBanners,
  listCategories,
  listFeatured,
  listMenu,
  listPromotions,
  listZones,
} from "@/lib/queries";
import { buildEnquiryUrl } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Jata Cafe | Fancy but Affordable Cafe in Eastleigh, Nairobi",
  description:
    "Signature coffees, fast food, main meals and desserts on 18th Street, Section 3, Eastleigh. Order on WhatsApp for delivery across Eastleigh, Umoja, Buruburu and Nairobi CBD.",
  alternates: { canonical: "/" },
};

const CATEGORY_ART: Record<string, string> = {
  "signature-coffees": "/img/generated/signature-coffees.webp",
  "fast-food": "/img/generated/fast-food.webp",
  "main-meals": "/img/generated/main-meals.webp",
  desserts: "/img/generated/desserts.webp",
  "cold-drinks-smoothies": "/img/generated/cold-drinks-smoothies.webp",
  breakfast: "/img/generated/breakfast.webp",
};

export default async function HomePage() {
  const settings = getSettings();
  const banners = listBanners({ activeOnly: true });
  const featured = listFeatured(6);
  const categories = listCategories();
  const promotions = listPromotions({ activeOnly: true });
  const zones = listZones({ activeOnly: true });
  const allItems = listMenu({ availableOnly: true });

  const itemNames = new Map(allItems.map((item) => [item.id, item.name]));
  const countByCategory = new Map<number, number>();
  for (const item of allItems) {
    countByCategory.set(item.category_id, (countByCategory.get(item.category_id) ?? 0) + 1);
  }

  const cheapestZone = zones.reduce<number | null>(
    (min, zone) => (min === null || zone.fee_cents < min ? zone.fee_cents : min),
    null,
  );

  return (
    <>
      <HeroBanners banners={banners} />

      {/* Primary conversion block, kept high on the page and above the fold on phones. */}
      <section className="container-page mt-5">
        <div className="card p-4 sm:p-6">
          <h1 className="text-balance-tight font-display text-2xl font-bold leading-tight text-espresso-900 sm:text-3xl">
            {settings.hero_kicker || "Eastleigh's favourite coffee & kitchen"}
          </h1>
          <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-espresso-600">
            {settings.tagline}. Order in a minute on WhatsApp, pay cash or M-Pesa when it
            lands. Come hungry, leave happy.
          </p>

          <OrderTypeCta className="mt-4 sm:max-w-lg" />

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem] font-medium text-espresso-600">
            <li className="flex items-center gap-1.5">
              <ScooterIcon size={15} className="text-caramel-500" />
              {cheapestZone !== null
                ? `Delivery from ${formatMoney(cheapestZone, settings.currency)}`
                : "Delivery available"}
            </li>
            {settings.free_delivery_threshold_cents > 0 && (
              <li className="flex items-center gap-1.5">
                <SparkIcon size={15} className="text-caramel-500" />
                Free over{" "}
                {formatMoney(settings.free_delivery_threshold_cents, settings.currency)}
              </li>
            )}
            {settings.opening_hours && (
              <li className="flex items-center gap-1.5">
                <ClockIcon size={15} className="text-caramel-500" />
                {settings.opening_hours}
              </li>
            )}
          </ul>
        </div>
      </section>

      {/* Category rail */}
      <section aria-labelledby="categories" className="container-page mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
              Browse
            </p>
            <h2 id="categories" className="font-display text-2xl font-bold text-espresso-900">
              What are you craving?
            </h2>
          </div>
          <Link
            href="/menu"
            className="shrink-0 text-sm font-semibold text-caramel-600 underline underline-offset-4"
          >
            Full menu
          </Link>
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/menu?category=${category.slug}`}
                className="group block overflow-hidden rounded-xl border border-cream-200 bg-white shadow-soft transition-shadow hover:shadow-lift"
              >
                <div className="relative aspect-[4/3] bg-cream-100">
                  <Image
                    src={CATEGORY_ART[category.slug] ?? "/img/generated/placeholder.webp"}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 190px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    quality={62}
                  />
                </div>
                <div className="p-2.5">
                  <p className="font-display text-[0.9375rem] font-bold leading-tight text-espresso-900">
                    {category.name}
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] font-medium uppercase tracking-wider text-espresso-500">
                    {countByCategory.get(category.id) ?? 0} items
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <LiveOffers
        promotions={promotions}
        categories={categories}
        itemNames={itemNames}
        currency={settings.currency}
      />

      {/* Featured items */}
      {featured.length > 0 && (
        <section aria-labelledby="signature" className="container-page mt-10">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
                Signature
              </p>
              <h2 id="signature" className="font-display text-2xl font-bold text-espresso-900">
                What everyone orders
              </h2>
            </div>
            <Link
              href="/menu"
              className="shrink-0 text-sm font-semibold text-caramel-600 underline underline-offset-4"
            >
              See all
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((item, index) => (
              <MenuItemCard
                key={item.id}
                item={item}
                currency={settings.currency}
                priority={index < 2}
              />
            ))}
          </div>
        </section>
      )}

      {/* Delivery teaser */}
      <section aria-labelledby="delivery-teaser" className="container-page mt-10">
        <div className="overflow-hidden rounded-2xl bg-espresso-900 text-cream-100">
          <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-400">
                Delivery
              </p>
              <h2
                id="delivery-teaser"
                className="mt-1 font-display text-2xl font-bold text-cream-50 sm:text-3xl"
              >
                Skip the queue. We bring it to you.
              </h2>
              <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-cream-200/80">
                {settings.delivery_note ||
                  "Rider leaves the cafe within 10 minutes of confirmation."}
              </p>

              <div className="mt-4 flex flex-wrap gap-2.5">
                <Link href="/delivery" className="btn bg-cream-50 !text-sm text-espresso-900">
                  Check your zone & rate
                  <ChevronRightIcon size={15} />
                </Link>
                <a
                  href={buildEnquiryUrl(
                    settings.whatsapp_number,
                    "Hi Jata Cafe! Do you deliver to my area?",
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-whatsapp !text-sm"
                >
                  <WhatsAppIcon size={16} />
                  Ask on WhatsApp
                </a>
              </div>
            </div>

            <ul className="space-y-1.5 rounded-xl bg-cream-100/8 p-4 text-[0.8125rem]">
              {zones.slice(0, 5).map((zone) => (
                <li key={zone.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-cream-200/85">{zone.name}</span>
                  <span className="shrink-0 font-bold tabular-nums text-caramel-300">
                    {formatMoney(zone.fee_cents, settings.currency)}
                  </span>
                </li>
              ))}
              {zones.length > 5 && (
                <li className="pt-1.5 text-[0.75rem] text-cream-200/55">
                  + {zones.length - 5} more areas on the delivery page
                </li>
              )}
            </ul>
          </div>
        </div>
      </section>

      {/* Visit */}
      <section aria-labelledby="visit-teaser" className="container-page mt-10">
        <div className="card grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
              Visit
            </p>
            <h2
              id="visit-teaser"
              className="mt-1 font-display text-2xl font-bold text-espresso-900"
            >
              Right in the middle of everything
            </h2>
            <p className="mt-2 flex items-start gap-2 text-[0.9375rem] leading-relaxed text-espresso-600">
              <PinIcon size={17} className="mt-0.5 shrink-0 text-caramel-500" />
              <span>
                {settings.address_line}
                {settings.area_hint && (
                  <span className="block text-espresso-500">{settings.area_hint}</span>
                )}
              </span>
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link href="/visit" className="btn btn-outline !text-sm">
                Directions & hours
              </Link>
              {settings.maps_url && (
                <a
                  href={settings.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary !text-sm"
                >
                  <PinIcon size={15} />
                  Open in Maps
                </a>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            {[
              { label: "Opens", value: "7:00 AM" },
              { label: "Closes", value: "10:00 PM" },
              { label: "Pay with", value: "Cash / M-Pesa" },
              { label: "Seats", value: "Dine in & takeaway" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-cream-100 p-3.5">
                <dt className="text-[0.6875rem] font-bold uppercase tracking-wider text-espresso-500">
                  {stat.label}
                </dt>
                <dd className="mt-0.5 font-display text-base font-bold text-espresso-900">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}

// Cached HTML for fast first paint on mobile data. Admin edits push an immediate
// refresh via revalidateStorefront(); this is the self-healing fallback.
export const revalidate = 120;
