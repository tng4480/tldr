import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const STARTER_PRICE_ID = process.env.STRIPE_STARTER_PRICE_ID;
const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL;
const CANCEL_URL = process.env.STRIPE_CANCEL_URL;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json();
  const tier = body?.tier as "free" | "starter" | "pro" | undefined;

  if (tier === "free") {
    return NextResponse.json({ error: "Free plan does not require checkout." }, { status: 400 });
  }

  if (tier === "pro") {
    return NextResponse.json({ error: "Pro is unavailable during public beta." }, { status: 400 });
  }

  if (tier !== "starter") {
    return NextResponse.json({ error: "Invalid tier." }, { status: 400 });
  }

  if (!STARTER_PRICE_ID || !SUCCESS_URL || !CANCEL_URL) {
    return NextResponse.json({ error: "Billing configuration is incomplete." }, { status: 500 });
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
    line_items: [{ price: STARTER_PRICE_ID, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
