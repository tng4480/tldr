"use client";

import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { splitIntoSentences } from "@tldr/core";
import { useSession } from "next-auth/react";
import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { parseUploadedFile } from "@/lib/file/parseUploadedFile";
import type { ParsedDocument, RenderMode } from "@/lib/file/types";
import { applyDocxHighlights } from "@/lib/highlight/docxDomHighlight";
import { renderTextWithHighlights } from "@/lib/highlight/plainTextRender";
import { buildHighlightSpans, buildHighlightTerms } from "@/lib/highlight/spans";
import { mapSpansToHighlightRects } from "@/lib/pdf/boldMap";
import { ocrProvider } from "@/lib/pdf/ocr";
import { exportHighlightedPdf } from "@/lib/pdf/exportPseudoBold";

// PAYWALL
const READ_FILES_REQUIRES_PAID_PLAN = true;

type RsvpToken = {
  word: string;
  start: number;
  end: number;
};

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

function findTokenIndexForOffset(tokens: RsvpToken[], offset: number): number {
  if (!tokens.length) {
    return 0;
  }
  const index = tokens.findIndex((token) => offset >= token.start && offset < token.end);
  if (index >= 0) {
    return index;
  }
  const nextIndex = tokens.findIndex((token) => token.start >= offset);
  if (nextIndex >= 0) {
    return nextIndex;
  }
  return tokens.length - 1;
}

function buildRsvpSentenceStartIndexes(tokens: RsvpToken[], text: string): number[] {
  if (!tokens.length) {
    return [];
  }
  const starts = new Set<number>();
  starts.add(0);
  const sentences = splitIntoSentences(text);
  if (!sentences.length) {
    return [0];
  }

  let searchStart = 0;
  for (const sentence of sentences) {
    const normalizedSentence = sentence.trim();
    if (!normalizedSentence) {
      continue;
    }
    const index = text.indexOf(normalizedSentence, searchStart);
    if (index === -1) {
      continue;
    }
    starts.add(findTokenIndexForOffset(tokens, index));
    searchStart = index + normalizedSentence.length;
  }

  return Array.from(starts).sort((a, b) => a - b);
}

