"use client";

import { useCart } from "./cart-provider";
import { CheckIcon, MinusIcon, PlusIcon } from "./icons";
import type { CartLine } from "@/lib/types";

/**
 * Add / quantity control for a single menu item.
 *
 * Once an item is in the cart the button turns into a stepper in place, so a
 * shopper never has to open the cart just to buy a second coffee.
 */
export function AddToCart({
  line,
  soldOut = false,
  compact = false,
}: {
  line: Omit<CartLine, "quantity">;
  soldOut?: boolean;
  compact?: boolean;
}) {
  const { lines, add, setQuantity, hydrated } = useCart();
  const inCart = lines.find((l) => l.id === line.id);

  if (soldOut) {
    return (
      <span className="chip bg-cream-200 text-espresso-600" aria-label="Sold out">
        Sold out
      </span>
    );
  }

  // Before hydration we render the neutral "Add" label so the markup matches
  // the server output and the button is clickable the moment JS lands.
  if (!hydrated || !inCart) {
    return (
      <button
        type="button"
        onClick={() => add(line, 1)}
        className={`btn btn-accent ${compact ? "!min-h-9 !px-3.5 !text-sm" : ""}`}
        aria-label={`Add ${line.name} to cart`}
      >
        <PlusIcon size={16} />
        Add
      </button>
    );
  }

  return (
    <div
      className={`flex items-center rounded-full bg-espresso-800 text-cream-50 ${
        compact ? "h-9" : "h-11"
      }`}
    >
      <button
        type="button"
        onClick={() => setQuantity(line.id, inCart.quantity - 1)}
        className={`flex items-center justify-center rounded-l-full hover:bg-espresso-900 ${
          compact ? "h-9 w-9" : "h-11 w-11"
        }`}
        aria-label={`Reduce ${line.name}`}
      >
        <MinusIcon size={15} />
      </button>
      <span
        className="min-w-7 text-center text-sm font-bold tabular-nums"
        aria-live="polite"
        aria-label={`${inCart.quantity} in cart`}
      >
        {inCart.quantity}
      </span>
      <button
        type="button"
        onClick={() => setQuantity(line.id, inCart.quantity + 1)}
        className={`flex items-center justify-center rounded-r-full hover:bg-espresso-900 ${
          compact ? "h-9 w-9" : "h-11 w-11"
        }`}
        aria-label={`Add another ${line.name}`}
      >
        <PlusIcon size={15} />
      </button>
    </div>
  );
}

/** Wide "added" confirmation used on the item detail layout. */
export function AddToCartWide({
  line,
  soldOut = false,
}: {
  line: Omit<CartLine, "quantity">;
  soldOut?: boolean;
}) {
  const { lines, add, hydrated } = useCart();
  const inCart = lines.find((l) => l.id === line.id);

  if (soldOut) {
    return (
      <button type="button" disabled className="btn btn-outline w-full">
        Sold out for now
      </button>
    );
  }

  return (
    <button type="button" onClick={() => add(line, 1)} className="btn btn-accent w-full">
      {hydrated && inCart ? (
        <>
          <CheckIcon size={16} />
          In your order ({inCart.quantity}) · add another
        </>
      ) : (
        <>
          <PlusIcon size={16} />
          Add to order
        </>
      )}
    </button>
  );
}
