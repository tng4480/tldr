import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
const SUCCESS_URL = process.env.STRIPE_SUCCESS_URL;

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "Customer missing." }, { status: 400 });
  }
  if (!SUCCESS_URL) {
    return NextResponse.json({ error: "Billing configuration is incomplete." }, { status: 500 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: SUCCESS_URL,
  });

  return NextResponse.json({ url: portalSession.url });
}
