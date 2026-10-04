import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-[#071a31]/72 backdrop-blur-xl supports-[backdrop-filter]:bg-[#071a31]/58">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-lg font-semibold uppercase tracking-wide text-foreground">
            tldr
          </Link>
          <span className="hidden text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:inline">
            Reading simplifier
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          <Button asChild variant="ghost" className="h-9 px-3 text-sm text-foreground/88 hover:text-foreground">
            <Link href="/extension">Extension</Link>
          </Button>
          <Button asChild variant="ghost" className="h-9 px-3 text-sm text-foreground/88 hover:text-foreground">
            <Link href="/read-pdf">Read Files</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
