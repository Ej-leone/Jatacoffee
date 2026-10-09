"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  attemptLogin,
  changePassword,
  createSession,
  destroySession,
  requireAdmin,
} from "./auth";
import {
  createBanner,
  createCategory,
  createMenuItem,
  createPromotion,
  createZone,
  deleteBanner,
  deleteCategory,
  deleteCustomer,
  deleteMenuItem,
  deletePromotion,
  deleteZone,
  setMenuItemAvailability,
  setOrderStatus,
  updateBanner,
  updateCategory,
  updateCustomerNotes,
  updateMenuItem,
  updatePromotion,
  updateSettings,
  updateZone,
} from "./queries";
import { revalidateStorefront } from "./revalidate";
import type { DiscountType, OrderStatus, PromotionKind, PromotionScope } from "./types";

export type ActionState = { ok: boolean; error?: string; message?: string } | null;

/* ------------------------------------------------------------------ *
 * Form parsing helpers
 * ------------------------------------------------------------------ */

function str(form: FormData, key: string, max = 500): string {
  const raw = form.get(key);
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function int(form: FormData, key: string, fallback = 0): number {
  const n = Number(str(form, key, 32));
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function id(form: FormData, key: string): number | null {
  const raw = str(form, key, 32);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function bool(form: FormData, key: string): boolean {
  const raw = form.get(key);
  return raw === "on" || raw === "true" || raw === "1";
}

/** Admin types prices in whole shillings; storage is in cents. */
function shillingsToCents(form: FormData, key: string): number {
  const n = Number(str(form, key, 32).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function refreshAdmin(...paths: string[]): void {
  revalidatePath("/ms");
  for (const path of paths) revalidatePath(path);
  revalidateStorefront();
}

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */

export async function loginAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = str(form, "email", 120);
  const password = str(form, "password", 200);

  const result = attemptLogin(email, password);
  if (!result.ok) return { ok: false, error: result.error };

  await createSession(result.userId);
  redirect("/ms");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/ms/login");
}

export async function changePasswordAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  const current = str(form, "current_password", 200);
  const next = str(form, "new_password", 200);
  const confirm = str(form, "confirm_password", 200);

  if (next !== confirm) return { ok: false, error: "The new passwords do not match." };

  const result = changePassword(user.id, current, next);
  if (!result.ok) return { ok: false, error: result.error };

  // changePassword clears all sessions, so send the owner back to the login screen.
  redirect("/ms/login?changed=1");
}

/* ------------------------------------------------------------------ *
 * Banners
 * ------------------------------------------------------------------ */

export async function saveBannerAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const title = str(form, "title", 120);
  if (title.length < 2) return { ok: false, error: "Give the banner a title." };

  const payload = {
    title,
    subtitle: str(form, "subtitle", 300),
    image_url: str(form, "image_url", 400),
    link_url: str(form, "link_url", 400),
    cta_label: str(form, "cta_label", 40),
    theme: str(form, "theme", 20) || "espresso",
    is_active: bool(form, "is_active"),
    sort_order: int(form, "sort_order"),
    starts_at: str(form, "starts_at", 20) || null,
    ends_at: str(form, "ends_at", 20) || null,
  };

  const bannerId = id(form, "id");
  if (bannerId) {
    updateBanner(bannerId, payload);
  } else {
    createBanner(payload);
  }

  refreshAdmin("/ms/banners");
  redirect("/ms/banners?saved=1");
}

export async function deleteBannerAction(form: FormData): Promise<void> {
  await requireAdmin();
  const bannerId = id(form, "id");
  if (bannerId) deleteBanner(bannerId);
  refreshAdmin("/ms/banners");
}

export async function toggleBannerAction(form: FormData): Promise<void> {
  await requireAdmin();
  const bannerId = id(form, "id");
  if (!bannerId) return;
  updateBanner(bannerId, {
    title: str(form, "title", 120),
    subtitle: str(form, "subtitle", 300),
    image_url: str(form, "image_url", 400),
    link_url: str(form, "link_url", 400),
    cta_label: str(form, "cta_label", 40),
    theme: str(form, "theme", 20),
    sort_order: int(form, "sort_order"),
    starts_at: str(form, "starts_at", 20) || null,
    ends_at: str(form, "ends_at", 20) || null,
    is_active: str(form, "next_state") === "1",
  });
  refreshAdmin("/ms/banners");
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export async function saveCategoryAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const name = str(form, "name", 60);
  if (name.length < 2) return { ok: false, error: "Give the category a name." };

  const payload = {
    name,
    blurb: str(form, "blurb", 200),
    sort_order: int(form, "sort_order"),
    is_active: bool(form, "is_active"),
  };

  const categoryId = id(form, "id");
  if (categoryId) updateCategory(categoryId, payload);
  else createCategory(payload);

  refreshAdmin("/ms/categories", "/ms/menu");
  return { ok: true, message: `Saved "${name}".` };
}

export async function deleteCategoryAction(form: FormData): Promise<void> {
  await requireAdmin();
  const categoryId = id(form, "id");
  if (categoryId) deleteCategory(categoryId);
  refreshAdmin("/ms/categories", "/ms/menu");
}

/* ------------------------------------------------------------------ *
 * Menu items
 * ------------------------------------------------------------------ */

export async function saveMenuItemAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const name = str(form, "name", 100);
  if (name.length < 2) return { ok: false, error: "Give the item a name." };

  const categoryId = id(form, "category_id");
  if (!categoryId) return { ok: false, error: "Choose a category." };

  const priceCents = shillingsToCents(form, "price");
  if (priceCents <= 0) return { ok: false, error: "Enter a price above zero." };

  const payload = {
    category_id: categoryId,
    name,
    description: str(form, "description", 400),
    price_cents: priceCents,
    image_url: str(form, "image_url", 400),
    badge: str(form, "badge", 30),
    is_available: bool(form, "is_available"),
    is_featured: bool(form, "is_featured"),
    sort_order: int(form, "sort_order"),
  };

  const itemId = id(form, "id");
  if (itemId) updateMenuItem(itemId, payload);
  else createMenuItem(payload);

  refreshAdmin("/ms/menu");
  redirect("/ms/menu?saved=1");
}

export async function toggleAvailabilityAction(form: FormData): Promise<void> {
  await requireAdmin();
  const itemId = id(form, "id");
  if (!itemId) return;
  setMenuItemAvailability(itemId, str(form, "next_state") === "1");
  refreshAdmin("/ms/menu");
}

export async function deleteMenuItemAction(form: FormData): Promise<void> {
  await requireAdmin();
  const itemId = id(form, "id");
  if (itemId) deleteMenuItem(itemId);
  refreshAdmin("/ms/menu");
}

/* ------------------------------------------------------------------ *
 * Delivery zones + delivery settings
 * ------------------------------------------------------------------ */

export async function saveZoneAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const name = str(form, "name", 80);
  if (name.length < 2) return { ok: false, error: "Name the area." };

  const etaRaw = str(form, "eta_minutes", 10);
  const payload = {
    name,
    fee_cents: shillingsToCents(form, "fee"),
    eta_minutes: etaRaw ? int(form, "eta_minutes") : null,
    notes: str(form, "notes", 200),
    is_active: bool(form, "is_active"),
    sort_order: int(form, "sort_order"),
  };

  const zoneId = id(form, "id");
  if (zoneId) updateZone(zoneId, payload);
  else createZone(payload);

  refreshAdmin("/ms/delivery");
  return { ok: true, message: `Saved "${name}".` };
}

