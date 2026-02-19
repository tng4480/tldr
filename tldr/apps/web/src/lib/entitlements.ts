import {
  computeUsagePeriod,
  getPlanLimit,
  getTrialLimit,
  normalizePlan,
  PlanTier,
  PLAN_FREE,
  PLAN_STARTER,
} from "@/lib/billing";

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
  usageWindow: "lifetime" | "monthly";
  resetsMonthly: boolean;
};

export function evaluateEntitlements(profile: UserProfileEntitlements, now = new Date()): EntitlementDecision {
  const usagePeriod = computeUsagePeriod(now);
  const plan = normalizePlan(profile.plan);
  const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const isTrialValid = Boolean(profile.trial_active) && trialEndsAt ? now < trialEndsAt : false;

  if (plan === PLAN_STARTER) {
    return {
      monthlyLimit: getPlanLimit(PLAN_STARTER),
      isActive: true,
      usagePeriod,
      usageWindow: "monthly",
      resetsMonthly: true,
    };
  }

  if (isTrialValid) {
    return {
      monthlyLimit: getTrialLimit(),
      isActive: true,
      usagePeriod,
      usageWindow: "monthly",
      resetsMonthly: true,
    };
  }

  return {
    monthlyLimit: getPlanLimit(PLAN_FREE),
    isActive: false,
    usagePeriod: "lifetime",
    usageWindow: "lifetime",
    resetsMonthly: false,
  };
}
