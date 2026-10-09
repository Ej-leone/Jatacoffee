import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="card max-w-md p-8 text-center">
        <p className="font-display text-5xl font-bold text-caramel-500">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-espresso-900">
          That page is off the menu
        </h1>
        <p className="prose-note mt-2">
          The link may be old or mistyped. The coffee is still where you left it.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <Link href="/" className="btn btn-primary">
            Back home
          </Link>
          <Link href="/menu" className="btn btn-outline">
            See the menu
          </Link>
        </div>
      </div>
    </main>
  );
}
