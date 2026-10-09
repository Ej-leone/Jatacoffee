import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { SubmitButton } from "@/components/admin/submit-button";
import { EmptyNote, PageHeader } from "@/components/admin/ui";
import { deleteCustomerAction, saveCustomerAction } from "@/lib/admin-actions";
import { clampSearch, formatStamp, type Param } from "@/lib/admin-format";
import { formatMoney } from "@/lib/pricing";
import { getSettings, listCustomers } from "@/lib/queries";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: Param }>;
}) {
  const params = await searchParams;
  const search = clampSearch(params.q);

  const settings = getSettings();
  const currency = settings.currency;
  const customers = listCustomers({ limit: 200, search });

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who has ordered, newest first. Up to 200 at a time."
      />

      <form
        action="/ms/customers"
        method="get"
        className="card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="q" className="field-label">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={search}
            maxLength={60}
            placeholder="Phone, name or area"
            className="field"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {customers.length === 0 ? (
        <div className="card p-4">
          <EmptyNote>No customers match this search.</EmptyNote>
        </div>
      ) : (
        <div className="card overflow-x-auto p-2">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Area</th>
                <th scope="col">Orders</th>
                <th scope="col">Spend</th>
                <th scope="col">Last order</th>
                <th scope="col">Marketing</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="align-top">
                    {customer.name && <span className="font-semibold">{customer.name}</span>}
                    <a
                      href={`tel:+${customer.phone}`}
                      className="block text-xs text-espresso-500 underline"
                    >
                      {customer.phone}
                    </a>
                    {customer.notes && (
                      <span className="mt-1 block max-w-xs text-xs text-espresso-500">
                        {customer.notes}
                      </span>
                    )}
                  </td>
                  <td className="align-top">
                    {customer.zone_name ?? customer.location ?? "—"}
                  </td>
                  <td className="align-top">{customer.orders_count}</td>
                  <td className="align-top whitespace-nowrap">
                    {formatMoney(customer.total_spend_cents, currency)}
                  </td>
                  <td className="align-top whitespace-nowrap">
                    {formatStamp(customer.last_order_at)}
                  </td>
                  <td className="align-top">
                    {customer.marketing_opt_in === 1 ? (
                      <span className="chip bg-leaf-500/15 text-leaf-600">Opted in</span>
                    ) : (
                      <span className="chip bg-cream-200 text-espresso-600">Opted out</span>
                    )}
                  </td>
                  <td className="align-top">
                    <div className="flex flex-wrap items-start gap-1.5">
                      <details className="inline-block align-top">
                        <summary className="btn btn-outline !min-h-9 !px-3 !text-xs cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                          Edit
                          <span className="sr-only">
                            {" "}
                            {customer.name || customer.phone}
                          </span>
                        </summary>
                        {/*
                          saveCustomerAction writes both fields unconditionally, so
                          both have to carry the stored value or saving wipes them.
                        */}
                        <form
                          action={saveCustomerAction}
                          className="mt-2 w-64 rounded-xl border border-cream-200 bg-cream-50 p-3"
                        >
                          <input type="hidden" name="id" value={customer.id} />
                          <label
                            htmlFor={`notes-${customer.id}`}
                            className="field-label"
                          >
                            Notes
                          </label>
                          <textarea
                            id={`notes-${customer.id}`}
                            name="notes"
                            rows={3}
                            maxLength={400}
                            defaultValue={customer.notes ?? ""}
                            className="field"
                          />
                          <label
                            htmlFor={`opt-${customer.id}`}
                            className="mt-2 flex items-center gap-2 text-sm"
                          >
                            <input
                              id={`opt-${customer.id}`}
                              name="marketing_opt_in"
                              type="checkbox"
                              defaultChecked={customer.marketing_opt_in === 1}
                              className="size-4"
                            />
                            Happy to receive offers
                          </label>
                          <div className="mt-3">
                            <SubmitButton className="btn btn-primary !min-h-9 w-full !text-xs">
                              Save {customer.name || customer.phone}
                            </SubmitButton>
                          </div>
                        </form>
                      </details>

                      <ConfirmDelete
                        action={deleteCustomerAction}
                        id={customer.id}
                        label={customer.name || customer.phone}
                        warning={`Delete “${
                          customer.name || customer.phone
                        }”? Their past orders stay, but lose the link to this profile. This cannot be undone.`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
