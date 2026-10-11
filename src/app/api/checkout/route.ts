import { NextResponse } from "next/server";
import { computePricing } from "@/lib/pricing";
import {
  findPromotionByCode,
  getSettings,
  getZone,
  incrementPromotionUsage,
  listPublicPromotions,
  logEvent,
  nextOrderReference,
  getMenuItemsByIds,
  recordOrder,
} from "@/lib/queries";
import type { CartLine, OrderLine } from "@/lib/types";
import {
  buildOrderMessage,
  buildWhatsAppUrl,
  formatKenyanPhone,
  normalizeKenyanPhone,
} from "@/lib/whatsapp";

type IncomingItem = { id: number; quantity: number };

type Payload = {
  items?: IncomingItem[];
  orderType?: string;
  zoneId?: number | null;
  name?: string;
  phone?: string;
  location?: string;
  notes?: string;
  promoCode?: string | null;
  marketingOptIn?: boolean;
};

const bad = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status });

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Collapse whitespace and strip control characters before anything is stored
  // or pushed into the WhatsApp message.
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return bad("Could not read that request.");
  }

  /* ---------------- items ---------------- */

  const incoming = Array.isArray(payload.items) ? payload.items : [];
  const wanted = incoming
    .filter(
      (item) =>
        item &&
        Number.isInteger(item.id) &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 99,
    )
    .slice(0, 60);

  if (wanted.length === 0) return bad("Your cart is empty.");

  const dbItems = await getMenuItemsByIds(wanted.map((item) => item.id));
  const byId = new Map(dbItems.map((item) => [item.id, item]));

  const missing = wanted.filter((item) => !byId.has(item.id));
  if (missing.length > 0) {
    return bad("Some items are no longer on the menu. Please refresh and try again.", 409);
  }

  const soldOut = wanted
    .map((item) => byId.get(item.id)!)
    .filter((item) => item.is_available === 0);
  if (soldOut.length > 0) {
    return bad(
      `Sorry, ${soldOut.map((i) => i.name).join(", ")} just sold out. Remove it and try again.`,
      409,
    );
  }

  // Prices always come from the database, never from the browser.
  const lines: CartLine[] = wanted.map((item) => {
    const dbItem = byId.get(item.id)!;
    return {
      id: dbItem.id,
      name: dbItem.name,
      price_cents: dbItem.price_cents,
      quantity: item.quantity,
      image_url: dbItem.image_url,
      category_id: dbItem.category_id,
      category_name: dbItem.category_name,
    };
  });

  /* ---------------- customer ---------------- */

  const settings = await getSettings();
  const orderType = payload.orderType === "pickup" ? "pickup" : "delivery";

  const phone = normalizeKenyanPhone(payload.phone ?? "");
  if (!phone) {
    return bad("Enter a valid Kenyan phone number, for example 0712 345 678.");
  }

  const name = clean(payload.name, 60);
  if (name.length < 2) return bad("Tell us your name so we know who to call.");

  const location = clean(payload.location, 200);
  if (orderType === "delivery" && location.length < 4) {
    return bad("Add a delivery location: street, building or a nearby landmark.");
  }

  const notes = clean(payload.notes, 300);

  /* ---------------- delivery zone ---------------- */

  let zoneId: number | null = null;
  let zoneName: string | null = null;
  let zoneFeeCents: number | null = null;

  if (orderType === "delivery") {
    if (settings.delivery_mode === "zone") {
      const requested = Number(payload.zoneId);
      if (!Number.isInteger(requested)) return bad("Choose your delivery area.");
      const zone = await getZone(requested);
      if (!zone || zone.is_active === 0) return bad("That delivery area is not available.");
      zoneId = zone.id;
      zoneName = zone.name;
      zoneFeeCents = zone.fee_cents;
    } else {
      zoneName = "Flat rate";
      zoneFeeCents = settings.delivery_flat_fee_cents;
    }
  }

  /* ---------------- promotions ---------------- */

  const requestedCode = clean(payload.promoCode ?? "", 32).toUpperCase();
  let unlockedIds: number[] = [];
  let acceptedCode: string | null = null;

  if (requestedCode) {
    const promo = await findPromotionByCode(requestedCode);
    if (promo) {
      unlockedIds = [promo.id];
      acceptedCode = requestedCode;
    }
    // An expired or unknown code is simply ignored rather than blocking the order.
  }

  const pricing = computePricing({
    lines,
    promotions: await listPublicPromotions(),
    unlockedPromotionIds: unlockedIds,
    orderType,
    deliveryMode: settings.delivery_mode,
    flatFeeCents: settings.delivery_flat_fee_cents,
    zoneFeeCents,
    freeDeliveryThresholdCents: settings.free_delivery_threshold_cents,
  });

  if (pricing.subtotal_cents < settings.min_order_cents) {
    return bad(
      `Minimum order is KES ${Math.round(settings.min_order_cents / 100)}. Please add a little more.`,
    );
  }

  /* ---------------- persist + build message ---------------- */

  const reference = await nextOrderReference();

  const orderLines: OrderLine[] = lines.map((line) => ({
    menu_item_id: line.id,
    name: line.name,
    unit_price_cents: line.price_cents,
    quantity: line.quantity,
    line_total_cents: line.price_cents * line.quantity,
  }));

  try {
    await recordOrder({
      reference,
      phone,
      customer_name: name,
      order_type: orderType,
      location: orderType === "delivery" ? location : null,
      zone_id: zoneId,
      zone_name: zoneName,
      lines: orderLines,
      subtotal_cents: pricing.subtotal_cents,
      discount_cents: pricing.discount_cents,
      delivery_fee_cents: pricing.delivery_fee_cents,
      total_cents: pricing.total_cents,
      applied_promos:
        pricing.applied.length > 0
          ? JSON.stringify(
              pricing.applied.map((p) => ({ name: p.name, amount_cents: p.amount_cents })),
            )
          : null,
      promo_code: acceptedCode,
      notes: notes || null,
      marketing_opt_in: payload.marketingOptIn !== false,
    });

    if (pricing.applied.length > 0) {
      await incrementPromotionUsage(
        pricing.applied.filter((p) => unlockedIds.includes(p.id)).map((p) => p.id),
      );
    }

    await logEvent("whatsapp_checkout", {
      reference,
      order_type: orderType,
      total_cents: pricing.total_cents,
      items: orderLines.length,
    });
  } catch (error) {
    console.error("[jata] failed to record order", error);
    return NextResponse.json(
      { ok: false, error: "We could not save that order. Please try again." },
      { status: 500 },
    );
  }

  const message = buildOrderMessage({
    lines,
    pricing,
    orderType,
    customerName: name,
    customerPhone: formatKenyanPhone(phone),
    location,
    zoneName: settings.delivery_mode === "zone" ? zoneName : null,
    notes: notes || null,
    reference,
    currency: settings.currency,
  });

  return NextResponse.json(
    {
      ok: true,
      reference,
      url: buildWhatsAppUrl(settings.whatsapp_number, message),
      message,
      pricing,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
