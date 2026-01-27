import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripe } from "@/lib/stripe";
import { computeUsagePeriod, getTrialLimit, TRIAL_DAYS } from "@/lib/billing";

export async function ensureUserProfile(user: { id: string; email?: string | null; name?: string | null }) {
  const { data: existing, error } = await supabaseAdmin
    .from("user_profiles")
    .select("id, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read user profile: ${error.message}`);
  }

  if (existing) {
    return existing;
  }

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: user.name ?? undefined,
    metadata: { user_id: user.id },
  });

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const usagePeriod = computeUsagePeriod();

  const { error: insertError } = await supabaseAdmin.from("user_profiles").insert({
    id: user.id,
    email: user.email ?? null,
    stripe_customer_id: customer.id,
    trial_active: true,
    trial_ends_at: trialEndsAt,
    monthly_limit: getTrialLimit(),
    monthly_usage_period: usagePeriod,
  });

  if (insertError) {
    throw new Error(`Failed to create user profile: ${insertError.message}`);
  }

  return { id: user.id, stripe_customer_id: customer.id };
}
