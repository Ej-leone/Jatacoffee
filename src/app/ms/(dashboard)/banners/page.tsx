import Link from "next/link";
import { BannerForm } from "@/components/admin/banner-form";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { SubmitButton } from "@/components/admin/submit-button";
import { EmptyNote, PageHeader, SavedNotice } from "@/components/admin/ui";
import { deleteBannerAction, toggleBannerAction } from "@/lib/admin-actions";
import { formatDay, hasFlag, positiveInt, type Param } from "@/lib/admin-format";
import { getBanner, listBanners } from "@/lib/queries";

export const metadata = { title: "Banners" };

export default async function BannersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: Param; saved?: Param }>;
}) {
  const params = await searchParams;
  const editId = positiveInt(params.edit);

  const banners = await listBanners({});
  const editing = editId ? await getBanner(editId) : null;
  const missingEdit = editId !== null && editing === null;

  return (
    <>
      <PageHeader
        title="Banners"
        description="The sliding panels at the top of the homepage."
      />

      {hasFlag(params.saved) && <SavedNotice>Banner saved.</SavedNotice>}

      <section aria-labelledby="form-heading" className="card mb-6 p-4">
        <h2 id="form-heading" className="font-display text-base font-bold text-espresso-900">
          {editing ? `Edit “${editing.title}”` : "Add a banner"}
        </h2>
        {missingEdit && (
          <p role="status" className="prose-note mt-1">
            That banner no longer exists — this will create a new one.
          </p>
        )}
        <div className="mt-3">
          <BannerForm banner={editing} />
        </div>
      </section>

      <section aria-labelledby="list-heading" className="card p-2">
        <h2
          id="list-heading"
          className="px-2 pt-2 font-display text-base font-bold text-espresso-900"
        >
          All banners
        </h2>

        {banners.length === 0 ? (
          <EmptyNote>No banners yet.</EmptyNote>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Banner</th>
                  <th scope="col">Theme</th>
                  <th scope="col">Runs</th>
                  <th scope="col">Live</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {banners.map((banner) => (
                  <tr key={banner.id}>
                    <td className="align-top">
                      <span className="font-semibold">{banner.title}</span>
                      {banner.subtitle && (
                        <span className="block max-w-xs text-xs text-espresso-500">
                          {banner.subtitle}
                        </span>
                      )}
                    </td>
                    <td className="align-top capitalize">{banner.theme}</td>
                    <td className="align-top text-xs whitespace-nowrap">
                      {banner.starts_at || banner.ends_at ? (
                        <>
                          {formatDay(banner.starts_at)} → {formatDay(banner.ends_at)}
                        </>
                      ) : (
                        "Always"
                      )}
                    </td>
                    <td className="align-top">
                      {banner.is_active === 1 ? (
                        <span className="chip bg-leaf-500/15 text-leaf-600">Active</span>
                      ) : (
                        <span className="chip bg-cream-200 text-espresso-600">Off</span>
                      )}
                    </td>
                    <td className="align-top">
                      <div className="flex flex-wrap items-start gap-1.5">
                        <Link
                          href={`/ms/banners?edit=${banner.id}`}
                          className="btn btn-outline !min-h-9 !px-3 !text-xs"
                        >
                          Edit
                        </Link>

                        {/*
                          toggleBannerAction writes straight from this FormData and
                          does not re-read the row, so every editable column has to
                          ride along or it gets blanked. is_active is excluded on
                          purpose - next_state carries it.
                        */}
                        <form action={toggleBannerAction}>
                          <input type="hidden" name="id" value={banner.id} />
                          <input
                            type="hidden"
                            name="next_state"
                            value={banner.is_active === 1 ? "0" : "1"}
                          />
                          <input type="hidden" name="title" value={banner.title} />
                          <input
                            type="hidden"
                            name="subtitle"
                            value={banner.subtitle ?? ""}
                          />
                          <input
                            type="hidden"
                            name="image_url"
                            value={banner.image_url ?? ""}
                          />
                          <input
                            type="hidden"
                            name="link_url"
                            value={banner.link_url ?? ""}
                          />
                          <input
                            type="hidden"
                            name="cta_label"
                            value={banner.cta_label ?? ""}
                          />
                          <input type="hidden" name="theme" value={banner.theme} />
                          <input
                            type="hidden"
                            name="sort_order"
                            value={String(banner.sort_order)}
                          />
                          <input
                            type="hidden"
                            name="starts_at"
                            value={banner.starts_at ?? ""}
                          />
                          <input type="hidden" name="ends_at" value={banner.ends_at ?? ""} />
                          <SubmitButton
                            busyLabel="…"
                            className="btn btn-outline !min-h-9 !px-3 !text-xs"
                          >
                            {banner.is_active === 1 ? "Turn off" : "Turn on"}
                            <span className="sr-only"> — {banner.title}</span>
                          </SubmitButton>
                        </form>

                        <ConfirmDelete
                          action={deleteBannerAction}
                          id={banner.id}
                          label={banner.title}
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
