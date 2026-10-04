import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-12 sm:px-6">
        <div className="space-y-10">
          <Card className="overflow-hidden border-border/70 bg-card/92 shadow-[0_22px_58px_rgba(1,8,20,0.55)]">
            <CardHeader className="space-y-4 pb-5">
              <div>
                <Badge variant="secondary" className="rounded-full px-4 py-1.5 text-sm font-semibold">
                  Everything runs on your device
                </Badge>
              </div>
              <CardTitle className="text-4xl font-semibold uppercase tracking-tight sm:text-5xl">
                Read long pages faster.
              </CardTitle>
              <p className="max-w-3xl text-lg text-muted-foreground">
                tldr highlights the key phrases in what you read and can step through any text one word at a time. There
                are no accounts and no servers: your text never leaves your browser.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/extension">Get the browser extension</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/read-pdf">Read a file</Link>
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Keyword highlights</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Noun phrases, names, numbers and dates are picked out so you can skim a page and still catch what
                matters.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>RSVP reader</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Rapid serial visual presentation shows one word at a time at a speed you choose, starting from the top of
                a page or from any selection.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>File reader</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Open PDF, DOCX or plain text files, highlight them, and export a PDF with the key phrases emboldened.
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
