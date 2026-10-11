import Link from "next/link";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { MenuItemForm } from "@/components/admin/menu-item-form";
import { SubmitButton } from "@/components/admin/submit-button";
import { EmptyNote, PageHeader, SavedNotice } from "@/components/admin/ui";
import {
  deleteMenuItemAction,
  toggleAvailabilityAction,
} from "@/lib/admin-actions";
import { hasFlag, positiveInt, type Param } from "@/lib/admin-format";
import { formatMoney } from "@/lib/pricing";
import { getMenuItem, getSettings, listCategories, listMenu } from "@/lib/queries";

export const metadata = { title: "Menu" };

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: Param; saved?: Param }>;
}) {
  const params = await searchParams;
  const editId = positiveInt(params.edit);

  const items = await listMenu({});
  const categories = await listCategories({ includeHidden: true });
  const settings = await getSettings();
  const currency = settings.currency;

  const editing = editId ? await getMenuItem(editId) : null;
  const missingEdit = editId !== null && editing === null;

  return (
    <>
      <PageHeader
        title="Menu"
        description={`${items.length} items across ${categories.length} categories.`}
      />

      {hasFlag(params.saved) && <SavedNotice>Menu item saved.</SavedNotice>}

      <section aria-labelledby="form-heading" className="card mb-6 p-4">
        <h2 id="form-heading" className="font-display text-base font-bold text-espresso-900">
          {editing ? `Edit “${editing.name}”` : "Add a menu item"}
        </h2>
        {missingEdit && (
          <p role="status" className="prose-note mt-1">
            That item no longer exists — this will create a new one.
          </p>
        )}
        <div className="mt-3">
          <MenuItemForm item={editing} categories={categories} />
        </div>
      </section>

      <section aria-labelledby="list-heading" className="card p-2">
        <h2 id="list-heading" className="px-2 pt-2 font-display text-base font-bold text-espresso-900">
          All items
        </h2>

        {items.length === 0 ? (
          <EmptyNote>No menu items yet.</EmptyNote>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Category</th>
                  <th scope="col">Price</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="align-top">
                      <span className="font-semibold">{item.name}</span>
                      {item.badge && (
                        <span className="ml-1.5 chip bg-caramel-400/20 text-caramel-600">
                          {item.badge}
                        </span>
                      )}
                      {item.is_featured === 1 && (
                        <span className="block text-xs text-espresso-500">Featured</span>
                      )}
                    </td>
                    <td className="align-top">{item.category_name}</td>
                    <td className="align-top whitespace-nowrap">
                      {formatMoney(item.price_cents, currency)}
                    </td>
                    <td className="align-top">
                      {item.is_available === 1 ? (
                        <span className="chip bg-leaf-500/15 text-leaf-600">In stock</span>
                      ) : (
                        <span className="chip bg-berry-500/15 text-berry-500">Sold out</span>
                      )}
                    </td>
                    <td className="align-top">
                      <div className="flex flex-wrap items-start gap-1.5">
                        <Link
                          href={`/ms/menu?edit=${item.id}`}
                          className="btn btn-outline !min-h-9 !px-3 !text-xs"
                        >
                          Edit
                        </Link>

                        <form action={toggleAvailabilityAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <input
                            type="hidden"
                            name="next_state"
                            value={item.is_available === 1 ? "0" : "1"}
                          />
                          <SubmitButton
                            busyLabel="…"
                            className="btn btn-outline !min-h-9 !px-3 !text-xs"
                          >
                            {item.is_available === 1 ? "Mark sold out" : "Mark in stock"}
                            <span className="sr-only"> — {item.name}</span>
                          </SubmitButton>
                        </form>

                        <ConfirmDelete
                          action={deleteMenuItemAction}
                          id={item.id}
                          label={item.name}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
