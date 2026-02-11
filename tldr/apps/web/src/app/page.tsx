"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { buildGoogleCalendarTemplateUrl } from "@/lib/googleCalendar";
import type { SimplifyTone, WholeTextMode } from "@/lib/llm";
import {
  computeSpacyStyleHighlights,
  detectHardSentences,
  extractDateHighlights,
  extractKeywords,
  fleschReadingEase,
  pickTopSentences,
  segmentTextIntoSubsections,
  splitIntoSentences,
  STOP_WORDS,
  wordCount,
} from "@tldr/core";
import type { HighlightSpan } from "@tldr/core";

type ReadingLevel = "simple" | "gcse" | "plain";

type SimplifiedMap = Record<number, string>;

type SimplifyState = {
  loadingIndex: number | null;
  error: string | null;
};

type WholeTextState = {
  isLoading: boolean;
  error: string | null;
};

type KeyInfoPayload = {
  sections: Record<string, string[]>;
  events: Array<{
    title: string;
    start?: string | null;
    end?: string | null;
    timezone?: string | null;
    location?: string | null;
    details?: string | null;
    calendarUrl?: string | null;
  }>;
};

const READING_LEVEL_OPTIONS = [
  { value: "simple", label: "Simple" },
  { value: "gcse", label: "GCSE" },
  { value: "plain", label: "Plain" },
] as const;

const TONE_OPTIONS: { value: SimplifyTone; label: string }[] = [
  { value: "preserve", label: "Preserve tone" },
  { value: "descriptive", label: "Descriptive" },
  { value: "bullets", label: "Bullet points" },
];

const WHOLE_TEXT_OPTIONS: { value: WholeTextMode; label: string; description: string }[] = [
  {
    value: "key_info",
    label: "Key info bullets",
    description: "Highlights important dates, things to do, and things to know.",
  },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KEY_INFO_HEADINGS = ["Important dates", "Things to do", "Things to know"] as const;

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}

function parseKeyInfoPayload(rawText: string): KeyInfoPayload | null {
  try {
    const cleaned = stripJsonFence(rawText);
    if (!cleaned) {
      return null;
    }
    const parsed = JSON.parse(cleaned) as { sections?: unknown; events?: unknown };
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const sections = (parsed as any).sections;
    if (!sections || typeof sections !== "object") {
      return null;
    }
    const normalizedSections: Record<string, string[]> = {};
    KEY_INFO_HEADINGS.forEach((heading) => {
      const items = Array.isArray((sections as any)[heading]) ? ((sections as any)[heading] as unknown[]) : [];
      normalizedSections[heading] = items
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    });
    const events = Array.isArray((parsed as any).events) ? ((parsed as any).events as unknown[]) : [];
    const normalizedEvents = events
      .filter((event): event is Record<string, unknown> => !!event && typeof event === "object")
      .map((event) => {
        const title = typeof event.title === "string" ? event.title.trim() : "";
        if (!title) {
          return null;
        }
        return {
          title,
          start: typeof event.start === "string" ? event.start.trim() : null,
          end: typeof event.end === "string" ? event.end.trim() : null,
          timezone: typeof event.timezone === "string" ? event.timezone.trim() : null,
          location: typeof event.location === "string" ? event.location.trim() : null,
          details: typeof event.details === "string" ? event.details.trim() : null,
          calendarUrl: typeof event.calendarUrl === "string" ? event.calendarUrl : null,
        };
      })
      .filter((event): event is NonNullable<typeof event> => !!event);
    return {
      sections: normalizedSections,
      events: normalizedEvents,
    };
  } catch {
    return null;
  }
}

