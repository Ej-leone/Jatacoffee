/**
 * Pricing + promotions engine.
 *
 * This module is intentionally dependency-free and side-effect-free so the exact
 * same code runs in the browser (live cart totals) and on the server
 * (authoritative totals at checkout). The server result is the one that is stored.
 */

import type { CartLine, DiscountType, PromotionKind, PromotionScope } from "./types";

export const NAIROBI_TZ = "Africa/Nairobi";

/** The serialisable slice of a promotion that the client is allowed to see. */
export type PublicPromotion = {
  id: number;
  name: string;
  kind: PromotionKind;
  /** Codes are never sent to the browser; this is true when a code is required. */
  requires_code: boolean;
  discount_type: DiscountType;
  discount_value: number;
  scope: PromotionScope;
  target_id: number | null;
  min_subtotal_cents: number;
  days_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type NairobiClock = {
  /** ISO weekday: 1 = Monday ... 7 = Sunday. */
  weekday: number;
  /** Minutes since midnight, Nairobi local time. */
  minutes: number;
  /** "YYYY-MM-DD" in Nairobi local time. */
  date: string;
  /** "HH:MM" in Nairobi local time. */
  time: string;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** Current wall-clock time in Nairobi, regardless of where the code runs. */
export function nairobiClock(at: Date = new Date()): NairobiClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NAIROBI_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const hour = Number(get("hour") === "24" ? "00" : get("hour"));
  const minute = Number(get("minute"));

  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 1,
    minutes: hour * 60 + minute,
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Does a time window contain `minutes`? Handles windows that cross midnight. */
function withinWindow(minutes: number, start: string, end: string): boolean {
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null) return true;
  if (from === to) return true;
  if (from < to) return minutes >= from && minutes < to;
  // e.g. 22:00 -> 02:00
  return minutes >= from || minutes < to;
}

/** Is the promotion currently running (date range, weekday and time window)? */
export function isPromotionLive(
  promo: Pick<
    PublicPromotion,
    "days_of_week" | "start_time" | "end_time" | "starts_at" | "ends_at"
  >,
  clock: NairobiClock = nairobiClock(),
): boolean {
  if (promo.starts_at && promo.starts_at.slice(0, 10) > clock.date) return false;
  if (promo.ends_at && promo.ends_at.slice(0, 10) < clock.date) return false;

  if (promo.days_of_week && promo.days_of_week.trim() !== "") {
    const days = promo.days_of_week
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => d >= 1 && d <= 7);
    if (days.length > 0 && !days.includes(clock.weekday)) return false;
  }

  if (promo.start_time && promo.end_time) {
    if (!withinWindow(clock.minutes, promo.start_time, promo.end_time)) return false;
  }

  return true;
}

/** Human readable schedule, e.g. "Daily 2:00 PM - 5:00 PM". */
export function describeSchedule(promo: {
  days_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
}): string {
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let dayText = "Daily";

  if (promo.days_of_week && promo.days_of_week.trim() !== "") {
    const days = promo.days_of_week
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => d >= 1 && d <= 7)
      .sort((a, b) => a - b);
    if (days.length > 0 && days.length < 7) {
      dayText = days.map((d) => names[d]).join(", ");
    }
  }

  if (!promo.start_time || !promo.end_time) return dayText;
  return `${dayText} ${formatClockTime(promo.start_time)} - ${formatClockTime(promo.end_time)}`;
}

