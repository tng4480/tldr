import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlanLimit, mapPriceIdToPlan } from "@/lib/billing";

export const runtime = "nodejs";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

async function updateSubscriptionProfile(subscription: Stripe.Subscription) {
  // Stripe's API includes `current_period_end`, but type definitions can vary by version/api config.
  const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number | null })
    .current_period_end;
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const plan = mapPriceIdToPlan(priceId);

  await supabaseAdmin
    .from("user_profiles")
    .update({
      plan,
      monthly_limit: getPlanLimit(plan),
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      current_period_end: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    })
    .eq("stripe_customer_id", subscription.customer as string);
}

export async function POST(request: Request) {
  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing webhook secret." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        await updateSubscriptionProfile(subscription);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscriptionProfile(subscription);
      break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      };
      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id ?? null;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await updateSubscriptionProfile(subscription);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
