import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { computeStableHash } from "@tldr/core";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateEntitlements } from "@/lib/entitlements";
import { buildGoogleCalendarTemplateUrl } from "@/lib/googleCalendar";
import { extractKeyInfoWithLlm, WholeTextMode } from "@/lib/llm";

export const runtime = "nodejs";

const ALLOWED_MODES: WholeTextMode[] = ["key_info"];

type KeyInfoPayload = {
  sections: Record<string, string[]>;
  events: Array<{
    title: string;
    start?: string | null;
    end?: string | null;
    timezone?: string | null;
    location?: string | null;
    details?: string | null;
    calendarUrl?: string | null;
  }>;
};

const KEY_INFO_HEADINGS = ["Important dates", "Things to do", "Things to know"] as const;

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}

function parseKeyInfoPayload(rawText: string): KeyInfoPayload | null {
  try {
    const cleaned = stripJsonFence(rawText);
    if (!cleaned) {
      return null;
    }
    const parsed = JSON.parse(cleaned) as { sections?: unknown; events?: unknown };
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const sections = (parsed as any).sections;
    if (!sections || typeof sections !== "object") {
      return null;
    }
    const normalizedSections: Record<string, string[]> = {};
    KEY_INFO_HEADINGS.forEach((heading) => {
      const items = Array.isArray((sections as any)[heading]) ? ((sections as any)[heading] as unknown[]) : [];
      normalizedSections[heading] = items
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    });
    const events = Array.isArray((parsed as any).events) ? ((parsed as any).events as unknown[]) : [];
    const normalizedEvents = events
      .filter((event): event is Record<string, unknown> => !!event && typeof event === "object")
      .map((event) => {
        const title = typeof event.title === "string" ? event.title.trim() : "";
        const normalizedEvent = {
          title,
          start: typeof event.start === "string" ? event.start.trim() : null,
          end: typeof event.end === "string" ? event.end.trim() : null,
          timezone: typeof event.timezone === "string" ? event.timezone.trim() : null,
          location: typeof event.location === "string" ? event.location.trim() : null,
          details: typeof event.details === "string" ? event.details.trim() : null,
          calendarUrl: typeof event.calendarUrl === "string" ? event.calendarUrl : null,
        };
        if (!normalizedEvent.title) {
          return null;
        }
        const calendarUrl =
          normalizedEvent.calendarUrl ??
          buildGoogleCalendarTemplateUrl({
            title: normalizedEvent.title,
            start: normalizedEvent.start ?? null,
            end: normalizedEvent.end ?? null,
            timezone: normalizedEvent.timezone ?? null,
            location: normalizedEvent.location ?? null,
            details: normalizedEvent.details ?? null,
          });
        return { ...normalizedEvent, calendarUrl };
      })
      .filter((event): event is NonNullable<typeof event> => !!event);
    return {
      sections: normalizedSections,
      events: normalizedEvents,
    };
  } catch {
    return null;
  }
}

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
  const parsedPayload = parseKeyInfoPayload(llmResult.simplifiedText);
  const resultText = parsedPayload ? JSON.stringify(parsedPayload) : llmResult.simplifiedText;

  await supabaseAdmin.from("cached_simplifications").insert({
    content_hash: contentHash,
    reading_level: "plain",
    simplified_text: resultText,
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

  return NextResponse.json({ resultText, cached: false });
}
