/** Shared domain types. Money is always stored and passed around as integer cents. */

export type Category = {
  id: number;
  name: string;
  slug: string;
  blurb: string | null;
  sort_order: number;
  is_active: number;
};

export type MenuItem = {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  badge: string | null;
  is_available: number;
  is_featured: number;
  sort_order: number;
  created_at: string;
};

export type MenuItemWithCategory = MenuItem & {
  category_name: string;
  category_slug: string;
};

export type Banner = {
  id: number;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_label: string | null;
  theme: string;
  is_active: number;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
};

export type DeliveryZone = {
  id: number;
  name: string;
  fee_cents: number;
  eta_minutes: number | null;
  notes: string | null;
  is_active: number;
  sort_order: number;
};

export type PromotionKind = "happy_hour" | "code" | "auto";
export type DiscountType = "percent" | "fixed";
export type PromotionScope = "all" | "category" | "item";

export type Promotion = {
  id: number;
  name: string;
  kind: PromotionKind;
  code: string | null;
  discount_type: DiscountType;
  discount_value: number;
  scope: PromotionScope;
  /** category_id or menu_item_id depending on `scope`. */
  target_id: number | null;
  min_subtotal_cents: number;
  /** Comma separated ISO weekdays, 1 = Monday .. 7 = Sunday. Empty = every day. */
  days_of_week: string | null;
  /** "HH:MM" in Africa/Nairobi time. */
  start_time: string | null;
  end_time: string | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  usage_count: number;
  is_active: number;
  created_at: string;
};

export type Customer = {
  id: number;
  phone: string;
  name: string | null;
  location: string | null;
  zone_id: number | null;
  orders_count: number;
  total_spend_cents: number;
  marketing_opt_in: number;
  notes: string | null;
  first_order_at: string;
  last_order_at: string;
};

export type OrderType = "delivery" | "pickup";
export type OrderStatus = "new" | "confirmed" | "completed" | "cancelled";

export type OrderLine = {
  menu_item_id: number | null;
  name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
};

export type Order = {
  id: number;
  reference: string;
  customer_id: number | null;
  customer_name: string | null;
  phone: string;
  order_type: OrderType;
  location: string | null;
  zone_id: number | null;
  zone_name: string | null;
  items_json: string;
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  applied_promos: string | null;
  promo_code: string | null;
  notes: string | null;
  status: OrderStatus;
  created_at: string;
};

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  must_change_password: number;
  created_at: string;
  last_login_at: string | null;
};

export type SiteSettings = {
  site_name: string;
  tagline: string;
  hero_kicker: string;
  whatsapp_number: string;
  phone_display: string;
  address_line: string;
  area_hint: string;
  maps_url: string;
  opening_hours: string;
  announcement: string;
  delivery_mode: "flat" | "zone";
  delivery_flat_fee_cents: number;
  free_delivery_threshold_cents: number;
  delivery_note: string;
  min_order_cents: number;
  instagram_url: string;
  tiktok_url: string;
  facebook_url: string;
  currency: string;
};

export type CartLine = {
  id: number;
  name: string;
  price_cents: number;
  quantity: number;
  image_url: string | null;
  category_id: number;
  category_name: string;
};
