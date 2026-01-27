import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { evaluateEntitlements } from "@/lib/entitlements";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: profile, error } = await supabaseAdmin
    .from("user_profiles")
    .select(
      "email, plan, subscription_status, trial_active, trial_ends_at, monthly_usage, monthly_limit, monthly_usage_period, current_period_end, cancel_at_period_end",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  const entitlements = evaluateEntitlements({
    plan: profile.plan,
    subscription_status: profile.subscription_status,
    trial_active: profile.trial_active,
    trial_ends_at: profile.trial_ends_at,
    monthly_usage: profile.monthly_usage ?? 0,
    monthly_usage_period: profile.monthly_usage_period ?? "",
  });

  return NextResponse.json({
    profile: {
      ...profile,
      monthly_limit: entitlements.monthlyLimit,
    },
  });
}
