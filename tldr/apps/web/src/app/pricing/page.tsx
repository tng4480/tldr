"use client";

import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "next-auth/react";

const tiers = [
  {
    name: "Free",
    price: "£0",
    description: "Client-side analysis with a one-time simplification allowance.",
    features: ["20 AI simplifications lifetime", "Local readability insights", "Browser extension-ready"],
    tier: "free" as const,
  },
  {
    name: "Starter",
    price: "£5",
    description: "For students and busy teams who need steady help.",
    features: ["100 AI simplifications per month", "Priority processing", "Access to trial features"],
    tier: "starter" as const,
  },
];

export default function PricingPage() {
  const { data: session } = useSession();

  async function handlePortal() {
    const response = await fetch("/api/stripe/portal", {
      method: "POST",
    });
    if (response.ok) {
      const data = await response.json();
      if (data.url) {
        window.location.assign(data.url);
      }
    }
  }

  async function handleSubscribe(tier: "starter") {
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tier }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.url) {
        window.location.assign(data.url);
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          {/* <Badge variant="secondary" className="text-sm">
            14-day trial included
          </Badge> */}
          <h1 className="text-3xl font-semibold text-foreground">Pricing that keeps reading simple.</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Choose a plan for AI-powered simplification. Local analysis is always included.
          </p>
          {session?.user ? (
            <Button variant="outline" onClick={handlePortal}>
              Manage subscription
            </Button>
          ) : null}
        </div>
        <div className="mx-auto mt-10 grid w-full max-w-5xl gap-6 md:grid-cols-2">
          {tiers.map((tier) => (
            <Card key={tier.name}>
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-between">
                  <CardTitle>{tier.name}</CardTitle>
                  {tier.tier !== "free" ? <Badge>Popular</Badge> : null}
                </div>
                <div className="text-3xl font-semibold text-foreground">
                  {tier.price}
                  {tier.tier === "free" ? null : (
                    <span className="text-sm font-normal text-muted-foreground">/month</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{tier.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-foreground/90">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className="mt-1 h-2 w-2 rounded-full bg-secondary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {tier.tier === "free" ? (
                  <Button variant="secondary" className="w-full">
                    Included
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => handleSubscribe(tier.tier)} disabled={!session?.user}>
                    {session?.user ? "Start subscription" : "Sign in to subscribe"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
