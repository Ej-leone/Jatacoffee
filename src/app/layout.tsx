import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://jatacafe.co.ke";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Jata Cafe | Fancy but Affordable Cafe in Eastleigh, Nairobi",
    template: "%s | Jata Cafe Eastleigh",
  },
  description:
    "Jata Cafe on 18th Street, Section 3, Eastleigh. Signature coffees, fast food, main meals and desserts. Order on WhatsApp for delivery across Eastleigh and Nairobi east.",
  applicationName: "Jata Cafe",
  keywords: [
    "Jata Cafe",
    "Jata Cafe Nairobi",
    "best cafe in Eastleigh",
    "Eastleigh food delivery",
    "cafe Eastleigh Nairobi",
    "Spanish Latte Nairobi",
    "coffee shop Eastleigh",
    "Eastleigh restaurant delivery",
    "breakfast Eastleigh",
    "cheesecake Nairobi",
  ],
  authors: [{ name: "Jata Cafe" }],
  creator: "Jata Cafe",
  publisher: "Jata Cafe",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Jata Cafe",
    locale: "en_KE",
    url: SITE_URL,
    title: "Jata Cafe | Fancy but Affordable Cafe in Eastleigh, Nairobi",
    description:
      "Signature coffees, fast food, main meals and desserts in Eastleigh. Order on WhatsApp for delivery or pre-order for pickup.",
    images: [
      {
        url: "/img/generated/og-image.webp",
        width: 1200,
        height: 630,
        alt: "Jata Cafe, Eastleigh Nairobi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Jata Cafe | Eastleigh, Nairobi",
    description: "Fancy but affordable. Order on WhatsApp for delivery or pickup.",
    images: ["/img/generated/og-image.webp"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
  category: "restaurant",
  formatDetection: { telephone: true, address: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1008" },
  ],
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-KE">
      <body>{children}</body>
    </html>
  );
}
