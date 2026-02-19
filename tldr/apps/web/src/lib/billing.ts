export type PlanTier = "free" | "starter" | "pro";

export const PLAN_LIMITS: Record<PlanTier, number> = {
  free: 20,
  starter: 100,
  pro: 1000,
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
  return PLAN_LIMITS.starter;
}

export function mapPriceIdToPlan(priceId?: string | null): PlanTier {
  if (!priceId) {
    return "free";
  }
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
    return "pro";
  }
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) {
    return "starter";
  }
  return "free";
}
