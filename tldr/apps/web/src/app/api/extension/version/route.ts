import { NextResponse } from "next/server";
import { LATEST_EXTENSION_VERSION, LATEST_EXTENSION_ZIP_URL } from "@/lib/extensionRelease";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      version: LATEST_EXTENSION_VERSION,
      zipUrl: LATEST_EXTENSION_ZIP_URL,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
