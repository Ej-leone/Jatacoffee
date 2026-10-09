import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { SubmitButton } from "@/components/admin/submit-button";
import { ChevronDownIcon, LogoutIcon, Logo } from "@/components/icons";
import { logoutAction } from "@/lib/admin-actions";
import { requireAdmin } from "@/lib/auth";

/** The single gate for every real admin screen. */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  if (user.must_change_password) redirect("/ms/password");

  return (
    <>
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-espresso-900 focus:px-4 focus:py-2 focus:text-cream-50"
      >
        Skip to content
      </a>

      <header className="border-b border-cream-200 bg-white">
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
          <Link href="/ms" className="flex items-center gap-2.5">
            <Logo className="text-espresso-800" size={30} />
            <span className="font-display text-base font-bold text-espresso-900">
              Jata admin
            </span>
          </Link>

          <details className="relative">
            <summary className="btn btn-outline !min-h-9 !px-3 !text-xs cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              {user.name || user.email}
              <ChevronDownIcon size={14} />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-cream-200 bg-white p-3 shadow-[var(--shadow-lift)]">
              <p className="text-xs break-words text-espresso-500">{user.email}</p>
              <Link
                href="/ms/password"
                className="mt-2 block text-sm font-semibold text-espresso-700 underline"
              >
                Change password
              </Link>
              <form action={logoutAction} className="mt-3">
                <SubmitButton
                  busyLabel="Signing out…"
                  className="btn btn-outline !min-h-9 w-full !text-xs"
                >
                  <LogoutIcon size={14} />
                  Log out
                </SubmitButton>
              </form>
            </div>
          </details>
        </div>

        <nav aria-label="Admin" className="container-page pb-2">
          <AdminNav />
        </nav>
      </header>

      <main id="admin-main" className="container-page pb-16">
        {children}
      </main>
    </>
  );
}
