import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Update this when you publish a new extension build.
const CURRENT_EXTENSION_VERSION = "0.1.0";

export async function GET() {
  return NextResponse.json(
    { version: CURRENT_EXTENSION_VERSION },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
