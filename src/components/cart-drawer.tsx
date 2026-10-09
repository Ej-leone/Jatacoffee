"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useCart } from "./cart-provider";
import { CartIcon, CheckIcon, CloseIcon, MinusIcon, PlusIcon, TrashIcon } from "./icons";
import { formatMoney } from "@/lib/pricing";

export function CartDrawer() {
  const {
    lines,
    itemCount,
    pricing,
    config,
    drawerOpen,
    closeDrawer,
    setQuantity,
    remove,
    clear,
    orderType,
    setOrderType,
    zoneId,
    setZoneId,
  } = useCart();

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape to dismiss, and move focus into the panel when it opens.
  useEffect(() => {
    if (!drawerOpen) return;
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeDrawer]);

  if (!drawerOpen) return null;

  const currency = config.currency;
  const belowMinimum = pricing.subtotal_cents < config.min_order_cents;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close cart"
        onClick={closeDrawer}
        className="absolute inset-0 animate-fade bg-espresso-900/50"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Your order"
        className="relative flex h-full w-full max-w-md animate-rise flex-col bg-cream-50 shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-cream-200 px-4 py-3.5">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-espresso-900">
            <CartIcon size={18} />
            Your order
            {itemCount > 0 && (
              <span className="text-sm font-sans font-medium text-espresso-500">
                ({itemCount})
              </span>
            )}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={closeDrawer}
            className="btn btn-ghost !min-h-10 !px-2.5"
            aria-label="Close cart"
          >
            <CloseIcon />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="rounded-full bg-cream-100 p-5 text-espresso-500">
              <CartIcon size={30} />
            </div>
            <div>
              <p className="font-display text-lg font-bold text-espresso-900">
                Nothing here yet
              </p>
              <p className="prose-note mt-1">
                Add a Spanish Latte and something sweet. Come hungry, leave happy.
              </p>
            </div>
            <Link href="/menu" onClick={closeDrawer} className="btn btn-primary">
              Browse the menu
            </Link>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <ul className="space-y-2.5">
                {lines.map((line) => (
                  <li key={line.id} className="card flex gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-espresso-900">
                        {line.name}
                      </p>
                      <p className="mt-0.5 text-xs text-espresso-500">
                        {formatMoney(line.price_cents, currency)} each
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex items-center rounded-full border border-cream-300 bg-white">
                          <button
                            type="button"
                            onClick={() => setQuantity(line.id, line.quantity - 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-l-full text-espresso-700 hover:bg-cream-100"
                            aria-label={`Reduce ${line.name}`}
                          >
                            <MinusIcon size={16} />
                          </button>
                          <span
                            className="min-w-8 text-center text-sm font-bold tabular-nums"
                            aria-live="polite"
                          >
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQuantity(line.id, line.quantity + 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-r-full text-espresso-700 hover:bg-cream-100"
                            aria-label={`Add another ${line.name}`}
                          >
                            <PlusIcon size={16} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(line.id)}
                          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-espresso-500 hover:bg-cream-100 hover:text-berry-500"
                          aria-label={`Remove ${line.name}`}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-espresso-900">
                      {formatMoney(line.price_cents * line.quantity, currency)}
                    </p>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={clear}
                className="mt-3 text-xs font-semibold text-espresso-500 underline underline-offset-2 hover:text-berry-500"
              >
                Empty the cart
              </button>

              {/* Order type + zone live here so the total in the drawer is honest. */}
              <fieldset className="mt-5">
                <legend className="field-label">How do you want it?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["delivery", "pickup"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOrderType(type)}
                      aria-pressed={orderType === type}
                      className={`btn ${
                        orderType === type ? "btn-primary" : "btn-outline"
                      } !text-sm`}
                    >
                      {orderType === type && <CheckIcon size={15} />}
                      {type === "delivery" ? "Delivery" : "Pickup"}
                    </button>
                  ))}
                </div>
              </fieldset>

              {orderType === "delivery" && config.delivery_mode === "zone" && (
                <div className="mt-3">
                  <label className="field-label" htmlFor="drawer-zone">
                    Delivery area
                  </label>
                  <select
                    id="drawer-zone"
                    className="field"
                    value={zoneId ?? ""}
                    onChange={(event) =>
                      setZoneId(event.target.value ? Number(event.target.value) : null)
                    }
                  >
                    <option value="">Choose your area</option>
                    {config.zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name} · {formatMoney(zone.fee_cents, currency)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="border-t border-cream-200 bg-white px-4 pb-4 pt-3 safe-bottom">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-espresso-600">Subtotal</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatMoney(pricing.subtotal_cents, currency)}
                  </dd>
                </div>

                {pricing.applied.map((promo) => (
                  <div key={promo.id} className="flex justify-between text-leaf-600">
                    <dt className="truncate pr-2">
                      {promo.name}{" "}
                      <span className="text-xs text-leaf-500">({promo.label})</span>
                    </dt>
                    <dd className="shrink-0 font-semibold tabular-nums">
                      -{formatMoney(promo.amount_cents, currency)}
                    </dd>
                  </div>
                ))}

                {orderType === "delivery" && (
                  <div className="flex justify-between">
                    <dt className="text-espresso-600">Delivery</dt>
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

                <div className="flex justify-between border-t border-cream-200 pt-2 text-base">
                  <dt className="font-display font-bold text-espresso-900">Total</dt>
                  <dd className="font-display font-bold tabular-nums text-espresso-900">
                    {formatMoney(pricing.total_cents, currency)}
                    {pricing.delivery_pending && (
                      <span className="ml-1 text-xs font-sans font-medium text-espresso-500">
                        + delivery
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              {belowMinimum ? (
                <p className="mt-3 rounded-lg bg-cream-100 px-3 py-2 text-xs font-medium text-espresso-600">
                  Minimum order is {formatMoney(config.min_order_cents, currency)}. Add a
                  little more.
                </p>
              ) : null}

              <Link
                href="/checkout"
                onClick={closeDrawer}
                aria-disabled={belowMinimum}
                className={`btn btn-whatsapp mt-3 w-full ${
                  belowMinimum ? "pointer-events-none opacity-50" : ""
                }`}
              >
                Continue to checkout
              </Link>

              <p className="mt-2 text-center text-[0.6875rem] text-espresso-500">
                You will confirm the order on WhatsApp. No card needed.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Sticky mobile summary bar. Appears only once something is in the cart, which keeps
 * the first view clean and the checkout one thumb-tap away afterwards.
 */
export function CartBar() {
  const { itemCount, pricing, openDrawer, hydrated, config, drawerOpen } = useCart();

  if (!hydrated || itemCount === 0 || drawerOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-cream-200 bg-white/95 px-3 pb-3 pt-2.5 shadow-lift backdrop-blur md:hidden safe-bottom">
      <button type="button" onClick={openDrawer} className="btn btn-primary w-full !justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-caramel-500 px-1.5 text-xs font-bold">
            {itemCount}
          </span>
          View order
        </span>
        <span className="tabular-nums">
          {formatMoney(pricing.total_cents, config.currency)}
        </span>
      </button>
    </div>
  );
}
