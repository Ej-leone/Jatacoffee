import Link from "next/link";
import { CategoryForm } from "@/components/admin/category-form";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { EmptyNote, PageHeader } from "@/components/admin/ui";
import { deleteCategoryAction } from "@/lib/admin-actions";
import { positiveInt, type Param } from "@/lib/admin-format";
import { listCategories, listMenu } from "@/lib/queries";

export const metadata = { title: "Categories" };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: Param }>;
}) {
  const params = await searchParams;
  const editId = positiveInt(params.edit);

  const categories = listCategories({ includeHidden: true });
  const items = listMenu({});

  const counts = new Map<number, number>();
  for (const item of items) {
    counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1);
  }

  // listCategories is unpaginated, so an in-memory lookup is complete.
  const editing = editId ? (categories.find((c) => c.id === editId) ?? null) : null;
  const missingEdit = editId !== null && editing === null;

  return (
    <>
      <PageHeader
        title="Categories"
        description="Menu sections, in the order they appear on the site."
      />

      <section aria-labelledby="form-heading" className="card mb-6 p-4">
        <h2 id="form-heading" className="font-display text-base font-bold text-espresso-900">
          {editing ? `Edit “${editing.name}”` : "Add a category"}
        </h2>
        {missingEdit && (
          <p role="status" className="prose-note mt-1">
            That category no longer exists — this will create a new one.
          </p>
        )}
        <div className="mt-3">
          <CategoryForm category={editing} />
        </div>
      </section>

      <section aria-labelledby="list-heading" className="card p-2">
        <h2
          id="list-heading"
          className="px-2 pt-2 font-display text-base font-bold text-espresso-900"
        >
          All categories
        </h2>

        {categories.length === 0 ? (
          <EmptyNote>No categories yet.</EmptyNote>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Items</th>
                  <th scope="col">Order</th>
                  <th scope="col">Live</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => {
                  const count = counts.get(category.id) ?? 0;
                  return (
                    <tr key={category.id}>
                      <td className="align-top">
                        <span className="font-semibold">{category.name}</span>
                        {category.blurb && (
                          <span className="block max-w-xs text-xs text-espresso-500">
                            {category.blurb}
                          </span>
                        )}
                      </td>
                      <td className="align-top">{count}</td>
                      <td className="align-top">{category.sort_order}</td>
                      <td className="align-top">
                        {category.is_active === 1 ? (
                          <span className="chip bg-leaf-500/15 text-leaf-600">Visible</span>
                        ) : (
                          <span className="chip bg-cream-200 text-espresso-600">Hidden</span>
                        )}
                      </td>
                      <td className="align-top">
                        <div className="flex flex-wrap items-start gap-1.5">
                          <Link
                            href={`/ms/categories?edit=${category.id}`}
                            className="btn btn-outline !min-h-9 !px-3 !text-xs"
                          >
                            Edit
                          </Link>
                          <ConfirmDelete
                            action={deleteCategoryAction}
                            id={category.id}
                            label={category.name}
                            warning={
                              count > 0
                                ? `Deleting “${category.name}” also deletes its ${count} menu ${
                                    count === 1 ? "item" : "items"
                                  }. This cannot be undone.`
                                : `Delete “${category.name}”? This cannot be undone.`
                            }
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
