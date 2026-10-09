"use client";

import Link from "next/link";

export default function MsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="container-page flex min-h-dvh items-center justify-center py-12">
      <div className="card w-full max-w-md p-6 text-center">
        <h1 className="font-display text-xl font-bold text-espresso-900">
          We could not load this screen
        </h1>
        <p className="prose-note mt-2">
          Something went wrong reading the data. Try again, or head back to the
          dashboard.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="btn btn-primary">
            Try again
          </button>
          <Link href="/ms" className="btn btn-outline">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
