/**
 * Generates lightweight, optimised WebP artwork so the site looks finished before
 * the cafe uploads real photography. Run with `npm run assets` (also runs
 * automatically before `dev` and `build`).
 *
 * Pass --force to regenerate files that already exist.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public", "img", "generated");
const FORCE = process.argv.includes("--force");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(process.cwd(), "public", "uploads"), { recursive: true });

const PALETTES = {
  espresso: ["#3B2416", "#1C1008", "#E7C9A0"],
  caramel: ["#A75F22", "#5E3110", "#FFE2B8"],
  mint: ["#1F4D3C", "#0E2A20", "#BFE8D4"],
  berry: ["#6B2039", "#330F1C", "#F6C9D8"],
  cocoa: ["#4A3022", "#241610", "#EBD3B5"],
  sky: ["#1D4A5E", "#0C2530", "#BFE4F0"],
  wheat: ["#8A6520", "#45320E", "#FBE6B4"],
};

/* ------------------------------------------------------------------ *
 * Drawing helpers (hand-written SVG; no external icon deps)
 * ------------------------------------------------------------------ */

const ICONS = {
  cup: `
    <path d="M -46 -30 h 74 a 6 6 0 0 1 6 6 v 32 a 40 40 0 0 1 -40 40 h -6 a 40 40 0 0 1 -40 -40 v -32 a 6 6 0 0 1 6 -6 z"
          fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>
    <path d="M 36 -18 h 14 a 22 22 0 0 1 0 44 h -6"
          fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
    <path d="M -56 58 h 104" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
    <path d="M -24 -48 q 8 -12 0 -24 M 0 -48 q 8 -12 0 -24 M 24 -48 q 8 -12 0 -24"
          fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity="0.65"/>`,

  burger: `
    <path d="M -56 -12 a 56 34 0 0 1 112 0 z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>
    <path d="M -58 2 h 116" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
    <path d="M -58 20 q 29 16 58 0 q 29 -16 58 0" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
    <path d="M -56 36 a 56 26 0 0 0 112 0 z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>
    <circle cx="-26" cy="-26" r="3.5" fill="currentColor"/>
    <circle cx="4" cy="-32" r="3.5" fill="currentColor"/>
    <circle cx="30" cy="-24" r="3.5" fill="currentColor"/>`,

  plate: `
    <circle cx="0" cy="6" r="54" fill="none" stroke="currentColor" stroke-width="7"/>
    <circle cx="0" cy="6" r="34" fill="none" stroke="currentColor" stroke-width="4" opacity="0.6"/>
    <path d="M -74 -34 v 46 a 10 10 0 0 0 20 0 v -46" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <path d="M 64 -34 v 26 a 12 12 0 0 0 12 12 v 20" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`,

  cake: `
    <path d="M -50 10 h 100 v 38 a 8 8 0 0 1 -8 8 h -84 a 8 8 0 0 1 -8 -8 z"
          fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>
    <path d="M -50 10 q 25 -22 50 0 q 25 22 50 0" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
    <path d="M 0 -6 v -30" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <path d="M 0 -40 q 10 -10 0 -18 q -10 8 0 18 z" fill="currentColor"/>`,

  glass: `
    <path d="M -34 -46 h 68 l -10 92 a 8 8 0 0 1 -8 7 h -32 a 8 8 0 0 1 -8 -7 z"
          fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>
    <path d="M -30 -14 h 60" stroke="currentColor" stroke-width="5" opacity="0.6"/>
    <path d="M 18 -46 l 26 -34" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <circle cx="-14" cy="14" r="4" fill="currentColor" opacity="0.7"/>
    <circle cx="6" cy="30" r="3" fill="currentColor" opacity="0.7"/>`,

  sunrise: `
    <circle cx="0" cy="8" r="26" fill="none" stroke="currentColor" stroke-width="7"/>
    <path d="M 0 -46 v 14 M -38 -30 l 10 10 M 38 -30 l -10 10 M -58 8 h 14 M 44 8 h 14"
          stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    <path d="M -70 46 h 140 M -50 64 h 100" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>`,

  scooter: `
    <circle cx="-40" cy="34" r="20" fill="none" stroke="currentColor" stroke-width="7"/>
    <circle cx="48" cy="34" r="20" fill="none" stroke="currentColor" stroke-width="7"/>
    <path d="M -40 34 h 26 l 16 -46 h 20" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 22 -12 h 30 l 8 46" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>
    <path d="M 14 -46 h 22" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>`,

  clock: `
    <circle cx="0" cy="0" r="52" fill="none" stroke="currentColor" stroke-width="7"/>
    <path d="M 0 -30 v 32 l 24 16" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 0 -62 v -10 M -46 -46 l -8 -8 M 46 -46 l 8 -8" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="0.7"/>`,
};

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c],
  );
}

