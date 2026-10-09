"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { savePromotionAction } from "@/lib/admin-actions";
import { centsToShillingInput, parseDaysOfWeek, WEEKDAYS } from "@/lib/admin-format";
import type {
  Category,
  DiscountType,
  MenuItemWithCategory,
  Promotion,
  PromotionKind,
  PromotionScope,
} from "@/lib/types";
import { ActionNotice } from "./ui";
import { SubmitButton } from "./submit-button";

const KINDS: { value: PromotionKind; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "happy_hour", label: "Happy hour" },
  { value: "code", label: "Discount code" },
];

export function PromotionForm({
  promotion,
  categories,
  items,
}: {
  promotion: Promotion | null;
  categories: Category[];
  items: MenuItemWithCategory[];
}) {
  const [state, formAction, pending] = useActionState(savePromotionAction, null);

  const [kind, setKind] = useState<PromotionKind>(promotion?.kind ?? "auto");
  const [discountType, setDiscountType] = useState<DiscountType>(
    promotion?.discount_type ?? "percent",
  );
  const [scope, setScope] = useState<PromotionScope>(promotion?.scope ?? "all");

  const activeDays = parseDaysOfWeek(promotion?.days_of_week ?? null);

  const targetOptions =
    scope === "category"
      ? categories.map((c) => ({ id: c.id, label: c.name }))
      : scope === "item"
        ? items.map((i) => ({ id: i.id, label: `${i.name} — ${i.category_name}` }))
        : [];

  // A non-"all" scope with nothing to point at would be rejected server-side, so
  // fall the submitted value back to "all" and say why.
  const scopeUnavailable = scope !== "all" && targetOptions.length === 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <ActionNotice state={state} />

      {promotion && <input type="hidden" name="id" value={promotion.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="field-label">
            Offer name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={80}
            defaultValue={promotion?.name ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="kind" className="field-label">
            Offer type
          </label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as PromotionKind)}
            className="field"
          >
            {KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {kind === "code" && (
          <div>
            <label htmlFor="code" className="field-label">
              Discount code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              required
              minLength={3}
              maxLength={32}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="JATA10"
              defaultValue={promotion?.code ?? ""}
              className="field uppercase"
            />
            <p className="prose-note mt-1.5 text-xs">
              Saved in capitals. Shoppers type this at checkout.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="discount_type" className="field-label">
            Discount kind
          </label>
          <select
            id="discount_type"
            name="discount_type"
            value={discountType}
            onChange={(event) => setDiscountType(event.target.value as DiscountType)}
            className="field"
          >
            <option value="percent">Percentage off</option>
            <option value="fixed">Shillings off</option>
          </select>
        </div>

        <div>
          <label htmlFor="discount_value" className="field-label">
            {discountType === "percent" ? "Percent off" : "Shillings off"}
          </label>
          <input
            id="discount_value"
            name="discount_value"
            type="number"
            required
            min="1"
            step="1"
            max={discountType === "percent" ? 100 : undefined}
            inputMode="numeric"
            defaultValue={promotion ? String(promotion.discount_value) : ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="scope" className="field-label">
            Applies to
          </label>
          <select
            id="scope"
            name={scopeUnavailable ? undefined : "scope"}
            value={scope}
            onChange={(event) => setScope(event.target.value as PromotionScope)}
            className="field"
          >
            <option value="all">The whole order</option>
            <option value="category">One category</option>
            <option value="item">One menu item</option>
          </select>
          {scopeUnavailable && <input type="hidden" name="scope" value="all" />}
        </div>

        {scope !== "all" && (
          <div>
            <label htmlFor="target_id" className="field-label">
              {scope === "category" ? "Category" : "Menu item"}
            </label>
            {scopeUnavailable ? (
              <p className="prose-note">
                Nothing to point at yet —{" "}
                <Link
                  href={scope === "category" ? "/ms/categories" : "/ms/menu"}
                  className="font-semibold underline"
                >
                  add {scope === "category" ? "a category" : "a menu item"}
                </Link>
                . Saving now applies the offer to the whole order.
              </p>
            ) : (
              <select
                id="target_id"
                name="target_id"
                required
                defaultValue={promotion?.target_id ? String(promotion.target_id) : ""}
                className="field"
              >
                <option value="">Choose one</option>
                {targetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div>
          <label htmlFor="min_subtotal" className="field-label">
            Minimum order (whole shillings)
          </label>
          <input
            id="min_subtotal"
            name="min_subtotal"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={
              promotion ? centsToShillingInput(promotion.min_subtotal_cents) : "0"
            }
            className="field"
          />
        </div>

        <div>
          <label htmlFor="max_uses" className="field-label">
            Maximum uses
          </label>
          <input
            id="max_uses"
            name="max_uses"
            type="number"
            min="0"
            step="1"
            placeholder="Unlimited"
            defaultValue={promotion?.max_uses != null ? String(promotion.max_uses) : ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="start_time" className="field-label">
            Starts at (time of day)
          </label>
          <input
            id="start_time"
            name="start_time"
            type="time"
            defaultValue={promotion?.start_time ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="end_time" className="field-label">
            Ends at (time of day)
          </label>
          <input
            id="end_time"
            name="end_time"
            type="time"
            defaultValue={promotion?.end_time ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="starts_at" className="field-label">
            First day
          </label>
          <input
            id="starts_at"
            name="starts_at"
            type="date"
            defaultValue={promotion?.starts_at ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="ends_at" className="field-label">
            Last day
          </label>
          <input
            id="ends_at"
            name="ends_at"
            type="date"
            defaultValue={promotion?.ends_at ?? ""}
            className="field"
          />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="field-label">Days of the week</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {WEEKDAYS.map((day) => (
              <label
                key={day.value}
                htmlFor={`day-${day.value}`}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  id={`day-${day.value}`}
                  name="days"
                  type="checkbox"
                  value={day.value}
                  defaultChecked={activeDays.includes(day.value)}
                  className="size-4"
                />
                {day.label}
              </label>
            ))}
          </div>
          <p className="prose-note mt-1.5 text-xs">
            Leave every day ticked (or none) for an offer that runs daily. Set both
            times, or leave both blank.
          </p>
        </fieldset>

        <label htmlFor="is_active" className="flex items-center gap-2 text-sm">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={promotion ? promotion.is_active === 1 : true}
            className="size-4"
          />
          Offer is running
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <SubmitButton pending={pending}>
          {promotion ? "Save changes" : "Add offer"}
        </SubmitButton>
        {promotion && (
          <Link href="/ms/promotions" className="btn btn-outline">
            Cancel edit
          </Link>
        )}
      </div>
    </form>
  );
}
