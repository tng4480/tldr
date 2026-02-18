import { NextResponse } from "next/server";
import { authenticateExtensionToken } from "@/lib/extensionAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const tokenAuth = await authenticateExtensionToken(request);
  if (!tokenAuth.ok) {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    expiresAt: tokenAuth.expiresAt,
  });
}
