import type { ReactNode } from "react";
import type { HighlightSpan } from "@tldr/core";

type RenderStyle = "bold" | "highlight";

export function renderTextWithHighlights(text: string, spans: HighlightSpan[], style: RenderStyle): ReactNode {
  if (!text || !spans.length) {
    return text;
  }

  const sorted = [...spans]
    .filter((span) => span.start >= 0 && span.end > span.start && span.end <= text.length)
    .sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return b.end - b.start - (a.end - a.start);
    });

  if (!sorted.length) {
    return text;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((span, index) => {
    const start = Math.max(cursor, span.start);
    const end = span.end;
    if (start > cursor) {
      parts.push(text.slice(cursor, start));
    }
    if (end > start) {
      const value = text.slice(start, end);
      if (style === "bold") {
        parts.push(<strong key={`bold-${index}`}>{value}</strong>);
      } else {
        parts.push(
          <mark key={`highlight-${index}`} className="rounded-[2px] bg-amber-300/40 px-[1px] text-inherit">
            {value}
          </mark>,
        );
      }
      cursor = end;
    }
  });
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}
