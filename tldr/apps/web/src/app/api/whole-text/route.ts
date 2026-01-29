import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { computeStableHash } from "@tldr/core";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateEntitlements } from "@/lib/entitlements";
import { extractKeyInfoWithLlm, WholeTextMode } from "@/lib/llm";

export const runtime = "nodejs";

const ALLOWED_MODES: WholeTextMode[] = ["key_info"];

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json();
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const mode = (body?.mode as WholeTextMode) ?? "key_info";

  if (!text || !ALLOWED_MODES.includes(mode)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const contentHash = await computeStableHash(`${text}:${mode}`);

  const { data: cached } = await supabaseAdmin
    .from("cached_simplifications")
    .select("simplified_text")
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (cached?.simplified_text) {
    return NextResponse.json({ resultText: cached.simplified_text, cached: true });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("user_profiles")
    .select("plan, subscription_status, trial_active, trial_ends_at, monthly_usage, monthly_usage_period")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profile missing." }, { status: 400 });
  }

  const entitlements = evaluateEntitlements({
    plan: profile.plan,
    subscription_status: profile.subscription_status,
    trial_active: profile.trial_active,
    trial_ends_at: profile.trial_ends_at,
    monthly_usage: profile.monthly_usage ?? 0,
    monthly_usage_period: profile.monthly_usage_period ?? "",
  });

  let monthlyUsage = profile.monthly_usage ?? 0;

  if (profile.monthly_usage_period !== entitlements.usagePeriod) {
    monthlyUsage = 0;
    await supabaseAdmin
      .from("user_profiles")
      .update({ monthly_usage: 0, monthly_usage_period: entitlements.usagePeriod })
      .eq("id", userId);
  }

  if (monthlyUsage >= entitlements.monthlyLimit) {
    return NextResponse.json({ error: "Monthly limit reached." }, { status: 402 });
  }

  const llmResult = await extractKeyInfoWithLlm(text, mode);

  await supabaseAdmin.from("cached_simplifications").insert({
    content_hash: contentHash,
    reading_level: "plain",
    simplified_text: llmResult.simplifiedText,
    model: llmResult.model ?? null,
  });

  await supabaseAdmin.from("usage_events").insert({
    user_id: userId,
    event_type: "simplify",
    model: llmResult.model ?? null,
    input_tokens: llmResult.inputTokens ?? null,
    output_tokens: llmResult.outputTokens ?? null,
    total_tokens: llmResult.totalTokens ?? null,
  });

  await supabaseAdmin
    .from("user_profiles")
    .update({ monthly_usage: monthlyUsage + 1, monthly_usage_period: entitlements.usagePeriod })
    .eq("id", userId);

  return NextResponse.json({ resultText: llmResult.simplifiedText, cached: false });
}
