"use client";

import { useCart } from "./cart-provider";
import { WhatsAppIcon } from "./icons";

/**
 * Floating "chat to us" button.
 *
 * Lifts itself above the sticky cart bar on phones so the two never overlap.
 */
export function WhatsAppFab({ href }: { href: string }) {
  const { itemCount, hydrated, drawerOpen } = useCart();
  const liftForCartBar = hydrated && itemCount > 0 && !drawerOpen;

  if (drawerOpen) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn btn-whatsapp fixed right-4 z-30 !h-14 !w-14 !min-h-14 !rounded-full !p-0 shadow-lift transition-[bottom] md:bottom-6 ${
        liftForCartBar ? "bottom-[5.5rem]" : "bottom-5"
      }`}
      aria-label="Chat with Jata Cafe on WhatsApp"
    >
      <WhatsAppIcon size={26} />
    </a>
  );
}
