import Link from "next/link";
import type { Metadata } from "next";
import {
  ClockIcon,
  PhoneIcon,
  PinIcon,
  SparkIcon,
  WhatsAppIcon,
} from "@/components/icons";
import { getSettings } from "@/lib/queries";
import { buildEnquiryUrl } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Visit Us in Eastleigh",
  description:
    "Jata Cafe is on 18th Street, Section 3, Eastleigh, Nairobi, opposite Save Mart. Opening hours, directions and contact details.",
  alternates: { canonical: "/visit" },
};

export default async function VisitPage() {
  const settings = getSettings();

  return (
    <>
      <header className="container-page pt-6">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
          Visit
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-espresso-900">
          Come see us in Eastleigh
        </h1>
        <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-espresso-600">
          We are easy to find and busy for a reason. Dine in, grab a takeaway, or pre-order
          and walk straight to the counter.
        </p>
      </header>

      <section className="container-page mt-6">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="card p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold text-espresso-900">
              Where to find us
            </h2>

            <ul className="mt-4 space-y-4">
              <li className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-100 text-caramel-500">
                  <PinIcon size={17} />
                </span>
                <div>
                  <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-espresso-500">
                    Address
                  </p>
                  <p className="font-semibold text-espresso-900">{settings.address_line}</p>
                  {settings.area_hint && (
                    <p className="text-[0.8125rem] text-espresso-600">{settings.area_hint}</p>
                  )}
                </div>
              </li>

              {settings.opening_hours && (
                <li className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-100 text-caramel-500">
                    <ClockIcon size={17} />
                  </span>
                  <div>
                    <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-espresso-500">
                      Open
                    </p>
                    <p className="font-semibold text-espresso-900">
                      {settings.opening_hours}
                    </p>
                    <p className="text-[0.8125rem] text-espresso-600">
                      Kitchen runs all day. Breakfast from 7:00 AM.
                    </p>
                  </div>
                </li>
              )}

              {settings.phone_display && (
                <li className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-100 text-caramel-500">
                    <PhoneIcon size={17} />
                  </span>
                  <div>
                    <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-espresso-500">
                      Call or WhatsApp
                    </p>
                    <a
                      href={`tel:+${settings.whatsapp_number}`}
                      className="font-semibold text-espresso-900 underline underline-offset-2"
                    >
                      {settings.phone_display}
                    </a>
                  </div>
                </li>
              )}
            </ul>

            <div className="mt-5 flex flex-wrap gap-2.5">
              {settings.maps_url && (
                <a
                  href={settings.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary !text-sm"
                >
                  <PinIcon size={16} />
                  Get directions
                </a>
              )}
              <a
                href={buildEnquiryUrl(
                  settings.whatsapp_number,
                  "Hi Jata Cafe! I'd like to pre-order for pickup.",
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-whatsapp !text-sm"
              >
                <WhatsAppIcon size={16} />
                Pre-order for pickup
              </a>
            </div>
          </div>

          <div className="space-y-4">
            {/* A static card instead of an embedded map: an iframe would add roughly
                half a megabyte and several render-blocking requests on mobile. */}
            <a
              href={settings.maps_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block overflow-hidden rounded-2xl border border-cream-200 shadow-soft"
            >
              <div className="relative aspect-[4/3] bg-espresso-900">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-30"
                  style={{
                    backgroundImage:
                      "linear-gradient(var(--color-caramel-400) 1px, transparent 1px), linear-gradient(90deg, var(--color-caramel-400) 1px, transparent 1px)",
                    backgroundSize: "34px 34px",
                  }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-caramel-500 text-white shadow-lift transition-transform group-hover:scale-110">
                    <PinIcon size={26} />
                  </span>
                  <p className="font-display text-lg font-bold text-cream-50">
                    18th Street, Section 3
                  </p>
                  <p className="text-[0.8125rem] text-cream-200/80">
                    Eastleigh, Nairobi · Opposite Save Mart
                  </p>
                  <span className="mt-1 rounded-full bg-cream-50/95 px-3.5 py-1.5 text-xs font-bold text-espresso-900">
                    Open in Google Maps
                  </span>
                </div>
              </div>
            </a>

            <div className="card p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-espresso-900">
                <SparkIcon size={16} className="text-caramel-500" />
                Good to know
              </h2>
              <ul className="mt-3 space-y-2 text-[0.8125rem] leading-relaxed text-espresso-600">
                <li>Cash and M-Pesa accepted. No card machine.</li>
                <li>Happy hour on coffees runs every afternoon, 2 PM to 5 PM.</li>
                <li>Pre-order on WhatsApp during the lunch rush and skip the wait.</li>
                <li>Catering and office orders welcome. Message us a day ahead.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page mt-10">
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <h2 className="font-display text-xl font-bold text-espresso-900">
            Fancy but affordable
          </h2>
          <p className="prose-note max-w-md">
            Have a look at what is on today, then order ahead and collect.
          </p>
          <Link href="/menu" className="btn btn-primary">
            See the menu
          </Link>
        </div>
      </section>
    </>
  );
}

// Cached HTML for fast first paint on mobile data. Admin edits push an immediate
// refresh via revalidateStorefront(); this is the self-healing fallback.
export const revalidate = 120;
