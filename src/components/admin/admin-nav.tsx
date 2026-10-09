"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BagIcon,
  GridIcon,
  ImageIcon,
  ScooterIcon,
  SettingsIcon,
  SparkIcon,
  TagIcon,
  UsersIcon,
} from "@/components/icons";

const ITEMS = [
  { href: "/ms", label: "Dashboard", Icon: GridIcon },
  { href: "/ms/orders", label: "Orders", Icon: BagIcon },
  { href: "/ms/menu", label: "Menu", Icon: SparkIcon },
  { href: "/ms/categories", label: "Categories", Icon: GridIcon },
  { href: "/ms/banners", label: "Banners", Icon: ImageIcon },
  { href: "/ms/promotions", label: "Offers", Icon: TagIcon },
  { href: "/ms/delivery", label: "Delivery", Icon: ScooterIcon },
  { href: "/ms/customers", label: "Customers", Icon: UsersIcon },
  { href: "/ms/settings", label: "Settings", Icon: SettingsIcon },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <ul className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 sm:flex-wrap sm:overflow-visible">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = href === "/ms" ? pathname === "/ms" : pathname.startsWith(href);
        return (
          <li key={href} className="shrink-0">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.8125rem] font-semibold whitespace-nowrap transition-colors ${
                active
                  ? "bg-espresso-800 text-cream-50"
                  : "bg-white text-espresso-700 ring-1 ring-cream-200 hover:bg-cream-100"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
