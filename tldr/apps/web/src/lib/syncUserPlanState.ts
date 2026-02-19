import { getPlanLimit, PLAN_FREE } from "@/lib/billing";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PROFILE_SELECT =
  "plan, subscription_status, trial_active, trial_ends_at, monthly_usage, monthly_usage_period, monthly_limit, current_period_end, cancel_at_period_end";

export type SyncedUserPlanProfile = {
  plan: number;
  subscription_status: string | null;
  trial_active: boolean | null;
  trial_ends_at: string | null;
  monthly_usage: number | null;
  monthly_usage_period: string | null;
  monthly_limit: number | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

type SyncUserPlanStateResult =
  | { ok: true; profile: SyncedUserPlanProfile; updated: boolean }
  | { ok: false; error: string };

function hasEnded(timestamp: string | null | undefined, nowMs: number): boolean {
  if (!timestamp) {
    return false;
  }
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return parsed <= nowMs;
}

export async function syncUserPlanState(
  userId: string,
  now = new Date(),
): Promise<SyncUserPlanStateResult> {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("user_profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: false, error: "Profile missing." };
  }

  const nowMs = now.getTime();
  const updates: Partial<SyncedUserPlanProfile> = {};

  if (Boolean(profile.trial_active) && hasEnded(profile.trial_ends_at, nowMs)) {
    updates.trial_active = false;
  }

  const shouldDowngradeForCancel =
    Boolean(profile.cancel_at_period_end) && hasEnded(profile.current_period_end, nowMs);

  if (shouldDowngradeForCancel) {
    updates.plan = PLAN_FREE;
    updates.monthly_limit = getPlanLimit(PLAN_FREE);
    updates.subscription_status = "canceled";
    updates.cancel_at_period_end = false;
    updates.current_period_end = null;
  }

  if (!Object.keys(updates).length) {
    return { ok: true, profile: profile as SyncedUserPlanProfile, updated: false };
  }

  const { data: updatedProfile, error: updateError } = await supabaseAdmin
    .from("user_profiles")
    .update(updates)
    .eq("id", userId)
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (updateError || !updatedProfile) {
    return { ok: false, error: "Unable to sync plan state." };
  }

  return { ok: true, profile: updatedProfile as SyncedUserPlanProfile, updated: true };
}

