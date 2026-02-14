"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signIn, signOut, useSession } from "next-auth/react";

export default function SiteHeader() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-border/90 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card px-3 py-2 shadow-[0_8px_18px_rgba(0,0,0,0.06)]">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
            Clarity Companion
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Reading simplifier with opt-in AI
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/examples/hard-text">Hard text demo</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/pricing">Pricing</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/account">Account</Link>
          </Button>
          {session?.user ? (
            <Button variant="outline" onClick={() => signOut()}>
              Sign out
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => signIn("google")}>
                Sign in with Google
              </Button>
              <Button variant="ghost" onClick={() => signIn("github")}>
                Sign in with GitHub
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
