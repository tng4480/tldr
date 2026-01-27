"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  List,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";

type ProfileData = {
  email: string | null;
  plan: string;
  subscription_status: string;
  trial_active: boolean;
  trial_ends_at: string | null;
  monthly_usage: number;
  monthly_limit: number;
  monthly_usage_period: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  extensionToken?: string;
};

export default function AccountPage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      if (!session?.user) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/account");
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error ?? "Unable to load account.");
        }
        const data = await response.json();
        setProfile(data.profile);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load account.");
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [session?.user]);

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to open billing portal.");
      }
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleToken() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/extension/token", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to mint token.");
      }
      const data = await response.json();
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              extensionToken: data.token,
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mint token.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") {
    return (
      <Stack gap="xl">
        <SiteHeader />
        <Container size="lg" py="xl">
          <Group>
            <Loader />
            <Text>Loading session…</Text>
          </Group>
        </Container>
      </Stack>
    );
  }

  if (!session?.user) {
    return (
      <Stack gap="xl">
        <SiteHeader />
        <Container size="lg" py="xl">
          <Alert color="indigo" title="Sign in required">
            Sign in to view your account details and manage your subscription.
          </Alert>
        </Container>
      </Stack>
    );
  }

  return (
    <Stack gap="xl">
      <SiteHeader />
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <Title order={2}>Your account</Title>
            <Button variant="light" loading={portalLoading} onClick={handlePortal}>
              Manage subscription
            </Button>
          </Group>
          {error ? <Alert color="red">{error}</Alert> : null}
          {loading ? (
            <Group>
              <Loader />
              <Text>Loading account details…</Text>
            </Group>
          ) : profile ? (
            <Stack gap="lg">
              <Card withBorder>
                <Stack gap="sm">
                  <Title order={4}>Plan overview</Title>
                  <Group gap="xs">
                    <Badge color="indigo">Plan: {profile.plan}</Badge>
                    <Badge color="teal">Status: {profile.subscription_status}</Badge>
                    {profile.cancel_at_period_end ? (
                      <Badge color="orange">Cancels at period end</Badge>
                    ) : null}
                  </Group>
                  <List spacing="xs">
                    <List.Item>Email: {profile.email ?? "Unknown"}</List.Item>
                    <List.Item>Monthly usage: {profile.monthly_usage}</List.Item>
                    <List.Item>Monthly limit: {profile.monthly_limit}</List.Item>
                    <List.Item>Usage period: {profile.monthly_usage_period || "Not set"}</List.Item>
                    <List.Item>
                      Trial active: {profile.trial_active ? "Yes" : "No"}
                    </List.Item>
                    <List.Item>
                      Trial ends: {profile.trial_ends_at ? new Date(profile.trial_ends_at).toLocaleDateString() : "N/A"}
                    </List.Item>
                    <List.Item>
                      Current period end: {profile.current_period_end ? new Date(profile.current_period_end).toLocaleDateString() : "N/A"}
                    </List.Item>
                  </List>
                </Stack>
              </Card>
              <Card withBorder>
                <Stack gap="sm">
                  <Title order={4}>Browser extension access</Title>
                  <Text size="sm" c="dimmed">
                    Generate a token for the upcoming browser extension. Keep it private.
                  </Text>
                  <Group>
                    <Button variant="outline" onClick={handleToken}>
                      Mint extension token
                    </Button>
                  </Group>
                  {profile.extensionToken ? (
                    <Alert color="indigo" title="New extension token">
                      {profile.extensionToken}
                    </Alert>
                  ) : null}
                </Stack>
              </Card>
            </Stack>
          ) : (
            <Text c="dimmed">No profile data available yet.</Text>
          )}
        </Stack>
      </Container>
    </Stack>
  );
}