function saveBytesAsFile(bytes: Uint8Array, fileName: string, mimeType: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const arrayBuffer = copy.buffer as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: mimeType });
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
  const { data: session, status: sessionStatus } = useSession();
  const [mode, setMode] = useState<RenderMode>("preserve_layout");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedDocument, setParsedDocument] = useState<ParsedDocument | null>(null);
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
  const [accessState, setAccessState] = useState<"checking" | "allowed" | "blocked">(
    READ_FILES_REQUIRES_PAID_PLAN ? "checking" : "allowed",
  );

  const docxContainerRef = useRef<HTMLDivElement | null>(null);
  const fullText = parsedDocument?.fullText ?? "";
  const spans = useMemo(() => buildHighlightSpans(fullText), [fullText]);
  const highlightTerms = useMemo(() => buildHighlightTerms(spans), [spans]);

  const highlightRects = useMemo(() => {
    if (!parsedDocument || parsedDocument.fileType !== "pdf" || mode !== "preserve_layout") {
      return [];
    }
    return mapSpansToHighlightRects(parsedDocument.pages, spans);
  }, [mode, parsedDocument, spans]);

  const tokens = useMemo(() => tokenize(fullText), [fullText]);
  const rsvpSentenceStarts = useMemo(() => buildRsvpSentenceStartIndexes(tokens, fullText), [fullText, tokens]);
  const currentToken = tokens[Math.min(rsvpIndex, Math.max(0, tokens.length - 1))];
  const rsvpWord = splitWordForRsvp(currentToken?.word ?? "");
  const activeRange = currentToken ? { start: currentToken.start, end: currentToken.end } : null;

  const extractViewText = useMemo(() => {
    if (!parsedDocument) {
      return "";
    }
    if (parsedDocument.fileType === "txt") {
      return parsedDocument.extractedText;
    }
    if (parsedDocument.fileType === "docx") {
      return parsedDocument.extractedText;
    }
    return parsedDocument.fullText;
  }, [parsedDocument]);

  const preserveTxtText = useMemo(() => {
    if (!parsedDocument || parsedDocument.fileType !== "txt") {
      return "";
    }
    return parsedDocument.preservedText;
  }, [parsedDocument]);

  const parseAndSet = useCallback(async (file: File, selectedMode: RenderMode) => {
    setLoading(true);
    setError(null);
    setParsedDocument(null);
    setDownloadState({ isLoading: false, error: null });
    try {
      const parsed = await parseUploadedFile(file, selectedMode);
      setMode(parsed.mode);
      setParsedDocument(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to parse this file.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (!file) {
        return;
      }
      setSelectedFile(file);
      await parseAndSet(file, mode);
      event.currentTarget.value = "";
    },
    [mode, parseAndSet],
  );

  const handleModeChange = useCallback(
    async (nextMode: RenderMode) => {
      setMode(nextMode);
      if (selectedFile) {
        await parseAndSet(selectedFile, nextMode);
      }
    },
    [parseAndSet, selectedFile],
  );

  useEffect(() => {
    if (!READ_FILES_REQUIRES_PAID_PLAN) {
      setAccessState("allowed");
      return;
    }

    if (sessionStatus === "loading") {
      setAccessState("checking");
      return;
    }

    if (!session?.user) {
      setAccessState("blocked");
      return;
    }

    let active = true;
    const loadAccess = async () => {
      try {
        const response = await fetch("/api/account");
        if (!response.ok) {
          throw new Error("Unable to load account.");
        }
        const data = (await response.json()) as {
          profile?: { plan?: string; subscription_status?: string };
        };
        const plan = data.profile?.plan ?? "free";
        const status = data.profile?.subscription_status ?? "none";
        const isPaidPlan = plan !== "free" && (status === "active" || status === "trialing");
        if (active) {
          setAccessState(isPaidPlan ? "allowed" : "blocked");
        }
      } catch {
        if (active) {
          setAccessState("blocked");
        }
      }
    };

    void loadAccess();
    return () => {
      active = false;
    };
  }, [session?.user, sessionStatus]);

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

  useEffect(() => {
    if (!parsedDocument || parsedDocument.fileType !== "docx" || mode !== "preserve_layout") {
      return;
    }
    const container = docxContainerRef.current;
    if (!container) {
      return;
    }
    applyDocxHighlights(container, highlightTerms, "bold");
  }, [highlightTerms, mode, parsedDocument]);

  const handleDownload = useCallback(async () => {
    if (!parsedDocument || parsedDocument.fileType !== "pdf" || mode !== "preserve_layout") {
      return;
    }
    setDownloadState({ isLoading: true, error: null });
    try {
      const output = await exportHighlightedPdf(parsedDocument.bytes, highlightRects);
      const baseName = parsedDocument.fileName.replace(/\.pdf$/i, "");
      saveBytesAsFile(output, `${baseName || "document"}.highlighted.pdf`, "application/pdf");
      setDownloadState({ isLoading: false, error: null });
    } catch (err) {
      setDownloadState({
        isLoading: false,
        error: err instanceof Error ? err.message : "Unable to export PDF.",
      });
    }
  }, [highlightRects, mode, parsedDocument]);

  const warnings = useMemo(() => {
    const list = [...(parsedDocument?.warnings ?? [])];
    if (
      parsedDocument?.fileType === "pdf" &&
      list.some((item) => item.code === "NO_TEXT_LAYER" || item.code === "LOW_TEXT_DENSITY") &&
      !ocrProvider.isAvailable()
    ) {
      list.push({
        code: "OCR_NOT_CONFIGURED",
        message: "OCR fallback is not configured yet. Scanned pages cannot be fully keyword-highlighted.",
      });
    }
    if (parsedDocument?.fileType === "docx" && mode === "preserve_layout") {
      list.push({
        code: "DOCX_LAYOUT_BEST_EFFORT",
        message: "DOCX preserve-layout rendering is best effort and may not perfectly match Word.",
      });
    }
    if (parsedDocument?.fileType === "txt" && mode === "preserve_layout") {
      list.push({
        code: "TXT_WHITESPACE_ONLY",
        message: "TXT preserve-layout keeps whitespace/line breaks only; no embedded images are available.",
      });
    }
    return list;
  }, [mode, parsedDocument]);

  const canDownloadPreservePdf = Boolean(parsedDocument && parsedDocument.fileType === "pdf" && mode === "preserve_layout");
  const canUseExtractMode = !parsedDocument || parsedDocument.fileType === "pdf";
  const showModeControls = parsedDocument?.fileType === "pdf";
  const isAccessBlocked = READ_FILES_REQUIRES_PAID_PLAN && accessState !== "allowed";

  const renderedExtractText = useMemo((): ReactNode => {
    if (!extractViewText) {
      return "No extractable text.";
    }
    return renderTextWithHighlights(extractViewText, spans, "bold", { activeRange });
  }, [activeRange, extractViewText, spans]);

  const rsvpCursorRects = useMemo(() => {
    if (!parsedDocument || parsedDocument.fileType !== "pdf" || mode !== "preserve_layout" || !activeRange) {
      return [];
    }
    return mapSpansToHighlightRects(parsedDocument.pages, [
      { text: currentToken?.word ?? "", start: activeRange.start, end: activeRange.end },
    ]);
  }, [activeRange, currentToken?.word, mode, parsedDocument]);

  const moveRsvpBySentence = useCallback(
    (direction: -1 | 1) => {
      if (!tokens.length) {
        return;
      }
      const starts = rsvpSentenceStarts.length ? rsvpSentenceStarts : [0];
      setRsvpIndex((prev) => {
        const bounded = Math.max(0, Math.min(prev, tokens.length - 1));
        let sentenceIndex = 0;
        for (let i = 0; i < starts.length; i += 1) {
          if (starts[i]! <= bounded) {
            sentenceIndex = i;
          } else {
            break;
          }
        }
        const targetSentenceIndex = Math.max(0, Math.min(starts.length - 1, sentenceIndex + direction));
        const nextIndex = starts[targetSentenceIndex] ?? 0;
        return Math.max(0, Math.min(nextIndex, tokens.length - 1));
      });
    },
    [rsvpSentenceStarts, tokens.length],
  );

  const handleRsvpSentenceBack = useCallback(() => {
    moveRsvpBySentence(-1);
  }, [moveRsvpBySentence]);

  const handleRsvpSentenceForward = useCallback(() => {
    moveRsvpBySentence(1);
  }, [moveRsvpBySentence]);

  if (isAccessBlocked) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Read Files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {accessState === "checking" ? (
                <p className="text-sm text-muted-foreground">Checking plan access...</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-amber-700">
                    Read Files is available on paid plans only. Upgrade to Starter to continue.
                  </p>
                  <Button onClick={() => window.location.assign("/pricing")}>View pricing</Button>
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Read Files</CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload PDF, DOCX, or TXT.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file-upload">Upload file</Label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileChange}
                  className="block w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              {showModeControls ? (
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={mode === "extract_text" ? "default" : "outline"}
                      disabled={!canUseExtractMode}
                      onClick={() => void handleModeChange("extract_text")}
                    >
                      Text extraction
                    </Button>
                    <Button
                      type="button"
                      variant={mode === "preserve_layout" ? "default" : "outline"}
                      onClick={() => void handleModeChange("preserve_layout")}
                    >
                      Preserve layout
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{loading ? "Parsing..." : "Client-side parsing"}</Badge>
                <Badge variant="secondary">Mode: {mode === "extract_text" ? "Extract text" : "Preserve layout"}</Badge>
                <Badge variant="secondary">
                  Style:{" "}
                  {mode === "extract_text"
                    ? "Bold keywords"
                    : parsedDocument?.fileType === "pdf"
                      ? "Highlight keywords"
                      : "Bold keywords"}
                </Badge>
                {parsedDocument ? <Badge variant="secondary">Type: {parsedDocument.fileType.toUpperCase()}</Badge> : null}
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
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleRsvpSentenceBack} disabled={!tokens.length}>
                    Rewind sentence
                  </Button>
                  <Button variant="outline" onClick={handleRsvpSentenceForward} disabled={!tokens.length}>
                    Skip sentence
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
                  Tokens: {tokens.length.toLocaleString()} | Highlight terms: {highlightTerms.length.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Download</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Preserve-layout highlighted export is available for PDF only. DOCX and TXT preserve mode support on-screen highlighting.
                </p>
                <Button onClick={handleDownload} disabled={!canDownloadPreservePdf || downloadState.isLoading}>
                  {downloadState.isLoading ? "Generating..." : "Download highlighted PDF"}
                </Button>
                {!canDownloadPreservePdf ? (
                  <p className="text-xs text-muted-foreground">Upload a PDF and select preserve layout mode to enable export.</p>
                ) : null}
                {downloadState.error ? <p className="text-sm text-destructive">{downloadState.error}</p> : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Document View</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {mode === "preserve_layout" && parsedDocument?.fileType === "pdf" ? (
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
              ) : null}

              {!parsedDocument ? <p className="text-sm text-muted-foreground">Upload a file to preview it here.</p> : null}

              {parsedDocument && mode === "extract_text" ? (
                <div className="rounded-md border border-border bg-card p-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{renderedExtractText}</p>
                </div>
              ) : null}

              {parsedDocument && mode === "preserve_layout" && parsedDocument.fileType === "txt" ? (
                <div className="rounded-md border border-border bg-card p-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {renderTextWithHighlights(preserveTxtText, spans, "bold", { activeRange })}
                  </p>
                </div>
              ) : null}

              {parsedDocument && mode === "preserve_layout" && parsedDocument.fileType === "docx" ? (
                <div
                  ref={docxContainerRef}
                  className="docx-preserve rounded-md border border-border bg-card p-4 text-sm leading-relaxed text-foreground"
                  dangerouslySetInnerHTML={{ __html: parsedDocument.html ?? "<p>No rendered content available.</p>" }}
                />
              ) : null}

              {parsedDocument && mode === "preserve_layout" && parsedDocument.fileType === "pdf"
                ? parsedDocument.pages.map((page) => {
                    const pageRects = highlightRects.filter((rect) => rect.pageIndex === page.pageIndex);
                    return (
                      <div key={`page-${page.pageIndex}`} className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Page {page.pageIndex + 1}</p>
                        <div className="overflow-x-auto rounded-md border border-border bg-white">
                          <div className="relative" style={{ width: `${page.width}px`, height: `${page.height}px` }}>
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
                              {rsvpCursorRects.map((rect, index) => (
                                <div
                                  key={`cursor-${page.pageIndex}-${index}`}
                                  className="absolute rounded-[2px] bg-orange-300/45 ring-1 ring-orange-500/45"
                                  style={{
                                    left: `${rect.viewportX}px`,
                                    top: `${rect.viewportTop + Math.max(2, rect.viewportHeight * (highlightOffsetPct / 100))}px`,
                                    width: `${rect.viewportWidth}px`,
                                    height: `${rect.viewportHeight}px`,
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                : null}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
