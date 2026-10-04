import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ExtensionPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Badge variant="secondary">Browser extension</Badge>
            <h1 className="text-3xl font-semibold text-foreground">Use tldr in any reading tab</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Bubble highlights, sidepanel highlights and RSVP. No account or sign-in is needed.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Install (Chrome/Edge)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Download the latest extension zip from the GitHub Releases page, or build it from source.</li>
                <li>Extract the zip to a folder.</li>
                <li>Open the browser&apos;s extensions page and enable Developer mode.</li>
                <li>Click Load unpacked and select the extracted folder.</li>
                <li>For updates, remove the old extension and load the new folder.</li>
              </ol>
            </CardContent>
          </Card>

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
                The sidepanel also includes RSVP controls so you can read one word at a time at adjustable speed, and a
                Settings tab for the theme, highlight contrast and bubble visibility.
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