export default function HomePage() {
  const didInitFromQuery = useRef(false);
  const [text, setText] = useState("");
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>("simple");
  const [simplifiedMap, setSimplifiedMap] = useState<SimplifiedMap>({});
  const [simplifyState, setSimplifyState] = useState<SimplifyState>({
    loadingIndex: null,
    error: null,
  });
  const [tone, setTone] = useState<SimplifyTone>("preserve");
  const [wholeTextMode, setWholeTextMode] = useState<WholeTextMode>("key_info");
  const [wholeTextResult, setWholeTextResult] = useState("");
  const [wholeTextState, setWholeTextState] = useState<WholeTextState>({
    isLoading: false,
    error: null,
  });

  const normalizedText = useMemo(() => text.replace(/\s+/g, " ").trim(), [text]);

  useEffect(() => {
    if (didInitFromQuery.current) {
      return;
    }
    const queryText = new URLSearchParams(window.location.search).get("text");
    if (queryText) {
      setText(queryText);
    }
    didInitFromQuery.current = true;
  }, []);

  const sentences = useMemo(() => splitIntoSentences(normalizedText), [normalizedText]);
  const keywords = useMemo(() => extractKeywords(text, 8), [text]);
  const hardSentences = useMemo(() => detectHardSentences(sentences), [sentences]);
  const keySentences = useMemo(() => pickTopSentences(sentences, 3), [sentences]);
  const readability = useMemo(() => fleschReadingEase(text), [text]);
  const totalWords = useMemo(() => wordCount(text), [text]);
  const filteredKeywords = useMemo(
    () => keywords.filter((keyword) => !STOP_WORDS.has(keyword.toLowerCase())),
    [keywords],
  );
  const highlightSpans = useMemo(() => computeSpacyStyleHighlights(normalizedText), [normalizedText]);
  const dateTerms = useMemo(() => extractDateHighlights(normalizedText, 12), [normalizedText]);
  const dateSpans = useMemo(() => {
    if (!dateTerms.length) {
      return [];
    }
    const spans: HighlightSpan[] = [];
    dateTerms.forEach((term) => {
      const regex = new RegExp(escapeRegExp(term), "gi");
      let match: RegExpExecArray | null = regex.exec(normalizedText);
      while (match) {
        spans.push({
          text: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
        match = regex.exec(normalizedText);
      }
    });
    return spans;
  }, [dateTerms, normalizedText]);
  const highlightBlocks = useMemo(() => {
    const overlaps = (span: HighlightSpan) =>
      highlightSpans.some((highlight) => span.start < highlight.end && span.end > highlight.start);
    const filteredDates = dateSpans.filter((span) => !overlaps(span));
    const typedHighlights = highlightSpans.map((span) => ({ ...span, kind: "highlight" as const }));
    const typedDates = filteredDates.map((span) => ({ ...span, kind: "date" as const }));
    return [...typedHighlights, ...typedDates].sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return b.end - b.start - (a.end - a.start);
    });
  }, [dateSpans, highlightSpans]);

  const sentenceRanges = useMemo(() => {
    const ranges: Array<{ sentence: string; start: number; end: number }> = [];
    let searchStart = 0;
    sentences.forEach((sentence) => {
      const index = normalizedText.indexOf(sentence, searchStart);
      if (index === -1) {
        return;
      }
      ranges.push({ sentence, start: index, end: index + sentence.length });
      searchStart = index + sentence.length;
    });
    return ranges;
  }, [normalizedText, sentences]);

  const renderSentence = useCallback(
    (sentence: string, sentenceStart: number) => {
      const sentenceEnd = sentenceStart + sentence.length;
      const spans = highlightBlocks.filter((span) => span.start < sentenceEnd && span.end > sentenceStart);
      if (!spans.length) {
        return sentence;
      }
      const sorted = [...spans].sort((a, b) => {
        if (a.start !== b.start) {
          return a.start - b.start;
        }
        return b.end - b.start - (a.end - a.start);
      });
      const parts: React.ReactNode[] = [];
      let cursor = sentenceStart;
      sorted.forEach((span, index) => {
        const start = Math.max(span.start, sentenceStart);
        const end = Math.min(span.end, sentenceEnd);
        if (start > cursor) {
          parts.push(normalizedText.slice(cursor, start));
        }
        const spanText = normalizedText.slice(start, end);
          parts.push(
            <span
              key={`${sentenceStart}-${index}-${span.kind}`}
              className={
                span.kind === "date"
                  ? "rounded-md bg-secondary/15 px-1 text-secondary ring-1 ring-secondary/30"
                  : "rounded-md bg-muted/80 px-1 text-foreground ring-1 ring-border/80"
              }
            >
              {spanText}
            </span>,
          );
        cursor = end;
      });
      if (cursor < sentenceEnd) {
        parts.push(normalizedText.slice(cursor, sentenceEnd));
      }
      return parts;
    },
    [highlightBlocks, normalizedText],
  );

  const keyInfoPayload = useMemo(() => parseKeyInfoPayload(wholeTextResult), [wholeTextResult]);

  const wholeTextLines = useMemo(
    () =>
      wholeTextResult
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [wholeTextResult],
  );

  const paragraphs = useMemo(() => {
    return segmentTextIntoSubsections(text);
  }, [text]);

  async function handleSimplify(paragraph: string, index: number) {
    setSimplifyState({ loadingIndex: index, error: null });
    try {
      const response = await fetch("/api/simplify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: paragraph, readingLevel, tone }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? "Unable to simplify this paragraph.");
      }

      const data = await response.json();
      setSimplifiedMap((prev) => ({ ...prev, [index]: data.simplifiedText }));
      setSimplifyState({ loadingIndex: null, error: null });
    } catch (error) {
      setSimplifyState({
        loadingIndex: null,
        error: error instanceof Error ? error.message : "Unexpected error.",
      });
    }
  }

  async function handleWholeText() {
    if (!text.trim()) {
      setWholeTextResult("");
      setWholeTextState({ isLoading: false, error: "Paste text to run this option." });
      return;
    }
    setWholeTextState({ isLoading: true, error: null });
    try {
      const response = await fetch("/api/whole-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, mode: wholeTextMode }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? "Unable to extract key information.");
      }

      const data = await response.json();
      setWholeTextResult(data.resultText ?? "");
      setWholeTextState({ isLoading: false, error: null });
    } catch (error) {
      setWholeTextState({
        isLoading: false,
        error: error instanceof Error ? error.message : "Unexpected error.",
      });
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-12 sm:px-6">
        <div className="space-y-12">
          <Card className="overflow-hidden border-border/70 bg-card/92 shadow-[0_22px_58px_rgba(1,8,20,0.55)]">
            <CardHeader className="space-y-3 pb-5">
              <CardTitle className="text-4xl font-semibold uppercase tracking-tight sm:text-5xl">Simplify long reads with confidence.</CardTitle>
              <p className="max-w-4xl text-lg text-muted-foreground">
                Paste text, see instant readability insights, and opt in to AI-powered
                simplification per paragraph. By default, everything stays on your device.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="source-text" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Paste your text
                </Label>
                <Textarea
                  id="source-text"
                  placeholder="Drop in an article, policy, or study notes."
                  value={text}
                  onChange={(event) => setText(event.currentTarget.value)}
                  className="min-h-[250px] border-border/70 bg-[#1a2f48]/70 text-base leading-relaxed"
                />
              </div>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap gap-5">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Simplification level</Label>
                    <Select value={readingLevel} onValueChange={(value) => setReadingLevel(value as ReadingLevel)}>
                      <SelectTrigger className="w-52 rounded-full border-border/70 bg-[#24425f]/80">
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        {READING_LEVEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Output tone</Label>
                    <Select value={tone} onValueChange={(value) => setTone(value as SimplifyTone)}>
                      <SelectTrigger className="w-52 rounded-full border-border/70 bg-[#24425f]/80">
                        <SelectValue placeholder="Tone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TONE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Badge variant="secondary" className="rounded-full border-border/80 bg-background/35 px-4 py-1.5 text-sm font-semibold tracking-wide text-foreground/92">
                  Client-side analysis only
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-7 lg:grid-cols-[5fr_7fr]">
            <Card className="border-border/70 bg-card/90 shadow-[0_18px_46px_rgba(2,9,20,0.5)]">
              <CardHeader>
                <CardTitle className="text-3xl font-semibold uppercase tracking-tight">Analysis snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="border-border/80 bg-background/35 px-3 py-1 font-semibold">Flesch score: {readability}</Badge>
                  <Badge variant="secondary" className="border-border/80 bg-background/35 px-3 py-1 font-semibold">Sentences: {sentences.length}</Badge>
                  <Badge variant="secondary" className="border-border/80 bg-background/35 px-3 py-1 font-semibold">Words: {totalWords}</Badge>
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-base font-semibold">Key sentences</p>
                  {keySentences.length ? (
                    <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                      {keySentences.map((sentence) => (
                        <li key={sentence}>{sentence}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Add text to reveal key sentences.
                    </p>
                  )}
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-base font-semibold">Top keywords</p>
                  <div className="flex flex-wrap gap-2">
                  {filteredKeywords.length ? (
                    filteredKeywords.map((keyword) => (
                      <Badge key={keyword} variant="outline">
                        {keyword}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No keywords yet.</p>
                  )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/90 shadow-[0_18px_46px_rgba(2,9,20,0.5)]">
              <CardHeader>
                <CardTitle className="text-3xl font-semibold uppercase tracking-tight">Highlighted reading view</CardTitle>
              </CardHeader>
              <CardContent>
                {sentenceRanges.length ? (
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {sentenceRanges.map((sentenceRange, index) => {
                      const content = renderSentence(sentenceRange.sentence, sentenceRange.start);
                      return (
                        <span key={`${sentenceRange.start}-${sentenceRange.end}`}>
                          {hardSentences[index] ? (
                            <mark className="rounded-md bg-primary/16 px-1 text-foreground ring-1 ring-primary/35">
                              {content}
                            </mark>
                          ) : (
                            content
                          )}{" "}
                        </span>
                      );
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Highlighted text appears here once you paste content.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 bg-card/90 shadow-[0_18px_46px_rgba(2,9,20,0.5)]">
            <CardHeader>
              <CardTitle className="text-3xl font-semibold uppercase tracking-tight">Whole-text LLM options</CardTitle>
              <p className="text-sm text-muted-foreground">
                Run a single pass over the entire text to extract key information.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Whole-text option</Label>
                  <Select value={wholeTextMode} onValueChange={(value) => setWholeTextMode(value as WholeTextMode)}>
                    <SelectTrigger className="w-64 rounded-full border-border/70 bg-[#24425f]/80">
                      <SelectValue placeholder="Select option" />
                    </SelectTrigger>
                    <SelectContent>
                      {WHOLE_TEXT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {WHOLE_TEXT_OPTIONS.find((option) => option.value === wholeTextMode)?.description}
                  </p>
                </div>
                <Button onClick={handleWholeText} disabled={wholeTextState.isLoading}>
                  {wholeTextState.isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Extracting...
                    </span>
                  ) : (
                    "Extract key info"
                  )}
                </Button>
              </div>
              {wholeTextState.error ? <p className="text-sm font-medium text-destructive">{wholeTextState.error}</p> : null}
              {wholeTextResult ? (
                <div className="rounded-2xl border border-border bg-muted/55 p-4">
                  <p className="text-sm font-semibold text-foreground">Key information</p>
                  <div className="mt-3 space-y-2 text-sm text-foreground/90">
                    {keyInfoPayload
                      ? KEY_INFO_HEADINGS.map((heading) => {
                          const items = keyInfoPayload.sections[heading] ?? [];
                          return (
                            <div key={heading}>
                              <p className="pt-2 font-semibold text-foreground">{heading}</p>
                              <ul className="mt-2 space-y-1 pl-4">
                                {(items.length ? items : ["None"]).map((item, itemIndex) => (
                                  <li key={`${heading}-${itemIndex}`} className="text-foreground/90">
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })
                      : wholeTextLines.map((line, index) => {
                          const isHeading = /:$/.test(line) && !/^[\-\u2022]\s*/.test(line);
                          if (isHeading) {
                            return (
                              <p key={`heading-${index}`} className="pt-2 font-semibold text-foreground">
                                {line}
                              </p>
                            );
                          }
                          const cleaned = line.replace(/^[\-\u2022]\s*/, "");
                          return (
                            <div key={`bullet-${index}`} className="flex gap-2">
                              <span className="text-muted-foreground">*</span>
                              <p className="flex-1">{cleaned}</p>
                            </div>
                          );
                        })}
                  </div>
                  {keyInfoPayload?.events?.length ? (
                    <div className="mt-4 border-t border-border pt-3">
                      <p className="text-sm font-semibold text-foreground">Add to Google Calendar</p>
                      <ul className="mt-2 space-y-1 pl-4 text-sm">
                        {keyInfoPayload.events.map((event, index) => {
                          const calendarUrl =
                            event.calendarUrl ??
                            buildGoogleCalendarTemplateUrl({
                              title: event.title,
                              start: event.start ?? null,
                              end: event.end ?? null,
                              timezone: event.timezone ?? null,
                              location: event.location ?? null,
                              details: event.details ?? null,
                            });
                          return (
                            <li key={`${event.title}-${index}`}>
                              <a className="text-primary underline-offset-4 hover:underline" href={calendarUrl} target="_blank" rel="noreferrer">
                                {event.title}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Run the whole-text option to see key dates, action items, and other highlights.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90 shadow-[0_18px_46px_rgba(2,9,20,0.5)]">
            <CardHeader>
              <CardTitle className="text-3xl font-semibold uppercase tracking-tight">Simplify paragraphs</CardTitle>
              <p className="text-sm text-muted-foreground">
                Opt in to AI per paragraph. No streaming, just a clean rewrite.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {simplifyState.error ? (
                <p className="text-sm font-medium text-destructive">{simplifyState.error}</p>
              ) : null}
              {paragraphs.length ? (
                <div className="space-y-4">
                  {paragraphs.map((paragraph, index) => {
                    const isLoading = simplifyState.loadingIndex === index;
                    return (
                      <Card key={`${index}-${paragraph.slice(0, 12)}`} className="border border-border/70 bg-muted/30 shadow-none">
                        <CardContent className="space-y-3 pt-6">
                          <p className="text-sm font-semibold text-foreground">Paragraph {index + 1}</p>
                          <p className="text-sm text-foreground/90">{paragraph}</p>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Button onClick={() => handleSimplify(paragraph, index)} disabled={isLoading}>
                              {isLoading ? (
                                <span className="flex items-center gap-2">
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                  Simplifying...
                                </span>
                              ) : (
                                "Simplify this paragraph"
                              )}
                            </Button>
                            {simplifiedMap[index] ? (
                              <Badge variant="success">Simplified</Badge>
                            ) : null}
                          </div>
                          {simplifiedMap[index] ? (
                            <div className="rounded-2xl border border-border bg-muted/55 p-4">
                              <p className="text-sm font-semibold text-foreground">Simplified copy</p>
                              {simplifiedMap[index]
                                .split(/\n\s*\n+/)
                                .map((para) => para.trim())
                                .filter(Boolean)
                                .map((para, paraIndex) => (
                                  <p
                                    key={`simplified-${index}-${paraIndex}`}
                                    className="mt-2 whitespace-pre-wrap text-sm text-foreground/90 first:mt-3"
                                  >
                                    {para}
                                  </p>
                                ))}
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Paste text above to break it into paragraphs.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
