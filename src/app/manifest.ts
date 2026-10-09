import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jata Cafe - Eastleigh, Nairobi",
    short_name: "Jata Cafe",
    description:
      "Fancy but affordable. Order signature coffees, fast food, main meals and desserts on WhatsApp.",
    start_url: "/",
    display: "standalone",
    background_color: "#fdfaf6",
    theme_color: "#1c1008",
    orientation: "portrait",
    categories: ["food", "shopping"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcuts: [
      { name: "Menu", url: "/menu" },
      { name: "Delivery zones", url: "/delivery" },
    ],
  };
}
