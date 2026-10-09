"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { saveZoneAction } from "@/lib/admin-actions";
import { centsToShillingInput } from "@/lib/admin-format";
import type { DeliveryZone } from "@/lib/types";
import { ActionNotice } from "./ui";
import { SubmitButton } from "./submit-button";

export function ZoneForm({ zone }: { zone: DeliveryZone | null }) {
  const [state, formAction, pending] = useActionState(saveZoneAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && !zone) formRef.current?.reset();
  }, [state, zone]);

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <ActionNotice state={state} />

      {zone && <input type="hidden" name="id" value={zone.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="field-label">
            Area name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={80}
            defaultValue={zone?.name ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="fee" className="field-label">
            Delivery fee (whole shillings)
          </label>
          <input
            id="fee"
            name="fee"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={zone ? centsToShillingInput(zone.fee_cents) : "0"}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="eta_minutes" className="field-label">
            Typical minutes
          </label>
          <input
            id="eta_minutes"
            name="eta_minutes"
            type="number"
            min="0"
            step="1"
            placeholder="Leave blank if it varies"
            defaultValue={zone?.eta_minutes != null ? String(zone.eta_minutes) : ""}
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
            defaultValue={zone ? String(zone.sort_order) : "0"}
            className="field"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="notes" className="field-label">
            Notes
          </label>
          <input
            id="notes"
            name="notes"
            type="text"
            maxLength={200}
            defaultValue={zone?.notes ?? ""}
            className="field"
          />
        </div>

        <label htmlFor="is_active" className="flex items-center gap-2 text-sm">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={zone ? zone.is_active === 1 : true}
            className="size-4"
          />
          Offer delivery here
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <SubmitButton pending={pending}>{zone ? "Save changes" : "Add area"}</SubmitButton>
        {zone && (
          <Link href="/ms/delivery" className="btn btn-outline">
            Cancel edit
          </Link>
        )}
      </div>
    </form>
  );
}
