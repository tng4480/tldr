"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signIn, signOut, useSession } from "next-auth/react";

export default function SiteHeader() {
  const { data: session } = useSession();

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-semibold text-indigo-700">
            Clarity Companion
          </Link>
          <span className="text-sm text-muted-foreground">
            Reading simplifier with opt-in AI
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
