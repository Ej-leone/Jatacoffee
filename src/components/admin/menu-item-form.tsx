"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import { saveMenuItemAction } from "@/lib/admin-actions";
import { centsToShillingInput } from "@/lib/admin-format";
import type { Category, MenuItem } from "@/lib/types";
import { ActionNotice } from "./ui";
import { SubmitButton } from "./submit-button";

export function MenuItemForm({
  item,
  categories,
}: {
  item: MenuItem | null;
  categories: Category[];
}) {
  const [state, formAction, pending] = useActionState(saveMenuItemAction, null);

  if (categories.length === 0) {
    return (
      <p className="prose-note">
        Add a category first —{" "}
        <Link href="/ms/categories" className="font-semibold underline">
          go to categories
        </Link>
        .
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <ActionNotice state={state} />

      {item && <input type="hidden" name="id" value={item.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className="field-label">
            Item name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={100}
            defaultValue={item?.name ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="category_id" className="field-label">
            Category
          </label>
          <select
            id="category_id"
            name="category_id"
            required
            defaultValue={item ? String(item.category_id) : ""}
            className="field"
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.is_active ? "" : " (hidden)"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="price" className="field-label">
            Price (whole shillings)
          </label>
          <input
            id="price"
            name="price"
            type="number"
            required
            min="1"
            step="1"
            inputMode="numeric"
            defaultValue={item ? centsToShillingInput(item.price_cents) : ""}
            className="field"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className="field-label">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={400}
            defaultValue={item?.description ?? ""}
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
            placeholder="/img/generated/signature-coffees.webp"
            defaultValue={item?.image_url ?? ""}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="badge" className="field-label">
            Badge
          </label>
          <input
            id="badge"
            name="badge"
            type="text"
            maxLength={30}
            placeholder="Bestseller"
            defaultValue={item?.badge ?? ""}
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
            defaultValue={item ? String(item.sort_order) : "0"}
            className="field"
          />
        </div>

        <fieldset className="flex flex-wrap items-center gap-4 pt-1">
          <legend className="field-label">Visibility</legend>
          <label htmlFor="is_available" className="flex items-center gap-2 text-sm">
            <input
              id="is_available"
              name="is_available"
              type="checkbox"
              defaultChecked={item ? item.is_available === 1 : true}
              className="size-4"
            />
            In stock
          </label>
          <label htmlFor="is_featured" className="flex items-center gap-2 text-sm">
            <input
              id="is_featured"
              name="is_featured"
              type="checkbox"
              defaultChecked={item ? item.is_featured === 1 : false}
              className="size-4"
            />
            Featured
          </label>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <SubmitButton pending={pending}>
          {item ? "Save changes" : "Add item"}
        </SubmitButton>
        {item && (
          <Link href="/ms/menu" className="btn btn-outline">
            Cancel edit
          </Link>
        )}
      </div>
    </form>
  );
}
