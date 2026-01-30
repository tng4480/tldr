import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { computeStableHash } from "@tldr/core";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateEntitlements } from "@/lib/entitlements";
import { extractKeyInfoWithLlm, extractKeyInfoWithLlmStream, WholeTextMode } from "@/lib/llm";
import { buildGoogleCalendarTemplateUrl, type GoogleCalendarTemplateEvent } from "@/lib/googleCalendar";

export const runtime = "nodejs";

const ALLOWED_MODES: WholeTextMode[] = ["key_info"];

function augmentCalendarLinks(resultText: string): string {
  try {
    const parsed = JSON.parse(resultText) as { events?: unknown };
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as any).events)) {
      return resultText;
    }
    const events = (parsed as any).events as GoogleCalendarTemplateEvent[];
    (parsed as any).events = events.map((event) => ({
      ...event,
      calendarUrl: buildGoogleCalendarTemplateUrl(event),
    }));
    return JSON.stringify(parsed);
  } catch {
    return resultText;
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
  const stream = body?.stream === true;

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
    const cachedResultText = augmentCalendarLinks(cached.simplified_text);
    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "final", resultText: cachedResultText, cached: true })}\n`));
          controller.close();
        },
      });
      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ resultText: cachedResultText, cached: true });
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

  if (stream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          try {
            const llmResult = await extractKeyInfoWithLlmStream(text, mode, (deltaText) => {
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: "delta", text: deltaText })}\n`));
            });
            const resultText = augmentCalendarLinks(llmResult.simplifiedText);

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

            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "final", resultText, cached: false })}\n`));
            controller.close();
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  type: "error",
                  error: error instanceof Error ? error.message : "Unable to extract key information.",
                })}\n`,
              ),
            );
            controller.close();
          }
        })();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const llmResult = await extractKeyInfoWithLlm(text, mode);
  const resultText = augmentCalendarLinks(llmResult.simplifiedText);

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