export async function deleteZoneAction(form: FormData): Promise<void> {
  await requireAdmin();
  const zoneId = id(form, "id");
  if (zoneId) deleteZone(zoneId);
  refreshAdmin("/ms/delivery");
}

export async function saveDeliverySettingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();

  updateSettings({
    delivery_mode: str(form, "delivery_mode", 10) === "flat" ? "flat" : "zone",
    delivery_flat_fee_cents: shillingsToCents(form, "delivery_flat_fee"),
    free_delivery_threshold_cents: shillingsToCents(form, "free_delivery_threshold"),
    min_order_cents: shillingsToCents(form, "min_order"),
    delivery_note: str(form, "delivery_note", 400),
  });

  refreshAdmin("/ms/delivery");
  return { ok: true, message: "Delivery settings updated." };
}

/* ------------------------------------------------------------------ *
 * Promotions
 * ------------------------------------------------------------------ */

const KINDS: PromotionKind[] = ["happy_hour", "code", "auto"];
const DISCOUNTS: DiscountType[] = ["percent", "fixed"];
const SCOPES: PromotionScope[] = ["all", "category", "item"];

export async function savePromotionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const name = str(form, "name", 80);
  if (name.length < 2) return { ok: false, error: "Give the offer a name." };

  const kindRaw = str(form, "kind", 20) as PromotionKind;
  const kind = KINDS.includes(kindRaw) ? kindRaw : "auto";

  const discountRaw = str(form, "discount_type", 20) as DiscountType;
  const discount_type = DISCOUNTS.includes(discountRaw) ? discountRaw : "percent";

  const scopeRaw = str(form, "scope", 20) as PromotionScope;
  const scope = SCOPES.includes(scopeRaw) ? scopeRaw : "all";

  const discount_value = int(form, "discount_value");
  if (discount_value <= 0) return { ok: false, error: "Enter a discount above zero." };
  if (discount_type === "percent" && discount_value > 100) {
    return { ok: false, error: "A percentage cannot be more than 100." };
  }

  const code = str(form, "code", 32).toUpperCase();
  if (kind === "code" && code.length < 3) {
    return { ok: false, error: "A discount code needs at least 3 characters." };
  }

  if (scope !== "all" && !id(form, "target_id")) {
    return {
      ok: false,
      error: scope === "category" ? "Choose a category." : "Choose a menu item.",
    };
  }

  const days = form
    .getAll("days")
    .map((d) => Number(String(d)))
    .filter((d) => d >= 1 && d <= 7);

  const startTime = str(form, "start_time", 5);
  const endTime = str(form, "end_time", 5);
  if ((startTime && !endTime) || (!startTime && endTime)) {
    return { ok: false, error: "Set both a start and an end time, or leave both blank." };
  }

  const maxUsesRaw = str(form, "max_uses", 10);

  const payload = {
    name,
    kind,
    code: kind === "code" ? code : null,
    discount_type,
    discount_value,
    scope,
    target_id: scope === "all" ? null : id(form, "target_id"),
    min_subtotal_cents: shillingsToCents(form, "min_subtotal"),
    days_of_week: days.length > 0 && days.length < 7 ? days.join(",") : null,
    start_time: startTime || null,
    end_time: endTime || null,
    starts_at: str(form, "starts_at", 20) || null,
    ends_at: str(form, "ends_at", 20) || null,
    max_uses: maxUsesRaw ? int(form, "max_uses") : null,
    is_active: bool(form, "is_active"),
  };

  const promoId = id(form, "id");
  try {
    if (promoId) updatePromotion(promoId, payload);
    else createPromotion(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) {
      return { ok: false, error: `The code "${code}" is already in use.` };
    }
    throw error;
  }

  refreshAdmin("/ms/promotions");
  redirect("/ms/promotions?saved=1");
}

