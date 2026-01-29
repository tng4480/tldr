"use client";

import { useMemo, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { SimplifyTone } from "@/lib/llm";
import {
  computeTfIdfHighlights,
  detectHardSentences,
  extractKeywords,
  fleschReadingEase,
  pickTopSentences,
  segmentTextIntoSubsections,
  splitIntoSentences,
  STOP_WORDS,
  wordCount,
} from "@/lib/textAnalysis";

type ReadingLevel = "simple" | "gcse" | "plain";

type SimplifiedMap = Record<number, string>;

type SimplifyState = {
  loadingIndex: number | null;
  error: string | null;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function HomePage() {
  const [text, setText] = useState("");
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>("simple");
  const [simplifiedMap, setSimplifiedMap] = useState<SimplifiedMap>({});
  const [simplifyState, setSimplifyState] = useState<SimplifyState>({
    loadingIndex: null,
    error: null,
  });
  const [tone, setTone] = useState<SimplifyTone>("preserve");

  const sentences = useMemo(() => splitIntoSentences(text), [text]);
  const keywords = useMemo(() => extractKeywords(text, 8), [text]);
  const hardSentences = useMemo(() => detectHardSentences(sentences), [sentences]);
  const keySentences = useMemo(() => pickTopSentences(sentences, 3), [sentences]);
  const readability = useMemo(() => fleschReadingEase(text), [text]);
  const totalWords = useMemo(() => wordCount(text), [text]);
  const filteredKeywords = useMemo(
    () => keywords.filter((keyword) => !STOP_WORDS.has(keyword.toLowerCase())),
    [keywords],
  );
  const highlightTerms = useMemo(() => computeTfIdfHighlights(text, 14), [text]);
  const highlightSet = useMemo(
    () => new Set(highlightTerms.map((term) => term.toLowerCase())),
    [highlightTerms],
  );
  const highlightRegex = useMemo(() => {
    if (!highlightTerms.length) {
      return null;
    }
    return new RegExp(`\\b(${highlightTerms.map(escapeRegExp).join("|")})\\b`, "gi");
  }, [highlightTerms]);

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

  return (
    <div className="flex min-h-screen flex-col gap-10 bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Simplify long reads with confidence.</CardTitle>
              <p className="text-sm text-muted-foreground">
                Paste text, see instant readability insights, and opt in to AI-powered
                simplification per paragraph. By default, everything stays on your device.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="source-text">Paste your text</Label>
                <Textarea
                  id="source-text"
                  placeholder="Drop in an article, policy, or study notes."
                  value={text}
                  onChange={(event) => setText(event.currentTarget.value)}
                  className="min-h-[180px]"
                />
              </div>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap gap-4">
                  <div className="space-y-2">
                    <Label>Simplification level</Label>
                    <Select value={readingLevel} onValueChange={(value) => setReadingLevel(value as ReadingLevel)}>
                      <SelectTrigger className="w-48">
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
                    <Label>Output tone</Label>
                    <Select value={tone} onValueChange={(value) => setTone(value as SimplifyTone)}>
                      <SelectTrigger className="w-48">
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
                <Badge variant="secondary" className="text-sm">
                  Client-side analysis only
                </Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[5fr_7fr]">
            <Card>
              <CardHeader>
                <CardTitle>Analysis snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Flesch score: {readability}</Badge>
                  <Badge variant="secondary">Sentences: {sentences.length}</Badge>
                  <Badge variant="secondary">Words: {totalWords}</Badge>
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Key sentences</p>
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
                  <p className="text-sm font-semibold">Top keywords</p>
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
            <Card>
              <CardHeader>
                <CardTitle>Highlighted reading view</CardTitle>
              </CardHeader>
              <CardContent>
                {sentences.length ? (
                  <p className="text-sm leading-relaxed text-slate-800">
                    {sentences.map((sentence, index) => {
                      const content = highlightRegex
                        ? sentence.split(highlightRegex).map((part, partIndex) => {
                            if (highlightSet.has(part.toLowerCase())) {
                              return (
                                <span key={`${sentence}-${index}-highlight-${partIndex}`} className="rounded bg-violet-100 px-1 text-violet-900">
                                  {part}
                                </span>
                              );
                            }
                            return part;
                          })
                        : sentence;

                      return (
                        <span key={`${sentence}-${index}`}>
                          {hardSentences[index] ? (
                            <mark className="rounded bg-amber-100 px-1 text-amber-900">{content}</mark>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Simplify paragraphs</CardTitle>
              <p className="text-sm text-muted-foreground">
                Opt in to AI per paragraph. No streaming, just a clean rewrite.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {simplifyState.error ? (
                <p className="text-sm font-medium text-red-600">{simplifyState.error}</p>
              ) : null}
              {paragraphs.length ? (
                <div className="space-y-4">
                  {paragraphs.map((paragraph, index) => {
                    const isLoading = simplifyState.loadingIndex === index;
                    return (
                      <Card key={`${index}-${paragraph.slice(0, 12)}`} className="border border-slate-200">
                        <CardContent className="space-y-3 pt-6">
                          <p className="text-sm font-semibold text-slate-700">Paragraph {index + 1}</p>
                          <p className="text-sm text-slate-700">{paragraph}</p>
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
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                              <p className="text-sm font-semibold text-slate-700">Simplified copy</p>
                              {simplifiedMap[index]
                                .split(/\n\s*\n+/)
                                .map((para) => para.trim())
                                .filter(Boolean)
                                .map((para, paraIndex) => (
                                  <p
                                    key={`simplified-${index}-${paraIndex}`}
                                    className="mt-2 text-sm text-slate-700 first:mt-3 whitespace-pre-wrap"
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
