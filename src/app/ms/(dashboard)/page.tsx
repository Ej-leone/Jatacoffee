import Link from "next/link";
import { EmptyNote, PageHeader, StatCard, StatusPill } from "@/components/admin/ui";
import { formatStamp } from "@/lib/admin-format";
import { formatMoney } from "@/lib/pricing";
import { getDashboardStats, getSettings, listOrders } from "@/lib/queries";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const stats = getDashboardStats();
  const orders = listOrders({ limit: 8 });
  const settings = getSettings();
  const currency = settings.currency;

  const maxRevenue = Math.max(1, ...stats.daily.map((d) => d.revenue_cents));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="How the cafe is doing right now."
      />

      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="sr-only">
          Key numbers
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Orders today"
            value={String(stats.orders_today)}
            hint={`${stats.orders_7d} in the last 7 days`}
          />
          <StatCard
            label="Revenue today"
            value={formatMoney(stats.revenue_today_cents, currency)}
            hint={`${formatMoney(stats.revenue_7d_cents, currency)} in 7 days`}
          />
          <StatCard
            label="Average order"
            value={formatMoney(stats.avg_order_cents, currency)}
            hint="Last 30 days"
          />
          <StatCard
            label="Customers"
            value={String(stats.total_customers)}
            hint={`${stats.new_customers_7d} new in 7 days`}
            href="/ms/customers"
          />
          <StatCard
            label="Sold out items"
            value={String(stats.sold_out_count)}
            hint="Mark them back in stock"
            href="/ms/menu"
          />
          <StatCard
            label="Active offers"
            value={String(stats.active_promos)}
            href="/ms/promotions"
          />
          <StatCard
            label="WhatsApp checkouts"
            value={String(stats.whatsapp_clicks_today)}
            hint={`${stats.whatsapp_clicks_7d} in 7 days`}
          />
          <StatCard
            label="Orders in list"
            value={String(orders.length)}
            hint="Most recent first"
            href="/ms/orders"
          />
        </div>
      </section>

      <section aria-labelledby="daily-heading" className="card mt-6 p-4">
        <h2 id="daily-heading" className="font-display text-base font-bold text-espresso-900">
          Last 7 days (by day)
        </h2>
        {stats.daily.length === 0 ? (
          <EmptyNote>No orders in this period yet.</EmptyNote>
        ) : (
          <ul className="mt-3 space-y-2">
            {stats.daily.map((day) => (
              <li key={day.day} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-espresso-700">{day.day}</span>
                  <span className="text-espresso-500">
                    {day.orders} {day.orders === 1 ? "order" : "orders"} ·{" "}
                    {formatMoney(day.revenue_cents, currency)}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-cream-100">
                  <div
                    className="h-2 rounded-full bg-caramel-400"
                    style={{
                      width: `${Math.round((day.revenue_cents / maxRevenue) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="recent-heading" className="card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="recent-heading"
              className="font-display text-base font-bold text-espresso-900"
            >
              Recent orders
            </h2>
            <Link href="/ms/orders" className="text-sm font-semibold underline">
              All orders
            </Link>
          </div>

          {orders.length === 0 ? (
            <EmptyNote>No orders yet.</EmptyNote>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Placed</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Total</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="font-semibold">{order.reference}</td>
                      <td className="whitespace-nowrap">{formatStamp(order.created_at)}</td>
                      <td>{order.customer_name || order.phone}</td>
                      <td className="whitespace-nowrap">
                        {formatMoney(order.total_cents, currency)}
                      </td>
                      <td>
                        <StatusPill status={order.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="top-heading" className="card p-4">
          <h2 id="top-heading" className="font-display text-base font-bold text-espresso-900">
            Top items (30 days)
          </h2>
          {stats.top_items.length === 0 ? (
            <EmptyNote>Nothing sold yet.</EmptyNote>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {stats.top_items.map((item, index) => (
                <li key={item.name} className="flex justify-between gap-3">
                  <span className="text-espresso-700">
                    {index + 1}. {item.name}
                  </span>
                  <span className="font-semibold">{item.quantity}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
