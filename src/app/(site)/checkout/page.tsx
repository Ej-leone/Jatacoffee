import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout-form";
import { getSettings } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Checkout on WhatsApp",
  description:
    "Review your Jata Cafe order, pick delivery or pickup, then send it straight to our WhatsApp. Pay cash or M-Pesa on arrival.",
  robots: { index: false, follow: true },
};

export default async function CheckoutPage() {
  const settings = getSettings();

  return (
    <section className="container-page pt-6">
      <header>
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-caramel-500">
          Almost there
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-espresso-900">Checkout</h1>
        <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-espresso-600">
          Check your order, add your details, and we will open WhatsApp with everything
          typed out. One tap to send.
        </p>
      </header>

      <div className="mt-5">
        <CheckoutForm addressLine={settings.address_line} />
      </div>
    </section>
  );
}

// Cached HTML for fast first paint on mobile data. Admin edits push an immediate
// refresh via revalidateStorefront(); this is the self-healing fallback.
export const revalidate = 120;
