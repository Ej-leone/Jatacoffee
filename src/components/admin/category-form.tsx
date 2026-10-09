"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { saveCategoryAction } from "@/lib/admin-actions";
import type { Category } from "@/lib/types";
import { ActionNotice } from "./ui";
import { SubmitButton } from "./submit-button";

export function CategoryForm({ category }: { category: Category | null }) {
  const [state, formAction, pending] = useActionState(saveCategoryAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Create mode only: clear up after a save so a second tap cannot mint a
  // near-duplicate. Edit mode keeps the values on screen.
  useEffect(() => {
    if (state?.ok && !category) formRef.current?.reset();
  }, [state, category]);

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

      {category && <input type="hidden" name="id" value={category.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="field-label">
            Category name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={60}
            defaultValue={category?.name ?? ""}
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
            defaultValue={category ? String(category.sort_order) : "0"}
            className="field"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="blurb" className="field-label">
            Blurb
          </label>
          <textarea
            id="blurb"
            name="blurb"
            rows={2}
            maxLength={200}
            defaultValue={category?.blurb ?? ""}
            className="field"
          />
        </div>

        <label htmlFor="is_active" className="flex items-center gap-2 text-sm">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={category ? category.is_active === 1 : true}
            className="size-4"
          />
          Show on the live site
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <SubmitButton pending={pending}>
          {category ? "Save changes" : "Add category"}
        </SubmitButton>
        {category && (
          <Link href="/ms/categories" className="btn btn-outline">
            Cancel edit
          </Link>
        )}
      </div>
    </form>
  );
}
