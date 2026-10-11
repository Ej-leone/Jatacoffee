import Link from "next/link";
import { ClockIcon, InstagramIcon, Logo, PhoneIcon, PinIcon, TikTokIcon } from "./icons";
import type { SiteSettings } from "@/lib/types";

export function SiteFooter({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-14 border-t border-cream-200 bg-espresso-900 text-cream-100">
      <div className="container-page py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo className="text-cream-100" size={34} />
              <div>
                <p className="font-display text-lg font-bold text-cream-50">
                  {settings.site_name}
                </p>
                <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-caramel-400">
                  {settings.tagline}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-cream-200/75">
              Come hungry, leave happy. Signature coffees, a hot kitchen and desserts
              worth the trip, right in the middle of Eastleigh.
            </p>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-caramel-400">
              Find us
            </h2>
            <ul className="mt-3 space-y-2.5 text-[0.8125rem] text-cream-200/85">
              <li className="flex gap-2.5">
                <PinIcon size={16} className="mt-0.5 shrink-0 text-caramel-400" />
                <span>
                  {settings.address_line}
                  {settings.area_hint && (
                    <span className="block text-cream-200/60">{settings.area_hint}</span>
                  )}
                </span>
              </li>
              {settings.opening_hours && (
                <li className="flex gap-2.5">
                  <ClockIcon size={16} className="mt-0.5 shrink-0 text-caramel-400" />
                  <span>{settings.opening_hours}</span>
                </li>
              )}
              {settings.phone_display && (
                <li className="flex gap-2.5">
                  <PhoneIcon size={16} className="mt-0.5 shrink-0 text-caramel-400" />
                  <a
                    href={`tel:+${settings.whatsapp_number}`}
                    className="hover:text-caramel-300"
                  >
                    {settings.phone_display}
                  </a>
                </li>
              )}
            </ul>
          </div>

          <nav aria-label="Footer">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-caramel-400">
              Order
            </h2>
            <ul className="mt-3 space-y-2 text-[0.8125rem] text-cream-200/85">
              {[
                { href: "/menu", label: "Full menu" },
                { href: "/delivery", label: "Delivery zones & rates" },
                { href: "/offers", label: "Offers & happy hour" },
                { href: "/checkout", label: "Checkout on WhatsApp" },
                { href: "/visit", label: "Visit the cafe" },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-caramel-300">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-caramel-400">
              Say hello
            </h2>
            <p className="mt-3 text-[0.8125rem] text-cream-200/75">
              Questions, bulk orders or events? Message us and we will sort you out.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {settings.maps_url && (
                <a
                  href={settings.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn !min-h-9 border border-cream-100/25 !px-3.5 !text-xs text-cream-100 hover:bg-cream-100/10"
                >
                  <PinIcon size={14} />
                  Google Maps
                </a>
              )}
              {settings.instagram_url && (
                <a
                  href={settings.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn !min-h-9 border border-cream-100/25 !px-3.5 !text-xs text-cream-100 hover:bg-cream-100/10"
                >
                  <InstagramIcon size={14} />
                  Instagram
                </a>
              )}
              {settings.tiktok_url && (
                <a
                  href={settings.tiktok_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn !min-h-9 border border-cream-100/25 !px-3.5 !text-xs text-cream-100 hover:bg-cream-100/10"
                >
                  <TikTokIcon size={14} />
                  TikTok
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="mt-9 border-t border-cream-100/10 pt-5 text-[0.75rem] text-cream-200/55">
          <p>
            © {year} {settings.site_name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
