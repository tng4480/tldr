"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import SiteHeader from "@/components/SiteHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LATEST_EXTENSION_VERSION, LATEST_EXTENSION_ZIP_URL } from "@/lib/extensionRelease";

type MintedToken = {
  token: string;
  expiresAt: string;
};

export default function ExtensionPage() {
  const { data: session, status } = useSession();
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mintedToken, setMintedToken] = useState<MintedToken | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function handleMintToken() {
    setMinting(true);
    setMintError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/extension/token", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to mint extension token.");
      }

      const data = await response.json();
      setMintedToken({
        token: data.token,
        expiresAt: data.expiresAt,
      });
    } catch (error) {
      setMintError(error instanceof Error ? error.message : "Unable to mint extension token.");
    } finally {
      setMinting(false);
    }
  }

  async function handleCopyToken() {
    if (!mintedToken?.token) {
      return;
    }
    try {
      await navigator.clipboard.writeText(mintedToken.token);
      setCopied(true);
    } catch {
      setMintError("Unable to copy token. Copy it manually.");
    }
  }

  async function handleRevokeTokens() {
    setRevoking(true);
    setMintError(null);
    try {
      const response = await fetch("/api/extension/token/revoke", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Unable to revoke extension tokens.");
      }
      setMintedToken(null);
      setCopied(false);
    } catch (error) {
      setMintError(error instanceof Error ? error.message : "Unable to revoke extension tokens.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Badge variant="secondary">Browser extension</Badge>
            <h1 className="text-3xl font-semibold text-foreground">Use tldr in any reading tab</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Mint an extension token and follow these steps to use bubble highlights, sidepanel highlights, and RSVP.
            </p>
          </div>

          <Card>
            <CardHeader className="space-y-3">
              <CardTitle>Download latest extension</CardTitle>
              <p className="text-sm text-muted-foreground">Current version: v{LATEST_EXTENSION_VERSION}</p>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <a href={LATEST_EXTENSION_ZIP_URL}>Download .zip</a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Upload your newest extension zip and update <span className="font-mono">src/lib/extensionRelease.ts</span>.
              </p>
            </CardContent>
          </Card>

          {status === "loading" ? (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-transparent" />
              Loading session...
            </div>
          ) : (
            <Card>
              <CardHeader className="space-y-3">
                <CardTitle>Mint extension token</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Keep this token private. It authorizes extension API requests for your account.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {session?.user ? (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleMintToken} disabled={minting || revoking}>
                      {minting ? "Minting..." : "Mint extension token"}
                    </Button>
                    <Button variant="outline" onClick={handleRevokeTokens} disabled={minting || revoking}>
                      {revoking ? "Revoking..." : "Revoke all tokens"}
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => signIn("google")}>Sign in to mint token</Button>
                )}

                {mintError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Token mint failed</AlertTitle>
                    <AlertDescription>{mintError}</AlertDescription>
                  </Alert>
                ) : null}

                {mintedToken ? (
                  <Alert>
                    <AlertTitle>New extension token</AlertTitle>
                    <AlertDescription className="space-y-3">
                      <p className="break-all font-mono text-xs text-foreground">{mintedToken.token}</p>
                      <p className="text-xs text-muted-foreground">
                        Expires: {new Date(mintedToken.expiresAt).toLocaleString()}
                      </p>
                      <Button variant="outline" className="h-8 px-3 text-xs" onClick={handleCopyToken}>
                        {copied ? "Copied" : "Copy token"}
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>How the bubble works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                On pages with significant readable text (about 200+ words), the tldr floating bubble appears in the
                bottom-right corner.
              </p>
              <p>
                Click the bubble to open it, then press <span className="text-foreground">Highlight key phrases</span>{" "}
                to emphasize keywords on the page.
              </p>
              <p>Use <span className="text-foreground">Clear highlights</span> to reset the page.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How the sidepanel works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Open the sidepanel from the extension icon.</p>
              <p>
                In <span className="text-foreground">Actions</span>, click{" "}
                <span className="text-foreground">Highlight keywords</span> to run keyword highlighting from the
                sidepanel.
              </p>
              <p>
                The sidepanel also includes RSVP controls so you can read one word at a time at adjustable speed.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How to use RSVP</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                To start from the top of a page: open the sidepanel, go to{" "}
                <span className="text-foreground">Rapid serial visual presentation</span>, then press{" "}
                <span className="text-foreground">Start</span>.
              </p>
              <p>
                To start from a specific place: highlight/select the text where you want to begin, right-click, and
                choose <span className="text-foreground">Start RSVP</span>. The sidepanel opens and starts from your
                selected location.
              </p>
              <p>
                If cookie-based connection fails, mint a token here and paste it into the sidepanel account tab using{" "}
                <span className="text-foreground">Use pasted token</span>.
              </p>
              <p>
                Use <span className="text-foreground">Pause/Resume</span>,{" "}
                <span className="text-foreground">Rewind sentence</span>,{" "}
                <span className="text-foreground">Skip sentence</span>, and the WPM slider to control speed and flow.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
