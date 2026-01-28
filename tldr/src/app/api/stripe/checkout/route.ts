import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const PRICE_MAP = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID,
};

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json();
  const tier = body?.tier as keyof typeof PRICE_MAP;
  const priceId = PRICE_MAP[tier];

  if (!priceId) {
    return NextResponse.json({ error: "Invalid tier." }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("stripe_customer_id, email")
    .eq("id", userId)
    .maybeSingle();

  let stripeCustomerId = profile?.stripe_customer_id ?? null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? session?.user?.email ?? undefined,
      metadata: { user_id: userId },
    });
    stripeCustomerId = customer.id;
    await supabaseAdmin
      .from("user_profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", userId);
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: process.env.STRIPE_SUCCESS_URL ?? "",
    cancel_url: process.env.STRIPE_CANCEL_URL ?? "",
  });

  return NextResponse.json({ url: checkoutSession.url });
}
