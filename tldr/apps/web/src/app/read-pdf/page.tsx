"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { HighlightSpan } from "@tldr/core";
import { computeSpacyStyleHighlights, extractDateHighlights } from "@tldr/core";
import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { mapSpansToHighlightRects } from "@/lib/pdf/boldMap";
import { exportHighlightedPdf } from "@/lib/pdf/exportPseudoBold";
import { ocrProvider } from "@/lib/pdf/ocr";
import { parsePdfFile } from "@/lib/pdf/parse";
import type { ParsedPdfDocument } from "@/lib/pdf/types";

type RsvpToken = {
  word: string;
  start: number;
  end: number;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHighlightSpans(text: string): HighlightSpan[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const keywordSpans = computeSpacyStyleHighlights(normalized);
  const dateTerms = extractDateHighlights(normalized, 48);
  const dateSpans: HighlightSpan[] = [];

  dateTerms.forEach((term) => {
    const regex = new RegExp(escapeRegExp(term), "gi");
    let match: RegExpExecArray | null = regex.exec(normalized);
    while (match) {
      dateSpans.push({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
      match = regex.exec(normalized);
    }
  });

  const overlaps = (span: HighlightSpan) =>
    keywordSpans.some((keyword) => span.start < keyword.end && span.end > keyword.start);
  const merged = [...keywordSpans, ...dateSpans.filter((span) => !overlaps(span))];

  return merged.sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return b.end - b.start - (a.end - a.start);
  });
}

function tokenize(text: string): RsvpToken[] {
  const tokens: RsvpToken[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match) {
    const word = match[0];
    const start = match.index;
    tokens.push({ word, start, end: start + word.length });
    match = regex.exec(text);
  }
  return tokens;
}

function getAnchorIndex(word: string): number {
  if (word.length <= 1) {
    return 0;
  }
  if (word.length <= 5) {
    return 1;
  }
  if (word.length <= 9) {
    return 2;
  }
  return 3;
}

function splitWordForRsvp(word: string) {
  if (!word) {
    return { left: "", anchor: "", right: "" };
  }
  const index = Math.min(getAnchorIndex(word), word.length - 1);
  return {
    left: word.slice(0, index),
    anchor: word[index] ?? "",
    right: word.slice(index + 1),
  };
}

function saveBytesAsFile(bytes: Uint8Array, fileName: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const arrayBuffer = copy.buffer as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ReadPdfPage() {
  const [parsedPdf, setParsedPdf] = useState<ParsedPdfDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wpm, setWpm] = useState(450);
  const [rsvpIndex, setRsvpIndex] = useState(0);
  const [rsvpPlaying, setRsvpPlaying] = useState(false);
  const [highlightOffsetPct, setHighlightOffsetPct] = useState(50);
  const [highlightOpacityPct, setHighlightOpacityPct] = useState(38);
  const [downloadState, setDownloadState] = useState<{ isLoading: boolean; error: string | null }>({
    isLoading: false,
    error: null,
  });

  const fullText = parsedPdf?.fullText ?? "";

  const spans = useMemo(() => buildHighlightSpans(fullText), [fullText]);
  const highlightRects = useMemo(() => mapSpansToHighlightRects(parsedPdf?.pages ?? [], spans), [parsedPdf?.pages, spans]);
  const tokens = useMemo(() => tokenize(fullText), [fullText]);
  const currentToken = tokens[Math.min(rsvpIndex, Math.max(0, tokens.length - 1))];
  const rsvpWord = splitWordForRsvp(currentToken?.word ?? "");

  useEffect(() => {
    setRsvpIndex(0);
    setRsvpPlaying(false);
  }, [fullText]);

  useEffect(() => {
    if (!rsvpPlaying || !tokens.length) {
      return;
    }
    if (rsvpIndex >= tokens.length) {
      setRsvpPlaying(false);
      return;
    }
    const ms = Math.max(1, Math.round(60000 / wpm));
    const timeoutId = window.setTimeout(() => {
      setRsvpIndex((prev) => prev + 1);
    }, ms);
    return () => window.clearTimeout(timeoutId);
  }, [rsvpIndex, rsvpPlaying, tokens.length, wpm]);

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }
    setLoading(true);
    setError(null);
    setParsedPdf(null);
    setDownloadState({ isLoading: false, error: null });

    try {
      const parsed = await parsePdfFile(file);
      setParsedPdf(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to parse this PDF.");
    } finally {
      setLoading(false);
      event.currentTarget.value = "";
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (!parsedPdf) {
      return;
    }
    setDownloadState({ isLoading: true, error: null });
    try {
      const output = await exportHighlightedPdf(parsedPdf.bytes, highlightRects);
      const baseName = parsedPdf.fileName.replace(/\.pdf$/i, "");
      saveBytesAsFile(output, `${baseName || "document"}.highlighted.pdf`);
      setDownloadState({ isLoading: false, error: null });
    } catch (err) {
      setDownloadState({
        isLoading: false,
        error: err instanceof Error ? err.message : "Unable to export PDF.",
      });
    }
  }, [highlightRects, parsedPdf]);

  const warnings = useMemo(() => {
    const list = [...(parsedPdf?.warnings ?? [])];
    if (list.some((item) => item.code === "NO_TEXT_LAYER" || item.code === "LOW_TEXT_DENSITY") && !ocrProvider.isAvailable()) {
      list.push({
        code: "OCR_NOT_CONFIGURED",
        message: "OCR fallback is not configured yet. Scanned pages cannot be fully keyword-highlighted.",
      });
    }
    return list;
  }, [parsedPdf]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Read PDF</CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload a PDF to parse text, highlight key terms in-page, run RSVP, and download a highlighted PDF export.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pdf-upload">Upload PDF</Label>
                <input
                  id="pdf-upload"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="block w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{loading ? "Parsing..." : "Client-side parsing"}</Badge>
                <Badge variant="secondary">Non-keywords shown as highlights</Badge>
                <Badge variant="secondary">Best-effort highlighted export</Badge>
              </div>
              {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
              {warnings.map((warning, index) => (
                <p key={`${warning.code}-${index}`} className="text-sm text-amber-700">
                  {warning.message}
                </p>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
            <Card>
              <CardHeader>
                <CardTitle>RSVP</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border border-border bg-muted/40 p-4 text-center font-mono text-3xl">
                  <span className="text-muted-foreground">{rsvpWord.left}</span>
                  <span className="text-orange-600">{rsvpWord.anchor || "."}</span>
                  <span className="text-muted-foreground">{rsvpWord.right}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setRsvpPlaying(true)} disabled={!tokens.length}>
                    Start
                  </Button>
                  <Button variant="outline" onClick={() => setRsvpPlaying((prev) => !prev)} disabled={!tokens.length}>
                    {rsvpPlaying ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRsvpPlaying(false);
                      setRsvpIndex(0);
                    }}
                    disabled={!tokens.length}
                  >
                    Reset
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rsvp-wpm">Words per minute: {wpm}</Label>
                  <input
                    id="rsvp-wpm"
                    type="range"
                    min={150}
                    max={700}
                    step={10}
                    value={wpm}
                    onChange={(event) => setWpm(Number(event.currentTarget.value))}
                    className="w-full"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Tokens: {tokens.length.toLocaleString()} | Highlight matches: {highlightRects.length.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Download</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Export creates a new PDF by overlaying keyword highlights. Layout and images are preserved.
                </p>
                <Button onClick={handleDownload} disabled={!parsedPdf || downloadState.isLoading}>
                  {downloadState.isLoading ? "Generating..." : "Download highlighted PDF"}
                </Button>
                {downloadState.error ? <p className="text-sm text-destructive">{downloadState.error}</p> : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>PDF View</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 rounded-md border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="highlight-offset">Highlight vertical offset: {highlightOffsetPct}%</Label>
                  <input
                    id="highlight-offset"
                    type="range"
                    min={0}
                    max={50}
                    step={1}
                    value={highlightOffsetPct}
                    onChange={(event) => setHighlightOffsetPct(Number(event.currentTarget.value))}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="highlight-opacity">Highlight opacity: {highlightOpacityPct}%</Label>
                  <input
                    id="highlight-opacity"
                    type="range"
                    min={10}
                    max={80}
                    step={1}
                    value={highlightOpacityPct}
                    onChange={(event) => setHighlightOpacityPct(Number(event.currentTarget.value))}
                    className="w-full"
                  />
                </div>
              </div>
              {!parsedPdf ? (
                <p className="text-sm text-muted-foreground">Upload a PDF to preview it here.</p>
              ) : (
                parsedPdf.pages.map((page) => {
                  const pageRects = highlightRects.filter((rect) => rect.pageIndex === page.pageIndex);
                  return (
                    <div key={`page-${page.pageIndex}`} className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Page {page.pageIndex + 1}</p>
                      <div className="overflow-x-auto rounded-md border border-border bg-white">
                        <div
                          className="relative"
                          style={{ width: `${page.width}px`, height: `${page.height}px` }}
                        >
                          <img
                            src={page.imageDataUrl}
                            alt={`PDF page ${page.pageIndex + 1}`}
                            className="absolute left-0 top-0 block"
                            style={{ width: `${page.width}px`, height: `${page.height}px` }}
                          />
                          <div className="pointer-events-none absolute inset-0">
                            {pageRects.map((rect, index) => (
                              <div
                                key={`rect-${page.pageIndex}-${index}`}
                                className="absolute rounded-[2px]"
                                style={{
                                  left: `${rect.viewportX}px`,
                                  top: `${rect.viewportTop + Math.max(2, rect.viewportHeight * (highlightOffsetPct / 100))}px`,
                                  width: `${rect.viewportWidth}px`,
                                  height: `${rect.viewportHeight}px`,
                                  backgroundColor: `rgba(252, 211, 77, ${Math.max(0.1, Math.min(0.9, highlightOpacityPct / 100))})`,
                                  border: `1px solid rgba(245, 158, 11, ${Math.max(0.08, Math.min(0.6, (highlightOpacityPct / 100) * 0.55))})`,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