/** Builds a soft gradient card with a line-art icon and a label. */
function artSvg({ width, height, palette, icon, label, kicker, iconScale = 1 }) {
  const [from, to, ink] = PALETTES[palette] ?? PALETTES.espresso;
  const cx = width / 2;
  const cy = height / 2 - (label ? height * 0.07 : 0);
  const scale = (Math.min(width, height) / 300) * iconScale;
  const labelSize = Math.round(Math.min(width, height) * 0.085);
  const kickerSize = Math.round(labelSize * 0.6);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.22" r="0.85">
      <stop offset="0" stop-color="${ink}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${ink}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <g stroke="${ink}" stroke-opacity="0.12" fill="none" stroke-width="1.5">
    <circle cx="${width * 0.86}" cy="${height * 0.2}" r="${Math.min(width, height) * 0.3}"/>
    <circle cx="${width * 0.1}" cy="${height * 0.92}" r="${Math.min(width, height) * 0.26}"/>
  </g>
  <g transform="translate(${cx} ${cy}) scale(${scale})" color="${ink}" opacity="0.92">
    ${ICONS[icon] ?? ICONS.cup}
  </g>
  ${
    label
      ? `<text x="${cx}" y="${height * 0.88}" text-anchor="middle" fill="${ink}"
            font-family="Georgia, 'Times New Roman', serif" font-size="${labelSize}"
            font-weight="700" letter-spacing="0.5">${escapeXml(label)}</text>`
      : ""
  }
  ${
    kicker
      ? `<text x="${cx}" y="${height * 0.955}" text-anchor="middle" fill="${ink}"
            fill-opacity="0.72" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
            font-size="${kickerSize}" letter-spacing="2.5">${escapeXml(kicker.toUpperCase())}</text>`
      : ""
  }
</svg>`;
}

/* ------------------------------------------------------------------ *
 * Asset manifest
 * ------------------------------------------------------------------ */

const ASSETS = [
  // Hero banners (16:9, used by the homepage banner carousel)
  {
    file: "hero-main.webp",
    width: 1280,
    height: 720,
    palette: "espresso",
    icon: "cup",
    label: "Fancy but affordable",
    kicker: "Jata Cafe · Eastleigh",
    quality: 72,
  },
  {
    file: "hero-happy-hour.webp",
    width: 1280,
    height: 720,
    palette: "caramel",
    icon: "clock",
    label: "Happy Hour 2 - 5 PM",
    kicker: "15% off all coffees",
    quality: 72,
  },
  {
    file: "hero-delivery.webp",
    width: 1280,
    height: 720,
    palette: "mint",
    icon: "scooter",
    label: "We deliver",
    kicker: "Eastleigh & beyond",
    quality: 72,
  },

  // Category / menu item fallbacks (4:3)
  { file: "signature-coffees.webp", palette: "espresso", icon: "cup", label: "Signature Coffees" },
  { file: "fast-food.webp", palette: "caramel", icon: "burger", label: "Fast Food" },
  { file: "main-meals.webp", palette: "mint", icon: "plate", label: "Main Meals" },
  { file: "desserts.webp", palette: "berry", icon: "cake", label: "Desserts" },
  {
    file: "cold-drinks-smoothies.webp",
    palette: "sky",
    icon: "glass",
    label: "Cold Drinks",
  },
  { file: "breakfast.webp", palette: "wheat", icon: "sunrise", label: "Breakfast" },
  { file: "placeholder.webp", palette: "cocoa", icon: "cup", label: "Jata Cafe" },

  // Social share card
  {
    file: "og-image.webp",
    width: 1200,
    height: 630,
    palette: "espresso",
    icon: "cup",
    label: "Jata Cafe",
    kicker: "Fancy but affordable · Eastleigh",
    quality: 78,
  },
];

async function main() {
  let written = 0;
  let skipped = 0;

  for (const asset of ASSETS) {
    const target = path.join(OUT_DIR, asset.file);
    if (!FORCE && fs.existsSync(target)) {
      skipped++;
      continue;
    }

    const svg = artSvg({
      width: asset.width ?? 800,
      height: asset.height ?? 600,
      palette: asset.palette,
      icon: asset.icon,
      label: asset.label,
      kicker: asset.kicker,
      iconScale: asset.iconScale,
    });

    await sharp(Buffer.from(svg))
      .webp({ quality: asset.quality ?? 70, effort: 6 })
      .toFile(target);

    written++;
  }

  // Raster icons for PWA / Apple touch, derived from the brand mark.
  const markSvg = artSvg({
    width: 512,
    height: 512,
    palette: "espresso",
    icon: "cup",
    iconScale: 1.25,
  });
  for (const [file, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-icon.png", 180],
  ]) {
    const target = path.join(process.cwd(), "public", file);
    if (!FORCE && fs.existsSync(target)) {
      skipped++;
      continue;
    }
    await sharp(Buffer.from(markSvg)).resize(size, size).png({ compressionLevel: 9 }).toFile(target);
    written++;
  }

  console.log(`[jata] artwork ready - ${written} written, ${skipped} already present`);
}

main().catch((error) => {
  console.error("[jata] artwork generation failed:", error);
  process.exit(1);
});
