import Link from "next/link";
import { Logo } from "@/components/icons";
import { requireAdmin } from "@/lib/auth";

/**
 * Requires a session but deliberately does NOT check must_change_password - this
 * is the group that holds the change-password screen itself.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <main className="container-page flex min-h-dvh items-center justify-center py-12">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <Logo className="text-espresso-800" size={34} />
          <div>
            <p className="font-display text-lg font-bold text-espresso-900">Jata admin</p>
            <p className="text-xs text-espresso-500">{user.email}</p>
          </div>
        </div>

        {children}

        {!user.must_change_password && (
          <p className="mt-4 text-center">
            <Link href="/ms" className="text-sm font-semibold text-espresso-700 underline">
              Back to dashboard
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
