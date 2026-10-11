import { InstagramIcon, TikTokIcon } from "@/components/icons";
import { TikTokEmbed } from "@/components/tiktok-embed";

const HANDLE = /^[A-Za-z0-9._]{1,30}$/;

function profile(url: string, host: "instagram.com" | "tiktok.com"): {
  href: string;
  handle: string | null;
} | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.hostname.replace(/^www\./, "") !== host) return null;
    const segment = parsed.pathname.split("/").filter(Boolean)[0];
    const handle = segment ? decodeURIComponent(segment).replace(/^@/, "") : "";
    const safeHandle = HANDLE.test(handle) ? handle : null;
    const href = safeHandle
      ? `https://www.${host}/${host === "tiktok.com" ? "@" : ""}${safeHandle}`
      : parsed.toString();
    return { href, handle: safeHandle };
  } catch {
    return null;
  }
}

export function SocialSpotlight({
  instagramUrl,
  tiktokUrl,
}: {
  instagramUrl: string;
  tiktokUrl: string;
}) {
  const instagram = profile(instagramUrl, "instagram.com");
  const tiktok = profile(tiktokUrl, "tiktok.com");
  if (!instagram && !tiktok) return null;

  return (
    <section aria-labelledby="social" className="container-page mt-10">
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
        Follow
      </p>
      <h2 id="social" className="font-display text-2xl font-bold text-espresso-900">
        Fresh from the cafe
      </h2>
      <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-espresso-600">
        New videos and photos from 18th Street. Have a look, then come in or order.
      </p>

      <div
        className={`mt-4 grid items-stretch gap-3 ${instagram && tiktok ? "lg:grid-cols-2" : ""}`}
      >
        {instagram && (
          <a
            href={instagram.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-full flex-col justify-between rounded-2xl bg-espresso-900 p-5 text-cream-100 transition-shadow hover:shadow-lift sm:p-6"
          >
            <div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-cream-100/10 text-caramel-300">
                <InstagramIcon size={18} />
              </span>
              <p className="mt-4 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-400">
                Instagram
              </p>
              <h3 className="mt-1 font-display text-2xl font-bold text-cream-50">
                {instagram.handle ? `@${instagram.handle}` : "Jata Cafe"}
              </h3>
              <p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-cream-200/80">
                Photos of the coffees, the plates and the room. The newest posts are on
                the profile.
              </p>
            </div>
            <span className="btn mt-6 w-fit bg-cream-50 !text-sm text-espresso-900">
              See the latest posts
            </span>
          </a>
        )}

        {tiktok && (
          <div className="card min-w-0 overflow-hidden p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
                  TikTok
                </p>
                <h3 className="font-display text-xl font-bold text-espresso-900">
                  Latest videos
                </h3>
              </div>
              <a
                href={tiktok.href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline !min-h-9 shrink-0 !px-3 !text-xs"
              >
                <TikTokIcon size={14} />
                Watch
              </a>
            </div>
            {tiktok.handle ? (
              <TikTokEmbed username={tiktok.handle} profileUrl={tiktok.href} />
            ) : (
              <p className="mt-3 text-sm text-espresso-600">
                The latest clips are on the TikTok profile.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
