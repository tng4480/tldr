"use client";

import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "next-auth/react";

type ProfileData = {
  email: string | null;
  plan: string;
  subscription_status: string;
  trial_active: boolean;
  trial_ends_at: string | null;
  monthly_usage: number;
  monthly_limit: number;
  monthly_usage_period: string;
  usage_window?: "lifetime" | "monthly";
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
  const [revokeLoading, setRevokeLoading] = useState(false);

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
        window.location.assign(data.url);
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

  async function handleRevokeTokens() {
    setRevokeLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/extension/token/revoke", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to revoke extension tokens.");
      }
      setProfile((prev) => (prev ? { ...prev, extensionToken: undefined } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke extension tokens.");
    } finally {
      setRevokeLoading(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-transparent" />
            Loading session...
          </div>
        </main>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <Alert>
            <AlertTitle>Sign in required</AlertTitle>
            <AlertDescription>
              Sign in to view your account details and manage your subscription.
            </AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold text-foreground">Your account</h1>
            <Button variant="outline" onClick={handlePortal} disabled={portalLoading}>
              {portalLoading ? "Opening portal..." : "Manage subscription"}
            </Button>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {loading ? (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-transparent" />
              Loading account details...
            </div>
          ) : profile ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Plan overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Plan: {profile.plan}</Badge>
                    <Badge variant="secondary">Status: {profile.subscription_status}</Badge>
                    {profile.cancel_at_period_end ? <Badge variant="warning">Cancels at period end</Badge> : null}
                  </div>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li>Email: {profile.email ?? "Unknown"}</li>
                    <li>
                      Usage: {profile.monthly_usage} / {profile.monthly_limit}{" "}
                      {profile.usage_window === "lifetime" ? "lifetime" : "this month"}
                    </li>
                    <li>Usage period: {profile.usage_window === "lifetime" ? "Lifetime" : profile.monthly_usage_period || "Not set"}</li>
                    <li>Trial active: {profile.trial_active ? "Yes" : "No"}</li>
                    <li>
                      Trial ends:{" "}
                      {profile.trial_ends_at ? new Date(profile.trial_ends_at).toLocaleDateString() : "N/A"}
                    </li>
                    <li>
                      Current period end:{" "}
                      {profile.current_period_end
                        ? new Date(profile.current_period_end).toLocaleDateString()
                        : "N/A"}
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Browser extension access</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Generate a token for the browser extension. Keep it private.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handleToken} disabled={loading || revokeLoading}>
                      Mint extension token
                    </Button>
                    <Button variant="outline" onClick={handleRevokeTokens} disabled={loading || revokeLoading}>
                      {revokeLoading ? "Revoking..." : "Revoke all tokens"}
                    </Button>
                  </div>
                  {profile.extensionToken ? (
                    <Alert>
                      <AlertTitle>New extension token</AlertTitle>
                      <AlertDescription>{profile.extensionToken}</AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No profile data available yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
