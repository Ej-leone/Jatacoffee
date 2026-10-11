import { NextResponse } from "next/server";
import { findPromotionByCode } from "@/lib/queries";
import { isPromotionLive } from "@/lib/pricing";

/** Validates a discount code typed at checkout. */
export async function POST(request: Request) {
  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  if (!code || code.length > 32) {
    return NextResponse.json({ ok: false, error: "Enter a valid code." }, { status: 400 });
  }

  const promotion = await findPromotionByCode(code);
  if (!promotion) {
    return NextResponse.json(
      { ok: false, error: "We don't recognise that code." },
      { status: 404 },
    );
  }

  if (!isPromotionLive(promotion)) {
    return NextResponse.json(
      { ok: false, error: "That code is not active right now." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { ok: true, promotion },
    { headers: { "Cache-Control": "no-store" } },
  );
}
