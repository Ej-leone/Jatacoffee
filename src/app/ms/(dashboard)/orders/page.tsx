import { EmptyNote, PageHeader, StatusPill } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/submit-button";
import { setOrderStatusAction } from "@/lib/admin-actions";
import {
  clampSearch,
  formatStamp,
  isOrderStatus,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  safeAppliedPromos,
  safeOrderLines,
  type Param,
} from "@/lib/admin-format";
import { formatMoney } from "@/lib/pricing";
import { getSettings, listOrders } from "@/lib/queries";

export const metadata = { title: "Orders" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Param; q?: Param }>;
}) {
  const params = await searchParams;

  const statusRaw = clampSearch(params.status, 20);
  const status = isOrderStatus(statusRaw) ? statusRaw : "all";
  const search = clampSearch(params.q);

  const settings = getSettings();
  const currency = settings.currency;
  const orders = listOrders({ limit: 100, status, search });

  return (
    <>
      <PageHeader
        title="Orders"
        description="The 100 most recent orders. Update a status as the kitchen works through them."
      />

      <form
        action="/ms/orders"
        method="get"
        className="card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
      >
        <div className="sm:w-52">
          <label htmlFor="status" className="field-label">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className="field">
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

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
            placeholder="Phone, name or reference"
            className="field"
          />
        </div>

        <button type="submit" className="btn btn-primary">
          Filter
        </button>
      </form>

      {orders.length === 0 ? (
        <div className="card p-4">
          <EmptyNote>No orders match this filter.</EmptyNote>
        </div>
      ) : (
        <div className="card overflow-x-auto p-2">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Placed</th>
                <th scope="col">Customer</th>
                <th scope="col">Type</th>
                <th scope="col">Total</th>
                <th scope="col">Status</th>
                <th scope="col">Update</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const lines = safeOrderLines(order.items_json);
                const promos = safeAppliedPromos(order.applied_promos);

                return (
                  <tr key={order.id}>
                    <td className="align-top">
                      <span className="font-semibold">{order.reference}</span>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-espresso-500">
                          Items ({lines.length})
                        </summary>
                        <div className="mt-1.5 w-64 text-xs leading-relaxed text-espresso-700">
                          {lines.length === 0 ? (
                            <p>Items unavailable.</p>
                          ) : (
                            <ul>
                              {lines.map((line, index) => (
                                <li key={`${order.id}-${index}`}>
                                  {line.quantity} × {line.name} ·{" "}
                                  {formatMoney(line.line_total_cents, currency)}
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-1.5">
                            Subtotal {formatMoney(order.subtotal_cents, currency)}
                            {order.discount_cents > 0 && (
                              <> · Discount −{formatMoney(order.discount_cents, currency)}</>
                            )}
                            {order.delivery_fee_cents > 0 && (
                              <> · Delivery {formatMoney(order.delivery_fee_cents, currency)}</>
                            )}
                          </p>
                          {promos.length > 0 && (
                            <p className="mt-1">
                              Offers: {promos.map((p) => p.name).join(", ")}
                            </p>
                          )}
                          {order.promo_code && <p className="mt-1">Code: {order.promo_code}</p>}
                          {order.notes && <p className="mt-1">Note: {order.notes}</p>}
                        </div>
                      </details>
                    </td>
                    <td className="align-top whitespace-nowrap">
                      {formatStamp(order.created_at)}
                    </td>
                    <td className="align-top">
                      {order.customer_name && <span>{order.customer_name}</span>}
                      <a
                        href={`tel:+${order.phone}`}
                        className="block text-xs text-espresso-500 underline"
                      >
                        {order.phone}
                      </a>
                    </td>
                    <td className="align-top">
                      <span className="capitalize">{order.order_type}</span>
                      {order.zone_name && (
                        <span className="block text-xs text-espresso-500">
                          {order.zone_name}
                        </span>
                      )}
                      {order.location && (
                        <span className="block text-xs text-espresso-500">
                          {order.location}
                        </span>
                      )}
                    </td>
                    <td className="align-top whitespace-nowrap font-semibold">
                      {formatMoney(order.total_cents, currency)}
                    </td>
                    <td className="align-top">
                      <StatusPill status={order.status} />
                    </td>
                    <td className="align-top">
                      <form action={setOrderStatusAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={order.id} />
                        <label htmlFor={`status-${order.id}`} className="sr-only">
                          Status for order {order.reference}
                        </label>
                        <select
                          id={`status-${order.id}`}
                          name="status"
                          defaultValue={order.status}
                          className="field !w-auto !px-2 !py-1.5 !text-sm"
                        >
                          {ORDER_STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {ORDER_STATUS_LABELS[value]}
                            </option>
                          ))}
                        </select>
                        <SubmitButton
                          busyLabel="…"
                          className="btn btn-outline !min-h-9 !px-3 !text-xs"
                        >
                          Save
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
