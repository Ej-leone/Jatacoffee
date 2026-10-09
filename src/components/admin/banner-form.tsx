"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import { saveBannerAction } from "@/lib/admin-actions";
import type { Banner } from "@/lib/types";
import { ActionNotice } from "./ui";
import { SubmitButton } from "./submit-button";

/** The four keys THEMES in hero-banners.tsx knows about. */
export const BANNER_THEMES = ["espresso", "caramel", "mint", "berry"] as const;

export function BannerForm({ banner }: { banner: Banner | null }) {
  const [state, formAction, pending] = useActionState(saveBannerAction, null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <ActionNotice state={state} />

      {banner && <input type="hidden" name="id" value={banner.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="title" className="field-label">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            minLength={2}
            maxLength={120}
            defaultValue={banner?.title ?? ""}
            className="field"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="subtitle" className="field-label">
            Subtitle
          </label>
          <textarea
            id="subtitle"
            name="subtitle"
            rows={2}
            maxLength={300}
            defaultValue={banner?.subtitle ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="image_url" className="field-label">
            Image path or URL
          </label>
          <input
            id="image_url"
            name="image_url"
            type="text"
            maxLength={400}
            placeholder="/img/generated/hero-main.webp"
            defaultValue={banner?.image_url ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="link_url" className="field-label">
            Link path or URL
          </label>
          <input
            id="link_url"
            name="link_url"
            type="text"
            maxLength={400}
            placeholder="/menu?category=signature-coffees"
            defaultValue={banner?.link_url ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="cta_label" className="field-label">
            Button label
          </label>
          <input
            id="cta_label"
            name="cta_label"
            type="text"
            maxLength={40}
            placeholder="See the menu"
            defaultValue={banner?.cta_label ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="theme" className="field-label">
            Colour theme
          </label>
          <select
            id="theme"
            name="theme"
            defaultValue={banner?.theme ?? "espresso"}
            className="field capitalize"
          >
            {BANNER_THEMES.map((theme) => (
              <option key={theme} value={theme} className="capitalize">
                {theme}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="starts_at" className="field-label">
            Starts on
          </label>
          <input
            id="starts_at"
            name="starts_at"
            type="date"
            defaultValue={banner?.starts_at ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="ends_at" className="field-label">
            Ends on
          </label>
          <input
            id="ends_at"
            name="ends_at"
            type="date"
            defaultValue={banner?.ends_at ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="sort_order" className="field-label">
            Sort order
          </label>
          <input
            id="sort_order"
            name="sort_order"
            type="number"
            step="1"
            defaultValue={banner ? String(banner.sort_order) : "0"}
            className="field"
          />
        </div>

        <label htmlFor="is_active" className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={banner ? banner.is_active === 1 : true}
            className="size-4"
          />
          Show on the homepage
        </label>
      </div>

      <p className="prose-note mt-2 text-xs">
        Leave both dates blank for a banner that always runs.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <SubmitButton pending={pending}>
          {banner ? "Save changes" : "Add banner"}
        </SubmitButton>
        {banner && (
          <Link href="/ms/banners" className="btn btn-outline">
            Cancel edit
          </Link>
        )}
      </div>
    </form>
  );
}
