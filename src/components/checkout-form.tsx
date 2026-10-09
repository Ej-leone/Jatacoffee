"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "./cart-provider";
import {
  AlertIcon,
  BagIcon,
  CheckIcon,
  MinusIcon,
  PlusIcon,
  ScooterIcon,
  TagIcon,
  TrashIcon,
  WhatsAppIcon,
} from "./icons";
import { formatMoney } from "@/lib/pricing";
import { normalizeKenyanPhone } from "@/lib/whatsapp";

const CUSTOMER_KEY = "jata-customer-v1";

type SentState = { url: string; reference: string };

export function CheckoutForm({ addressLine }: { addressLine: string }) {
  const {
    lines,
    pricing,
    config,
    orderType,
    setOrderType,
    zoneId,
    setZoneId,
    zone,
    setQuantity,
    remove,
    clear,
    promoCode,
    promoMessage,
    promoChecking,
    applyPromoCode,
    clearPromoCode,
    hydrated,
  } = useCart();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [codeInput, setCodeInput] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<SentState | null>(null);

  const currency = config.currency;

  // Remember details so a repeat customer only taps "send".
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUSTOMER_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        name?: string;
        phone?: string;
        location?: string;
      };
      if (saved.name) setName(saved.name);
      if (saved.phone) setPhone(saved.phone);
      if (saved.location) setLocation(saved.location);
    } catch {
      // ignore unreadable storage
    }
  }, []);

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (name.trim().length < 2) next.name = "We need a name for the order.";
    if (!normalizeKenyanPhone(phone)) {
      next.phone = "Use a Kenyan number, like 0712 345 678.";
    }
    if (orderType === "delivery") {
      if (location.trim().length < 4) {
        next.location = "Street, building or a landmark we will recognise.";
      }
      if (config.delivery_mode === "zone" && !zoneId) {
        next.zone = "Choose your delivery area.";
      }
    }
    if (pricing.subtotal_cents < config.min_order_cents) {
      next.cart = `Minimum order is ${formatMoney(config.min_order_cents, currency)}.`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((line) => ({ id: line.id, quantity: line.quantity })),
          orderType,
          zoneId: zoneId ?? null,
          name: name.trim(),
          phone: phone.trim(),
          location: location.trim(),
          notes: notes.trim(),
          promoCode: promoCode,
          marketingOptIn,
        }),
      });

      const data = (await response.json()) as
        | { ok: true; url: string; reference: string }
        | { ok: false; error: string };

      if (!response.ok || !data.ok) {
        setServerError("error" in data ? data.error : "Something went wrong.");
        return;
      }

      try {
        localStorage.setItem(
          CUSTOMER_KEY,
          JSON.stringify({ name: name.trim(), phone: phone.trim(), location: location.trim() }),
        );
      } catch {
        // ignore
      }

      setSent({ url: data.url, reference: data.reference });
      clear();

      // Hand off to WhatsApp. On a phone this switches to the app and leaves this
      // confirmation screen behind in the browser.
      window.location.assign(data.url);
    } catch {
      setServerError("No connection. Check your data and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------- sent confirmation ---------------- */

  if (sent) {
    return (
      <div className="card animate-rise p-6 text-center sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-leaf-500/15 text-leaf-600">
          <CheckIcon size={28} />
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold text-espresso-900">
          Order ready to send
        </h2>
        <p className="prose-note mx-auto mt-2 max-w-sm">
          We have opened WhatsApp with your order typed out. Press send in WhatsApp and we
          will confirm in a moment.
        </p>
        <p className="mt-3 inline-block rounded-lg bg-cream-100 px-3 py-1.5 font-mono text-sm font-bold text-espresso-800">
          Ref {sent.reference}
        </p>

        <a href={sent.url} className="btn btn-whatsapp mt-5 w-full">
          <WhatsAppIcon size={18} />
          WhatsApp didn't open? Tap here
        </a>
        <Link href="/menu" className="btn btn-ghost mt-2 w-full">
          Back to the menu
        </Link>
      </div>
    );
  }

  /* ---------------- empty cart ---------------- */

  if (hydrated && lines.length === 0) {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cream-100 text-espresso-500">
          <BagIcon size={26} />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold text-espresso-900">
          Your cart is empty
        </h2>
        <p className="prose-note mx-auto mt-1 max-w-xs">
          Pick a few things from the menu and come back. It takes a minute.
        </p>
        <Link href="/menu" className="btn btn-primary mt-4">
          Browse the menu
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start">
      {/* ---------------- left: details ---------------- */}
      <div className="space-y-4">
        <fieldset className="card p-4 sm:p-5">
          <legend className="sr-only">How you want your order</legend>
          <h2 className="font-display text-lg font-bold text-espresso-900">
            Delivery or pickup?
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setOrderType("delivery")}
              aria-pressed={orderType === "delivery"}
              className={`btn ${orderType === "delivery" ? "btn-primary" : "btn-outline"}`}
            >
              <ScooterIcon size={17} />
              Delivery
            </button>
            <button
              type="button"
              onClick={() => setOrderType("pickup")}
              aria-pressed={orderType === "pickup"}
              className={`btn ${orderType === "pickup" ? "btn-primary" : "btn-outline"}`}
            >
              <BagIcon size={17} />
              Pickup
            </button>
          </div>

          {orderType === "pickup" && (
            <p className="prose-note mt-3 rounded-lg bg-cream-100 px-3 py-2.5">
              Collect at <strong className="font-semibold">{addressLine}</strong>. We will
              confirm your pickup time on WhatsApp.
            </p>
          )}
        </fieldset>

        <fieldset className="card p-4 sm:p-5">
          <legend className="sr-only">Your details</legend>
          <h2 className="font-display text-lg font-bold text-espresso-900">Your details</h2>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={`field ${errors.name ? "field-error" : ""}`}
                placeholder="Amina"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "name-error" : undefined}
                required
              />
              {errors.name && (
                <p id="name-error" className="mt-1 text-xs font-medium text-berry-500">
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="phone">
                Phone (WhatsApp)
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={`field ${errors.phone ? "field-error" : ""}`}
                placeholder="0712 345 678"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "phone-error" : undefined}
                required
              />
              {errors.phone && (
                <p id="phone-error" className="mt-1 text-xs font-medium text-berry-500">
                  {errors.phone}
                </p>
              )}
            </div>
          </div>

          {orderType === "delivery" && (
            <>
              {config.delivery_mode === "zone" && (
                <div className="mt-3">
                  <label className="field-label" htmlFor="zone">
                    Delivery area
                  </label>
                  <select
                    id="zone"
                    name="zone"
                    value={zoneId ?? ""}
                    onChange={(event) =>
                      setZoneId(event.target.value ? Number(event.target.value) : null)
                    }
                    className={`field ${errors.zone ? "field-error" : ""}`}
                    aria-invalid={Boolean(errors.zone)}
                    aria-describedby={errors.zone ? "zone-error" : undefined}
                  >
                    <option value="">Choose your area</option>
                    {config.zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} · {formatMoney(z.fee_cents, currency)}
                        {z.eta_minutes ? ` · ~${z.eta_minutes} min` : ""}
                      </option>
                    ))}
                  </select>
                  {errors.zone && (
                    <p id="zone-error" className="mt-1 text-xs font-medium text-berry-500">
                      {errors.zone}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3">
                <label className="field-label" htmlFor="location">
                  Where should we deliver?
                </label>
                <textarea
                  id="location"
                  name="location"
                  rows={2}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className={`field resize-y ${errors.location ? "field-error" : ""}`}
                  placeholder="Building name, street, floor or a landmark nearby"
                  aria-invalid={Boolean(errors.location)}
                  aria-describedby={errors.location ? "location-error" : undefined}
                  required
                />
                {errors.location ? (
                  <p id="location-error" className="mt-1 text-xs font-medium text-berry-500">
                    {errors.location}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-espresso-500">
                    You can also drop a live location pin in the WhatsApp chat.
                  </p>
                )}
              </div>
            </>
          )}

          <div className="mt-3">
            <label className="field-label" htmlFor="notes">
              Anything else? <span className="font-normal text-espresso-500">(optional)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="field resize-y"
              placeholder="Less sugar, extra chilli, call when you arrive..."
            />
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(event) => setMarketingOptIn(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-cream-300 accent-caramel-500"
            />
            <span className="text-[0.8125rem] leading-relaxed text-espresso-600">
              Send me the occasional WhatsApp about offers and happy hour. No spam, and you
              can ask us to stop any time.
            </span>
          </label>
        </fieldset>
      </div>

      {/* ---------------- right: summary ---------------- */}
      <div className="space-y-4 lg:sticky lg:top-28">
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-espresso-900">Your order</h2>
            <Link
              href="/menu"
              className="text-xs font-semibold text-caramel-600 underline underline-offset-2"
            >
              Add more
            </Link>
          </div>

          <ul className="mt-3 divide-y divide-cream-100">
            {lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 py-2.5">
                <div className="flex items-center rounded-full border border-cream-300 bg-white">
                  <button
                    type="button"
                    onClick={() => setQuantity(line.id, line.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-l-full text-espresso-700 hover:bg-cream-100"
                    aria-label={`Reduce ${line.name}`}
                  >
                    <MinusIcon size={14} />
                  </button>
                  <span className="min-w-6 text-center text-xs font-bold tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(line.id, line.quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-r-full text-espresso-700 hover:bg-cream-100"
                    aria-label={`Add another ${line.name}`}
                  >
                    <PlusIcon size={14} />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-espresso-900">
                    {line.name}
                  </p>
                  <p className="text-xs text-espresso-500">
                    {formatMoney(line.price_cents, currency)} each
                  </p>
                </div>

                <p className="shrink-0 text-sm font-bold tabular-nums">
                  {formatMoney(line.price_cents * line.quantity, currency)}
                </p>

                <button
                  type="button"
                  onClick={() => remove(line.id)}
                  className="shrink-0 rounded-full p-1.5 text-espresso-500 hover:bg-cream-100 hover:text-berry-500"
                  aria-label={`Remove ${line.name}`}
                >
                  <TrashIcon size={15} />
                </button>
              </li>
            ))}
          </ul>

          {/* Discount code */}
          <div className="mt-3 rounded-xl bg-cream-100 p-3">
            {promoCode ? (
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-leaf-600">
                  <TagIcon size={15} />
                  Code {promoCode} applied
                </p>
                <button
                  type="button"
                  onClick={() => {
                    clearPromoCode();
                    setCodeInput("");
                  }}
                  className="text-xs font-semibold text-espresso-500 underline underline-offset-2"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <label className="field-label" htmlFor="promo">
                  Have a discount code?
                </label>
                <div className="flex gap-2">
                  <input
                    id="promo"
                    type="text"
                    value={codeInput}
                    onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
                    className="field !bg-white uppercase"
                    placeholder="JATA10"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => void applyPromoCode(codeInput)}
                    disabled={promoChecking}
                    className="btn btn-outline !px-4 !text-sm"
                  >
                    {promoChecking ? "Checking" : "Apply"}
                  </button>
                </div>
              </>
            )}

            {promoMessage && (
              <p
                className={`mt-2 text-xs font-medium ${
                  promoMessage.tone === "ok" ? "text-leaf-600" : "text-berry-500"
                }`}
                role="status"
              >
                {promoMessage.text}
              </p>
            )}
          </div>

          {/* Totals */}
          <dl className="mt-4 space-y-1.5 border-t border-cream-200 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-espresso-600">Subtotal</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(pricing.subtotal_cents, currency)}
              </dd>
            </div>

            {pricing.applied.map((promo) => (
              <div key={promo.id} className="flex justify-between text-leaf-600">
                <dt className="truncate pr-2">
                  {promo.name} <span className="text-xs">({promo.label})</span>
                </dt>
                <dd className="shrink-0 font-semibold tabular-nums">
                  -{formatMoney(promo.amount_cents, currency)}
                </dd>
              </div>
            ))}

            {orderType === "delivery" && (
              <div className="flex justify-between">
                <dt className="text-espresso-600">
                  Delivery{zone ? ` · ${zone.name}` : ""}
                </dt>
                <dd className="font-semibold tabular-nums">
                  {pricing.free_delivery_applied ? (
                    <span className="text-leaf-600">Free</span>
                  ) : pricing.delivery_pending ? (
                    <span className="text-espresso-500">Pick an area</span>
                  ) : (
                    formatMoney(pricing.delivery_fee_cents, currency)
                  )}
                </dd>
              </div>
            )}

            <div className="flex justify-between border-t border-cream-200 pt-2.5">
              <dt className="font-display text-lg font-bold text-espresso-900">Total</dt>
              <dd className="font-display text-lg font-bold tabular-nums text-espresso-900">
                {formatMoney(pricing.total_cents, currency)}
              </dd>
            </div>
          </dl>

          {(errors.cart || serverError) && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg bg-berry-500/10 px-3 py-2.5 text-xs font-medium text-berry-500"
            >
              <AlertIcon size={15} className="mt-px shrink-0" />
              {serverError || errors.cart}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || lines.length === 0}
            className="btn btn-whatsapp mt-4 w-full"
          >
            <WhatsAppIcon size={18} />
            {submitting ? "Preparing your order..." : "Send order on WhatsApp"}
          </button>

          <p className="mt-2.5 text-center text-[0.6875rem] leading-relaxed text-espresso-500">
            No card needed. Pay cash or M-Pesa on delivery or at the counter. We only use
            your number to confirm this order and, if you allow it, to share offers.
          </p>
        </div>
      </div>
    </form>
  );
}
