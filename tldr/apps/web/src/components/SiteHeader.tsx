"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signIn, signOut, useSession } from "next-auth/react";

export default function SiteHeader() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-border/95 bg-[hsl(214_42%_12%/0.92)] backdrop-blur supports-[backdrop-filter]:bg-[hsl(214_42%_12%/0.85)]">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-display text-lg font-bold uppercase tracking-[0.03em] text-foreground">
            Clarity Companion
          </Link>
          <span className="hidden text-[11px] uppercase tracking-[0.06em] text-muted-foreground sm:inline">
            Reading simplifier with opt-in AI
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          <Button asChild variant="ghost" className="h-9 px-3 text-sm text-foreground/88 hover:text-foreground">
            <Link href="/examples/hard-text">Hard text demo</Link>
          </Button>
          <Button asChild variant="ghost" className="h-9 px-3 text-sm text-foreground/88 hover:text-foreground">
            <Link href="/pricing">Pricing</Link>
          </Button>
          <Button asChild variant="ghost" className="h-9 px-3 text-sm text-foreground/88 hover:text-foreground">
            <Link href="/read-pdf">Read PDF</Link>
          </Button>
          <Button asChild variant="ghost" className="h-9 px-3 text-sm text-foreground/88 hover:text-foreground">
            <Link href="/account">Account</Link>
          </Button>
          {session?.user ? (
            <Button variant="outline" className="h-10 rounded-full px-5" onClick={() => signOut()}>
              Sign out
            </Button>
          ) : (
            <>
              <Button variant="outline" className="h-10 rounded-full px-5" onClick={() => signIn("google")}>
                Sign in with Google
              </Button>
              <Button variant="ghost" className="h-9 px-3 text-sm text-foreground/88 hover:text-foreground" onClick={() => signIn("github")}>
                Sign in with GitHub
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
