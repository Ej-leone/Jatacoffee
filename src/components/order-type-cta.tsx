"use client";

import { useRouter } from "next/navigation";
import { useCart } from "./cart-provider";
import { BagIcon, ScooterIcon } from "./icons";

/**
 * The two headline calls to action. Each one pre-selects the fulfilment method so
 * the cart total is right from the first tap.
 */
export function OrderTypeCta({ className = "" }: { className?: string }) {
  const { setOrderType } = useCart();
  const router = useRouter();

  const go = (type: "delivery" | "pickup") => {
    setOrderType(type);
    router.push("/menu");
  };

  return (
    <div className={`grid gap-2.5 sm:grid-cols-2 ${className}`}>
      <button type="button" onClick={() => go("delivery")} className="btn btn-primary">
        <ScooterIcon size={18} />
        Order now for delivery
      </button>
      <button type="button" onClick={() => go("pickup")} className="btn btn-outline">
        <BagIcon size={18} />
        Pre-order for pickup
      </button>
    </div>
  );
}
