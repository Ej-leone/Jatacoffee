import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Storefront pages are cached so they paint fast on a slow connection. Every admin
 * mutation calls this so an edit in the dashboard shows on the live site straight
 * away instead of waiting for the timed refresh.
 */
export function revalidateStorefront(): void {
  // 'layout' covers the shared chrome, which carries settings, zones and promotions.
  revalidatePath("/", "layout");
  for (const path of ["/", "/menu", "/delivery", "/offers", "/visit", "/checkout"]) {
    revalidatePath(path);
  }
  revalidatePath("/sitemap.xml");
}
