"use client";

import { startTransition, useActionState } from "react";
import { changePasswordAction } from "@/lib/admin-actions";
import { ActionNotice } from "./ui";
import { SubmitButton } from "./submit-button";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <ActionNotice state={state} />

      <div className="mb-3">
        <label htmlFor="current_password" className="field-label">
          Current password
        </label>
        <input
          id="current_password"
          name="current_password"
          type="password"
          required
          maxLength={200}
          autoComplete="current-password"
          className="field"
        />
      </div>

      <div className="mb-3">
        <label htmlFor="new_password" className="field-label">
          New password
        </label>
        <input
          id="new_password"
          name="new_password"
          type="password"
          required
          minLength={10}
          maxLength={200}
          autoComplete="new-password"
          aria-describedby="password-rules"
          className="field"
        />
        <p id="password-rules" className="prose-note mt-1.5 text-xs">
          At least 10 characters, with one lowercase letter, one uppercase letter and
          one number.
        </p>
      </div>

      <div className="mb-4">
        <label htmlFor="confirm_password" className="field-label">
          Confirm new password
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={10}
          maxLength={200}
          autoComplete="new-password"
          className="field"
        />
      </div>

      <SubmitButton
        pending={pending}
        busyLabel="Updating…"
        className="btn btn-primary w-full"
      >
        Update password
      </SubmitButton>
    </form>
  );
}
