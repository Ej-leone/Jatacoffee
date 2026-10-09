import type { Metadata } from "next";

/** Every admin screen re-reads SQLite instead of serving a cached shell. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Jata admin", template: "%s · Jata admin" },
  robots: { index: false, follow: false },
};

/**
 * Deliberately NOT a gate. requireAdmin() redirects to /ms/login, so gating here
 * would bounce the login page into itself forever. The (dashboard) group owns the
 * gate instead.
 */
export default function MsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
