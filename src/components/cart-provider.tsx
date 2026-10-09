"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  computePricing,
  nairobiClock,
  type NairobiClock,
  type PricingResult,
  type PublicPromotion,
} from "@/lib/pricing";
import type { CartLine } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Shape of the storefront config handed down from the server
 * ------------------------------------------------------------------ */

export type StoreZone = {
  id: number;
  name: string;
  fee_cents: number;
  eta_minutes: number | null;
};

export type StoreConfig = {
  currency: string;
  whatsapp_number: string;
  delivery_mode: "flat" | "zone";
  delivery_flat_fee_cents: number;
  free_delivery_threshold_cents: number;
  min_order_cents: number;
  zones: StoreZone[];
  promotions: PublicPromotion[];
};

export type OrderType = "delivery" | "pickup";

type PersistedCart = {
  v: 1;
  lines: CartLine[];
  orderType: OrderType;
  zoneId: number | null;
  promoCode: string | null;
};

const STORAGE_KEY = "jata-cart-v1";

type CartContextValue = {
  config: StoreConfig;
  lines: CartLine[];
  itemCount: number;
  pricing: PricingResult;
  orderType: OrderType;
  zoneId: number | null;
  zone: StoreZone | null;
  promoCode: string | null;
  promoMessage: { tone: "ok" | "error"; text: string } | null;
  promoChecking: boolean;
  /** True until localStorage has been read, so the UI can avoid a flash. */
  hydrated: boolean;
  drawerOpen: boolean;

  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (id: number, quantity: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  setOrderType: (type: OrderType) => void;
  setZoneId: (id: number | null) => void;
  applyPromoCode: (code: string) => Promise<boolean>;
  clearPromoCode: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */

export function CartProvider({
  config,
  children,
}: {
  config: StoreConfig;
  children: React.ReactNode;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [orderType, setOrderTypeState] = useState<OrderType>("delivery");
  const [zoneId, setZoneIdState] = useState<number | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [unlockedIds, setUnlockedIds] = useState<number[]>([]);
  const [promoMessage, setPromoMessage] =
    useState<CartContextValue["promoMessage"]>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Re-evaluate time-based promotions on a timer so a happy hour can start or
  // end while the shopper is still looking at the page.
  const [clock, setClock] = useState<NairobiClock>(() => nairobiClock());
  useEffect(() => {
    const id = setInterval(() => setClock(nairobiClock()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* ---------------- persistence ---------------- */

  const validateCode = useRef<(code: string) => Promise<boolean>>(async () => false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedCart;
        if (Array.isArray(parsed.lines)) {
          setLines(
            parsed.lines.filter(
              (l) =>
                typeof l?.id === "number" &&
                typeof l?.name === "string" &&
                typeof l?.price_cents === "number" &&
                typeof l?.quantity === "number" &&
                l.quantity > 0,
            ),
          );
        }
        if (parsed.orderType === "pickup" || parsed.orderType === "delivery") {
          setOrderTypeState(parsed.orderType);
        }
        if (typeof parsed.zoneId === "number") setZoneIdState(parsed.zoneId);
        if (parsed.promoCode) {
          setPromoCode(parsed.promoCode);
          // Re-check with the server: the code may have expired since last visit.
          void validateCode.current(parsed.promoCode);
        }
      }
    } catch {
      // Corrupt storage should never block the shop.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedCart = { v: 1, lines, orderType, zoneId, promoCode };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Private browsing / full quota: carry on with in-memory state.
    }
  }, [hydrated, lines, orderType, zoneId, promoCode]);

  // Lock background scroll while the cart drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  /* ---------------- derived ---------------- */

  const zone = useMemo(
    () => config.zones.find((z) => z.id === zoneId) ?? null,
    [config.zones, zoneId],
  );

  const pricing = useMemo(
    () =>
      computePricing({
        lines,
        promotions: config.promotions,
        unlockedPromotionIds: unlockedIds,
        orderType,
        deliveryMode: config.delivery_mode,
        flatFeeCents: config.delivery_flat_fee_cents,
        zoneFeeCents: zone ? zone.fee_cents : null,
        freeDeliveryThresholdCents: config.free_delivery_threshold_cents,
        clock,
      }),
    [lines, config, unlockedIds, orderType, zone, clock],
  );

  const itemCount = pricing.item_count;

  /* ---------------- actions ---------------- */

  const add = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((l) => l.id === line.id);
      if (existing) {
        return current.map((l) =>
          l.id === line.id ? { ...l, quantity: Math.min(99, l.quantity + quantity) } : l,
        );
      }
      return [...current, { ...line, quantity: Math.min(99, Math.max(1, quantity)) }];
    });
  }, []);

  const setQuantity = useCallback((id: number, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.id !== id)
        : current.map((l) => (l.id === id ? { ...l, quantity: Math.min(99, quantity) } : l)),
    );
  }, []);

  const remove = useCallback((id: number) => {
    setLines((current) => current.filter((l) => l.id !== id));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setPromoCode(null);
    setUnlockedIds([]);
    setPromoMessage(null);
  }, []);

  const applyPromoCode = useCallback(async (codeRaw: string): Promise<boolean> => {
    const code = codeRaw.trim().toUpperCase();
    if (!code) {
      setPromoMessage({ tone: "error", text: "Type a code first." });
      return false;
    }

    setPromoChecking(true);
    try {
      const response = await fetch("/api/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as
        | { ok: true; promotion: PublicPromotion }
        | { ok: false; error: string };

      if (!response.ok || !data.ok) {
        setPromoCode(null);
        setUnlockedIds([]);
        setPromoMessage({
          tone: "error",
          text: data && "error" in data ? data.error : "That code is not valid.",
        });
        return false;
      }

      setPromoCode(code);
      setUnlockedIds([data.promotion.id]);
      setPromoMessage({ tone: "ok", text: `${data.promotion.name} applied.` });
      return true;
    } catch {
      setPromoMessage({
        tone: "error",
        text: "Could not check that code. Check your connection.",
      });
      return false;
    } finally {
      setPromoChecking(false);
    }
  }, []);

  validateCode.current = applyPromoCode;

  const clearPromoCode = useCallback(() => {
    setPromoCode(null);
    setUnlockedIds([]);
    setPromoMessage(null);
  }, []);

  const setOrderType = useCallback((type: OrderType) => setOrderTypeState(type), []);
  const setZoneId = useCallback((id: number | null) => setZoneIdState(id), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const value: CartContextValue = {
    config,
    lines,
    itemCount,
    pricing,
    orderType,
    zoneId,
    zone,
    promoCode,
    promoMessage,
    promoChecking,
    hydrated,
    drawerOpen,
    add,
    setQuantity,
    remove,
    clear,
    setOrderType,
    setZoneId,
    applyPromoCode,
    clearPromoCode,
    openDrawer,
    closeDrawer,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
