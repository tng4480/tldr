export const PLAN_FREE = 0 as const;
export const PLAN_STARTER = 1 as const;

export type PlanTier = typeof PLAN_FREE | typeof PLAN_STARTER;

export const PLAN_LIMITS: Record<PlanTier, number> = {
  [PLAN_FREE]: 20,
  [PLAN_STARTER]: 100,
};

export const TRIAL_DAYS = 14;

export function computeUsagePeriod(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

export function getPlanLimit(plan: PlanTier): number {
  return PLAN_LIMITS[plan];
}

export function getTrialLimit(): number {
  return PLAN_LIMITS[PLAN_STARTER];
}

export function mapPriceIdToPlan(priceId?: string | null): PlanTier {
  if (!priceId) {
    return PLAN_FREE;
  }
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) {
    return PLAN_STARTER;
  }
  return PLAN_FREE;
}

export function normalizePlan(plan: unknown): PlanTier {
  if (plan === PLAN_STARTER || plan === 1 || plan === "starter" || plan === "pro") {
    return PLAN_STARTER;
  }
  return PLAN_FREE;
}

export function isPaidPlan(plan: unknown): boolean {
  return normalizePlan(plan) === PLAN_STARTER;
}

export function planLabel(plan: unknown): "free" | "starter" {
  return isPaidPlan(plan) ? "starter" : "free";
}
