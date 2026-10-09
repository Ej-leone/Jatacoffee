"use client";

import { startTransition, useActionState } from "react";
import { saveDeliverySettingsAction } from "@/lib/admin-actions";
import { centsToShillingInput } from "@/lib/admin-format";
import type { SiteSettings } from "@/lib/types";
import { ActionNotice } from "./ui";
import { SubmitButton } from "./submit-button";

/**
 * Every field is pre-filled on purpose: the action writes all five keys and a
 * blank number box lands in the database as 0.
 */
export function DeliverySettingsForm({ settings }: { settings: SiteSettings }) {
  const [state, formAction, pending] = useActionState(saveDeliverySettingsAction, null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <ActionNotice state={state} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="delivery_mode" className="field-label">
            How delivery is charged
          </label>
          <select
            id="delivery_mode"
            name="delivery_mode"
            defaultValue={settings.delivery_mode}
            className="field"
          >
            <option value="zone">By zone</option>
            <option value="flat">One flat fee</option>
          </select>
        </div>

        <div>
          <label htmlFor="delivery_flat_fee" className="field-label">
            Flat fee (whole shillings)
          </label>
          <input
            id="delivery_flat_fee"
            name="delivery_flat_fee"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={centsToShillingInput(settings.delivery_flat_fee_cents)}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="free_delivery_threshold" className="field-label">
            Free delivery over (whole shillings)
          </label>
          <input
            id="free_delivery_threshold"
            name="free_delivery_threshold"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            aria-describedby="threshold-hint"
            defaultValue={centsToShillingInput(settings.free_delivery_threshold_cents)}
            className="field"
          />
          <p id="threshold-hint" className="prose-note mt-1.5 text-xs">
            Use 0 to switch free delivery off.
          </p>
        </div>

        <div>
          <label htmlFor="min_order" className="field-label">
            Minimum order (whole shillings)
          </label>
          <input
            id="min_order"
            name="min_order"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={centsToShillingInput(settings.min_order_cents)}
            className="field"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="delivery_note" className="field-label">
            Note shown to shoppers
          </label>
          <textarea
            id="delivery_note"
            name="delivery_note"
            rows={2}
            maxLength={400}
            defaultValue={settings.delivery_note}
            className="field"
          />
        </div>
      </div>

      <div className="mt-4">
        <SubmitButton pending={pending}>Save delivery settings</SubmitButton>
      </div>
    </form>
  );
}
