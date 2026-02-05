import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createHash } from "crypto";

export type ExtensionAuthResult =
  | { ok: true; userId: string }
  | { ok: false; error: "missing" | "invalid" | "expired" };

function parseBearerToken(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^Bearer\s+(.+)\s*$/i);
  if (!match) {
    return null;
  }
  const token = match[1]?.trim() ?? "";
  return token.length ? token : null;
}

export async function authenticateExtensionToken(request: Request): Promise<ExtensionAuthResult> {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { ok: false, error: "missing" };
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("extension_tokens")
    .select("user_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data?.user_id) {
    return { ok: false, error: "invalid" };
  }

  const expiresAt = typeof data.expires_at === "string" ? data.expires_at : "";
  if (!expiresAt || expiresAt <= nowIso) {
    return { ok: false, error: "expired" };
  }

  return { ok: true, userId: data.user_id as string };
}

