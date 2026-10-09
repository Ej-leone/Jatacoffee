"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  /**
   * Pass useActionState's pending flag for forms submitted through onSubmit.
   * Forms using the `action` prop can omit it and rely on useFormStatus.
   */
  pending?: boolean;
  busyLabel?: string;
  className?: string;
};

/**
 * Must be rendered *inside* the <form> it belongs to: useFormStatus reads the
 * nearest ancestor form.
 */
export function SubmitButton({
  children,
  pending,
  busyLabel = "Saving…",
  className = "btn btn-primary",
}: Props) {
  const status = useFormStatus();
  const busy = pending ?? status.pending;

  return (
    <button type="submit" className={className} disabled={busy} aria-busy={busy}>
      {busy ? busyLabel : children}
    </button>
  );
}
