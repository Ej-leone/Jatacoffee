import { SubmitButton } from "./submit-button";

/**
 * Two-step delete with no client JS: a native <details> disclosure holds the
 * warning and the real submit button.
 */
export function ConfirmDelete({
  action,
  id,
  label,
  warning,
  summaryLabel = "Delete",
}: {
  action: (form: FormData) => Promise<void>;
  id: number;
  label: string;
  warning?: string;
  summaryLabel?: string;
}) {
  return (
    <details className="inline-block align-top">
      <summary className="btn btn-outline !min-h-9 !px-3 !text-xs cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {summaryLabel}
        <span className="sr-only"> “{label}”</span>
      </summary>
      <div className="mt-2 w-60 rounded-xl border border-berry-500/35 bg-berry-500/5 p-3">
        <p className="text-xs leading-relaxed text-espresso-700">
          {warning ?? `Delete “${label}”? This cannot be undone.`}
        </p>
        <form action={action} className="mt-2">
          <input type="hidden" name="id" value={id} />
          <SubmitButton
            busyLabel="Deleting…"
            className="btn !min-h-9 !px-3 !text-xs bg-berry-500 text-white hover:opacity-90"
          >
            Yes, delete “{label}”
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}
