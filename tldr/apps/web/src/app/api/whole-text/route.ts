import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authenticateExtensionToken } from "@/lib/extensionAuth";
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

function normalizeCacheText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

type CacheLookupPlan = {
  primaryHash: string;
  orderedHashes: string[];
};

type ParsedSections = {
  [heading: string]: unknown;
};

type ParsedEvent = {
  title?: unknown;
  start?: unknown;
  end?: unknown;
  timezone?: unknown;
  location?: unknown;
  details?: unknown;
  calendarUrl?: unknown;
};

async function buildCacheLookupPlan(text: string, mode: WholeTextMode): Promise<CacheLookupPlan> {
  const normalizedText = normalizeCacheText(text);

  const hashInputs = [
    `${normalizedText}:${mode}`,
    `${text}:${mode}`,
    normalizedText,
    text,
    `${normalizedText}:plain`,
    `${text}:plain`,
  ];

  const orderedHashes: string[] = [];
  const seenHashes = new Set<string>();

  for (const input of hashInputs) {
    const hash = await computeStableHash(input);
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      orderedHashes.push(hash);
    }
  }

  return {
    primaryHash: orderedHashes[0]!,
    orderedHashes,
  };
}

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
    const sections = (parsed as { sections?: unknown }).sections;
    if (!sections || typeof sections !== "object") {
      return null;
    }
    const normalizedSections: Record<string, string[]> = {};
    const typedSections = sections as ParsedSections;
    KEY_INFO_HEADINGS.forEach((heading) => {
      const maybeItems = typedSections[heading];
      const items = Array.isArray(maybeItems) ? maybeItems : [];
      normalizedSections[heading] = items
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    });
    const events = Array.isArray((parsed as { events?: unknown }).events)
      ? ((parsed as { events?: unknown[] }).events ?? [])
      : [];
    const normalizedEvents = events
      .filter((event): event is ParsedEvent => !!event && typeof event === "object")
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
  let userId = session?.user?.id;

  if (!userId) {
    const tokenAuth = await authenticateExtensionToken(request);
    if (tokenAuth.ok) {
      userId = tokenAuth.userId;
    } else {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
  }

  const body = await request.json();
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const mode = (body?.mode as WholeTextMode) ?? "key_info";

  if (!text || !ALLOWED_MODES.includes(mode)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
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

  const cacheLookup = await buildCacheLookupPlan(text, mode);
  const { data: cachedRows } = await supabaseAdmin
    .from("cached_simplifications")
    .select("content_hash, simplified_text, model")
    .in("content_hash", cacheLookup.orderedHashes);

  if (cachedRows?.length) {
    const cachedByHash = new Map(cachedRows.map((row) => [row.content_hash, row]));
    const cachedEntry = cacheLookup.orderedHashes
      .map((hash) => cachedByHash.get(hash))
      .find(
        (
          row,
        ): row is {
          content_hash: string;
          simplified_text: string;
          model: string | null;
        } => typeof row?.simplified_text === "string" && row.simplified_text.length > 0,
      );
    if (cachedEntry) {
      await supabaseAdmin.from("usage_events").insert({
        user_id: userId,
        event_type: "whole_text",
        model: cachedEntry.model ?? null,
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
      });

      await supabaseAdmin
        .from("user_profiles")
        .update({ monthly_usage: monthlyUsage + 1, monthly_usage_period: entitlements.usagePeriod })
        .eq("id", userId);

      return NextResponse.json({ resultText: cachedEntry.simplified_text, cached: true, charged: true });
    }
  }

  const llmResult = await extractKeyInfoWithLlm(text, mode);
  const parsedPayload = parseKeyInfoPayload(llmResult.simplifiedText);
  const resultText = parsedPayload ? JSON.stringify(parsedPayload) : llmResult.simplifiedText;

  await supabaseAdmin
    .from("cached_simplifications")
    .upsert(
      {
        content_hash: cacheLookup.primaryHash,
        reading_level: "plain",
        simplified_text: resultText,
        model: llmResult.model ?? null,
      },
      {
        onConflict: "content_hash",
        ignoreDuplicates: true,
      },
    );

  await supabaseAdmin.from("usage_events").insert({
    user_id: userId,
    event_type: "whole_text",
    model: llmResult.model ?? null,
    input_tokens: llmResult.inputTokens ?? null,
    output_tokens: llmResult.outputTokens ?? null,
    total_tokens: llmResult.totalTokens ?? null,
  });

  await supabaseAdmin
    .from("user_profiles")
    .update({ monthly_usage: monthlyUsage + 1, monthly_usage_period: entitlements.usagePeriod })
    .eq("id", userId);

  return NextResponse.json({ resultText, cached: false, charged: true });
}
