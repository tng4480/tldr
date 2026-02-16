import type { ReactNode } from "react";
import type { HighlightSpan } from "@tldr/core";

type RenderStyle = "bold" | "highlight";

type RenderOptions = {
  activeRange?: { start: number; end: number } | null;
};

function inRange(offset: number, range: { start: number; end: number }) {
  return offset >= range.start && offset < range.end;
}

export function renderTextWithHighlights(
  text: string,
  spans: HighlightSpan[],
  style: RenderStyle,
  options?: RenderOptions,
): ReactNode {
  if (!text) {
    return text;
  }

  const activeRange =
    options?.activeRange && options.activeRange.end > options.activeRange.start ? options.activeRange : null;

  const sorted = [...spans]
    .filter((span) => span.start >= 0 && span.end > span.start && span.end <= text.length)
    .sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return b.end - b.start - (a.end - a.start);
    });

  if (!sorted.length && !activeRange) {
    return text;
  }

  const points = new Set<number>([0, text.length]);
  sorted.forEach((span) => {
    points.add(span.start);
    points.add(span.end);
  });
  if (activeRange) {
    points.add(activeRange.start);
    points.add(activeRange.end);
  }
  const boundaries = Array.from(points).sort((a, b) => a - b);
  const parts: ReactNode[] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    if (end <= start) {
      continue;
    }
    const value = text.slice(start, end);
    if (!value) {
      continue;
    }

    const isActive = activeRange ? inRange(start, activeRange) : false;
    const isHighlighted = sorted.some((span) => inRange(start, span));

    if (isActive) {
      parts.push(
        <mark key={`active-${i}`} className="rounded-[2px] bg-orange-300/45 px-[1px] text-inherit ring-1 ring-orange-500/40">
          {value}
        </mark>,
      );
      continue;
    }

    if (isHighlighted) {
      if (style === "bold") {
        parts.push(<strong key={`bold-${i}`}>{value}</strong>);
      } else {
        parts.push(
          <mark key={`highlight-${i}`} className="rounded-[2px] bg-amber-300/40 px-[1px] text-inherit">
            {value}
          </mark>,
        );
      }
      continue;
    }

    parts.push(value);
  }

  return parts;
}
