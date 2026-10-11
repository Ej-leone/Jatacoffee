import Link from "next/link";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { DeliverySettingsForm } from "@/components/admin/delivery-settings-form";
import { ZoneForm } from "@/components/admin/zone-form";
import { EmptyNote, PageHeader } from "@/components/admin/ui";
import { deleteZoneAction } from "@/lib/admin-actions";
import { positiveInt, type Param } from "@/lib/admin-format";
import { formatMoney } from "@/lib/pricing";
import { getSettings, getZone, listZones } from "@/lib/queries";

export const metadata = { title: "Delivery" };

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: Param }>;
}) {
  const params = await searchParams;
  const editId = positiveInt(params.edit);

  const settings = await getSettings();
  const currency = settings.currency;
  const zones = await listZones({});

  const editing = editId ? await getZone(editId) : null;
  const missingEdit = editId !== null && editing === null;

  return (
    <>
      <PageHeader
        title="Delivery"
        description="Fees, the free-delivery threshold and the areas you cover."
      />

      <section aria-labelledby="settings-heading" className="card mb-6 p-4">
        <h2
          id="settings-heading"
          className="font-display text-base font-bold text-espresso-900"
        >
          Delivery settings
        </h2>
        <p className="prose-note mt-1 mb-3">
          Currently charging{" "}
          {settings.delivery_mode === "flat"
            ? `a flat ${formatMoney(settings.delivery_flat_fee_cents, currency)}`
            : "per zone"}
          .
        </p>
        <DeliverySettingsForm settings={settings} />
      </section>

      <section aria-labelledby="zone-form-heading" className="card mb-6 p-4">
        <h2
          id="zone-form-heading"
          className="font-display text-base font-bold text-espresso-900"
        >
          {editing ? `Edit “${editing.name}”` : "Add a delivery area"}
        </h2>
        {missingEdit && (
          <p role="status" className="prose-note mt-1">
            That area no longer exists — this will create a new one.
          </p>
        )}
        <div className="mt-3">
          <ZoneForm zone={editing} />
        </div>
      </section>

      <section aria-labelledby="zones-heading" className="card p-2">
        <h2
          id="zones-heading"
          className="px-2 pt-2 font-display text-base font-bold text-espresso-900"
        >
          Delivery areas
        </h2>

        {zones.length === 0 ? (
          <EmptyNote>No delivery areas yet.</EmptyNote>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Area</th>
                  <th scope="col">Fee</th>
                  <th scope="col">ETA</th>
                  <th scope="col">Live</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td className="align-top">
                      <span className="font-semibold">{zone.name}</span>
                      {zone.notes && (
                        <span className="block max-w-xs text-xs text-espresso-500">
                          {zone.notes}
                        </span>
                      )}
                    </td>
                    <td className="align-top whitespace-nowrap">
                      {formatMoney(zone.fee_cents, currency)}
                    </td>
                    <td className="align-top whitespace-nowrap">
                      {zone.eta_minutes != null ? `${zone.eta_minutes} min` : "—"}
                    </td>
                    <td className="align-top">
                      {zone.is_active === 1 ? (
                        <span className="chip bg-leaf-500/15 text-leaf-600">Delivering</span>
                      ) : (
                        <span className="chip bg-cream-200 text-espresso-600">Paused</span>
                      )}
                    </td>
                    <td className="align-top">
                      <div className="flex flex-wrap items-start gap-1.5">
                        <Link
                          href={`/ms/delivery?edit=${zone.id}`}
                          className="btn btn-outline !min-h-9 !px-3 !text-xs"
                        >
                          Edit
                        </Link>
                        <ConfirmDelete
                          action={deleteZoneAction}
                          id={zone.id}
                          label={zone.name}
                          warning={`Delete “${zone.name}”? Customers pinned to this area lose it, and past orders keep the name only. This cannot be undone.`}
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
