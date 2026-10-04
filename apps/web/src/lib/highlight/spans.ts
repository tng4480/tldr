import type { HighlightSpan } from "@tldr/core";
import { extractDateHighlights, extractKeywordHighlightSpans } from "@tldr/core";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildHighlightSpans(text: string): HighlightSpan[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const keywordSpans = extractKeywordHighlightSpans(normalized);
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

export function buildHighlightTerms(spans: HighlightSpan[]): string[] {
  return Array.from(
    new Set(
      spans
        .map((span) => span.text.trim())
        .filter((text) => text.length > 1)
        .map((text) => text.toLowerCase()),
    ),
  );
}
