/**
 * Pure helpers for the admin UI.
 *
 * No DB, no React, no "use server" - safe to import from Server and Client
 * Components alike. Anything that touches SQLite belongs in queries.ts.
 */

import type { OrderLine, OrderStatus } from "./types";

/** A single searchParams value. A repeated key arrives as an array. */
export type Param = string | string[] | undefined;

export type AppliedPromo = { name: string; amount_cents: number };

function firstValue(value: Param): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/**
 * Stored cents -> the bare digits that belong in a whole-shilling number input.
 * This is the only place the /100 lives; form components must never divide.
 */
export function centsToShillingInput(cents: number): string {
  return String(Math.round(cents / 100));
}

/* ------------------------------------------------------------------ *
 * Search params
 * ------------------------------------------------------------------ */

export function clampSearch(q: Param, max = 60): string {
  return firstValue(q).trim().slice(0, max);
}

export function positiveInt(value: Param): number | null {
  const raw = firstValue(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Presence check for flags like ?saved=1. */
export function hasFlag(value: Param): boolean {
  return firstValue(value) !== "";
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "new",
  "confirmed",
  "completed",
  "cancelled",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** orders.items_json -> lines. A malformed row yields [] rather than throwing. */
export function safeOrderLines(json: string | null): OrderLine[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as OrderLine[]) : [];
  } catch {
    return [];
  }
}

/** orders.applied_promos -> promos. A malformed row yields []. */
export function safeAppliedPromos(json: string | null): AppliedPromo[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as AppliedPromo[]) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Promotions
 * ------------------------------------------------------------------ */

export const WEEKDAYS: readonly { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

/** "1,2,3" -> [1,2,3]. Null, empty and junk entries yield []. */
export function parseDaysOfWeek(csv: string | null): number[] {
  if (!csv || csv.trim() === "") return [];
  return csv
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

/**
 * SQLite stores "YYYY-MM-DD HH:MM:SS" in UTC. Render it in Nairobi time so the
 * kitchen sees the clock on the wall.
 */
export function formatStamp(value: string | null): string {
  if (!value) return "—";
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Date-only display for schedules, e.g. "11 Jun 2026". */
export function formatDay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
