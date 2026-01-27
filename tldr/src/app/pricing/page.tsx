"use client";

import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  List,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useSession } from "next-auth/react";
import SiteHeader from "@/components/SiteHeader";

const tiers = [
  {
    name: "Free",
    price: "£0",
    description: "Client-side analysis with a small monthly simplification allowance.",
    features: ["20 AI simplifications per month", "Local readability insights", "Browser extension-ready"],
    tier: "free" as const,
  },
  {
    name: "Starter",
    price: "£9",
    description: "For students and busy teams who need steady help.",
    features: ["200 AI simplifications per month", "Priority processing", "Access to trials"],
    tier: "starter" as const,
  },
  {
    name: "Pro",
    price: "£19",
    description: "For heavy reading workloads and content teams.",
    features: ["1,000 AI simplifications per month", "Fastest responses", "Team-friendly usage"],
    tier: "pro" as const,
  },
];

export default function PricingPage() {
  const { data: session } = useSession();
  async function handlePortal() {
    const response = await fetch("/api/stripe/portal", { method: "POST" });
    if (response.ok) {
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    }
  }

  async function handleSubscribe(tier: "starter" | "pro") {
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    }
  }

  return (
    <Stack gap="xl">
      <SiteHeader />
      <Container size="lg" py="xl">
        <Stack gap="lg" align="center">
          <Badge variant="light" color="indigo" size="lg">
            14-day trial included
          </Badge>
          <Title order={2}>Pricing that keeps reading simple.</Title>
          <Text c="dimmed" ta="center" maw={600}>
            Choose a plan for AI-powered simplification. Local analysis is always included.
          </Text>
          {session?.user ? (
            <Button variant="light" onClick={handlePortal}>
              Manage subscription
            </Button>
          ) : null}
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg" w="100%">
            {tiers.map((tier) => (
              <Card key={tier.name} withBorder radius="md" padding="lg">
                <Stack gap="md">
                  <Group justify="space-between">
                    <Title order={3}>{tier.name}</Title>
                    {tier.tier !== "free" ? <Badge color="indigo">Popular</Badge> : null}
                  </Group>
                  <Text fw={700} size="xl">
                    {tier.price}
                    <Text span size="sm" c="dimmed">
                      /month
                    </Text>
                  </Text>
                  <Text c="dimmed">{tier.description}</Text>
                  <List spacing="xs">
                    {tier.features.map((feature) => (
                      <List.Item key={feature}>{feature}</List.Item>
                    ))}
                  </List>
                  {tier.tier === "free" ? (
                    <Button variant="light">Included</Button>
                  ) : (
                    <Button
                      onClick={() => handleSubscribe(tier.tier)}
                      disabled={!session?.user}
                    >
                      {session?.user ? "Start subscription" : "Sign in to subscribe"}
                    </Button>
                  )}
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>
    </Stack>
  );
}
