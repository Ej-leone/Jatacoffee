import Link from "next/link";
import { formatMoney } from "@/lib/pricing";
import { ORDER_STATUS_LABELS } from "@/lib/admin-format";
import type { ActionState } from "@/lib/admin-actions";
import type { OrderStatus } from "@/lib/types";

/** One <h1> per page, plus optional supporting copy and a right-hand slot. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 pt-6 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold text-espresso-900">{title}</h1>
        {description && <p className="prose-note mt-1">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-espresso-500">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold text-espresso-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-espresso-500">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card block p-4 hover:border-caramel-400">
        {body}
      </Link>
    );
  }
  return <div className="card p-4">{body}</div>;
}

/** Banner for ?saved=1 / ?changed=1 style confirmations. */
export function SavedNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="mb-4 rounded-xl border border-leaf-500/35 bg-leaf-500/10 px-4 py-3 text-sm font-medium text-leaf-600"
    >
      {children}
    </p>
  );
}

/** Inline result of a useActionState submission. */
export function ActionNotice({ state }: { state: ActionState }) {
  if (!state) return null;

  if (state.ok) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="mb-3 rounded-xl border border-leaf-500/35 bg-leaf-500/10 px-3.5 py-2.5 text-sm font-medium text-leaf-600"
      >
        {state.message ?? "Saved."}
      </p>
    );
  }

  return (
    <p
      role="alert"
      aria-live="polite"
      className="mb-3 rounded-xl border border-berry-500/40 bg-berry-500/10 px-3.5 py-2.5 text-sm font-medium text-berry-500"
    >
      {state.error ?? "Something went wrong. Try again."}
    </p>
  );
}

const STATUS_CLASS: Record<OrderStatus, string> = {
  new: "bg-caramel-400/20 text-caramel-600",
  confirmed: "bg-espresso-500/15 text-espresso-700",
  completed: "bg-leaf-500/15 text-leaf-600",
  cancelled: "bg-berry-500/15 text-berry-500",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={`chip ${STATUS_CLASS[status]}`}>{ORDER_STATUS_LABELS[status]}</span>
  );
}

export function Money({ cents, currency }: { cents: number; currency: string }) {
  return <>{formatMoney(cents, currency)}</>;
}

/** Shared empty-state row for the admin tables. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="prose-note py-6 text-center">{children}</p>;
}
