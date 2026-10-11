import Link from "next/link";
import type { Metadata } from "next";
import {
  ClockIcon,
  PinIcon,
  ScooterIcon,
  SparkIcon,
  WhatsAppIcon,
} from "@/components/icons";
import { formatMoney } from "@/lib/pricing";
import { getSettings, listZones } from "@/lib/queries";
import { buildEnquiryUrl } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Delivery Zones & Rates",
  description:
    "Jata Cafe delivery areas and fees across Eastleigh, Pumwani, Umoja, Buruburu, Nairobi CBD and South B. See your rate, then order on WhatsApp.",
  alternates: { canonical: "/delivery" },
};

export default async function DeliveryPage() {
  const settings = await getSettings();
  const zones = await listZones({ activeOnly: true });
  const flat = settings.delivery_mode === "flat";

  return (
    <>
      <header className="container-page pt-6">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
          Delivery
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-espresso-900">
          Where we deliver, and what it costs
        </h1>
        <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-espresso-600">
          {settings.delivery_note ||
            "Our rider leaves the cafe shortly after you confirm on WhatsApp."}
        </p>
      </header>

      {/* Headline facts */}
      <section className="container-page mt-5">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <dt className="flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-wider text-espresso-500">
              <ScooterIcon size={15} className="text-caramel-500" />
              {flat ? "Flat rate" : "From"}
            </dt>
            <dd className="mt-1 font-display text-2xl font-bold text-espresso-900">
              {flat
                ? formatMoney(settings.delivery_flat_fee_cents, settings.currency)
                : zones.length > 0
                  ? formatMoney(
                      Math.min(...zones.map((z) => z.fee_cents)),
                      settings.currency,
                    )
                  : "Ask us"}
            </dd>
            <p className="prose-note mt-1">
              {flat ? "Same fee anywhere we reach." : "Nearest sections of Eastleigh."}
            </p>
          </div>

          <div className="card p-4">
            <dt className="flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-wider text-espresso-500">
              <SparkIcon size={15} className="text-caramel-500" />
              Free delivery
            </dt>
            <dd className="mt-1 font-display text-2xl font-bold text-espresso-900">
              {settings.free_delivery_threshold_cents > 0
                ? formatMoney(settings.free_delivery_threshold_cents, settings.currency)
                : "Not running"}
            </dd>
            <p className="prose-note mt-1">
              {settings.free_delivery_threshold_cents > 0
                ? "Spend this much and we waive the fee."
                : "Ask about bulk and office orders."}
            </p>
          </div>

          <div className="card p-4">
            <dt className="flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-wider text-espresso-500">
              <ClockIcon size={15} className="text-caramel-500" />
              Minimum order
            </dt>
            <dd className="mt-1 font-display text-2xl font-bold text-espresso-900">
              {settings.min_order_cents > 0
                ? formatMoney(settings.min_order_cents, settings.currency)
                : "None"}
            </dd>
            <p className="prose-note mt-1">Pay cash or M-Pesa when the rider arrives.</p>
          </div>
        </dl>
      </section>

      {/* Zone table */}
      <section aria-labelledby="zones" className="container-page mt-9">
        <h2 id="zones" className="font-display text-2xl font-bold text-espresso-900">
          {flat ? "Areas we cover" : "Zones & rates"}
        </h2>

        {zones.length === 0 ? (
          <p className="prose-note mt-3">
            Delivery areas are being updated. Message us and we will confirm your area.
          </p>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-soft">
            {zones.map((zone) => (
              <li
                key={zone.id}
                className="flex items-center justify-between gap-3 border-b border-cream-100 px-4 py-3.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold text-espresso-900">
                    <PinIcon size={15} className="shrink-0 text-caramel-500" />
                    {zone.name}
                  </p>
                  <p className="mt-0.5 pl-5 text-[0.75rem] text-espresso-500">
                    {zone.eta_minutes ? `About ${zone.eta_minutes} min` : "Timing on request"}
                    {zone.notes ? ` · ${zone.notes}` : ""}
                  </p>
                </div>
                <p className="shrink-0 font-display text-lg font-bold tabular-nums text-caramel-600">
                  {flat
                    ? formatMoney(settings.delivery_flat_fee_cents, settings.currency)
                    : formatMoney(zone.fee_cents, settings.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}

        <p className="prose-note mt-3">
          Not on the list? Send us your location pin on WhatsApp and we will quote you
          before the rider leaves.
        </p>
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className="container-page mt-10">
        <h2 id="how" className="font-display text-2xl font-bold text-espresso-900">
          How ordering works
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: "1",
              title: "Build your order",
              body: "Tap through the menu and add what you want. Prices update as you go.",
            },
            {
              step: "2",
              title: "Pick your area",
              body: "Choose your zone so the delivery fee is in the total before you send.",
            },
            {
              step: "3",
              title: "Send on WhatsApp",
              body: "Checkout opens WhatsApp with your order already typed out. Just hit send.",
            },
            {
              step: "4",
              title: "Pay on arrival",
              body: "Cash or M-Pesa to the rider. No cards, no online payment forms.",
            },
          ].map((item) => (
            <li key={item.step} className="card p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-espresso-800 font-display text-sm font-bold text-cream-50">
                {item.step}
              </span>
              <h3 className="mt-2.5 font-display text-base font-bold text-espresso-900">
                {item.title}
              </h3>
              <p className="prose-note mt-1">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container-page mt-10">
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <h2 className="font-display text-xl font-bold text-espresso-900">
            Ready when you are
          </h2>
          <p className="prose-note max-w-md">
            Come hungry, leave happy. Start with a Spanish Latte and work your way down.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Link href="/menu" className="btn btn-primary">
              Start my order
            </Link>
            <a
              href={buildEnquiryUrl(
                settings.whatsapp_number,
                "Hi Jata Cafe! Do you deliver to my area?",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-whatsapp"
            >
              <WhatsAppIcon size={17} />
              Ask about my area
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

// Cached HTML for fast first paint on mobile data. Admin edits push an immediate
// refresh via revalidateStorefront(); this is the self-healing fallback.
export const revalidate = 120;
