import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { SavedNotice } from "@/components/admin/ui";
import { ClockIcon, Logo, PinIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/auth";
import { hasFlag, type Param } from "@/lib/admin-format";
import { getSettings } from "@/lib/queries";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: Param }>;
}) {
  // A live session has no business sitting on a login form.
  const user = await getCurrentUser();
  if (user) redirect("/ms");

  const { changed } = await searchParams;
  const settings = getSettings();

  return (
    <main className="container-page flex min-h-dvh items-center justify-center py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <Logo className="text-espresso-800" size={40} />
          <span className="leading-tight">
            <span className="block font-display text-xl font-bold text-espresso-900">
              {settings.site_name}
            </span>
            <span className="block text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-caramel-500">
              {settings.tagline}
            </span>
          </span>
        </div>

        <div className="card overflow-hidden">
          <div className="bg-espresso-900 px-5 py-4 text-cream-100">
            <h1 className="font-display text-lg font-bold text-cream-50">Staff sign in</h1>
            <p className="mt-0.5 text-[0.8125rem] text-cream-200/75">
              Manage the menu, orders and offers.
            </p>
          </div>

          <div className="p-5">
            {hasFlag(changed) && (
              <SavedNotice>Password updated. Sign in with your new password.</SavedNotice>
            )}
            <LoginForm />
          </div>
        </div>

        <div className="mt-5 space-y-1.5 text-center text-xs text-espresso-500">
          {settings.address_line && (
            <p className="flex items-center justify-center gap-1.5">
              <PinIcon size={14} className="text-caramel-500" />
              {settings.address_line}
            </p>
          )}
          {settings.opening_hours && (
            <p className="flex items-center justify-center gap-1.5">
              <ClockIcon size={14} className="text-caramel-500" />
              {settings.opening_hours}
            </p>
          )}
          <p className="pt-1">
            <Link href="/" className="font-semibold text-espresso-700 underline">
              Back to {settings.site_name}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
