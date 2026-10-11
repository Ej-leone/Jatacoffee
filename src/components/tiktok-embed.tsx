"use client";

import { useEffect, useRef } from "react";

/**
 * Official TikTok creator embed. The script is withheld until the block is
 * near the viewport so the rest of the page stays light on a small data bundle.
 */
export function TikTokEmbed({
  username,
  profileUrl,
}: {
  username: string;
  profileUrl: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    let started = false;
    const load = () => {
      if (started) return;
      started = true;
      // Re-insert so a return visit to the homepage scans the blockquote again.
      document.querySelector("script[data-jata-tiktok]")?.remove();
      const script = document.createElement("script");
      script.src = `https://www.tiktok.com/embed.js?cb=${Date.now()}`;
      script.async = true;
      script.dataset.jataTiktok = "1";
      document.body.appendChild(script);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          load();
          observer.disconnect();
        }
      },
      { rootMargin: "280px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="mt-3 min-h-64 min-w-0">
      <blockquote
        className="tiktok-embed"
        cite={profileUrl}
        data-unique-id={username}
        data-embed-from="oembed"
        data-embed-type="creator"
        style={{ maxWidth: "100%", minWidth: 0 }}
      >
        <section>
          <a
            target="_blank"
            href={`${profileUrl}?refer=creator_embed`}
            rel="noopener noreferrer"
          >
            @{username}
          </a>
        </section>
      </blockquote>
    </div>
  );
}
