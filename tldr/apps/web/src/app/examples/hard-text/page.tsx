import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const HARD_TEXT = `Pursuant to the aforementioned provisions (as amended, supplemented, restated, and otherwise modified from time to time), any recipient of this communication (the "Recipient") shall, as a condition precedent to continued access, acknowledge that interpretive ambiguity may arise in connection with any forward-looking statements, including (without limitation) statements regarding anticipated timelines, prospective deliverables, contingent dependencies, and any other non-historical assertions, whether express or implied.

Notwithstanding anything to the contrary herein, the Recipient must (i) review the entirety of the materials in sequence, (ii) document all deviations (including de minimis deviations) from the baseline requirements, and (iii) submit a consolidated memorandum that enumerates each deviation, identifies its purported root cause, and proposes remediative measures that are feasible under reasonable operational constraints; provided, however, that no such measures shall be construed as waiving any rights, remedies, or defenses available at law or in equity.

Effective January 15, 2026, and continuing through March 31, 2026 (the "Evaluation Window"), all requests shall be triaged in accordance with a multi-factor prioritization rubric that incorporates (a) criticality, (b) complexity, (c) stakeholder impact, and (d) reversibility; accordingly, requests that are non-reversible and high-impact may be escalated, whereas low-impact requests may be deferred absent a compelling justification that is both contemporaneously recorded and subsequently auditable.

If, at any time, the Recipient is unable to comply due to unforeseen circumstances (including, by way of illustration, infrastructural instability, jurisdictional constraints, or contractual incompatibilities), the Recipient shall provide written notice within forty-eight (48) hours, including a detailed explanation, a best-efforts mitigation plan, and an updated projection, and shall refrain from implementing any workaround that could reasonably be expected to introduce systemic regressions, data integrity anomalies, or security externalities.`;

export default function HardTextExamplePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6">
        <div className="space-y-10">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Hard-to-read example text</CardTitle>
              <p className="text-sm text-muted-foreground">
                Use this page as a torture test for readability scoring, hard sentence detection, and paragraph
                simplification.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild>
                  <Link href={`/?text=${encodeURIComponent(HARD_TEXT)}`}>Open in simplifier</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/">Back to home</Link>
                </Button>
              </div>
              <Separator />
              <div className="rounded-2xl border border-border bg-muted/55 p-4">
                <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                  {HARD_TEXT}
                </pre>
              </div>
              <p className="text-xs text-muted-foreground">
                Note: this text is intentionally dense (long sentences, nested clauses, abstract nouns, and legal-ish
                qualifiers).
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
