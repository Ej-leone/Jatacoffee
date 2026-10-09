import { CartProvider, type StoreConfig } from "@/components/cart-provider";
import { CartBar, CartDrawer } from "@/components/cart-drawer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsAppFab } from "@/components/whatsapp-fab";
import { getSettings, listPublicPromotions, listZones } from "@/lib/queries";
import { buildEnquiryUrl } from "@/lib/whatsapp";
import { AnnouncementBar } from "@/components/announcement-bar";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings();
  const zones = listZones({ activeOnly: true });
  const promotions = listPublicPromotions();

  const config: StoreConfig = {
    currency: settings.currency,
    whatsapp_number: settings.whatsapp_number,
    delivery_mode: settings.delivery_mode,
    delivery_flat_fee_cents: settings.delivery_flat_fee_cents,
    free_delivery_threshold_cents: settings.free_delivery_threshold_cents,
    min_order_cents: settings.min_order_cents,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      fee_cents: z.fee_cents,
      eta_minutes: z.eta_minutes,
    })),
    promotions,
  };

  // Structured data for local SEO: helps Google show hours, location and the
  // menu link for searches like "best cafe in Eastleigh".
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: settings.site_name,
    description: `${settings.tagline}. Cafe and kitchen in Eastleigh, Nairobi.`,
    slogan: settings.tagline,
    image: `${process.env.NEXT_PUBLIC_SITE_URL || "https://jatacafe.co.ke"}/img/generated/og-image.webp`,
    telephone: `+${settings.whatsapp_number}`,
    priceRange: "KES 80 - 900",
    servesCuisine: ["Coffee", "Kenyan", "Fast Food", "Desserts"],
    address: {
      "@type": "PostalAddress",
      streetAddress: "18th Street, Section 3",
      addressLocality: "Eastleigh, Nairobi",
      addressRegion: "Nairobi",
      addressCountry: "KE",
    },
    hasMap: settings.maps_url || undefined,
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://jatacafe.co.ke",
    hasMenu: `${process.env.NEXT_PUBLIC_SITE_URL || "https://jatacafe.co.ke"}/menu`,
    acceptsReservations: false,
    paymentAccepted: "Cash, M-Pesa",
    currenciesAccepted: "KES",
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        opens: "07:00",
        closes: "22:00",
      },
    ],
    areaServed: zones.map((z) => ({ "@type": "Place", name: z.name })),
  };

  return (
    <CartProvider config={config}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-espresso-900 focus:px-4 focus:py-2 focus:text-cream-50"
      >
        Skip to content
      </a>

      <AnnouncementBar message={settings.announcement} />
      <SiteHeader siteName={settings.site_name} tagline={settings.tagline} />

      <main id="main" className="pb-24 md:pb-10">
        {children}
      </main>

      <SiteFooter settings={settings} />

      <CartDrawer />
      <CartBar />
      <WhatsAppFab
        href={buildEnquiryUrl(
          settings.whatsapp_number,
          "Hi Jata Cafe! I have a question about your menu.",
        )}
      />

      <script
        type="application/ld+json"
        // Static, server-generated structured data.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </CartProvider>
  );
}

// Cached HTML for fast first paint on mobile data. Admin edits push an immediate
// refresh via revalidateStorefront(); this is the self-healing fallback.
export const revalidate = 120;
