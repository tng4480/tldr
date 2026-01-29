import { computeUsagePeriod, getPlanLimit, getTrialLimit, PlanTier } from "@/lib/billing";

export type UserProfileEntitlements = {
  plan: PlanTier;
  subscription_status: string | null;
  trial_active: boolean | null;
  trial_ends_at: string | null;
  monthly_usage: number;
  monthly_usage_period: string;
};

export type EntitlementDecision = {
  monthlyLimit: number;
  isActive: boolean;
  usagePeriod: string;
};

export function evaluateEntitlements(profile: UserProfileEntitlements, now = new Date()): EntitlementDecision {
  const usagePeriod = computeUsagePeriod(now);
  const subscriptionStatus = profile.subscription_status ?? "none";
  const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const isTrialValid = Boolean(profile.trial_active) && trialEndsAt ? now < trialEndsAt : false;

  if (subscriptionStatus === "active" || subscriptionStatus === "trialing") {
    return {
      monthlyLimit: getPlanLimit(profile.plan),
      isActive: true,
      usagePeriod,
    };
  }

  if (isTrialValid) {
    return {
      monthlyLimit: getTrialLimit(),
      isActive: true,
      usagePeriod,
    };
  }

  return {
    monthlyLimit: getPlanLimit("free"),
    isActive: false,
    usagePeriod,
  };
}