export function formatClockTime(hhmm: string): string {
  const minutes = toMinutes(hhmm);
  if (minutes === null) return hhmm;
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/* ------------------------------------------------------------------ *
 * Totals
 * ------------------------------------------------------------------ */

export type AppliedDiscount = {
  id: number;
  name: string;
  kind: PromotionKind;
  amount_cents: number;
  label: string;
};

export type PricingInput = {
  lines: CartLine[];
  promotions: PublicPromotion[];
  /** Promotions whose code the shopper has successfully supplied. */
  unlockedPromotionIds?: number[];
  orderType: "delivery" | "pickup";
  deliveryMode: "flat" | "zone";
  flatFeeCents: number;
  /** Fee for the chosen zone, or null when no zone is chosen yet. */
  zoneFeeCents: number | null;
  freeDeliveryThresholdCents: number;
  clock?: NairobiClock;
};

export type PricingResult = {
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  item_count: number;
  applied: AppliedDiscount[];
  /** True when delivery is owed but the shopper has not picked a zone yet. */
  delivery_pending: boolean;
  free_delivery_applied: boolean;
};

/** Subtotal of the lines a given promotion applies to. */
function scopedSubtotal(lines: CartLine[], promo: PublicPromotion): number {
  if (promo.scope === "all") {
    return lines.reduce((sum, l) => sum + l.price_cents * l.quantity, 0);
  }
  if (promo.scope === "category") {
    return lines
      .filter((l) => l.category_id === promo.target_id)
      .reduce((sum, l) => sum + l.price_cents * l.quantity, 0);
  }
  return lines
    .filter((l) => l.id === promo.target_id)
    .reduce((sum, l) => sum + l.price_cents * l.quantity, 0);
}

function discountAmount(promo: PublicPromotion, base: number): number {
  if (base <= 0) return 0;
  if (promo.discount_type === "percent") {
    const pct = Math.max(0, Math.min(100, promo.discount_value));
    return Math.round((base * pct) / 100);
  }
  // Fixed amounts are stored in whole shillings for the owner's convenience.
  return Math.min(base, promo.discount_value * 100);
}

function discountLabel(promo: PublicPromotion): string {
  if (promo.discount_type === "percent") return `${promo.discount_value}% off`;
  return `KES ${promo.discount_value} off`;
}

export function computePricing(input: PricingInput): PricingResult {
  const clock = input.clock ?? nairobiClock();
  const lines = input.lines;

  const subtotal = lines.reduce((sum, l) => sum + l.price_cents * l.quantity, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const unlocked = new Set(input.unlockedPromotionIds ?? []);

  const applied: AppliedDiscount[] = [];
  let discount = 0;

  for (const promo of input.promotions) {
    if (promo.requires_code && !unlocked.has(promo.id)) continue;
    if (!isPromotionLive(promo, clock)) continue;
    if (subtotal < promo.min_subtotal_cents) continue;

    const base = scopedSubtotal(lines, promo);
    const amount = discountAmount(promo, base);
    if (amount <= 0) continue;

    applied.push({
      id: promo.id,
      name: promo.name,
      kind: promo.kind,
      amount_cents: amount,
      label: discountLabel(promo),
    });
    discount += amount;
  }

  discount = Math.min(discount, subtotal);
  const afterDiscount = subtotal - discount;

  let deliveryFee = 0;
  let deliveryPending = false;
  let freeDelivery = false;

  if (input.orderType === "delivery" && itemCount > 0) {
    const threshold = input.freeDeliveryThresholdCents;
    if (threshold > 0 && afterDiscount >= threshold) {
      freeDelivery = true;
      deliveryFee = 0;
    } else if (input.deliveryMode === "flat") {
      deliveryFee = input.flatFeeCents;
    } else if (input.zoneFeeCents !== null) {
      deliveryFee = input.zoneFeeCents;
    } else {
      deliveryPending = true;
    }
  }

  return {
    subtotal_cents: subtotal,
    discount_cents: discount,
    delivery_fee_cents: deliveryFee,
    total_cents: afterDiscount + deliveryFee,
    item_count: itemCount,
    applied,
    delivery_pending: deliveryPending,
    free_delivery_applied: freeDelivery,
  };
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/** Format integer cents as "KES 1,250". Prices in Kenya are quoted in whole shillings. */
export function formatMoney(cents: number, currency = "KES"): string {
  const shillings = Math.round(cents / 100);
  return `${currency} ${shillings.toLocaleString("en-KE")}`;
}

/** Format without the currency prefix, e.g. "1,250". */
export function formatAmount(cents: number): string {
  return Math.round(cents / 100).toLocaleString("en-KE");
}
