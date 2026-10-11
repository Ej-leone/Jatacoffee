import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp is a native module: never bundle it.
  serverExternalPackages: ["sharp"],

  // Low-data target: ship modern formats and small responsive widths.
  images: {
    formats: ["image/webp"],
    deviceSizes: [360, 414, 640, 768, 1080, 1280],
    imageSizes: [64, 96, 128, 200, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  poweredByHeader: false,
  compress: true,

  experimental: {
    // Trim the client bundle for the few icons/helpers we import.
    optimizePackageImports: [],
  },

  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(self)",
      },
    ];

    return [
      { source: "/:path*", headers: security },
      {
        // Hashed/optimised upload assets are safe to cache hard.
        source: "/img/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/ms/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
