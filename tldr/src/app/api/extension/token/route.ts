import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createHash, randomBytes } from "crypto";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin.from("extension_tokens").insert({
    token_hash: tokenHash,
    user_id: userId,
    expires_at: expiresAt,
  });

  return NextResponse.json({ token: rawToken, expiresAt });
}
