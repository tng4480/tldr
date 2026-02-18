import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createHash } from "crypto";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const rawToken = typeof body.token === "string" ? body.token.trim() : "";

  if (rawToken) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const { data } = await supabaseAdmin
      .from("extension_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("token_hash", tokenHash)
      .select("token_hash");

    return NextResponse.json({
      revokedAll: false,
      revokedCount: data?.length ?? 0,
    });
  }

  const { data } = await supabaseAdmin
    .from("extension_tokens")
    .delete()
    .eq("user_id", userId)
    .select("token_hash");

  return NextResponse.json({
    revokedAll: true,
    revokedCount: data?.length ?? 0,
  });
}
