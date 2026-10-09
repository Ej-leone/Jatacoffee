"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./cart-provider";
import { CartIcon, Logo } from "./icons";
import { formatMoney } from "@/lib/pricing";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/delivery", label: "Delivery" },
  { href: "/visit", label: "Visit us" },
];

export function SiteHeader({
  siteName,
  tagline,
}: {
  siteName: string;
  tagline: string;
}) {
  const { itemCount, pricing, openDrawer, hydrated, config } = useCart();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-cream-200 bg-cream-50/95 backdrop-blur-sm">
      <div className="container-page">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0"
            aria-label={`${siteName} home`}
          >
            <Logo className="text-espresso-800" size={36} />
            <span className="leading-tight">
              <span className="block font-display text-lg font-bold text-espresso-900">
                {siteName}
              </span>
              <span className="block text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-caramel-500">
                {tagline}
              </span>
            </span>
          </Link>

          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                        active
                          ? "bg-espresso-800 text-cream-50"
                          : "text-espresso-700 hover:bg-cream-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <button
            type="button"
            onClick={openDrawer}
            className="btn btn-outline relative shrink-0 !px-4"
            aria-label={
              itemCount > 0
                ? `Open cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`
                : "Open cart, empty"
            }
          >
            <CartIcon />
            <span className="hidden sm:inline">
              {hydrated && itemCount > 0
                ? formatMoney(pricing.subtotal_cents, config.currency)
                : "Cart"}
            </span>
            {hydrated && itemCount > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-caramel-500 px-1 text-[0.6875rem] font-bold text-white"
                aria-hidden="true"
              >
                {itemCount}
              </span>
            )}
          </button>
        </div>

        {/* Mobile nav rail: horizontal, thumb friendly, no dropdown to tap through. */}
        <nav aria-label="Main" className="md:hidden">
          <ul className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto pb-2">
            {NAV.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                      active
                        ? "bg-espresso-800 text-cream-50"
                        : "bg-white text-espresso-700 ring-1 ring-cream-200"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