export async function togglePromotionAction(form: FormData): Promise<void> {
  await requireAdmin();
  const promoId = id(form, "id");
  if (!promoId) return;

  const { getPromotion } = await import("./queries");
  const existing = getPromotion(promoId);
  if (!existing) return;

  updatePromotion(promoId, {
    name: existing.name,
    kind: existing.kind,
    code: existing.code,
    discount_type: existing.discount_type,
    discount_value: existing.discount_value,
    scope: existing.scope,
    target_id: existing.target_id,
    min_subtotal_cents: existing.min_subtotal_cents,
    days_of_week: existing.days_of_week,
    start_time: existing.start_time,
    end_time: existing.end_time,
    starts_at: existing.starts_at,
    ends_at: existing.ends_at,
    max_uses: existing.max_uses,
    is_active: str(form, "next_state") === "1",
  });

  refreshAdmin("/ms/promotions");
}

export async function deletePromotionAction(form: FormData): Promise<void> {
  await requireAdmin();
  const promoId = id(form, "id");
  if (promoId) deletePromotion(promoId);
  refreshAdmin("/ms/promotions");
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

const STATUSES: OrderStatus[] = ["new", "confirmed", "completed", "cancelled"];

export async function setOrderStatusAction(form: FormData): Promise<void> {
  await requireAdmin();
  const orderId = id(form, "id");
  const status = str(form, "status", 20) as OrderStatus;
  if (orderId && STATUSES.includes(status)) setOrderStatus(orderId, status);
  revalidatePath("/ms/orders");
  revalidatePath("/ms");
}

/* ------------------------------------------------------------------ *
 * Customers (basic CRM)
 * ------------------------------------------------------------------ */

export async function saveCustomerAction(form: FormData): Promise<void> {
  await requireAdmin();
  const customerId = id(form, "id");
  if (!customerId) return;
  updateCustomerNotes(customerId, {
    notes: str(form, "notes", 400),
    marketing_opt_in: bool(form, "marketing_opt_in"),
  });
  revalidatePath("/ms/customers");
}

export async function deleteCustomerAction(form: FormData): Promise<void> {
  await requireAdmin();
  const customerId = id(form, "id");
  if (customerId) deleteCustomer(customerId);
  revalidatePath("/ms/customers");
  revalidatePath("/ms");
}

/* ------------------------------------------------------------------ *
 * Site settings
 * ------------------------------------------------------------------ */

export async function saveSettingsAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const whatsapp = str(form, "whatsapp_number", 20).replace(/[^\d]/g, "");
  if (whatsapp.length < 9) {
    return { ok: false, error: "Enter the WhatsApp number in full, e.g. 254712345678." };
  }

  updateSettings({
    site_name: str(form, "site_name", 60) || "Jata Cafe",
    tagline: str(form, "tagline", 80),
    hero_kicker: str(form, "hero_kicker", 120),
    whatsapp_number: whatsapp,
    phone_display: str(form, "phone_display", 30),
    address_line: str(form, "address_line", 160),
    area_hint: str(form, "area_hint", 80),
    maps_url: str(form, "maps_url", 400),
    opening_hours: str(form, "opening_hours", 120),
    announcement: str(form, "announcement", 200),
    instagram_url: str(form, "instagram_url", 200),
    tiktok_url: str(form, "tiktok_url", 200),
    facebook_url: str(form, "facebook_url", 200),
  });

  refreshAdmin("/ms/settings");
  return { ok: true, message: "Saved. The live site is updated." };
}
