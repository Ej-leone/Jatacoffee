"use client";

import { startTransition, useActionState } from "react";
import { loginAction } from "@/lib/admin-actions";
import { ActionNotice } from "./ui";
import { SubmitButton } from "./submit-button";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);

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
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={120}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className="field"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          maxLength={200}
          autoComplete="current-password"
          className="field"
        />
      </div>

      <SubmitButton pending={pending} busyLabel="Signing in…" className="btn btn-primary w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}
