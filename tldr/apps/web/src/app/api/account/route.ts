import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { evaluateEntitlements } from "@/lib/entitlements";
import { isPaidPlan, normalizePlan, planLabel } from "@/lib/billing";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authOptions);
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
    plan: normalizePlan(profile.plan),
    subscription_status: profile.subscription_status,
    trial_active: profile.trial_active,
    trial_ends_at: profile.trial_ends_at,
    monthly_usage: profile.monthly_usage ?? 0,
    monthly_usage_period: profile.monthly_usage_period ?? "",
  });

  return NextResponse.json({
    profile: {
      ...profile,
      plan: normalizePlan(profile.plan),
      plan_label: planLabel(profile.plan),
      is_paid: isPaidPlan(profile.plan),
      monthly_limit: entitlements.monthlyLimit,
      usage_window: entitlements.usageWindow,
    },
  });
}
