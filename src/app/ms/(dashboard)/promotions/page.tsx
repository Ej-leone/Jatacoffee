import Link from "next/link";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { PromotionForm } from "@/components/admin/promotion-form";
import { SubmitButton } from "@/components/admin/submit-button";
import { EmptyNote, PageHeader, SavedNotice } from "@/components/admin/ui";
import { deletePromotionAction, togglePromotionAction } from "@/lib/admin-actions";
import { hasFlag, positiveInt, type Param } from "@/lib/admin-format";
import { describeSchedule, formatMoney, isPromotionLive } from "@/lib/pricing";
import {
  getPromotion,
  getSettings,
  listCategories,
  listMenu,
  listPromotions,
} from "@/lib/queries";

export const metadata = { title: "Offers" };

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: Param; saved?: Param }>;
}) {
  const params = await searchParams;
  const editId = positiveInt(params.edit);

  const promotions = listPromotions({});
  const categories = listCategories({ includeHidden: true });
  const items = listMenu({});
  const settings = getSettings();
  const currency = settings.currency;

  const editing = editId ? getPromotion(editId) : null;
  const missingEdit = editId !== null && editing === null;

  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const itemNames = new Map(items.map((i) => [i.id, i.name]));

  function targetLabel(scope: string, targetId: number | null): string {
    if (scope === "all" || targetId === null) return "Whole order";
    if (scope === "category") return categoryNames.get(targetId) ?? `Category #${targetId}`;
    return itemNames.get(targetId) ?? `Item #${targetId}`;
  }

  return (
    <>
      <PageHeader
        title="Offers"
        description="Happy hours, discount codes and automatic deals."
      />

      {hasFlag(params.saved) && <SavedNotice>Offer saved.</SavedNotice>}

      <section aria-labelledby="form-heading" className="card mb-6 p-4">
        <h2 id="form-heading" className="font-display text-base font-bold text-espresso-900">
          {editing ? `Edit “${editing.name}”` : "Add an offer"}
        </h2>
        {missingEdit && (
          <p role="status" className="prose-note mt-1">
            That offer no longer exists — this will create a new one.
          </p>
        )}
        <div className="mt-3">
          <PromotionForm promotion={editing} categories={categories} items={items} />
        </div>
      </section>

      <section aria-labelledby="list-heading" className="card p-2">
        <h2
          id="list-heading"
          className="px-2 pt-2 font-display text-base font-bold text-espresso-900"
        >
          All offers
        </h2>

        {promotions.length === 0 ? (
          <EmptyNote>No offers yet.</EmptyNote>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Offer</th>
                  <th scope="col">Discount</th>
                  <th scope="col">Applies to</th>
                  <th scope="col">Schedule</th>
                  <th scope="col">Uses</th>
                  <th scope="col">State</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((promo) => {
                  const live = promo.is_active === 1 && isPromotionLive(promo);
                  return (
                    <tr key={promo.id}>
                      <td className="align-top">
                        <span className="font-semibold">{promo.name}</span>
                        <span className="block text-xs text-espresso-500">
                          {promo.kind === "code"
                            ? `Code: ${promo.code ?? "—"}`
                            : promo.kind === "happy_hour"
                              ? "Happy hour"
                              : "Automatic"}
                        </span>
                      </td>
                      <td className="align-top whitespace-nowrap">
                        {promo.discount_type === "percent"
                          ? `${promo.discount_value}% off`
                          : `${currency} ${promo.discount_value} off`}
                        {promo.min_subtotal_cents > 0 && (
                          <span className="block text-xs text-espresso-500">
                            Over {formatMoney(promo.min_subtotal_cents, currency)}
                          </span>
                        )}
                      </td>
                      <td className="align-top">{targetLabel(promo.scope, promo.target_id)}</td>
                      <td className="align-top text-xs">{describeSchedule(promo)}</td>
                      <td className="align-top whitespace-nowrap">
                        {promo.usage_count}
                        {promo.max_uses != null ? ` / ${promo.max_uses}` : ""}
                      </td>
                      <td className="align-top">
                        {promo.is_active !== 1 ? (
                          <span className="chip bg-cream-200 text-espresso-600">Off</span>
                        ) : live ? (
                          <span className="chip bg-leaf-500/15 text-leaf-600">Running now</span>
                        ) : (
                          <span className="chip bg-caramel-400/20 text-caramel-600">
                            Scheduled
                          </span>
                        )}
                      </td>
                      <td className="align-top">
                        <div className="flex flex-wrap items-start gap-1.5">
                          <Link
                            href={`/ms/promotions?edit=${promo.id}`}
                            className="btn btn-outline !min-h-9 !px-3 !text-xs"
                          >
                            Edit
                          </Link>

                          {/* togglePromotionAction re-reads the row itself, so id + next_state is enough. */}
                          <form action={togglePromotionAction}>
                            <input type="hidden" name="id" value={promo.id} />
                            <input
                              type="hidden"
                              name="next_state"
                              value={promo.is_active === 1 ? "0" : "1"}
                            />
                            <SubmitButton
                              busyLabel="…"
                              className="btn btn-outline !min-h-9 !px-3 !text-xs"
                            >
                              {promo.is_active === 1 ? "Turn off" : "Turn on"}
                              <span className="sr-only"> — {promo.name}</span>
                            </SubmitButton>
                          </form>

                          <ConfirmDelete
                            action={deletePromotionAction}
                            id={promo.id}
                            label={promo.name}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
