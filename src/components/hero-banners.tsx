import Image from "next/image";
import Link from "next/link";
import { ChevronRightIcon, SparkIcon } from "./icons";
import type { Banner } from "@/lib/types";

const THEMES: Record<string, { overlay: string; accent: string }> = {
  espresso: { overlay: "from-espresso-900/90 via-espresso-900/55", accent: "text-caramel-300" },
  caramel: { overlay: "from-caramel-600/92 via-caramel-600/50", accent: "text-caramel-300" },
  mint: { overlay: "from-leaf-600/92 via-leaf-600/50", accent: "text-cream-200" },
  berry: { overlay: "from-berry-500/92 via-berry-500/50", accent: "text-cream-200" },
};

/**
 * Homepage banner rail, fully managed from the admin panel.
 *
 * Scroll-snap does the carousel work in CSS, so there is no JavaScript on the
 * critical path and the first banner paints as soon as the HTML arrives.
 */
export function HeroBanners({ banners }: { banners: Banner[] }) {
  if (banners.length === 0) return null;

  const multiple = banners.length > 1;

  return (
    <section aria-label="Promotions" className="container-page pt-4">
      <div
        className={
          multiple
            ? "no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-4 pb-1"
            : ""
        }
      >
        {banners.map((banner, index) => {
          const theme = THEMES[banner.theme] ?? THEMES.espresso;
          const image = banner.image_url?.trim() || "/img/generated/hero-main.webp";

          return (
            <article
              key={banner.id}
              className={`relative isolate shrink-0 snap-start overflow-hidden rounded-2xl shadow-soft ${
                multiple ? "w-[88%] sm:w-[70%] lg:w-[48%]" : "w-full"
              }`}
            >
              <div className="relative aspect-[16/10] sm:aspect-[16/7]">
                <Image
                  src={image}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 90vw, (max-width: 1024px) 70vw, 600px"
                  className="object-cover"
                  priority={index === 0}
                  quality={index === 0 ? 72 : 62}
                />
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${theme.overlay} to-transparent`}
                />

                <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6">
                  {index === 0 && (
                    <span
                      className={`mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] backdrop-blur-sm ${theme.accent}`}
                    >
                      <SparkIcon size={12} />
                      Jata Cafe · Eastleigh
                    </span>
                  )}

                  <h2 className="text-balance-tight font-display text-xl font-bold leading-tight text-white sm:text-3xl">
                    {banner.title}
                  </h2>

                  {banner.subtitle && (
                    <p className="mt-1.5 max-w-prose text-[0.8125rem] leading-relaxed text-white/85 sm:text-[0.9375rem]">
                      {banner.subtitle}
                    </p>
                  )}

                  {banner.link_url && (
                    <Link
                      href={banner.link_url}
                      className="btn mt-3.5 w-fit bg-white/95 !text-sm text-espresso-900 hover:bg-white"
                    >
                      {banner.cta_label?.trim() || "Find out more"}
                      <ChevronRightIcon size={15} />
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {multiple && (
        <p className="mt-2 text-center text-[0.6875rem] font-medium uppercase tracking-wider text-espresso-500 sm:hidden">
          Swipe for more offers
        </p>
      )}
    </section>
  );
}
