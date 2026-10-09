/**
 * WhatsApp checkout helpers.
 *
 * There is no payment gateway. Checkout builds a pre-filled WhatsApp message and
 * hands the shopper off to the cafe's number, which is how Jata Cafe already takes
 * orders today.
 */

import { formatAmount, type PricingResult } from "./pricing";
import type { CartLine } from "./types";

/* ------------------------------------------------------------------ *
 * Phone numbers
 * ------------------------------------------------------------------ */

/**
 * Normalise a Kenyan phone number to international digits-only form (254XXXXXXXXX).
 * Returns null when the input cannot be read as a Kenyan mobile number.
 */
export function normalizeKenyanPhone(raw: string): string | null {
  const digits = (raw || "").replace(/[^\d]/g, "");
  if (!digits) return null;

  let national: string;
  if (digits.startsWith("254")) national = digits.slice(3);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits;

  // Kenyan mobile numbers are 9 national digits beginning with 7 or 1.
  if (!/^[71]\d{8}$/.test(national)) return null;
  return `254${national}`;
}

/** Pretty form for display: "+254 712 345 678". */
export function formatKenyanPhone(normalized: string): string {
  if (!/^254\d{9}$/.test(normalized)) return normalized;
  const n = normalized.slice(3);
  return `+254 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/** Strip anything that is not a digit, for use in a wa.me link. */
export function waDigits(raw: string): string {
  return (raw || "").replace(/[^\d]/g, "");
}

/* ------------------------------------------------------------------ *
 * Message builder
 * ------------------------------------------------------------------ */

export type OrderMessageInput = {
  lines: CartLine[];
  pricing: PricingResult;
  orderType: "delivery" | "pickup";
  customerName?: string | null;
  customerPhone?: string | null;
  location?: string | null;
  zoneName?: string | null;
  notes?: string | null;
  reference?: string | null;
  currency?: string;
};

/**
 * Build the human-readable order message.
 *
 * Kept short and scannable because the cafe reads these on a phone during a rush.
 */
export function buildOrderMessage(input: OrderMessageInput): string {
  const currency = input.currency ?? "KES";
  const money = (cents: number) => `${currency} ${formatAmount(cents)}`;
  const out: string[] = [];

  out.push("Hi Jata Cafe! I'd like to order:");
  out.push("");

  for (const line of input.lines) {
    out.push(`${line.quantity}x ${line.name} - ${money(line.price_cents * line.quantity)}`);
  }

  out.push("");
  out.push(`Subtotal: ${money(input.pricing.subtotal_cents)}`);

  for (const promo of input.pricing.applied) {
    out.push(`${promo.name} (${promo.label}): -${money(promo.amount_cents)}`);
  }

  if (input.orderType === "delivery") {
    if (input.pricing.free_delivery_applied) {
      out.push("Delivery: FREE");
    } else if (input.pricing.delivery_pending) {
      out.push("Delivery: to be confirmed");
    } else {
      const zone = input.zoneName ? ` (${input.zoneName})` : "";
      out.push(`Delivery${zone}: ${money(input.pricing.delivery_fee_cents)}`);
    }
  }

  const totalSuffix = input.pricing.delivery_pending ? " + delivery" : "";
  out.push(`*Estimated Total: ${money(input.pricing.total_cents)}${totalSuffix}*`);
  out.push("");

  if (input.customerName) out.push(`Name: ${input.customerName}`);
  if (input.customerPhone) out.push(`Phone: ${input.customerPhone}`);

  if (input.orderType === "delivery") {
    out.push(`Delivery to: ${input.location || "(location to share)"}`);
  } else {
    out.push("Pickup at the cafe (18th Street, Section 3, Eastleigh)");
  }

  if (input.notes) out.push(`Notes: ${input.notes}`);
  if (input.reference) {
    out.push("");
    out.push(`Ref: ${input.reference}`);
  }

  return out.join("\n");
}

/** Full wa.me deep link. Works in the WhatsApp app and on web. */
export function buildWhatsAppUrl(businessNumber: string, message: string): string {
  const number = waDigits(businessNumber);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Short "just say hello" link used by the floating contact button. */
export function buildEnquiryUrl(businessNumber: string, message?: string): string {
  const text = message ?? "Hi Jata Cafe! I have a question.";
  return buildWhatsAppUrl(businessNumber, text);
}
