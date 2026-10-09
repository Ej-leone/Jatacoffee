"use client";

import { startTransition, useActionState } from "react";
import { saveSettingsAction } from "@/lib/admin-actions";
import type { SiteSettings } from "@/lib/types";
import { ActionNotice } from "./ui";
import { SubmitButton } from "./submit-button";

/**
 * All thirteen fields are pre-filled on purpose: saveSettingsAction upserts every
 * one of them, so a blank input overwrites the live value with "".
 */
export function SettingsForm({ settings }: { settings: SiteSettings }) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <ActionNotice state={state} />

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="field-label">The cafe</legend>

        <div>
          <label htmlFor="site_name" className="field-label">
            Site name
          </label>
          <input
            id="site_name"
            name="site_name"
            type="text"
            maxLength={60}
            defaultValue={settings.site_name}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="tagline" className="field-label">
            Tagline
          </label>
          <input
            id="tagline"
            name="tagline"
            type="text"
            maxLength={80}
            defaultValue={settings.tagline}
            className="field"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="hero_kicker" className="field-label">
            Homepage kicker
          </label>
          <input
            id="hero_kicker"
            name="hero_kicker"
            type="text"
            maxLength={120}
            defaultValue={settings.hero_kicker}
            className="field"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="announcement" className="field-label">
            Announcement bar
          </label>
          <input
            id="announcement"
            name="announcement"
            type="text"
            maxLength={200}
            defaultValue={settings.announcement}
            className="field"
          />
        </div>
      </fieldset>

      <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
        <legend className="field-label">Contact and location</legend>

        <div>
          <label htmlFor="whatsapp_number" className="field-label">
            WhatsApp number
          </label>
          <input
            id="whatsapp_number"
            name="whatsapp_number"
            type="tel"
            required
            inputMode="numeric"
            maxLength={20}
            aria-describedby="whatsapp-hint"
            defaultValue={settings.whatsapp_number}
            className="field"
          />
          <p id="whatsapp-hint" className="prose-note mt-1.5 text-xs">
            Country code first, no plus sign — e.g. 254712345678.
          </p>
        </div>

        <div>
          <label htmlFor="phone_display" className="field-label">
            Phone number as shown
          </label>
          <input
            id="phone_display"
            name="phone_display"
            type="text"
            maxLength={30}
            defaultValue={settings.phone_display}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="address_line" className="field-label">
            Address
          </label>
          <input
            id="address_line"
            name="address_line"
            type="text"
            maxLength={160}
            defaultValue={settings.address_line}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="area_hint" className="field-label">
            Landmark hint
          </label>
          <input
            id="area_hint"
            name="area_hint"
            type="text"
            maxLength={80}
            defaultValue={settings.area_hint}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="opening_hours" className="field-label">
            Opening hours
          </label>
          <input
            id="opening_hours"
            name="opening_hours"
            type="text"
            maxLength={120}
            defaultValue={settings.opening_hours}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="maps_url" className="field-label">
            Google Maps link
          </label>
          <input
            id="maps_url"
            name="maps_url"
            type="url"
            maxLength={400}
            defaultValue={settings.maps_url}
            className="field"
          />
        </div>
      </fieldset>

      <fieldset className="mt-5 grid gap-3 sm:grid-cols-3">
        <legend className="field-label">Social links</legend>

        <div>
          <label htmlFor="instagram_url" className="field-label">
            Instagram
          </label>
          <input
            id="instagram_url"
            name="instagram_url"
            type="url"
            maxLength={200}
            defaultValue={settings.instagram_url}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="tiktok_url" className="field-label">
            TikTok
          </label>
          <input
            id="tiktok_url"
            name="tiktok_url"
            type="url"
            maxLength={200}
            defaultValue={settings.tiktok_url}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="facebook_url" className="field-label">
            Facebook
          </label>
          <input
            id="facebook_url"
            name="facebook_url"
            type="url"
            maxLength={200}
            defaultValue={settings.facebook_url}
            className="field"
          />
        </div>
      </fieldset>

      <div className="mt-5">
        <SubmitButton pending={pending}>Save settings</SubmitButton>
      </div>
    </form>
  );
}
